import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {type Client} from '@atproto/lex'

import * as persisted from '#/state/persisted'
import {useCloseAllActiveElements} from '#/state/util'
import {useGlobalDialogsControlContext} from '#/components/dialogs/Context'
import {AnalyticsContext, useAnalyticsBase, utils} from '#/analytics'
import {IS_WEB} from '#/env'
import {com} from '#/lexicons'
import {logger} from '#/logger'
import {emitAppViewProviderChanged, emitSessionDropped} from '../events'
import {getPublicAppviewClient} from './clients'
import {
  createSessionBundleAndCreateAccount,
  createSessionBundleAndOAuthSignup,
} from './create-account'
import {initializeOAuthClient, revokeOAuthSession} from './oauth-session'
import {
  getAppViewProviders,
  probeAppViewProvider,
  selectAppViewProvider,
} from './providers'
import {type Action, getInitialState, reducer, type State} from './reducer'
import {
  type AtpSessionEvent,
  createSessionBundleAndLogin,
  createSessionBundleAndResume,
  createSessionBundleFromOAuthSession,
  disposeBundle,
  type PublicSessionBundle,
  type SessionBundle,
  sessionDataToSessionAccount,
  switchAppViewProvider as switchBundleAppViewProvider,
} from './session-core'
export {isSignupQueued, type SessionData} from './session-data'
import {
  addSessionDebugLog,
  getBundleId,
  redactAccount,
  redactPersistedSession,
  redactState,
} from './logging'
import {type SessionData} from './session-data'
export type {SessionAccount} from '#/state/session/types'

import {clearPersistedQueryStorage} from '#/lib/persisted-query-storage'
import {
  type SessionApiContext,
  type SessionStateContext,
} from '#/state/session/types'
import {useOnboardingDispatch} from '#/state/shell/onboarding'

const StateContext = createContext<SessionStateContext>({
  accounts: [],
  currentAccount: undefined,
  hasSession: false,
})
StateContext.displayName = 'SessionStateContext'

/** Active account bundle, or the public bundle when logged out. */
const BundleContext = createContext<SessionBundle | PublicSessionBundle | null>(
  null,
)
BundleContext.displayName = 'SessionBundleContext'

const ApiContext = createContext<SessionApiContext>({
  signUp: async () => {},
  initializeOAuthSession: async () => false,
  createAccount: async () => {},
  login: async () => {},
  logoutCurrentAccount: () => {},
  logoutEveryAccount: () => {},
  resumeSession: async () => {},
  removeAccount: () => {},
  switchAppViewProvider: async () => {},
  partialRefreshSession: async () => {},
  refreshSession: () => Promise.resolve(undefined),
})
ApiContext.displayName = 'SessionApiContext'

class SessionStore {
  private state: State
  private listeners = new Set<() => void>()

  constructor() {
    // Careful: By the time this runs, `persisted` needs to already be filled.
    const initialState = getInitialState(persisted.get('session').accounts)
    addSessionDebugLog({type: 'reducer:init', state: redactState(initialState)})
    this.state = initialState
  }

