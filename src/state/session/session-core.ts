import {type Agent, type Client} from '@atproto/lex'

import {PUBLIC_ACCOUNT_SERVICE} from '#/lib/constants'
import {canParseUrl} from '#/lib/strings/url-helpers'
import {logger} from '#/logger'
import {features} from '#/analytics'
import {
  buildAppviewClient,
  buildChatClient,
  buildPdsClient,
  getPublicAppviewClient,
  getUnauthenticatedThrowingClient,
  routeSessionToPds,
} from './clients'
import {addSessionErrorLog} from './logging'
import {
  configureModerationForAccount,
  configureModerationForGuest,
} from './moderation'
import {networkAwareFetch} from './network'
import {
  assertOAuthLoginInput,
  type OAuthLoginInputWithLegacyFields,
} from './oauth-login-input'
import {
  type OAuthProviderSession,
  OAuthSessionAdapter,
  restoreOAuthSession,
  signInWithOAuth,
} from './oauth-session'
import {resolvePdsEndpointForDid} from './pds-resolution'
import {type AppViewProvider, getSelectedAppViewProvider} from './providers'
import {type SessionData, sessionDataToSessionAccount} from './session-data'
import {type AtpSessionEvent, type SessionAccount} from './types'

export {networkAwareFetch} from './network'
export {
  isSignupQueued,
  sessionAccountToSessionData,
  sessionDataToSessionAccount,
} from './session-data'
export type {AtpSessionEvent} from './types'

/** The service the bundle authenticated against. */
export type SessionTransport = Agent & {
  readonly destroyed: boolean
  readonly session: SessionData
  readonly service?: string
  refresh: () => Promise<SessionData>
  signOut?: () => Promise<void>
  logout: () => Promise<void>
  kill?: () => void
}

function deriveServiceUrl(session: SessionTransport | null): URL {
  return new URL(
    session && !session.destroyed
      ? (session.service ?? session.session.service)
      : PUBLIC_ACCOUNT_SERVICE,
  )
}

/** The three clients over one OAuth-backed session transport. */
export type SessionBundle = {
  session: SessionTransport
  appviewClient: Client
  pdsClient: Client
  chatClient: Client
  /** The persisted account PDS route, retained when AppView changes. */
  pdsUrl?: string
  readonly service: URL
}

/** OAuth session callbacks carry the same narrow snapshot used for persistence. */
type SessionHookData = SessionData

/**
 * OAuth sessions expose provider-backed revocation rather than a local
 * logout-free destroy, so disposal is implemented by disabling the injected
 * fetch and hooks. Keep that lifecycle
 * state private and tied to bundle identity.
 */
const bundleKillSwitches = new WeakMap<SessionBundle, () => void>()

/**
 * Register the lifecycle closure used by {@link disposeBundle}.
 *
 * Killing the hooks is the whole of disposal now: the clients hold no state of
 * their own, and every request they make goes through the session's injected
 * fetch, which the kill switch disables.
 */
export function registerBundleKillSwitch(
  bundle: SessionBundle,
  kill: () => void,
) {
  bundleKillSwitches.set(bundle, () => {
    kill()
    bundle.session.kill?.()
  })
}

/**
 * Build the three clients over a session.
 *
 * `storedPdsUrl` pins PDS routing for requests made before a refresh has
 * delivered a didDoc - see {@link routeSessionToPds}, which explains why the
 * session's own routing is not sufficient in that window. With no stored url
 * there is nothing better to pin to, so the clients go straight over the
 * session and it resolves them against its own service.
 */
export function buildBundle(
  session: SessionTransport,
  storedPdsUrl?: string,
  provider: AppViewProvider = getSelectedAppViewProvider(session.did ?? ''),
): SessionBundle {
  /*
   * The stored url is persisted data and may be malformed (legacy writes,
   * corruption). `routeSessionToPds` feeds it to `new URL()` on every request,
   * so an invalid value would throw from every client call; discard it here
   * and let the session route against its own service instead.
   */
  const agent =
    storedPdsUrl && canParseUrl(storedPdsUrl)
      ? routeSessionToPds(session, storedPdsUrl)
      : session
  return {
    session,
    appviewClient: buildAppviewClient(agent, provider),
    pdsClient: buildPdsClient(agent),
    chatClient: buildChatClient(agent),
    pdsUrl: storedPdsUrl,
    get service() {
      return deriveServiceUrl(session)
    },
  }
}

