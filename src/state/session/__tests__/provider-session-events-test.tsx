import {beforeEach, describe, expect, it, jest} from '@jest/globals'
import {act, render} from '@testing-library/react-native'

import {type Schema} from '#/state/persisted/schema'
import {type SessionData} from '../session-data'
import {type SessionAccount} from '../types'

/*
 * The provider pulls the whole app shell in through `#/state/util` and the
 * account factories. These mocks cut the tree back to the session lifecycle
 * itself, which is all these tests drive. They mirror provider-abort-test.tsx,
 * plus a stateful `#/state/persisted` for cross-tab updates and an observable
 * `emitSessionDropped`.
 */
const mockPersisted: {session: Schema['session']} = {
  session: {accounts: [], currentAccount: undefined},
}
/* Every registered listener is kept so cross-tab callbacks can be exercised. */
const mockPersistedListeners: ((value: Schema['session']) => void)[] = []
jest.mock('#/state/persisted', () => {
  const {
    defaults,
  }: typeof import('#/state/persisted/schema') = require('#/state/persisted/schema')
  return {
    defaults,
    get: (key: string) =>
      key === 'session'
        ? mockPersisted.session
        : defaults[key as keyof typeof defaults],
    write: () => Promise.resolve(),
    onUpdate: (_key: string, cb: (value: Schema['session']) => void) => {
      mockPersistedListeners.push(cb)
      return () => {}
    },
  }
})
jest.mock('#/state/util', () => ({useCloseAllActiveElements: () => () => {}}))
jest.mock('#/components/dialogs/Context', () => ({
  useGlobalDialogsControlContext: () => ({signinDialogControl: {open() {}}}),
}))
jest.mock('#/analytics', () => ({
  AnalyticsContext: ({children}: {children: React.ReactNode}) => children,
  useAnalyticsBase: () => ({metric() {}, logger: {debug() {}, error() {}}}),
  utils: {accountToSessionMetadata: () => ({}), useMeta: () => undefined},
}))
jest.mock('#/state/shell/onboarding', () => ({
  useOnboardingDispatch: () => () => {},
}))
jest.mock('#/lib/persisted-query-storage', () => ({
  clearPersistedQueryStorage: () => Promise.resolve(),
}))
jest.mock('#/lib/notifications/notifications', () => ({
  unregisterPushToken: () => Promise.resolve(),
}))
jest.mock('jwt-decode', () => ({jwtDecode: () => ({})}))

const mockEmitSessionDropped = jest.fn()
jest.mock('#/state/events', () => ({
  emitSessionDropped: () => mockEmitSessionDropped(),
  emitNetworkConfirmed: () => {},
  emitNetworkLost: () => {},
}))

/* The factories are stubbed so each test controls exactly what it returns. */
const mockLogin = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const mockResume = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const mockDisposeBundle = jest.fn()
jest.mock('../session-core', () => ({
  ...jest.requireActual<object>('../session-core'),
  createSessionBundleAndLogin: (...args: unknown[]) => mockLogin(...args),
  createSessionBundleAndResume: (...args: unknown[]) => mockResume(...args),
  disposeBundle: (bundle: unknown) => mockDisposeBundle(bundle),
}))
jest.mock('../create-account', () => ({
  createSessionBundleAndCreateAccount: () => new Promise(() => {}),
}))

import {Provider, useSession, useSessionApi} from '#/state/session'
import {
  type OnSessionChange,
  type SessionBundle,
} from '#/state/session/session-core'
import {type SessionApiContext} from '#/state/session/types'

const DID = 'did:plc:example123'
const SERVICE = 'https://bsky.social/'

function makeAccount(overrides: Partial<SessionAccount> = {}): SessionAccount {
  return {
    authType: 'oauth',
    service: SERVICE,
    did: DID,
    handle: 'alice.test',
    email: 'alice@example.com',
    emailConfirmed: true,
    emailAuthFactor: false,
    refreshJwt: 'refresh-jwt-1',
    accessJwt: 'access-jwt-1',
    signupQueued: false,
    active: true,
    status: undefined,
    pdsUrl: undefined,
    isSelfHosted: false,
    ...overrides,
  }
}

/*
 * The provider only ever reads `bundle.agent` (for context) and
 * `bundle.session.destroyed` / `bundle.session.session` (for the cross-tab
 * token comparison), and otherwise treats a bundle as an opaque identity. A
 * literal with those fields is enough, and keeps a real OAuth transport - with
 * its network and refresh machinery - out of a suite about provider dispatch.
 */
type FakeBundle = {
  session: {destroyed: boolean; session: SessionData}
  agent: object
  service: URL
}