  getState = (): State => {
    return this.state
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispatch = (action: Action) => {
    const nextState = reducer(this.state, action)
    this.state = nextState
    // Persist synchronously without waiting for the React render cycle.
    if (nextState.needsPersist) {
      nextState.needsPersist = false
      const persistedData = {
        accounts: nextState.accounts,
        currentAccount: nextState.accounts.find(
          a => a.did === nextState.currentBundleState.did,
        ),
      }
      addSessionDebugLog({
        type: 'persisted:broadcast',
        data: redactPersistedSession(persistedData),
      })
      void persisted.write('session', persistedData)
    }
    this.listeners.forEach(listener => listener())
  }
}

export function Provider({children}: React.PropsWithChildren<{}>) {
  const ax = useAnalyticsBase()
  const cancelPendingTask = useOneTaskAtATime()
  // eslint-disable-next-line react/hook-use-state
  const [store] = useState(() => new SessionStore())
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const onboardingDispatch = useOnboardingDispatch()

  const onSessionChange = useCallback(
    (
      bundle: SessionBundle,
      accountDid: string,
      sessionEvent: AtpSessionEvent,
      sessionData?: SessionData,
    ) => {
      /*
       * OAuthSession invokes its hooks before the provider render catches up.
       * Use the delivered payload so a refresh persists the newest identity
       * metadata immediately.
       *
       * A refresh payload carries no didDoc unless the server sends one, so the
       * stored account's `pdsUrl` is threaded in as the fallback. Without it the
       * refresh would persist `pdsUrl: undefined` and the next cold start would
       * route pre-refresh requests to the entryway instead of the PDS.
       */
      const refreshedAccount =
        sessionEvent === 'update' && sessionData
          ? sessionDataToSessionAccount(
              sessionData,
              sessionData.service,
              store.getState().accounts.find(a => a.did === accountDid)?.pdsUrl,
            )
          : undefined

      // Only the current bundle may report that its session was dropped.
      if (
        sessionEvent === 'expired' &&
        store.getState().currentBundleState.bundle === bundle
      ) {
        emitSessionDropped()
      }
      // Bundle identity prevents stale sessions from changing the active account.
      store.dispatch({
        type: 'received-session-event',
        bundle,
        refreshedAccount,
        accountDid,
        sessionEvent,
      })
    },
    [store],
  )
  const createAccount = useCallback<SessionApiContext['createAccount']>(
    async (params, metrics) => {
      addSessionDebugLog({type: 'method:start', method: 'createAccount'})
      const signal = cancelPendingTask()
      ax.metric('account:create:begin', {})
      const {bundle, account} = await createSessionBundleAndCreateAccount(
        params,
        onSessionChange,
      )

      if (signal.aborted) {
        // The factory returns an armed bundle, so a superseded signup must dispose it.
        disposeBundle(bundle)
        return
      }
      store.dispatch({
        type: 'switched-to-account',
        newBundle: bundle,
        newAccount: account,
      })
      ax.metric('account:create:success', metrics, {
        session: utils.accountToSessionMetadata(account),
      })
      addSessionDebugLog({
        type: 'method:end',
        method: 'createAccount',
        account: redactAccount(account),
      })
    },
    [ax, store, onSessionChange, cancelPendingTask],
  )

  const signUp = useCallback<SessionApiContext['signUp']>(
    async ({service}, metrics) => {
      addSessionDebugLog({type: 'method:start', method: 'createAccount'})
      const signal = cancelPendingTask()
      ax.metric('account:create:begin', {})
      const {bundle, account} = await createSessionBundleAndOAuthSignup(
        {service},
        onSessionChange,
      )

      if (signal.aborted) {
        disposeBundle(bundle)
        return
      }
      store.dispatch({
        type: 'switched-to-account',
        newBundle: bundle,
        newAccount: account,
      })
      ax.metric('account:create:success', metrics, {
        session: utils.accountToSessionMetadata(account),
      })
      addSessionDebugLog({
        type: 'method:end',
        method: 'createAccount',
        account: redactAccount(account),
      })
    },
    [ax, store, onSessionChange, cancelPendingTask],
  )

  const initializeOAuthSession = useCallback<
    SessionApiContext['initializeOAuthSession']
  >(async () => {
    const providerSession = await initializeOAuthClient()
    if (!providerSession) return false

    const signal = cancelPendingTask()
    const {bundle, account} = await createSessionBundleFromOAuthSession(
      providerSession,
      onSessionChange,
    )
    if (signal.aborted) {
      disposeBundle(bundle)
      return false
    }
    store.dispatch({
      type: 'switched-to-account',
      newBundle: bundle,
      newAccount: account,
    })
    addSessionDebugLog({
      type: 'method:end',
      method: 'initializeOAuthSession',
      account: redactAccount(account),
    })
    return true
  }, [store, onSessionChange, cancelPendingTask])

  const login = useCallback<SessionApiContext['login']>(
    async (params, logContext) => {
      addSessionDebugLog({type: 'method:start', method: 'login'})
      const signal = cancelPendingTask()
      const {bundle, account} = await createSessionBundleAndLogin(
        params,
        onSessionChange,
      )

      if (signal.aborted) {
        // The factory returns an armed bundle, so a superseded login must dispose it.
        disposeBundle(bundle)
        return
      }
      store.dispatch({
        type: 'switched-to-account',
        newBundle: bundle,
        newAccount: account,
      })
      ax.metric(
        'account:loggedIn',
        {logContext, withPassword: false},
        {session: utils.accountToSessionMetadata(account)},
      )
      addSessionDebugLog({
        type: 'method:end',
        method: 'login',
        account: redactAccount(account),
      })
    },
    [ax, store, onSessionChange, cancelPendingTask],
  )

  const logoutCurrentAccount = useCallback<
    SessionApiContext['logoutCurrentAccount']
  >(
    logContext => {
      addSessionDebugLog({type: 'method:start', method: 'logout'})
      cancelPendingTask()
      const prevState = store.getState()
      store.dispatch({
        type: 'logged-out-current-account',
      })
      ax.metric(
        'account:loggedOut',
        {logContext, scope: 'current'},
        {
          session: utils.accountToSessionMetadata(
            prevState.accounts.find(
              a => a.did === prevState.currentBundleState.did,
            ),
          ),
        },
      )
      addSessionDebugLog({type: 'method:end', method: 'logout'})
      const did = prevState.currentBundleState.did
      if (did) {
        void clearPersistedQueryStorage(did)
        void revokeOAuthSession(did).catch(error =>
          logOAuthRevocationFailure(did, error),
        )
      }
      // reset onboarding flow on logout
      onboardingDispatch({type: 'skip'})
    },
    [ax, store, cancelPendingTask, onboardingDispatch],
  )

  const logoutEveryAccount = useCallback<
    SessionApiContext['logoutEveryAccount']
  >(
    logContext => {
      addSessionDebugLog({type: 'method:start', method: 'logout'})
      cancelPendingTask()
      const prevState = store.getState()
      store.dispatch({
        type: 'logged-out-every-account',
      })
      ax.metric(
        'account:loggedOut',
        {logContext, scope: 'every'},
        {
          session: utils.accountToSessionMetadata(
            prevState.accounts.find(
              a => a.did === prevState.currentBundleState.did,
            ),
          ),
        },
      )
      addSessionDebugLog({type: 'method:end', method: 'logout'})
      for (const account of prevState.accounts) {
        void clearPersistedQueryStorage(account.did)
        void revokeOAuthSession(account.did).catch(error =>
          logOAuthRevocationFailure(account.did, error),
        )
      }
      // reset onboarding flow on logout
      onboardingDispatch({type: 'skip'})
    },
    [store, cancelPendingTask, onboardingDispatch, ax],
  )

  const resumeSession = useCallback<SessionApiContext['resumeSession']>(
    async (storedAccount, isSwitchingAccounts = false) => {
      addSessionDebugLog({
        type: 'method:start',
        method: 'resumeSession',
        account: redactAccount(storedAccount),
      })
      const signal = cancelPendingTask()
      const {bundle, account} = await createSessionBundleAndResume(
        storedAccount,
        onSessionChange,
      )

      if (signal.aborted) {
        // The factory returns an armed bundle, so a superseded resume must dispose it.
        disposeBundle(bundle)
        return
      }
      /*
       * A cross-tab logout may clear or remove the account while resume is in
       * flight. Check the account entry rather than the current did so ordinary
       * account switching remains valid.
       */
      const latest = store.getState()
      const latestEntry = latest.accounts.find(a => a.did === account.did)
      if (!latestEntry || latestEntry.authType !== 'oauth') {
        disposeBundle(bundle)
        return
      }
      store.dispatch({
        type: 'switched-to-account',
        newBundle: bundle,
        newAccount: account,
      })
      addSessionDebugLog({
        type: 'method:end',
        method: 'resumeSession',
        account: redactAccount(account),
      })
      if (isSwitchingAccounts) {
        // reset onboarding flow on switch account
        onboardingDispatch({type: 'skip'})
      }
    },
    [store, onSessionChange, cancelPendingTask, onboardingDispatch],
  )

  const partialRefreshSession = useCallback<
    SessionApiContext['partialRefreshSession']
  >(async () => {
    /*
     * Read the live bundle rather than the one captured by this render: a
     * dispatch that lands before the next render would otherwise leave this
     * holding a disposed bundle, whose clients dispatch through a disabled
     * fetch.
     */
    const bundle = store.getState().currentBundleState
      .bundle as unknown as SessionBundle
    const signal = cancelPendingTask()
    /* getSession targets the PDS; only the persisted account fields are patched. */
    const data = await bundle.pdsClient.call(com.atproto.server.getSession, {})
    if (signal.aborted) return
    store.dispatch({
      type: 'partial-refresh-session',
      /*
       * Read the did off the response rather than the session: the bundle may
       * have been disposed while the request was in flight, and the live
       * getters throw in that state.
       */
      accountDid: data.did,
      patch: {
        emailConfirmed: data.emailConfirmed,
        emailAuthFactor: data.emailAuthFactor,
      },
    })
  }, [store, cancelPendingTask])

  /**
   * Rotate the session's tokens and hand back the resulting account snapshot.
   *
   * OAuth refresh rejects on a failed rotation and returns a fresh identity
   * snapshot on success. The adapter owns the refresh token and DPoP key; this
   * layer only exposes the resulting account metadata to callers.
   *
   * Like {@link partialRefreshSession}, the bundle comes from
   * `store.getState()` rather than the render's `state`: a dispatch landing
   * before the next render would otherwise leave this holding a disposed
   * bundle, and reading live also keeps the callback's identity stable across
   * unrelated state updates.
   */
  const refreshSession = useCallback<
    SessionApiContext['refreshSession']
  >(async () => {
    const bundle = store.getState().currentBundleState.bundle as unknown as
      SessionBundle | PublicSessionBundle
    if (!bundle.session) return undefined // logged out: nothing to refresh
    const before = bundle.session.session
    const after = await bundle.session.refresh()
    if (after === before) {
      throw new Error('Failed to refresh session')
    }
    /*
     * The user may have logged out or switched accounts while the refresh was
     * in flight. Reporting success then would run the caller's success path
     * (dialogs closing, success toasts, SignupQueued advancing) against an
     * account that is no longer active, so a stale bundle rejects instead.
     */
    if (
      (store.getState().currentBundleState.bundle as unknown) !==
      (bundle as unknown)
    ) {
      throw new Error('The session changed while it was being refreshed')
    }
    /*
     * The session's `onUpdated` hook dispatches the new tokens into the store,
     * but that lands a render away; this snapshot exposes them immediately.
     */
    return sessionDataToSessionAccount(
      after,
      after.service,
      store.getState().accounts.find(a => a.did === after.did)?.pdsUrl,
    )
  }, [store])

  const removeAccount = useCallback<SessionApiContext['removeAccount']>(
    account => {
      addSessionDebugLog({
        type: 'method:start',
        method: 'removeAccount',
        account: redactAccount(account),
      })
      cancelPendingTask()
      store.dispatch({
        type: 'removed-account',
        accountDid: account.did,
      })
      void revokeOAuthSession(account.did).catch(error =>
        logOAuthRevocationFailure(account.did, error),
      )
      addSessionDebugLog({
        type: 'method:end',
        method: 'removeAccount',
        account: redactAccount(account),
      })
    },
    [store, cancelPendingTask],
  )
  useEffect(() => {
    return persisted.onUpdate('session', nextSession => {
      const synced = nextSession
      addSessionDebugLog({
        type: 'persisted:receive',
        data: redactPersistedSession(synced),
      })
      store.dispatch({
        type: 'synced-accounts',
        syncedAccounts: synced.accounts,
        syncedCurrentDid: synced.currentAccount?.did,
      })
      const syncedAccount = synced.accounts.find(
        a => a.did === synced.currentAccount?.did,
      )
      /*
       * Cancel pending work when another tab logs out the account this tab
       * considers current. Do not cancel unrelated work between logged-out tabs.
       */
      const syncedDid =
        syncedAccount?.authType === 'oauth' ? syncedAccount.did : undefined
      if (
        syncedDid === undefined &&
        state.currentBundleState.did !== undefined
      ) {
        cancelPendingTask()
      }
      if (syncedAccount && syncedAccount.authType === 'oauth') {
        if (syncedAccount.did !== state.currentBundleState.did) {
          // Restore the provider-backed session for the account selected by
          // another tab. OAuth tokens and DPoP keys never cross the broadcast.
          void resumeSession(syncedAccount)
        }
      }
    })
  }, [store, state, resumeSession, onSessionChange, cancelPendingTask])

  const stateContext = useMemo(
    () => ({
      accounts: state.accounts,
      currentAccount: state.accounts.find(
        a => a.did === state.currentBundleState.did,
      ),
      hasSession: !!state.currentBundleState.did,
    }),
    [state],
  )
  const switchAppView = useCallback(
    async (providerId: string, persist = true) => {
      const account = state.accounts.find(
        item => item.did === state.currentBundleState.did,
      )
      const currentBundle = state.currentBundleState.bundle as SessionBundle
      if (!account || !currentBundle.session) return
      const provider = getAppViewProviders().find(
        item => item.id === providerId,
      )
      if (!provider) throw new Error('Unknown AppView provider')
      await probeAppViewProvider(provider)
      if (persist) await selectAppViewProvider(account.did, providerId)
      await clearPersistedQueryStorage(account.did)
      const newBundle = switchBundleAppViewProvider(currentBundle, provider)
      store.dispatch({
        type: 'replaced-current-bundle',
        newBundle,
        newAccount: account,
      })
      emitAppViewProviderChanged(account.did, provider.id)
    },
    [state, store],
  )

  const api = useMemo(
    () => ({
      signUp,
      initializeOAuthSession,
      createAccount,
      login,
      logoutCurrentAccount,
      logoutEveryAccount,
      resumeSession,
      removeAccount,
      partialRefreshSession,
      refreshSession,
      switchAppViewProvider: switchAppView,
    }),
    [
      signUp,
      initializeOAuthSession,
      createAccount,
      login,
      logoutCurrentAccount,
      logoutEveryAccount,
      resumeSession,
      removeAccount,
      partialRefreshSession,
      refreshSession,
      switchAppView,
    ],
  )

  const bundle = state.currentBundleState.bundle as unknown as
    SessionBundle | PublicSessionBundle

  // @ts-expect-error window type is not declared, debug only
  // eslint-disable-next-line react-hooks/immutability
  if (__DEV__ && IS_WEB) window.bundle = bundle

  const currentBundleRef = useRef(bundle)
  /*
   * Disposal is deferred to this post-commit effect deliberately: components may
   * still render against the outgoing bundle during the commit that swaps it, so
   * disabling its session inline would pull the transport out from under them.
   * The reducer's bundle-identity guard drops any events the not-yet-disposed
   * session emits in that window.
   */
  useEffect(() => {
    if (currentBundleRef.current !== bundle) {
      const prevBundle = currentBundleRef.current
      currentBundleRef.current = bundle
      addSessionDebugLog({
        type: 'bundle:switch',
        prevBundleId: getBundleId(prevBundle),
        nextBundleId: getBundleId(bundle),
      })
      // Replaced bundles must never consume another refresh token.
      disposeBundle(prevBundle)
    }
  }, [bundle])

  return (
    <BundleContext.Provider value={bundle}>
      <StateContext.Provider value={stateContext}>
        <ApiContext.Provider value={api}>
          <AnalyticsContext
            metadata={utils.useMeta({
              session: utils.accountToSessionMetadata(
                stateContext.currentAccount,
              ),
            })}>
            {children}
          </AnalyticsContext>
        </ApiContext.Provider>
      </StateContext.Provider>
    </BundleContext.Provider>
  )
}

function logOAuthRevocationFailure(did: string, error: unknown): void {
  logger.error(error instanceof Error ? error : String(error), {
    message: 'session: provider OAuth revocation failed after local logout',
    did,
  })
}

function useOneTaskAtATime() {
  const abortController = useRef<AbortController | null>(null)
  const cancelPendingTask = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort()
    }
    abortController.current = new AbortController()
    return abortController.current.signal
  }, [])
  return cancelPendingTask
}

