import {type Client} from '@atproto/lex'

import {app} from '#/lexicons'
import {fetchPostQuotesPage} from './post-quotes-fetch'
import {isQuotePostForUri, quoteSearchPostsToPage} from './post-quotes-helpers'

function quotePostWithDetachedEmbed(): app.bsky.feed.defs.PostView {
  return {
    $type: 'app.bsky.feed.defs#postView',
    uri: 'at://did:plc:quote/app.bsky.feed.post/quote1',
    cid: 'bafyreiquote',
    author: {
      $type: 'app.bsky.actor.defs#profileViewBasic',
      did: 'did:plc:quote',
      handle: 'quote.example.com',
      displayName: 'Quote author',
    },
    record: {
      $type: 'app.bsky.feed.post',
      text: 'The quote text remains public context.',
      createdAt: '2026-08-18T20:00:00.000Z',
    },
    embed: {
      $type: 'app.bsky.embed.record#view',
      record: {
        $type: 'app.bsky.embed.record#viewDetached',
        uri: 'at://did:plc:viewer/app.bsky.feed.post/original',
        detached: true,
      },
    },
    indexedAt: '2026-08-18T20:00:00.000Z',
  }
}

describe('quote visibility', () => {
  it('recovers public quotes when the authenticated quote request is rejected', async () => {
    const targetUri = 'at://did:plc:viewer/app.bsky.feed.post/original'
    const post = quotePostWithDetachedEmbed()
    const authClient = {
      call: jest.fn((method: unknown) => {
        if (method === app.bsky.feed.getQuotes) {
          return Promise.reject(new Error('blockedByActor'))
        }
        return Promise.resolve({viewer: {}})
      }),
    } as unknown as Client
    const publicClient = {
      call: jest.fn().mockResolvedValue({
        uri: targetUri,
        posts: [post],
      }),
    } as unknown as Client

    const page = await fetchPostQuotesPage({
      client: authClient,
      publicClient,
      resolvedUri: targetUri,
      expectedQuoteCount: 1,
      pageParam: undefined,
    })

    expect(page.posts).toEqual([post])
    expect(authClient.call).toHaveBeenCalledTimes(3)
    expect(publicClient.call).toHaveBeenCalledTimes(1)
  })

  it('allows list-only boundaries to use public quote recovery', async () => {
    const targetUri = 'at://did:plc:viewer/app.bsky.feed.post/original'
    const post = quotePostWithDetachedEmbed()
    const list = {
      uri: 'at://did:plc:viewer/app.bsky.graph.list/mega',
    }
    const authClient = {
      call: jest.fn((method: unknown) => {
        if (method === app.bsky.feed.getQuotes) {
          return Promise.resolve({uri: targetUri, posts: []})
        }
        return Promise.resolve({
          viewer: {blocking: list.uri, blockingByList: list},
        })
      }),
    } as unknown as Client
    const publicClient = {
      call: jest.fn().mockResolvedValue({
        uri: targetUri,
        posts: [post],
      }),
    } as unknown as Client

    const page = await fetchPostQuotesPage({
      client: authClient,
      publicClient,
      resolvedUri: targetUri,
      expectedQuoteCount: 1,
      pageParam: undefined,
    })

    expect(page.posts).toEqual([post])
    expect(publicClient.call).toHaveBeenCalledTimes(1)
  })

  it('keeps a viewer-authored direct block fail-closed', async () => {
    const targetUri = 'at://did:plc:viewer/app.bsky.feed.post/original'
    const authError = new Error('blockedActor')
    const authClient = {
      call: jest.fn((method: unknown) => {
        if (method === app.bsky.feed.getQuotes) {
          return Promise.reject(authError)
        }
        return Promise.resolve({
          viewer: {
            blocking: 'at://did:plc:viewer/app.bsky.graph.block/direct',
          },
        })
      }),
    } as unknown as Client
    const publicClient = {
      call: jest.fn(),
    } as unknown as Client

    await expect(
      fetchPostQuotesPage({
        client: authClient,
        publicClient,
        resolvedUri: targetUri,
        expectedQuoteCount: 1,
        pageParam: undefined,
      }),
    ).rejects.toBe(authError)
    expect(publicClient.call).not.toHaveBeenCalled()
  })

  it('does not cross the public boundary for pagination failures', async () => {
    const targetUri = 'at://did:plc:viewer/app.bsky.feed.post/original'
    const authError = new Error('pagination unavailable')
    const authClient = {
      call: jest.fn().mockRejectedValue(authError),
    } as unknown as Client
    const publicClient = {
      call: jest.fn(),
    } as unknown as Client

    await expect(
      fetchPostQuotesPage({
        client: authClient,
        publicClient,
        resolvedUri: targetUri,
        expectedQuoteCount: 1,
        pageParam: 'auth-cursor',
      }),
    ).rejects.toBe(authError)
    expect(publicClient.call).not.toHaveBeenCalled()
  })

  it('retains the outer quote post when the embedded original is detached', () => {
    const post = quotePostWithDetachedEmbed()

    expect(post.record).toMatchObject({
      text: 'The quote text remains public context.',
    })
    expect(post.embed).toMatchObject({
      record: {detached: true},
    })
  })

  it('matches a quote using the outer record when the embedded view is detached', () => {
    const targetUri = 'at://did:plc:viewer/app.bsky.feed.post/original'
    const post = {
      ...quotePostWithDetachedEmbed(),
      record: {
        ...quotePostWithDetachedEmbed().record,
        embed: {
          $type: 'app.bsky.embed.record',
          record: {
            uri: targetUri,
            cid: 'bafyreioriginal',
          },
        },
      },
    }

    expect(isQuotePostForUri(post, targetUri)).toBe(true)

    const page = quoteSearchPostsToPage(
      {posts: [post], cursor: 'search-cursor'},
      targetUri,
    )
    expect(page.posts).toEqual([post])
    expect(page.cursor).toBeUndefined()
  })

  it('does not treat an unrelated search result as a quote', () => {
    const targetUri = 'at://did:plc:viewer/app.bsky.feed.post/original'
    const post = quotePostWithDetachedEmbed()
    expect(isQuotePostForUri(post, targetUri)).toBe(false)
    expect(
      quoteSearchPostsToPage({posts: [post]}, targetUri).posts,
    ).toHaveLength(0)
  })
})