function makeBundle(account: SessionAccount): FakeBundle {
  return {
    session: {
      destroyed: false,
      session: {
        authType: 'oauth',
        accessJwt: account.accessJwt ?? '',
        refreshJwt: account.refreshJwt ?? '',
        /* SessionData types these as branded strings; the values are fixtures */
        handle: account.handle,
        did: account.did,
        active: true,
        service: account.service,
      },
    },
    agent: {},
    service: new URL(account.service),
  }
}

type Harness = {
  api: SessionApiContext
  /** The provider's own onSessionChange, as handed to a session factory. */
  onSessionChange: OnSessionChange
  currentAccount: () => SessionAccount | undefined
  hasSession: () => boolean
}

/**
 * Render the provider, log an account in through the stubbed login factory, and
 * hand back the api plus the `onSessionChange` the factory received. Firing
 * that callback is how a test synthesizes a session event from a live bundle.
 */
async function renderLoggedIn(
  account: SessionAccount,
  bundle: FakeBundle,
): Promise<Harness> {
  let api!: SessionApiContext
  let session!: ReturnType<typeof useSession>
  function Probe() {
    api = useSessionApi()
    session = useSession()
    return null
  }
  render(
    <Provider>
      <Probe />
    </Provider>,
  )

  let captured!: OnSessionChange
  mockLogin.mockImplementationOnce((...args: unknown[]) => {
    captured = args[1] as OnSessionChange
    return Promise.resolve({bundle, account})
  })
  await act(async () => {
    await api.login({} as never, 'LoginForm')
  })

  return {
    api,
    onSessionChange: captured,
    currentAccount: () => session.currentAccount,
    hasSession: () => session.hasSession,
  }
}

/** The dying payload threads through its OAuth transport's deletion hook. */
function dyingData(refreshJwt: string): SessionData {
  return {
    accessJwt: 'dead-access-jwt',
    refreshJwt,
    handle: 'alice.test',
    did: DID,
    active: true,
    service: SERVICE,
  }
}

/** The rotated payload threads through its OAuth transport's update hook. */
function refreshedData(
  refreshJwt: string,
  didDoc?: SessionData['didDoc'],
): SessionData {
  return {
    accessJwt: 'fresh-access-jwt',
    refreshJwt,
    handle: 'alice.test',
    did: DID,
    active: true,
    service: SERVICE,
    ...(didDoc ? {didDoc} : {}),
  }
}

/** A minimal valid DID document whose only service entry is a PDS. */
function makeDidDoc(pdsUrl: string): SessionData['didDoc'] {
  return {
    id: DID,
    service: [
      {
        id: '#atproto_pds',
        type: 'AtprotoPersonalDataServer',
        serviceEndpoint: pdsUrl,
      },
    ],
  }
}

beforeEach(() => {
  mockPersisted.session = {accounts: [], currentAccount: undefined}
  mockPersistedListeners.length = 0
  mockLogin.mockReset()
  mockResume.mockReset()
  mockDisposeBundle.mockReset()
  mockEmitSessionDropped.mockReset()
})

describe('OAuth expiry handling', () => {
  it('logs out an expired OAuth session', async () => {
    const account = makeAccount()
    const bundle = makeBundle(account)
    const {onSessionChange, hasSession, currentAccount} = await renderLoggedIn(
      account,
      bundle,
    )

    act(() => {
      onSessionChange(
        bundle as unknown as SessionBundle,
        DID,
        'expired',
        dyingData('refresh-jwt-1'),
      )
    })

    expect(mockEmitSessionDropped).toHaveBeenCalledTimes(1)
    expect(hasSession()).toBe(false)
    expect(currentAccount()).toBe(undefined)
  })

  it('drops the session and logs out when there is no fresher generation', async () => {
    const account = makeAccount()
    const bundle = makeBundle(account)
    const {onSessionChange, hasSession, currentAccount} = await renderLoggedIn(
      account,
      bundle,
    )

    act(() => {
      onSessionChange(
        bundle as unknown as SessionBundle,
        DID,
        'expired',
        dyingData('refresh-jwt-1'),
      )
    })

    expect(mockEmitSessionDropped).toHaveBeenCalledTimes(1)
    expect(hasSession()).toBe(false)
    /* the reducer cleared the dead credentials rather than keeping them */
    expect(currentAccount()).toBe(undefined)
  })
})

/*
 * A refresh payload only carries a didDoc when the server sends one, but
 * `pdsUrl` is never derived from the login service. If the provider does not
 * thread the stored value through, an ordinary refresh persists
 * `pdsUrl: undefined` and the next cold start routes pre-refresh requests to
 * the entryway instead of the account's PDS.
 */
