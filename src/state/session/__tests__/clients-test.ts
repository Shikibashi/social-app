import {Client} from '@atproto/lex'
import {PasswordSession} from '@atproto/lex-password-session'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'

jest.mock('#/state/events', () => ({
  emitNetworkConfirmed: jest.fn(),
  emitNetworkLost: jest.fn(),
}))

jest.mock('jwt-decode', () => ({
  jwtDecode() {
    return {scope: 'com.atproto.access'}
  },
}))

import {BLUESKY_PROXY_HEADER, CHAT_PROXY_SERVICE} from '#/lib/constants'
import {
  invalidateCachedIsBetaUser,
  setCachedIsBetaUser,
} from '#/state/preferences/beta-user-cache'
import {app, chat, com} from '#/lexicons'
import {account} from '#/storage'
import {configureGlobalAppLabelers} from '../additional-moderation-authorities'
import {
  buildAppviewClient,
  buildChatClient,
  buildPdsClient,
  getUnauthenticatedThrowingClient,
  NotAuthenticatedError,
  routeSessionToPds,
} from '../clients'
import {DEFAULT_APPVIEW_PROVIDER} from '../providers'
import {sessionAccountToSessionData} from '../session-data'
import {
  asFetch,
  DID,
  DIDDOC_PDS_HOST,
  HANDLE,
  json,
  makeAccount,
  makeDidDoc,
  makeMockFetch,
  type MockFetch,
  PDS_HOST,
  SERVICE,
  urlsOf,
} from './mock-fetch'

const PROFILE_BODY = {
  did: DID,
  handle: HANDLE,
}

/** A mock fetch that answers `getProfile` and records every request. */
function makeProfileFetch(): MockFetch {
  return makeMockFetch({
    'app.bsky.actor.getProfile': () => json(PROFILE_BODY),
  })
}

/** A live `PasswordSession` whose whole network path is the mock fetch. */
function makeSession(fetchMock: MockFetch, didDocPdsUrl?: string) {
  const account = makeAccount()
  return new PasswordSession(
    {
      ...sessionAccountToSessionData(account),
      ...(didDocPdsUrl ? {didDoc: makeDidDoc(didDocPdsUrl)} : {}),
    },
    {fetch: asFetch(fetchMock)},
  )
}

/** The `init` a mock fetch was called with for a given nsid. */
function initFor(mock: MockFetch, nsid: string): RequestInit | undefined {
  const call = mock.mock.calls.find(c => {
    const url = c[0] instanceof URL ? c[0].href : String(c[0])
    return url.includes(`/xrpc/${nsid}`)
  })
  return call?.[1]
}

/** The headers a mock fetch was called with for a given nsid. */
function headersFor(mock: MockFetch, nsid: string): Headers {
  return new Headers(initFor(mock, nsid)?.headers)
}

