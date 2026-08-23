import {type Agent, type Client} from '@atproto/lex'
import {type PasswordSession} from '@atproto/lex-password-session'

import {APPVIEW_ENDPOINT, CHAT_PROXY_SERVICE} from '#/lib/constants'
import {createLexClient} from '#/lib/lexClient'
import {serviceBoundaryError} from '#/lib/service-boundary'
import {getCachedIsBetaUser} from '#/state/preferences/beta-user-cache'
import {networkAwareFetch} from './network'
import {type AppViewProvider, DEFAULT_APPVIEW_PROVIDER} from './providers'

const IS_BETA_USER_HEADER = 'X-Bsky-Is-Beta-User'

/**
 * Build the signed-in appview {@link Client}.
 *
 * AppView service identity and endpoint are supplied by the explicit provider
 * model. Record helpers force `service: null`, so they still target the account
 * host. Authenticated reads use endpoint-scoped service-auth tokens.
 *
 * The class-wide `Client.appLabelers` static is deliberately NOT suppressed
 * here: this client is the only producer of `atproto-accept-labelers` on an
 * appview request now that no agent sits underneath it. The account's own
 * subscriptions arrive separately, through `applyLabelersToClient` on the
 * instance, and that function filters out any DIDs already configured as
 * globally redacted authorities so they are not also listed unredacted.
 *
 * Each authenticated AppView request receives a short-lived, endpoint-scoped
 * service-auth JWT minted by the account PDS. The PDS access token is used only
 * for that PDS-side minting call and is never sent to the AppView endpoint.
 */
export function buildAppviewClient(
  agent: Agent,
  provider: AppViewProvider = DEFAULT_APPVIEW_PROVIDER,
): Client {
  const appviewAgent: Agent = {
    did: agent.did,
    async fetchHandler(path, init) {
      const nsid = path.startsWith('/xrpc/')
        ? path.slice('/xrpc/'.length).split('?')[0]
        : ''
      if (!nsid) throw new Error('AppView requests must be XRPC paths')
      const authUrl = `/xrpc/com.atproto.server.getServiceAuth?aud=${encodeURIComponent(provider.serviceDid)}&lxm=${encodeURIComponent(nsid)}`
      const authResponse = await agent.fetchHandler(authUrl as `/${string}`, {
        method: 'GET',
      })
      if (!authResponse.ok)
        throw new Error(
          `Account PDS could not authorize ${provider.displayName} (${provider.serviceDid}); HTTP ${authResponse.status}`,
        )
      const authBody = (await authResponse.json()) as {token?: string}
      if (!authBody.token)
        throw new Error('Service-auth issuance returned no token')
      const headers = new Headers(init?.headers)
      headers.set('authorization', `Bearer ${authBody.token}`)
      headers.set(
        'atproto-proxy',
        `${provider.serviceDid}#${provider.serviceFragment}`,
      )
      const isBetaUser = appviewAgent.did
        ? getCachedIsBetaUser(appviewAgent.did)
        : undefined
      if (isBetaUser !== undefined) {
        headers.set(IS_BETA_USER_HEADER, String(isBetaUser))
      }
      const response = await fetch(new URL(path, provider.endpoint), {
        ...init,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      })
      if (response.status === 401) {
        throw serviceBoundaryError(
          {
            kind: 'AppView provider',
            displayName: provider.displayName,
            serviceDid: provider.serviceDid,
          },
          new Error('HTTP 401 from the selected AppView'),
        )
      }
      return response
    },
  }
  return createLexClient(appviewAgent)
}

/**
 * Build the signed-in account-host {@link Client}.
 *
 * No `service`, so no proxy header: `com.atproto.*` repo, server and identity
 * calls reach the account's own PDS rather than being proxied onward.
 *
 * `appLabelers: null` suppresses the class-wide static for this instance. A PDS
 * request is not an appview read, so it must carry no moderation authorities at
 * all; without the suppression it would start emitting the global list.
 */
export function buildPdsClient(agent: Agent): Client {
  return createLexClient(agent, {appLabelers: null})
}

/**
 * Build the signed-in chat {@link Client}.
 *
 * {@link CHAT_PROXY_SERVICE} (`${CHAT_PROXY_DID}#bsky_chat`, default
 * `did:web:api.bsky.chat#bsky_chat`) is the client's `service`, so `chat.bsky.*`
 * calls are proxied to the chat service. The DID is read from the
 * env-configurable `CHAT_PROXY_DID` rather than a hard-coded constant, so it can
 * be retargeted per environment.
 *
 * `appLabelers: null` for the same reason as the PDS client: the chat service
 * takes no moderation authorities.
 */
export function buildChatClient(agent: Agent): Client {
  return createLexClient(agent, {
    appLabelers: null,
    service: CHAT_PROXY_SERVICE,
  })
}

