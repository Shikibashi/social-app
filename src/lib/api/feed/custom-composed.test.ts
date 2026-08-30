import {type Client} from '@atproto/lex'
import {describe, expect, it, jest} from '@jest/globals'

import {ComposedCustomFeedAPI} from './custom'
import {shouldRetryPostFeedError} from './retry'

const feedUri =
  'at://did:plc:feed/app.bsky.feed.generator/with-friends' as const
const postUri = 'at://did:plc:author/app.bsky.feed.post/1'
const postCid = 'bafybeig45pu3jn2i5h7p7gt2v7bdeax5kq2pmmvooakzn4fy3em47mlxa4'

const providers = [
  {
    id: 'provider-a',
    displayName: 'Provider A',
    endpoint: 'https://a.example',
    serviceDid: 'did:web:a.example',
    operatorId: 'operator-a',
  },
  {
    id: 'provider-b',
    displayName: 'Provider B',
    endpoint: 'https://b.example',
    serviceDid: 'did:web:b.example',
    operatorId: 'operator-b',
  },
] as const

function fakeClient(result: unknown): Client {
  return {
    call: jest.fn(() =>
      result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result),
    ),
  } as unknown as Client
}

function feedResponse(text: string) {
  return {
    feed: [
      {
        post: {
          uri: postUri,
          cid: postCid,
          record: {text},
        },
      },
    ],
    cursor: 'next',
  }
}

describe('ComposedCustomFeedAPI', () => {
  it('returns selected provider provenance for an agreeing feed read', async () => {
    const api = new ComposedCustomFeedAPI({
      providers: [providers[0]],
      clientForProvider: () => fakeClient(feedResponse('hello')),
      policy: {mode: 'require-agreement'},
      access: 'public',
      feedParams: {feed: feedUri},
    })

    await expect(api.fetch({cursor: undefined, limit: 1})).resolves.toEqual(
      expect.objectContaining({
        cursor: 'next',
        providerCompositionStatus: 'agreement',
        providerProvenance: [
          expect.objectContaining({
            id: 'provider-a',
            serviceDid: 'did:web:a.example',
          }),
        ],
        providerComposition: expect.objectContaining({
          surface: 'feeds',
          status: 'agreement',
          observations: expect.arrayContaining([
            expect.objectContaining({
              provider: expect.objectContaining({id: 'provider-a'}),
            }),
          ]),
        }),
      }),
    )
  })

  it('uses an explicit preferred-provider policy through a provider outage', async () => {
    const clients = new Map([
      ['provider-a', fakeClient(new Error('Failed to fetch'))],
      ['provider-b', fakeClient(feedResponse('available'))],
    ])
    const api = new ComposedCustomFeedAPI({
      providers,
      clientForProvider: provider => clients.get(provider.id)!,
      policy: {mode: 'prefer-provider', preferredProviderId: 'provider-b'},
      access: 'account-scoped',
      feedParams: {feed: feedUri},
    })

    await expect(api.fetch({cursor: undefined, limit: 1})).resolves.toEqual(
      expect.objectContaining({
        providerCompositionStatus: 'partial',
        providerProvenance: [expect.objectContaining({id: 'provider-b'})],
        providerComposition: expect.objectContaining({
          surface: 'feeds',
          status: 'partial',
          observations: expect.arrayContaining([
            expect.objectContaining({
              provider: expect.objectContaining({id: 'provider-a'}),
              status: 'unavailable',
            }),
          ]),
        }),
      }),
    )
  })

  it('fails closed by default and retains retryable outage evidence', async () => {
    const clients = new Map([
      ['provider-a', fakeClient(new Error('Failed to fetch'))],
      ['provider-b', fakeClient(feedResponse('available'))],
    ])
    const api = new ComposedCustomFeedAPI({
      providers,
      clientForProvider: provider => clients.get(provider.id)!,
      policy: {mode: 'require-agreement'},
      access: 'account-scoped',
      feedParams: {feed: feedUri},
    })

    await expect(
      api.fetch({cursor: undefined, limit: 1}),
    ).rejects.toMatchObject({
      name: 'ProviderCompositionError',
      composition: {
        status: 'partial',
        observations: expect.arrayContaining([
          expect.objectContaining({
            provider: expect.objectContaining({id: 'provider-a'}),
            retryable: true,
          }),
        ]),
      },
    })

    try {
      await api.fetch({cursor: undefined, limit: 1})
    } catch (error) {
      expect(shouldRetryPostFeedError(error)).toBe(true)
    }
  })

  it('propagates cancellation before requesting a provider', async () => {
    const controller = new AbortController()
    controller.abort()
    const client = fakeClient(feedResponse('unreachable'))
    const api = new ComposedCustomFeedAPI({
      providers: [providers[0]],
      clientForProvider: () => client,
      policy: {mode: 'require-agreement'},
      access: 'public',
      feedParams: {feed: feedUri},
    })

    await expect(
      api.fetch({cursor: undefined, limit: 1, signal: controller.signal}),
    ).rejects.toMatchObject({name: 'AbortError'})
    expect(client.call).not.toHaveBeenCalled()
  })
})