describe('buildAppviewClient', () => {
  let fetchMock: MockFetch
  let globalFetchSpy: jest.SpiedFunction<typeof fetch>

  beforeEach(() => {
    fetchMock = makeProfileFetch()
    globalFetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(asFetch(fetchMock))
    configureGlobalAppLabelers([])
    account.remove([DID, 'isBetaUser'])
    invalidateCachedIsBetaUser(DID)
  })

  afterEach(() => {
    globalFetchSpy.mockRestore()
  })

  it('passes through the session did', () => {
    const client = buildAppviewClient(makeSession(fetchMock))
    expect(client).toBeInstanceOf(Client)
    expect(client.did).toBe(DID)
  })

  it('routes client.call through the session to the network', async () => {
    const client = buildAppviewClient(makeSession(fetchMock))

    const body = await client.call(app.bsky.actor.getProfile, {actor: HANDLE})

    expect(body.handle).toBe(HANDLE)
    expect(urlsOf(fetchMock).join()).toContain(`actor=${HANDLE}`)
  })

  it('routes authenticated reads to the explicitly selected project provider', async () => {
    const provider = {
      ...DEFAULT_APPVIEW_PROVIDER,
      id: 'project-owned-appview',
      displayName: 'Project-owned AppView',
      serviceDid:
        'did:web:appview.project.test' as typeof DEFAULT_APPVIEW_PROVIDER.serviceDid,
      serviceFragment: 'appview',
      endpoint: 'https://appview.project.test',
      builtin: false,
    }
    const client = buildAppviewClient(makeSession(fetchMock), provider)

    await client.call(app.bsky.actor.getProfile, {actor: HANDLE})

    expect(urlsOf(fetchMock)).toContain(
      `${provider.endpoint}/xrpc/app.bsky.actor.getProfile?actor=${HANDLE}`,
    )
    expect(
      headersFor(fetchMock, 'app.bsky.actor.getProfile').get('atproto-proxy'),
    ).toBe(`${provider.serviceDid}#${provider.serviceFragment}`)
  })

  it('attributes an AppView identity rejection to the selected provider', async () => {
    globalFetchSpy.mockImplementation(async input => {
      const url =
        input instanceof URL
          ? input.href
          : typeof input === 'string'
            ? input
            : input.url
      if (url.startsWith(DEFAULT_APPVIEW_PROVIDER.endpoint)) {
        return json(
          {error: 'AuthenticationRequired', message: 'identity unknown'},
          401,
        )
      }
      return asFetch(fetchMock)(input)
    })

    const client = buildAppviewClient(makeSession(fetchMock))

    await expect(
      client.call(app.bsky.actor.getProfile, {actor: HANDLE}),
    ).rejects.toMatchObject({
      name: 'XrpcFetchError',
      cause: expect.objectContaining({
        name: 'ServiceBoundaryError',
        boundary: {
          kind: 'AppView provider',
          displayName: DEFAULT_APPVIEW_PROVIDER.displayName,
          serviceDid: DEFAULT_APPVIEW_PROVIDER.serviceDid,
        },
      }),
    })
  })

  it('emits the appview proxy header', async () => {
    const client = buildAppviewClient(makeSession(fetchMock))

    await client.call(app.bsky.actor.getProfile, {actor: HANDLE})

    expect(
      headersFor(fetchMock, 'app.bsky.actor.getProfile').get('atproto-proxy'),
    ).toBe(BLUESKY_PROXY_HEADER.get())
  })

  it.each([true, false])(
    'emits the current beta user header when the cached value is %s',
    async isBetaUser => {
      const client = buildAppviewClient(makeSession(fetchMock))
      setCachedIsBetaUser(DID, isBetaUser)

      await client.call(app.bsky.actor.getProfile, {actor: HANDLE})

      expect(
        headersFor(fetchMock, 'app.bsky.actor.getProfile').get(
          'x-bsky-is-beta-user',
        ),
      ).toBe(String(isBetaUser))
    },
  )

  it('omits the beta user header when the preference is not cached', async () => {
    const client = buildAppviewClient(makeSession(fetchMock))

    await client.call(app.bsky.actor.getProfile, {actor: HANDLE})

    expect(
      headersFor(fetchMock, 'app.bsky.actor.getProfile').get(
        'x-bsky-is-beta-user',
      ),
    ).toBeNull()
  })

  it('reads the persisted beta preference only once', async () => {
    account.set([DID, 'isBetaUser'], true)
    const getSpy = jest.spyOn(account, 'get')
    const client = buildAppviewClient(makeSession(fetchMock))

    await client.call(app.bsky.actor.getProfile, {actor: HANDLE})
    await client.call(app.bsky.actor.getProfile, {actor: HANDLE})

    expect(getSpy).toHaveBeenCalledTimes(1)
    getSpy.mockRestore()
  })

  it('emits an account subscription exactly once', async () => {
    const client = buildAppviewClient(makeSession(fetchMock))
    client.setLabelers(['did:plc:labeler'])

    await client.call(app.bsky.actor.getProfile, {actor: HANDLE})

    const labelers = headersFor(fetchMock, 'app.bsky.actor.getProfile').get(
      'atproto-accept-labelers',
    )
    /*
     * The client is the only producer of this header now, so a duplicate would
     * mean lex itself emitted the same DID twice.
     */
    const entries = labelers!
      .split(',')
      .filter(l => l.includes('did:plc:labeler'))
    expect(entries).toHaveLength(1)
  })

  it('emits a global app labeler once, redacted', async () => {
    /*
     * The global static is the ONLY producer of the redacted authorities - no
     * agent stamps them any more - and lex suffixes them with `;redact`. An
     * account subscription that also listed the same DID would produce a second,
     * non-redacting entry, which is what `applyLabelersToClient` filters against.
     */
    configureGlobalAppLabelers(['did:plc:global-labeler'])
    const client = buildAppviewClient(makeSession(fetchMock))

    await client.call(app.bsky.actor.getProfile, {actor: HANDLE})

    const labelers = headersFor(fetchMock, 'app.bsky.actor.getProfile').get(
      'atproto-accept-labelers',
    )
    const entries = labelers!
      .split(',')
      .map(l => l.trim())
      .filter(l => l.includes('did:plc:global-labeler'))
    expect(entries).toEqual(['did:plc:global-labeler;redact'])
  })

  it('sends a PDS-issued service-auth token to the selected AppView', async () => {
    const client = buildAppviewClient(makeSession(fetchMock))

    await client.call(app.bsky.actor.getProfile, {actor: HANDLE})

    expect(
      headersFor(fetchMock, 'app.bsky.actor.getProfile').get('authorization'),
    ).toBe('Bearer service-auth-jwt')
  })

  it('requests service auth from the account PDS when its route is pinned', async () => {
    const client = buildAppviewClient(
      routeSessionToPds(makeSession(fetchMock), PDS_HOST),
    )

    await client.call(app.bsky.actor.getProfile, {actor: HANDLE})

    expect(urlsOf(fetchMock)).toContain(
      `${PDS_HOST}/xrpc/com.atproto.server.getServiceAuth?aud=${encodeURIComponent(DEFAULT_APPVIEW_PROVIDER.serviceDid)}&lxm=app.bsky.actor.getProfile`,
    )
  })

  it('attributes service-auth rejection to the account PDS and selected provider', async () => {
    const failingFetch = makeMockFetch({
      'app.bsky.actor.getProfile': () => json(PROFILE_BODY),
      'com.atproto.server.getServiceAuth': () =>
        json({error: 'InvalidRequest', message: 'provider not allowed'}, 400),
    })
    globalFetchSpy.mockImplementation(asFetch(failingFetch))

    await expect(
      buildAppviewClient(makeSession(failingFetch)).call(
        app.bsky.actor.getProfile,
        {actor: HANDLE},
      ),
    ).rejects.toMatchObject({
      name: 'XrpcFetchError',
      cause: expect.objectContaining({
        message: `Account PDS could not authorize ${DEFAULT_APPVIEW_PROVIDER.displayName} (${DEFAULT_APPVIEW_PROVIDER.serviceDid}); HTTP 400`,
      }),
    })
  })
})