/**
 * Wrap a session so requests resolve against a known PDS while auth and refresh
 * stay with the session.
 *
 * This exists for the pre-didDoc window. `PasswordSession` resolves each request
 * against `extractPdsUrl(didDoc) ?? service`, so before a refresh has delivered
 * a didDoc it falls back to the login service - which for an entryway account
 * (`service: bsky.social`, PDS elsewhere) is the wrong host. The synchronous
 * resume fast path makes no network request at all, so that window covers every
 * request of a cold start until something triggers a refresh.
 *
 * Absolutizing here is enough because `PasswordSession.fetchHandler` builds its
 * URL with `new URL(path, base)`, which ignores the base for an already-absolute
 * input. So an absolute URL passes through untouched, and the session's own
 * didDoc routing still wins for any client built directly over it.
 *
 * The tradeoff is that this pins the STORED url for the bundle's lifetime, where
 * the session would prefer a didDoc endpoint that arrived later. That is
 * acceptable because the two only disagree if the account's PDS moved, and the
 * next cold start persists (and therefore pins) the new endpoint.
 */
export function routeSessionToPds(
  session: PasswordSession,
  pdsUrl: string,
): Agent {
  return {
    get did() {
      return session.did
    },
    async fetchHandler(path, init) {
      const absolutePath = new URL(path, pdsUrl).href
      const response = await session.fetchHandler(absolutePath, init)

      /*
       * A repository migration can leave a still-live entryway session with
       * an access token the new PDS no longer accepts. PasswordSession retries
       * ExpiredToken, but PDS migrations commonly surface InvalidToken or
       * AuthMissing instead. Refresh once through the login service and replay
       * only body-less reads; writes must never be replayed implicitly because
       * their request body may not be safely reusable.
       */
      if (
        init?.body !== undefined ||
        !(await isPdsAuthRecoveryResponse(response))
      ) {
        return response
      }

      const previousAccessJwt = session.session.accessJwt
      const refreshed = await session.refresh().catch(() => undefined)
      if (!refreshed || refreshed.accessJwt === previousAccessJwt) {
        return response
      }
      return session.fetchHandler(absolutePath, init)
    },
  }
}

async function isPdsAuthRecoveryResponse(response: Response): Promise<boolean> {
  if (response.status !== 400 && response.status !== 401) return false
  try {
    const body = (await response.clone().json()) as {error?: unknown}
    return body.error === 'InvalidToken' || body.error === 'AuthMissing'
  } catch {
    return false
  }
}

/** Thrown when a write/auth-only client is used with no active session. */
export class NotAuthenticatedError extends Error {
  constructor(op = 'this operation') {
    super(`Not authenticated: ${op} requires an active session`)
    this.name = 'NotAuthenticatedError'
  }
}

let unauthedClient: Client | undefined

/**
 * A {@link Client} that throws {@link NotAuthenticatedError} on any request,
 * before any network I/O. It is the logged-out value of the write/auth-only
 * hooks (`usePdsClient`/`useChatClient`) so an unauthenticated call fails
 * immediately and legibly instead of silently hitting public infrastructure,
 * which would answer with an opaque 4xx.
 *
 * A single module-level instance, so its identity is stable across renders -
 * safe to use in React Query keys and as a hook return value.
 */
export function getUnauthenticatedThrowingClient(): Client {
  return (unauthedClient ??= createLexClient({
    did: undefined,
    fetchHandler: () => {
      throw new NotAuthenticatedError()
    },
  }))
}

const publicLexClients = new Map<string, Client>()

/**
 * The unauthenticated {@link Client} for public reads, pointed at the public
 * appview.
 *
 * Public clients are cached by endpoint: there is no session to scope them to,
 * so each selected provider's client lives for the lifetime of the process and
 * is stable enough for a React Query key. Requests go through
 * {@link networkAwareFetch} so public reads feed the app's reachability signal
 * like authenticated ones do.
 *
 * Like the session appview client, it carries the class-wide
 * `Client.appLabelers`, so a logged-out read gets the same `;redact` moderation
 * authorities an authenticated one does. That makes `configureModerationForGuest`
 * load-bearing rather than test-only - it is what populates the static before
 * this client's first request, and `createPublicSessionBundle` runs it while
 * building the bundle.
 */
export function getPublicAppviewClient(
  endpoint: string = String(APPVIEW_ENDPOINT),
): Client {
  const normalizedEndpoint = endpoint.replace(/\/$/, '')
  let client = publicLexClients.get(normalizedEndpoint)
  if (!client) {
    client = createLexClient({
      service: normalizedEndpoint,
      fetch: networkAwareFetch,
    })
    publicLexClients.set(normalizedEndpoint, client)
  }
  return client
}