export function useSession() {
  return useContext(StateContext)
}

export function useSessionApi() {
  return useContext(ApiContext)
}

export function useRequireAuth() {
  const {hasSession} = useSession()
  const closeAll = useCloseAllActiveElements()
  const {signinDialogControl} = useGlobalDialogsControlContext()

  return useCallback(
    (fn: () => unknown) => {
      if (hasSession) {
        fn()
      } else {
        closeAll()
        signinDialogControl.open()
      }
    },
    [hasSession, signinDialogControl, closeAll],
  )
}

/**
 * Client for appview reads. Logged out, this is the bundle's public client,
 * which dispatches unauthenticated against the public appview.
 */
export function useAppviewClient(): Client {
  const bundle = useContext(BundleContext)
  if (!bundle) {
    throw Error('useAppviewClient() must be below <SessionProvider>.')
  }
  return bundle.appviewClient
}

/**
 * Client for account-host requests. It shares the active session's auth
 * lifecycle but sets no proxy or labeler headers, so calls target the PDS.
 * Logged out, calls throw `NotAuthenticatedError` before network I/O. Use
 * {@link useMaybePdsClient} when the caller must branch on authentication.
 */
export function usePdsClient(): Client {
  const bundle = useContext(BundleContext)
  if (!bundle) {
    throw Error('usePdsClient() must be below <SessionProvider>.')
  }
  return bundle.pdsClient
}

/**
 * Client for `chat.bsky.*` calls. Logged-out calls throw
 * `NotAuthenticatedError`; use {@link useMaybeChatClient} to branch on auth.
 */
export function useChatClient(): Client {
  const bundle = useContext(BundleContext)
  if (!bundle) {
    throw Error('useChatClient() must be below <SessionProvider>.')
  }
  return bundle.chatClient
}

/**
 * Account-host client for the active session, or `null` when logged out.
 */
export function useMaybePdsClient(): Client | null {
  const bundle = useContext(BundleContext)
  return bundle?.session ? bundle.pdsClient : null
}

/**
 * Chat client for the active session, or `null` when logged out.
 */
export function useMaybeChatClient(): Client | null {
  const bundle = useContext(BundleContext)
  return bundle?.session ? bundle.chatClient : null
}

/**
 * The unauthenticated client for public appview reads.
 */
export function usePublicAppviewClient(endpoint?: string): Client {
  return getPublicAppviewClient(endpoint)
}
