import {type Client} from '@atproto/lex'
import {describe, expect, it, jest} from '@jest/globals'

import {app} from '#/lexicons'
import {AuthorFeedAPI} from './author'

const feedParams = {
  actor: 'writerofdragons.bsky.social',
} as ConstructorParameters<typeof AuthorFeedAPI>[0]['feedParams']

function fakeClient(call: (method: unknown) => Promise<unknown>): Client {
  return {call: jest.fn(call)} as unknown as Client
}

describe('AuthorFeedAPI public-read fallback', () => {
  it('keeps a viewer-owned direct block from falling through to public data', async () => {
    const primary = fakeClient(method => {
      if (method === app.bsky.feed.getAuthorFeed) {
        throw new Error('BlockedActor')
      }
      return Promise.resolve({
        viewer: {
          blocking: 'at://did:plc:viewer/app.bsky.graph.block/direct',
        },
      })
    })
    const fallback = fakeClient(() =>
      Promise.resolve({
        feed: [{post: {uri: 'at://did:plc:writer/app.bsky.feed.post/1'}}],
      }),
    )
    const api = new AuthorFeedAPI({
      client: primary,
      fallbackClient: fallback,
      feedParams,
    })

    await expect(api.fetch({cursor: undefined, limit: 30})).rejects.toThrow(
      'BlockedActor',
    )
    expect(fallback.call).not.toHaveBeenCalled()
  })

  it('uses public data for an incoming block when no local direct block exists', async () => {
    const primary = fakeClient(method => {
      if (method === app.bsky.feed.getAuthorFeed) {
        throw new Error('BlockedActor')
      }
      return Promise.resolve({viewer: {blockedBy: true}})
    })
    const publicFeed = {
      feed: [
        {
          post: {
            uri: 'at://did:plc:writer/app.bsky.feed.post/1',
            author: {did: 'did:plc:writer'},
          },
        },
      ],
    }
    const fallback = fakeClient(() => Promise.resolve(publicFeed))
    const api = new AuthorFeedAPI({
      client: primary,
      fallbackClient: fallback,
      feedParams,
    })

    await expect(api.fetch({cursor: undefined, limit: 30})).resolves.toEqual(
      publicFeed,
    )
    expect(fallback.call).toHaveBeenCalledTimes(1)
  })

  it('uses public data when the authenticated incoming-block page is empty', async () => {
    const primary = fakeClient(method => {
      if (method === app.bsky.feed.getAuthorFeed) {
        return Promise.resolve({feed: []})
      }
      return Promise.resolve({viewer: {blockedBy: true}})
    })
    const publicFeed = {
      cursor: 'public-cursor',
      feed: [
        {
          post: {
            uri: 'at://did:plc:writer/app.bsky.feed.post/2',
            author: {did: 'did:plc:writer'},
          },
        },
      ],
    }
    const fallback = fakeClient(() => Promise.resolve(publicFeed))
    const api = new AuthorFeedAPI({
      client: primary,
      fallbackClient: fallback,
      feedParams,
    })

    await expect(api.fetch({cursor: undefined, limit: 30})).resolves.toEqual(
      publicFeed,
    )
    expect(fallback.call).toHaveBeenCalledTimes(1)
  })
})
