import {describe, expect, it, jest} from '@jest/globals'

import {
  initializeBrowserOAuthClient,
  OAuthSessionAdapter,
} from '../oauth-session'

describe('browser OAuth initialization', () => {
  it('adopts the session returned by the callback/restore initializer', async () => {
    const session = {} as never
    const init = jest.fn().mockResolvedValue({session, state: 'oauth-state'})

    await expect(initializeBrowserOAuthClient({init} as never)).resolves.toBe(
      session,
    )
    expect(init).toHaveBeenCalledTimes(1)
  })

  it('keeps a normal logged-out startup without a restored session', async () => {
    const init = jest.fn().mockResolvedValue(undefined)

    await expect(initializeBrowserOAuthClient({init} as never)).resolves.toBe(
      undefined,
    )
    expect(init).toHaveBeenCalledTimes(1)
  })

  it('preserves an absolute PDS URL for OAuth-backed account routing', async () => {
    const requests: string[] = []
    const providerSession = {
      serverMetadata: {issuer: 'https://plumblines.uk'},
      getTokenInfo: jest.fn().mockResolvedValue({scope: 'atproto'}),
      fetchHandler: jest.fn((path: string) => {
        requests.push(path)
        return Promise.resolve(
          new Response(
            JSON.stringify(
              path.includes('com.atproto.server.getSession')
                ? {did: 'did:plc:example123', handle: 'alice.test'}
                : {},
            ),
            {headers: {'content-type': 'application/json'}},
          ),
        )
      }),
    }

    const session = await OAuthSessionAdapter.fromSession(
      providerSession as never,
    )
    const pdsUrl =
      'https://pds.example.test/xrpc/app.bsky.actor.getProfile?actor=alice.test'

    await session.fetchHandler(pdsUrl)

    expect(requests).toEqual(['/xrpc/com.atproto.server.getSession', pdsUrl])
  })
})
