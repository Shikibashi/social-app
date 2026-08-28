import {type Client} from '@atproto/lex'
import {describe, expect, it, jest} from '@jest/globals'

import {app, com} from '#/lexicons'
import {AuthorFeedAPI} from './author'

const feedParams = {
  actor: 'writerofdragons.bsky.social',
} as ConstructorParameters<typeof AuthorFeedAPI>[0]['feedParams']

function fakeClient(call: (method: unknown) => Promise<unknown>): Client {
  return {call: jest.fn(call)} as unknown as Client
}

describe('AuthorFeedAPI public-read fallback', () => {
  it('shows an owner post directly from the account PDS when AppView has not indexed it', async () => {
    const actor = 'did:plc:writer'
    const account = Object.assign(
      fakeClient(method => {
        if (method === app.bsky.feed.getAuthorFeed) {
          throw new Error('AppView should not be used for an owner feed')
        }
        if (method === app.bsky.feed.getPosts) {
          return Promise.resolve({posts: []})
        }
        if (method === app.bsky.actor.getProfile) {
          return Promise.resolve({
            did: actor,
            handle: 'writer.test',
            displayName: 'Writer',
          })
        }
        throw new Error(`Unexpected account method: ${String(method)}`)
      }),
      {assertDid: actor},
    ) as Client
    ;(account.call as jest.Mock).mockImplementation((method: unknown) => {
      if (method === app.bsky.feed.getPosts) {
        return Promise.resolve({posts: []})
      }
      if (method === app.bsky.actor.getProfile) {
        return Promise.resolve({
          did: actor,
          handle: 'writer.test',
          displayName: 'Writer',
        })
      }
      if (method === com.atproto.repo.listRecords) {
        return Promise.resolve({
          records: [
            {
              cid: 'bafyreibwritertest',
              uri: `at://${actor}/app.bsky.feed.post/3local`,
              value: {
                $type: 'app.bsky.feed.post',
                text: 'PDS-only post',
                createdAt: '2026-08-27T00:00:00.000Z',
              },
            },
          ],
        })
      }
      throw new Error(`Unexpected account method: ${String(method)}`)
    })
    const api = new AuthorFeedAPI({
      client: fakeClient(() => Promise.resolve({posts: []})),
      accountClient: account,
      feedParams: {
        actor,
        filter: 'posts_and_author_threads',
      },
    })

    await expect(
      api.fetch({cursor: undefined, limit: 30}),
    ).resolves.toMatchObject({
      feed: [
        {
          post: {
            uri: `at://${actor}/app.bsky.feed.post/3local`,
            record: {text: 'PDS-only post'},
          },
        },
      ],
    })
  })

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