describe('refresh persistence', () => {
  const PDS_HOST = 'https://shimeji.us-east.host.bsky.network'
  const DIDDOC_PDS_HOST = 'https://morel.us-west.host.bsky.network'

  it('keeps the stored pdsUrl when the refresh carries no didDoc', async () => {
    const account = makeAccount({pdsUrl: `${PDS_HOST}/`})
    const bundle = makeBundle(account)
    const {onSessionChange, currentAccount} = await renderLoggedIn(
      account,
      bundle,
    )

    act(() => {
      onSessionChange(
        bundle as unknown as SessionBundle,
        DID,
        'update',
        refreshedData('refresh-jwt-2'),
      )
    })

    expect(currentAccount()?.refreshJwt).toBe('refresh-jwt-2')
    expect(currentAccount()?.pdsUrl).toBe(`${PDS_HOST}/`)
  })

  it('prefers the didDoc endpoint over the stored pdsUrl', async () => {
    const account = makeAccount({pdsUrl: `${PDS_HOST}/`})
    const bundle = makeBundle(account)
    const {onSessionChange, currentAccount} = await renderLoggedIn(
      account,
      bundle,
    )

    act(() => {
      onSessionChange(
        bundle as unknown as SessionBundle,
        DID,
        'update',
        refreshedData('refresh-jwt-2', makeDidDoc(DIDDOC_PDS_HOST)),
      )
    })

    expect(currentAccount()?.pdsUrl).toBe(`${DIDDOC_PDS_HOST}/`)
  })
})

/** Deliver a cross-tab `persisted` update to the provider's newest listener. */
function emitSynced(session: Schema['session']) {
  mockPersistedListeners[mockPersistedListeners.length - 1](session)
}

/*
 * OAuth refresh tokens and DPoP keys stay in provider-owned storage and are not
 * copied through the persisted account broadcast. Same-DID updates therefore
 * update account metadata while the active provider transport remains intact.
 */
describe('cross-tab sync', () => {
  it('short-circuits an update carrying the tokens the live session already has', async () => {
    const account = makeAccount()
    const bundle = makeBundle(account)
    const {hasSession} = await renderLoggedIn(account, bundle)

    act(() => {
      emitSynced({accounts: [account], currentAccount: account})
    })

    /* identical metadata: the active provider transport remains untouched */
    expect(hasSession()).toBe(true)
  })

  it('does not rebuild the active transport for a same-DID update', async () => {
    const account = makeAccount()
    const bundle = makeBundle(account)
    const {currentAccount} = await renderLoggedIn(account, bundle)

    const rotated = makeAccount({
      accessJwt: 'access-jwt-2',
      refreshJwt: 'refresh-jwt-2',
    })
    act(() => {
      emitSynced({accounts: [rotated], currentAccount: rotated})
    })

    /* OAuth token material is not replayed from the persistence broadcast. */
    expect(currentAccount()?.refreshJwt).toBe('refresh-jwt-2')
  })

  it('keeps the active transport while same-DID updates arrive back to back', async () => {
    const account = makeAccount()
    const bundle = makeBundle(account)
    const {currentAccount} = await renderLoggedIn(account, bundle)

    const gen2 = makeAccount({
      accessJwt: 'access-jwt-2',
      refreshJwt: 'refresh-jwt-2',
    })
    const gen3 = makeAccount({
      accessJwt: 'access-jwt-3',
      refreshJwt: 'refresh-jwt-3',
    })

    /*
     * Two broadcasts land back to back inside one act(), so React does not
     * commit (and the effect does not re-subscribe) between them. Neither
     * update should replace the active OAuth transport.
     */
    const listener = mockPersistedListeners[mockPersistedListeners.length - 1]
    act(() => {
      listener({accounts: [gen2], currentAccount: gen2})
      listener({accounts: [gen3], currentAccount: gen3})
    })

    expect(currentAccount()?.refreshJwt).toBe('refresh-jwt-3')
  })

  it('cancels pending work when another tab logs the account out', async () => {
    const account = makeAccount()
    const bundle = makeBundle(account)
    const {api} = await renderLoggedIn(account, bundle)

    /* a resume is in flight and will resolve only after the cross-tab logout */
    const resumedBundle = makeBundle(account)
    let finishResume!: (value: unknown) => void
    mockResume.mockReturnValueOnce(
      new Promise(resolve => {
        finishResume = resolve
      }),
    )
    const pending = api.resumeSession(account)

    const loggedOut = makeAccount({accessJwt: undefined, refreshJwt: undefined})
    act(() => {
      emitSynced({accounts: [loggedOut], currentAccount: loggedOut})
    })

    await act(async () => {
      finishResume({bundle: resumedBundle, account})
      await pending
    })

    /* the superseded resume disposed its bundle rather than signing back in */
    expect(mockDisposeBundle).toHaveBeenCalledWith(resumedBundle)
  })
})