describe('buildPdsClient', () => {
  let fetchMock: MockFetch

  beforeEach(() => {
    fetchMock = makeProfileFetch()
    configureGlobalAppLabelers([])
  })

  it('is a distinct client from the appview client over the same session', () => {
    const session = makeSession(fetchMock)
    expect(buildPdsClient(session)).not.toBe(buildAppviewClient(session))
  })

  it('sends the session access token', async () => {
    await buildPdsClient(makeSession(fetchMock)).call(
      com.atproto.server.getSession,
      {},
    )

    expect(
      headersFor(fetchMock, 'com.atproto.server.getSession').get(
        'authorization',
      ),
    ).toBe('Bearer access-jwt')
  })

  it('emits neither the proxy nor any labeler header', async () => {
    /*
     * The load-bearing difference from the appview client: a PDS request must
     * reach the account host itself rather than being proxied onward, and it is
     * not an appview read, so it carries no moderation authorities either.
     */
    configureGlobalAppLabelers(['did:plc:global-labeler'])

    await buildPdsClient(makeSession(fetchMock)).call(
      com.atproto.server.getSession,
      {},
    )

    const headers = headersFor(fetchMock, 'com.atproto.server.getSession')
    expect(headers.get('atproto-proxy')).toBeNull()
    expect(headers.get('atproto-accept-labelers')).toBeNull()
  })

  it('resolves the relative xrpc path against the account host', async () => {
    /*
     * lex hands its fetchHandler an origin-less `/xrpc/<nsid>` path; the session
     * absolutizes it against its didDoc endpoint or, absent one, its service.
     */
    await buildPdsClient(makeSession(fetchMock)).call(
      com.atproto.server.getSession,
      {},
    )

    expect(urlsOf(fetchMock)).toContain(
      `${SERVICE}/xrpc/com.atproto.server.getSession`,
    )
  })
})

