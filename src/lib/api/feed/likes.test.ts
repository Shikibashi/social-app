import {type Client} from '@atproto/lex'
import {describe, expect, it, jest} from '@jest/globals'

import {app, com} from '#/lexicons'
import {LikesFeedAPI} from './likes'

const actor = 'did:plc:viewer' as const
const firstPostUri = 'at://did:plc:author/app.bsky.feed.post/first'
const secondPostUri = 'at://did:plc:author/app.bsky.feed.post/second'

const feedParams = {
  actor,
} as ConstructorParameters<typeof LikesFeedAPI>[0]['feedParams']

function fakeClient(
  call: (method: unknown, params: unknown) => Promise<unknown>,
): Client {
  return {call: jest.fn(call)} as unknown as Client
}

describe('LikesFeedAPI', () => {
  it('reads account-owned like records and hydrates their subjects', async () => {
    const account = fakeClient(method => {
      expect(method).toBe(com.atproto.repo.listRecords)
      return Promise.resolve({
        cursor: 'next-like-cursor',
        records: [
          {
            uri: `at://${actor}/app.bsky.feed.like/1`,
            cid: 'bafyreia',
            value: {
              $type: 'app.bsky.feed.like',
              subject: {uri: firstPostUri, cid: 'bafyreia'},
              createdAt: '2026-08-27T00:00:00.000Z',
            },
          },
          {
            uri: `at://${actor}/app.bsky.feed.like/2`,
            cid: 'bafyreia',
            value: {
              $type: 'app.bsky.feed.like',
              subject: {uri: secondPostUri, cid: 'bafyreia'},
              createdAt: '2026-08-26T00:00:00.000Z',
            },
          },
        ],
      })
    })
    const appview = fakeClient(method => {
      expect(method).toBe(app.bsky.feed.getPosts)
      return Promise.resolve({
        posts: [{uri: firstPostUri}, {uri: secondPostUri}],
      })
    })
    const api = new LikesFeedAPI({
      client: appview,
      accountClient: account,
      feedParams,
    })

    const result = await api.fetch({cursor: undefined, limit: 30})

    expect(result.cursor).toBe('next-like-cursor')
    expect(result.feed).toEqual([
      {post: {uri: firstPostUri}},
      {post: {uri: secondPostUri}},
    ])
    expect(account.call).toHaveBeenCalledWith(
      com.atproto.repo.listRecords,
      expect.objectContaining({
        repo: actor,
        collection: 'app.bsky.feed.like',
        limit: 30,
      }),
    )
  })

  it('keeps the AppView implementation when no account client is available', async () => {
    const appviewFeed = {
      cursor: 'appview-cursor',
      feed: [{post: {uri: firstPostUri}}],
    }
    const appview = fakeClient(method => {
      expect(method).toBe(app.bsky.feed.getActorLikes)
      return Promise.resolve(appviewFeed)
    })
    const api = new LikesFeedAPI({client: appview, feedParams})

    await expect(api.fetch({cursor: undefined, limit: 30})).resolves.toEqual(
      appviewFeed,
    )
  })
})