export function switchAppViewProvider(
  bundle: SessionBundle,
  provider: AppViewProvider,
): SessionBundle {
  return buildBundle(bundle.session, bundle.pdsUrl, provider)
}
/**
 * The OAuth adapter delivers `sessionData` before the provider render catches
 * up. The provider uses that payload for refreshed identity metadata.
 */
export type OnSessionChange = (
  bundle: SessionBundle,
  did: string,
  event: AtpSessionEvent,
  sessionData?: SessionHookData,
) => void

export type SessionHooks = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  onUpdated: (data: SessionHookData) => void
  onDeleted: (data: SessionHookData) => void
  onUpdateFailure: () => void
}

/**
 * Hooks stay inert during initial session preparation. `kill()` disarms them
 * and disables the injected fetch so a disposed session cannot refresh or
 * dispatch.
 */
export function makeSessionHooks({
  onSessionChange,
  getBundle,
  getDid,
}: {
  onSessionChange: OnSessionChange
  /** Deferred: hooks are created before the bundle exists. */
  getBundle: () => SessionBundle
  /** Deferred: hooks are created before the bundle exists. */
  getDid: () => string
}) {
  let armed = false
  let killed = false
  const dispatch = (event: AtpSessionEvent, sessionData?: SessionHookData) => {
    if (!armed) {
      return
    }
    /*
     * A hook must never throw. The provider awaits its hooks inside the
     * assignment to its internal session promise, so a synchronous throw here
     * leaves that promise permanently rejected: every later request fails, and
     * because the session is never marked destroyed, disposeBundle cannot even
     * see that the bundle is dead. The dispatch path reaches reducer side
     * effects and event emitters, so treat it as capable of throwing.
     */
    try {
      const did = getDid()
      onSessionChange(getBundle(), did, event, sessionData)
      if (event !== 'update') {
        addSessionErrorLog(did, event)
      }
    } catch (e) {
      logger.error(e instanceof Error ? e : String(e), {
        message: `session: onSessionChange threw for a '${event}' event`,
      })
    }
  }
  const hooks: SessionHooks = {
    fetch: (input, init) => {
      if (killed) {
        throw new Error('session disposed')
      }
      return networkAwareFetch(input, init)
    },
    onUpdated(data) {
      dispatch('update', data)
    },
    onDeleted(data) {
      dispatch('expired', data)
    },
    onUpdateFailure() {
      dispatch('network-error')
    },
  }
  return Object.assign(hooks, {
    arm() {
      armed = true
    },
    kill() {
      killed = true
      armed = false
    },
  })
}

/** The clients exposed while logged out. */
export type PublicSessionBundle = {
  session: null
  appviewClient: Client
  pdsClient: Client
  chatClient: Client
  readonly service: URL
}

/**
 * Build the logged-out bundle.
 *
 * `configureModerationForGuest` is what populates the global
 * `Client.appLabelers` that {@link getPublicAppviewClient} reads for its labeler
 * header, so it must run before the public client's first request. There is no
 * agent stamping that header any more, which makes this call load-bearing rather
 * than test-only: without it a logged-out read would carry no moderation
 * authorities at all.
 *
 * The write surfaces get the throwing client rather than a public one, so an
 * unauthenticated write fails legibly instead of 4xx-ing against public
 * infrastructure.
 */
export function createPublicSessionBundle(): PublicSessionBundle {
  configureModerationForGuest()
  return {
    session: null,
    appviewClient: getPublicAppviewClient(),
    pdsClient: getUnauthenticatedThrowingClient(),
    chatClient: getUnauthenticatedThrowingClient(),
    service: new URL(PUBLIC_ACCOUNT_SERVICE),
  }
}

/**
 * Run the prepare tail shared by the asynchronous factories.
 *
 * Preparation does real network work, so it can both reject and - when a
 * request gets a 401 and the session's own refresh then fails definitively -
 * destroy the session underneath us.
 *
 * A session destroyed during preparation is fatal rather than recoverable. The
 * hooks are still disarmed at that point, so the session's `expired` event was
 * swallowed and nothing will ever tell the reducer to log the account out;
 * returning the bundle anyway would leave the app looking signed in over a
 * session that can only make unauthenticated requests. Failing instead matches
 * what `CredentialSession.resumeSession` did on a revoked token, and every
 * caller already handles a rejected factory. Checking `destroyed` first also
 * keeps a revoked OAuth session's opaque provider error from escaping as the
 * opaque rejection a caller would surface, so `snapshot` only ever runs against
 * a live session.
 *
 * Both failure modes dispose: the bundle is fully built by this point, and a
 * still-live session left behind would keep its refresh and dispatch paths
 * alive with nothing tracking it. (Disposal is a no-op for the destroyed case,
 * where the session already refuses to refresh - but the two paths are
 * indistinguishable to the caller, so both go through it.)
 */