describe('buildChatClient', () => {
  let fetchMock: MockFetch

  beforeEach(() => {
    fetchMock = makeProfileFetch()
    configureGlobalAppLabelers([])
  })

  it('is a distinct client from the pds client over the same session', () => {
    const session = makeSession(fetchMock)
    expect(buildChatClient(session)).not.toBe(buildPdsClient(session))
  })

  it('emits the chat proxy header exactly once, with the session token', async () => {
    /* the stub body fails listConvos output validation; headers are recorded pre-parse */
    await buildChatClient(makeSession(fetchMock))
      .call(chat.bsky.convo.listConvos, {})
      .catch(() => {})

    const headers = headersFor(fetchMock, 'chat.bsky.convo.listConvos')
    /*
     * An exact match, not `toContain`: `Headers` comma-joins repeated entries
     * for the same name, so a second contributor would show up here.
     */
    expect(headers.get('atproto-proxy')).toBe(CHAT_PROXY_SERVICE)
    expect(headers.get('authorization')).toBe('Bearer access-jwt')
  })

  it('emits no labeler header', async () => {
    /* the global authorities do not apply: a chat call is not an appview read */
    configureGlobalAppLabelers(['did:plc:global-labeler'])

    await buildChatClient(makeSession(fetchMock))
      .call(chat.bsky.convo.listConvos, {})
      .catch(() => {})

    expect(
      headersFor(fetchMock, 'chat.bsky.convo.listConvos').get(
        'atproto-accept-labelers',
      ),
    ).toBeNull()
  })
})

