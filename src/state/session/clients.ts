import {type Agent, type Client} from '@atproto/lex'

import {APPVIEW_ENDPOINT, CHAT_PROXY_SERVICE} from '#/lib/constants'
import {createLexClient} from '#/lib/lexClient'
import {serviceBoundaryError} from '#/lib/service-boundary'
import {getCachedIsBetaUser} from '#/state/preferences/beta-user-cache'
import {networkAwareFetch} from './network'
import {type AppViewProvider, DEFAULT_APPVIEW_PROVIDER} from './providers'
import {type SessionTransport} from './session-core'

const IS_BETA_USER_HEADER = 'X-Bsky-Is-Beta-User'
/**
 * Build the signed-in appview {@link Client}.
 *
 * AppView service identity and endpoint are supplied by the explicit provider
 * model. Record helpers force `service: null`, so they still target the account
 * host. Authenticated reads use the account PDS's standard service-proxy path;
 * the PDS performs the endpoint-scoped service-auth minting after checking the
 * OAuth grant.
 *
 * The class-wide `Client.appLabelers` static is deliberately NOT suppressed
 * here: this client is the only producer of `atproto-accept-labelers` on an
 * appview request now that no agent sits underneath it. The account's own
 * subscriptions arrive separately, through `applyLabelersToClient` on the
 * instance, and that function filters out any DIDs already configured as
 * globally redacted authorities so they are not also listed unredacted.
 *
 * Keeping the proxy hop at the account PDS is intentional. The reference PDS
 * checks OAuth `rpc` permissions against the full `did#serviceId` reference,
 * then mints the interoperable service-auth JWT for the selected service. This
 * avoids asking a client-side direct fetch to reproduce PDS proxy semantics and
 * keeps the user's OAuth access token at the resource server.
 */
export function buildAppviewClient(
  agent: Agent,
  provider: AppViewProvider = DEFAULT_APPVIEW_PROVIDER,
): Client {
  const serviceRef = `${provider.serviceDid}#${provider.serviceFragment}`
  const headers = new Headers()
  headers.set('atproto-proxy', serviceRef)
  const isBetaUser = agent.did ? getCachedIsBetaUser(agent.did) : undefined
  if (isBetaUser !== undefined) {
    headers.set(IS_BETA_USER_HEADER, String(isBetaUser))
  }
  const appviewAgent: Agent = {
    did: agent.did,
    async fetchHandler(path, init) {
      const response = await agent.fetchHandler(path, init)
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
  return createLexClient(appviewAgent, {headers})
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
 * This exists for the pre-didDoc window. The OAuth session resolves each request
 * against `extractPdsUrl(didDoc) ?? service`, so before a refresh has delivered
 * a didDoc it falls back to the login service - which for an entryway account
 * (`service: bsky.social`, PDS elsewhere) is the wrong host. The synchronous
 * resume fast path makes no network request at all, so that window covers every
 * request of a cold start until something triggers a refresh.
 *
 * Absolutizing here is enough because the OAuth fetch handler builds its
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
  session: SessionTransport,
  pdsUrl: string,
): Agent {
  return {
    get did() {
      return session.did
    },
    async fetchHandler(path, init) {
      const absolutePath = new URL(path, pdsUrl).href
      const response = await session.fetchHandler(
        absolutePath as `/${string}`,
        init ?? {},
      )

      /*
       * A repository migration can leave a still-live entryway session with
       * an access token the new PDS no longer accepts. The OAuth adapter retries
       * ExpiredToken, but PDS migrations commonly surface InvalidToken or
       * AuthMissing instead. Refresh once through the login service and replay
       * only a read or a write whose body is known to be reusable. Do not
       * replay network, server, or validation failures: a write may have
       * reached the server before those failures were returned.
       */
      if (
        !(await isPdsAuthRecoveryResponse(response)) ||
        !isReplayableRequest(init)
      ) {
        return response
      }

      const previousSession = session.session
      const refreshed = await session.refresh().catch(() => undefined)
      if (!refreshed || refreshed === previousSession) {
        return response
      }
      return session.fetchHandler(absolutePath as `/${string}`, init ?? {})
    },
  }
}

/**
 * A PDS authentication rejection is safe to replay only when the request is a
 * read or the body can be supplied to fetch more than once. Lex serializes
 * normal XRPC writes as strings, but keeping the other body types explicit
 * prevents a consumed ReadableStream from being replayed accidentally.
 */
function isReplayableRequest(init?: RequestInit): boolean {
  const method = init?.method?.toUpperCase() ?? 'GET'
  if (method === 'GET' || method === 'HEAD') return true

  const body = init?.body
  if (body == null) return false
  if (typeof body === 'string') return true
  if (
    typeof URLSearchParams !== 'undefined' &&
    body instanceof URLSearchParams
  ) {
    return true
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) return true
  if (typeof FormData !== 'undefined' && body instanceof FormData) return true
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    return true
  }
  return ArrayBuffer.isView(body)
}

async function isPdsAuthRecoveryResponse(response: Response): Promise<boolean> {
  // A PDS may return AuthMissing, InvalidToken, or another auth-specific
  // reason on a 401 depending on which verifier rejected the migrated token.
  // One refresh is safe here because the caller only invokes this helper for
  // explicit authentication failures and separately checks body replayability.
  if (response.status === 401) return true
  if (response.status !== 400) return false
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