export async function finishPreparation<T>(
  bundle: SessionBundle,
  preparation: Promise<unknown>,
  snapshot: () => T,
): Promise<T> {
  try {
    await preparation
    if (bundle.session.destroyed) {
      throw new Error('Session was revoked while it was being prepared')
    }
    return snapshot()
  } catch (e) {
    disposeBundle(bundle)
    throw e
  }
}

/**
 * Resume a stored account into a {@link SessionBundle}. Expired sessions take a
 * network resume; still-valid stored tokens take a synchronous no-network fast
 * path. Hooks are armed only after the prepare tail resolves.
 */
export async function createSessionBundleAndResume(
  storedAccount: SessionAccount,
  onSessionChange: OnSessionChange,
): Promise<{account: SessionAccount; bundle: SessionBundle}> {
  if (storedAccount.authType !== 'oauth') {
    throw new Error(
      'This account has a legacy password session; sign in again with ATProto OAuth',
    )
  }
  const gates = features.refresh({strategy: 'prefer-low-latency'})
  let bundle!: SessionBundle
  const hooks = makeSessionHooks({
    onSessionChange,
    getBundle: () => bundle,
    getDid: () => storedAccount.did,
  })

  let session: OAuthSessionAdapter
  /*
   * Hosted entryways authenticate accounts whose repository lives on a
   * different PDS. Older stored sessions can lack both pdsUrl and didDoc; in
   * that state service-auth issuance is accidentally sent to the entryway,
   * which commonly answers 400 for a project AppView audience. Resolve the
   * public DID document before constructing the session so refresh and all
   * subsequent PDS calls use the repository host.
   */
  /*
   * Hosted entryway sessions can carry a stale pdsUrl from an older client
   * (most notably the entryway itself, before the DID document was persisted).
   * Resolve the current repository endpoint first so a migrated account does
   * not keep sending account-host requests to bsky.social. Keep the stored
   * value only as an offline fallback, and preserve the explicit self-hosted
   * service route when the account was created directly on its PDS.
   */
  const storedPdsLooksLikeEntryway =
    !storedAccount.isSelfHosted &&
    !!storedAccount.pdsUrl &&
    (() => {
      try {
        return (
          new URL(storedAccount.pdsUrl).origin ===
          new URL(storedAccount.service).origin
        )
      } catch {
        return true
      }
    })()
  const resolvedPdsUrl =
    !storedAccount.isSelfHosted &&
    (!storedAccount.pdsUrl || storedPdsLooksLikeEntryway)
      ? await resolvePdsEndpointForDid(storedAccount.did)
      : undefined
  const pdsUrl = resolvedPdsUrl ?? storedAccount.pdsUrl
  session = await restoreOAuthSession(storedAccount.did, hooks, pdsUrl)

  bundle = buildBundle(session, pdsUrl)
  registerBundleKillSwitch(bundle, hooks.kill)
  // The returned account is captured again after asynchronous preparation.
  const earlyAccount =
    sessionDataToSessionAccount(
      session.session,
      session.service ?? session.session.service,
      pdsUrl,
    ) ?? storedAccount

  configureModerationForAccount(bundle, earlyAccount)

  // Preparation may auto-refresh the session while hooks are still disarmed.
  const account = await finishPreparation(
    bundle,
    gates,
    () =>
      sessionDataToSessionAccount(
        session.session,
        session.service ?? session.session.service,
        pdsUrl,
      ) ?? storedAccount,
  )
  hooks.arm()
  return {account, bundle}
}

/**
 * Adopt the browser OAuth session returned by the one-time startup
 * initialization. This is the callback/reload entry point: unlike a stored
 * account resume, it starts from the provider session that already consumed
 * the authorization response or restored IndexedDB state.
 */