describe('routeSessionToPds', () => {
  let fetchMock: MockFetch

  beforeEach(() => {
    fetchMock = makeProfileFetch()
  })

  it('sends a request to the pinned host rather than the login service', async () => {
    /*
     * The entryway case, and the reason this shim exists: an account whose
     * service is `bsky.social` but whose PDS is elsewhere, with no didDoc yet
     * (the synchronous resume fast path, i.e. the common cold start). Without
     * the shim the session would resolve against its service and every request
     * of that cold start would go to the entryway.
     */
    const session = makeSession(fetchMock)
    const client = buildPdsClient(routeSessionToPds(session, PDS_HOST))

    await client.call(com.atproto.server.getSession, {})

    expect(urlsOf(fetchMock)).toEqual([
      `${PDS_HOST}/xrpc/com.atproto.server.getSession`,
    ])
  })

  it('keeps the session auth lifecycle on the pinned host', async () => {
    const session = makeSession(fetchMock)
    const client = buildPdsClient(routeSessionToPds(session, PDS_HOST))

    await client.call(com.atproto.server.getSession, {})

    expect(
      headersFor(fetchMock, 'com.atproto.server.getSession').get(
        'authorization',
      ),
    ).toBe('Bearer access-jwt')
  })

  it('refreshes an entryway session once when the migrated PDS rejects its token', async () => {
    const fetchMock = makeMockFetch({
      'com.atproto.server.getSession': (url, init) => {
        const authorization = new Headers(init.headers).get('authorization')
        if (authorization === 'Bearer access-jwt') {
          return json(
            {error: 'InvalidToken', message: 'Token could not be verified'},
            400,
          )
        }
        return json({did: DID, handle: HANDLE, active: true})
      },
    })
    const session = makeSession(fetchMock)
    const client = buildPdsClient(routeSessionToPds(session, PDS_HOST))

    await client.call(com.atproto.server.getSession, {})

    expect(urlsOf(fetchMock)).toEqual([
      `${PDS_HOST}/xrpc/com.atproto.server.getSession`,
      `${SERVICE}/xrpc/com.atproto.server.refreshSession`,
      `${PDS_HOST}/xrpc/com.atproto.server.getSession`,
    ])
    const getSessionAuths = fetchMock.mock.calls
      .filter(([input]) =>
        String(input).includes('com.atproto.server.getSession'),
      )
      .map(([, init]) => new Headers(init?.headers).get('authorization'))
    expect(getSessionAuths).toEqual([
      'Bearer access-jwt',
      'Bearer access-jwt-2',
    ])
  })

  it('passes through the session did', () => {
    const session = makeSession(fetchMock)
    expect(routeSessionToPds(session, PDS_HOST).did).toBe(DID)
  })

  it('pins the stored host even when the session carries a different didDoc endpoint', async () => {
    /*
     * The narrowing this shim accepts versus the session manager it replaces:
     * the manager preferred a didDoc endpoint once one arrived, whereas an
     * absolute URL handed to `session.fetchHandler` survives `new URL(path,
     * base)` untouched, so the stored host wins for the bundle's lifetime. That
     * only matters if the account's PDS moved, and the next cold start pins the
     * newly persisted endpoint.
     */
    const session = makeSession(fetchMock, DIDDOC_PDS_HOST)
    const client = buildPdsClient(routeSessionToPds(session, PDS_HOST))

    await client.call(com.atproto.server.getSession, {})

    expect(urlsOf(fetchMock)).toEqual([
      `${PDS_HOST}/xrpc/com.atproto.server.getSession`,
    ])
  })

  it('lets the session route by didDoc when nothing is pinned', async () => {
    /*
     * The counterpart: a bundle built with no stored `pdsUrl` goes straight over
     * the session, which resolves against its own didDoc endpoint.
     */
    const client = buildPdsClient(makeSession(fetchMock, DIDDOC_PDS_HOST))

    await client.call(com.atproto.server.getSession, {})

    expect(urlsOf(fetchMock)).toEqual([
      `${DIDDOC_PDS_HOST}/xrpc/com.atproto.server.getSession`,
    ])
  })
})

describe('getUnauthenticatedThrowingClient', () => {
  it('is a stable singleton with no did', () => {
    const client = getUnauthenticatedThrowingClient()

    expect(client.did).toBeUndefined()
    /* identity is stable so it is safe in React Query keys */
    expect(getUnauthenticatedThrowingClient()).toBe(client)
  })

  it('rejects any call with NotAuthenticatedError as the cause, with no fetch', async () => {
    /*
     * The throwing fetchHandler fires before any network I/O. lex-client wraps a
     * fetchHandler throw in an internal error whose `cause` is the original, so
     * the NotAuthenticatedError surfaces there.
     */
    const fetchMock = makeProfileFetch()
    const err = await getUnauthenticatedThrowingClient()
      .call(com.atproto.server.getSession, {})
      .then(() => undefined)
      .catch((e: unknown) => e)

    expect((err as Error).cause).toBeInstanceOf(NotAuthenticatedError)
    expect(((err as Error).cause as Error).name).toBe('NotAuthenticatedError')
    expect(((err as Error).cause as Error).message).toBe(
      'Not authenticated: this operation requires an active session',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
