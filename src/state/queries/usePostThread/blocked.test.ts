import {type Client} from '@atproto/lex'
import {type AtUriString} from '@atproto/syntax'
import {describe, expect, it} from '@jest/globals'

import {type ApiThreadItem} from '#/state/queries/usePostThread/types'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {
  enforceThreadViewerBlockBoundaries,
  filterThreadViewerBlockBoundaries,
  hasViewerBlockBoundary,
  hydrateBlockedThreadItems,
} from './blocked'

const blockedUri =
  'at://did:plc:parent/app.bsky.feed.post/parent' as AtUriString

const blockedItem: ApiThreadItem = {
  $type: 'app.bsky.unspecced.getPostThreadV2#threadItem',
  uri: blockedUri,
  depth: -1,
  value: {
    $type: 'app.bsky.unspecced.defs#threadItemBlocked',
    author: {did: 'did:plc:parent'},
  },
}

function makePost(
  uri: AtUriString,
  did: string,
  handle: string,
): app.bsky.feed.defs.PostView {
  /* The visibility tests exercise thread boundaries, not lexicon decoding. */
  return {
    $type: 'app.bsky.feed.defs#postView',
    uri,
    cid: 'bafyreifakecid',
    author: {did, handle},
    record: {
      $type: 'app.bsky.feed.post',
      text: 'The parent post is visible to an unrelated viewer.',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    indexedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as app.bsky.feed.defs.PostView
}

const post = makePost(blockedUri, 'did:plc:parent', 'parent.example.com')

describe('pairwise thread visibility', () => {
  it('hydrates a provider tombstone when the viewer is unrelated', async () => {
    const result = await hydrateBlockedThreadItems([blockedItem], () =>
      Promise.resolve([post]),
    )

    const item = result[0]
    if (!bsky.isType(app.bsky.unspecced.defs.threadItemPost, item.value)) {
      throw new Error('expected hydrated post')
    }
    expect(item.value.post.record.text).toContain('parent post')
    expect(item.depth).toBe(-1)
  })

  it('keeps only the viewer-owned direct boundary hidden', async () => {
    expect(
      hasViewerBlockBoundary({
        author: {
          did: 'did:plc:parent',
          handle: 'parent.example.com',
          viewer: {
            blocking: 'at://did:plc:viewer/app.bsky.graph.block/direct',
          },
        },
      }),
    ).toBe(true)
    expect(
      hasViewerBlockBoundary({
        author: {
          did: 'did:plc:parent',
          handle: 'parent.example.com',
          viewer: {blockedBy: true},
        },
      }),
    ).toBe(false)
    expect(
      hasViewerBlockBoundary({
        author: {
          did: 'did:plc:parent',
          handle: 'parent.example.com',
          viewer: {
            blocking: 'at://did:plc:viewer/app.bsky.graph.block/direct',
            blockingByList: {
              uri: 'at://did:plc:viewer/app.bsky.graph.list/1',
              cid: 'bafyreifakecid',
              name: 'Viewer block list',
              purpose: 'app.bsky.graph.defs#modlist',
              indexedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        },
      }),
    ).toBe(true)
    expect(
      hasViewerBlockBoundary({
        author: {
          did: 'did:plc:parent',
          handle: 'parent.example.com',
          viewer: {
            blocking: 'at://did:plc:viewer/app.bsky.graph.list/1',
          },
        },
      }),
    ).toBe(false)

    const result = await hydrateBlockedThreadItems([blockedItem], () =>
      Promise.resolve([
        {
          ...post,
          author: {
            ...post.author,
            viewer: {
              blockingByList: {
                uri: 'at://did:plc:viewer/app.bsky.graph.list/1',
                cid: 'bafyreifakecid',
                name: 'Viewer block list',
                purpose: 'app.bsky.graph.defs#modlist',
                indexedAt: '2026-01-01T00:00:00.000Z',
              },
            },
          },
        },
      ]),
    )

    expect(
      bsky.isType(app.bsky.unspecced.defs.threadItemPost, result[0].value),
    ).toBe(true)
  })

  it('does not turn a public fallback into a bypass for a direct block', async () => {
    const directBlockedItem = {
      ...blockedItem,
      value: {
        $type: 'app.bsky.unspecced.defs#threadItemBlocked' as const,
        author: {
          did: 'did:plc:parent',
          viewer: {
            blocking: 'at://did:plc:viewer/app.bsky.graph.block/direct',
          },
        },
      },
    } as unknown as ApiThreadItem

    const result = await hydrateBlockedThreadItems([directBlockedItem], () =>
      Promise.resolve([post]),
    )

    expect(result).toEqual([directBlockedItem])
  })

  it('converts directly blocked posts in an anonymous thread fallback to tombstones', async () => {
    const visibleUri =
      'at://did:plc:visible/app.bsky.feed.post/visible' as AtUriString
    const visiblePost = makePost(
      visibleUri,
      'did:plc:visible',
      'visible.example.com',
    )
    const thread = [
      {
        $type: 'app.bsky.unspecced.getPostThreadV2#threadItem' as const,
        uri: blockedUri,
        depth: 0,
        value: {
          $type: 'app.bsky.unspecced.defs#threadItemPost' as const,
          post,
          opThread: false,
          moreParents: false,
          moreReplies: 0,
          hiddenByThreadgate: false,
          mutedByViewer: false,
        },
      },
      {
        $type: 'app.bsky.unspecced.getPostThreadV2#threadItem' as const,
        uri: visibleUri,
        depth: 1,
        value: {
          $type: 'app.bsky.unspecced.defs#threadItemPost' as const,
          post: visiblePost,
          opThread: false,
          moreParents: false,
          moreReplies: 0,
          hiddenByThreadgate: false,
          mutedByViewer: false,
        },
      },
    ] satisfies app.bsky.unspecced.getPostThreadV2.ThreadItem[]
    const client = {
      call: jest.fn((_method: unknown, params: {actor: string}) => ({
        viewer:
          params.actor === 'did:plc:parent'
            ? {
                blocking: 'at://did:plc:viewer/app.bsky.graph.block/direct',
              }
            : undefined,
      })),
    } as unknown as Client

    const result = await enforceThreadViewerBlockBoundaries(client, thread)

    expect(
      bsky.isType(app.bsky.unspecced.defs.threadItemBlocked, result[0].value),
    ).toBe(true)
    expect(
      bsky.isType(app.bsky.unspecced.defs.threadItemPost, result[1].value),
    ).toBe(true)
    expect(client.call).toHaveBeenCalledTimes(2)
  })

  it('filters directly blocked posts from additional public replies', async () => {
    const visibleUri =
      'at://did:plc:visible/app.bsky.feed.post/visible' as AtUriString
    const visiblePost = makePost(
      visibleUri,
      'did:plc:visible',
      'visible.example.com',
    )
    const thread = [
      {
        $type: 'app.bsky.unspecced.getPostThreadOtherV2#threadItem' as const,
        uri: blockedUri,
        depth: 1,
        value: {
          $type: 'app.bsky.unspecced.defs#threadItemPost' as const,
          post,
          opThread: false,
          moreParents: false,
          moreReplies: 0,
          hiddenByThreadgate: false,
          mutedByViewer: false,
        },
      },
      {
        $type: 'app.bsky.unspecced.getPostThreadOtherV2#threadItem' as const,
        uri: visibleUri,
        depth: 1,
        value: {
          $type: 'app.bsky.unspecced.defs#threadItemPost' as const,
          post: visiblePost,
          opThread: false,
          moreParents: false,
          moreReplies: 0,
          hiddenByThreadgate: false,
          mutedByViewer: false,
        },
      },
    ] satisfies app.bsky.unspecced.getPostThreadOtherV2.ThreadItem[]
    const client = {
      call: jest.fn((_method: unknown, params: {actor: string}) => ({
        viewer:
          params.actor === 'did:plc:parent'
            ? {
                blocking: 'at://did:plc:viewer/app.bsky.graph.block/direct',
              }
            : undefined,
      })),
    } as unknown as Client

    const result = await filterThreadViewerBlockBoundaries(client, thread)

    expect(result.map(item => item.uri)).toEqual([visibleUri])
    expect(client.call).toHaveBeenCalledTimes(2)
  })

  it('leaves the tombstone in place when hydration fails', async () => {
    const result = await hydrateBlockedThreadItems([blockedItem], () =>
      Promise.reject(new Error('provider unavailable')),
    )

    expect(result).toEqual([blockedItem])
  })
})