export async function createSessionBundleFromOAuthSession(
  providerSession: OAuthProviderSession,
  onSessionChange: OnSessionChange,
): Promise<{account: SessionAccount; bundle: SessionBundle}> {
  let bundle!: SessionBundle
  let accountDid = ''
  const hooks = makeSessionHooks({
    onSessionChange,
    getBundle: () => bundle,
    getDid: () => accountDid,
  })
  const session = await OAuthSessionAdapter.fromSession(providerSession, hooks)

  bundle = buildBundle(session)
  registerBundleKillSwitch(bundle, hooks.kill)
  const earlyAccount = sessionDataToSessionAccountOrThrow(session)
  accountDid = earlyAccount.did

  const gates = features.refresh({strategy: 'prefer-fresh-gates'})
  configureModerationForAccount(bundle, earlyAccount)
  const account = await finishPreparation(bundle, gates, () =>
    sessionDataToSessionAccountOrThrow(session),
  )
  hooks.arm()
  return {account, bundle}
}

/**
 * Start ATProto OAuth and build a {@link SessionBundle}.
 */
export async function createSessionBundleAndLogin(
  input: OAuthLoginInputWithLegacyFields,
  onSessionChange: OnSessionChange,
): Promise<{account: SessionAccount; bundle: SessionBundle}> {
  assertOAuthLoginInput(input)
  const {service, identifier} = input
  let bundle!: SessionBundle
  let accountDid = ''
  const hooks = makeSessionHooks({
    onSessionChange,
    getBundle: () => bundle,
    getDid: () => accountDid,
  })

  // OAuth accepts a handle, DID, or PDS host. An email identifier is resolved
  // by the provider UI instead of being sent as a password credential.
  const oauthInput = identifier.includes('@') ? service : identifier
  const session = await signInWithOAuth(oauthInput, hooks)

  bundle = buildBundle(session)
  registerBundleKillSwitch(bundle, hooks.kill)
  // Seed the hook's did before it is armed.
  const earlyAccount = sessionDataToSessionAccountOrThrow(session)
  accountDid = earlyAccount.did

  const gates = features.refresh({strategy: 'prefer-fresh-gates'})
  configureModerationForAccount(bundle, earlyAccount)

  // Preparation may auto-refresh the session while hooks are still disarmed.
  const account = await finishPreparation(bundle, gates, () =>
    sessionDataToSessionAccountOrThrow(session),
  )
  hooks.arm()
  return {account, bundle}
}

/**
 * Rebuild a bundle synchronously from stored tokens. The optional guard runs
 * after construction but before hooks are armed; rejected bundles are disposed.
 */
export function createSessionBundleFromStoredAccount(
  storedAccount: SessionAccount,
  onSessionChange: OnSessionChange,
  shouldActivate: (
    bundle: SessionBundle,
    account: SessionAccount,
  ) => boolean = () => true,
): {account: SessionAccount; bundle: SessionBundle} | undefined {
  if (storedAccount.authType !== 'oauth') {
    return undefined
  }
  let bundle!: SessionBundle
  const hooks = makeSessionHooks({
    onSessionChange,
    getBundle: () => bundle,
    getDid: () => storedAccount.did,
  })
  const session = OAuthSessionAdapter.fromStoredAccount(storedAccount, hooks)
  bundle = buildBundle(session, storedAccount.pdsUrl)
  registerBundleKillSwitch(bundle, hooks.kill)
  configureModerationForAccount(bundle, storedAccount)

  const account = session.destroyed
    ? storedAccount
    : (sessionDataToSessionAccount(
        session.session,
        session.service ?? session.session.service,
        storedAccount.pdsUrl,
      ) ?? storedAccount)
  if (!shouldActivate(bundle, account)) {
    disposeBundle(bundle)
    return undefined
  }
  hooks.arm()
  return {account, bundle}
}

export function sessionDataToSessionAccountOrThrow(
  session: SessionTransport,
): SessionAccount {
  const account = sessionDataToSessionAccount(
    session.session,
    session.service ?? session.session.service,
  )
  if (!account) {
    throw Error('Expected an active session')
  }
  return account
}

/**
 * Disable a replaced bundle without revoking its server session. The registered
 * lifecycle closure disables the OAuth fetch and hooks instead.
 */
export function disposeBundle(bundle: SessionBundle | PublicSessionBundle) {
  const session = bundle.session
  if (!session || session.destroyed) {
    return
  }
  bundleKillSwitches.get(bundle)?.()
}
