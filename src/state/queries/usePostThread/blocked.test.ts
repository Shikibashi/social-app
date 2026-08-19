import {type AtUriString} from '@atproto/syntax'
import {describe, expect, it} from '@jest/globals'

import {type ApiThreadItem} from '#/state/queries/usePostThread/types'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {hasViewerBlockBoundary, hydrateBlockedThreadItems} from './blocked'

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

const post: app.bsky.feed.defs.PostView = {
  $type: 'app.bsky.feed.defs#postView',
  uri: blockedUri,
  cid: 'bafyreifakecid',
  author: {
    did: 'did:plc:parent',
    handle: 'parent.example.com',
  },
  record: {
    $type: 'app.bsky.feed.post',
    text: 'The parent post is visible to an unrelated viewer.',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  indexedAt: '2026-01-01T00:00:00.000Z',
}

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

  it('leaves the tombstone in place when hydration fails', async () => {
    const result = await hydrateBlockedThreadItems([blockedItem], () =>
      Promise.reject(new Error('provider unavailable')),
    )

    expect(result).toEqual([blockedItem])
  })
})
