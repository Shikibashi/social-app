import {type Client} from '@atproto/lex'
import {type AtUriString} from '@atproto/syntax'

import {
  filterPublicPostsForViewer,
  hasDirectViewerBlock,
} from '#/state/queries/public-visibility'
import {type ApiThreadItem} from '#/state/queries/usePostThread/types'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'

const GET_POSTS_BATCH_SIZE = 25

type PostView = app.bsky.feed.defs.PostView
type AuthorViewer = app.bsky.actor.defs.ProfileViewBasic['viewer']

/**
 * A provider can return a thread tombstone when a relationship between two
 * other actors makes one side unavailable to the other. That relationship is
 * not a visibility decision for an unrelated viewer. Hydrating the URI through
 * getPosts lets the client restore the ordinary post view without mutating or
 * weakening anyone's relationship records.
 */
export function isPairwiseThreadBlock(item: ApiThreadItem): boolean {
  return bsky.isType(app.bsky.unspecced.defs.threadItemBlocked, item.value)
}

/**
 * Keep a block hidden only for the viewer's own direct block. Incoming blocks
 * and delegated list blocks are not universal authority over public context
 * on this client.
 */
export function hasViewerBlockBoundary(
  post: Pick<PostView, 'author'>,
): boolean {
  return hasDirectViewerBlock(post.author)
}

function blockedItemHasViewerBlockBoundary(item: ApiThreadItem): boolean {
  if (!isPairwiseThreadBlock(item)) return false
  const blockedItem = item as unknown as {
    value: {author?: {viewer?: AuthorViewer}}
  }
  const author = blockedItem.value.author
  return author ? hasDirectViewerBlock(author) : false
}

export function hydrateThreadPost(
  item: ApiThreadItem,
  post: PostView,
): ApiThreadItem {
  const value = {
    $type: 'app.bsky.unspecced.defs#threadItemPost' as const,
    post,
    moreParents: false,
    moreReplies: 0,
    opThread: false,
    hiddenByThreadgate: false,
    mutedByViewer: false,
  } as unknown as ApiThreadItem['value']
  return {
    ...item,
    value,
  } as unknown as ApiThreadItem
}

/**
 * Public thread reads do not contain the viewer's relationship state. Restore
 * the client's direct-block boundary before rendering an anonymous fallback;
 * a relationship lookup failure remains fail-closed rather than exposing a
 * post that the viewer may have directly blocked.
 */
export async function enforceThreadViewerBlockBoundaries(
  client: Client,
  thread: app.bsky.unspecced.getPostThreadV2.ThreadItem[],
): Promise<app.bsky.unspecced.getPostThreadV2.ThreadItem[]> {
  const postItems = thread.filter(item =>
    bsky.isType(app.bsky.unspecced.defs.threadItemPost, item.value),
  )
  if (!postItems.length) return thread

  const visiblePosts = await filterPublicPostsForViewer(
    client,
    postItems.map(
      item => (item.value as app.bsky.unspecced.defs.ThreadItemPost).post,
    ),
  )
  const visibleUris = new Set(visiblePosts.map(post => post.uri))

  return thread.map(item => {
    if (
      !bsky.isType(app.bsky.unspecced.defs.threadItemPost, item.value) ||
      visibleUris.has(item.uri)
    ) {
      return item
    }

    const post = item.value.post
    return {
      ...item,
      value: {
        $type: 'app.bsky.unspecced.defs#threadItemBlocked' as const,
        author: {
          $type: 'app.bsky.feed.defs#blockedAuthor' as const,
          did: post.author.did,
          viewer: post.author.viewer,
        },
      },
    }
  })
}

/**
 * Hydrate provider tombstones in bounded batches. Failures intentionally leave
 * the original tombstone in place so an AppView outage cannot be mistaken for
 * a successful visibility override.
 */
export async function hydrateBlockedThreadItems(
  thread: ApiThreadItem[],
  getPosts: (uris: AtUriString[]) => Promise<PostView[]>,
): Promise<ApiThreadItem[]> {
  const blocked = thread.filter(isPairwiseThreadBlock)
  if (!blocked.length) return thread

  const hydrated = new Map<string, PostView>()
  for (let i = 0; i < blocked.length; i += GET_POSTS_BATCH_SIZE) {
    const batch = blocked.slice(i, i + GET_POSTS_BATCH_SIZE)
    try {
      const posts = await getPosts(batch.map(item => item.uri))
      for (const post of posts) {
        hydrated.set(post.uri, post)
      }
    } catch {
      // Keep the affected tombstones. The provider's failure is not a reason
      // to claim that the post was successfully recovered.
    }
  }

  return thread.map(item => {
    if (!isPairwiseThreadBlock(item)) return item
    const post = hydrated.get(item.uri)
    // Preserve an explicitly authored direct block even when the public-read
    // fallback was able to hydrate the post without viewer relationship data.
    if (
      !post ||
      blockedItemHasViewerBlockBoundary(item) ||
      hasViewerBlockBoundary(post)
    ) {
      return item
    }
    return hydrateThreadPost(item, post)
  })
}
