import {useEffect, useMemo, useState} from 'react'
import {type AtUriString} from '@atproto/syntax'
import {type QueryClient} from '@tanstack/react-query'
import {EventEmitter} from 'eventemitter3'

import {batchedUpdates} from '#/lib/batchedUpdates'
import {findAllPostsInQueryData as findAllPostsInBookmarksQueryData} from '#/state/queries/bookmarks/useBookmarksQuery'
import {findAllPostsInQueryData as findAllPostsInExploreFeedPreviewsQueryData} from '#/state/queries/explore-feed-previews'
import {findAllPostsInQueryData as findAllPostsInNotifsQueryData} from '#/state/queries/notifications/feed'
import {findAllPostsInQueryData as findAllPostsInFeedQueryData} from '#/state/queries/post-feed'
import {findAllPostsInQueryData as findAllPostsInQuoteQueryData} from '#/state/queries/post-quotes'
import {findAllPostsInQueryData as findAllPostsInSearchQueryData} from '#/state/queries/search-posts-v2'
import {findAllPostsInQueryData as findAllPostsInThreadV2QueryData} from '#/state/queries/usePostThread/queryCache'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {
  getAccountScopedLikeShadow,
  setAccountScopedLikeShadow,
} from './post-interaction-shadow'
import {findDirectPostsInQueryCache} from './post-shadow-cache'
import {castAsShadow, type Shadow} from './types'
export type {Shadow} from './types'

/**
 * `'pending'` is the optimistic sentinel written before the real record uri
 * comes back, so the two uri slots admit it alongside a real at-uri.
 */
export interface PostShadow {
  likeUri: AtUriString | 'pending' | undefined
  repostUri: AtUriString | 'pending' | undefined
  isDeleted: boolean
  embed:
    app.bsky.embed.record.View | app.bsky.embed.recordWithMedia.View | undefined
  pinned: boolean
  optimisticReplyCount: number | undefined
  bookmarked: boolean | undefined
}

export const POST_TOMBSTONE = Symbol('PostTombstone')

const emitter = new EventEmitter()
const shadows: WeakMap<
  app.bsky.feed.defs.PostView,
  Partial<PostShadow>
> = new WeakMap()

function getStoredPostShadow(
  post: app.bsky.feed.defs.PostView,
  accountDid?: string,
): Partial<PostShadow> | undefined {
  const objectShadow = shadows.get(post)
  const accountLikeShadow = accountDid
    ? getAccountScopedLikeShadow(accountDid, post.uri)
    : undefined

  if (!objectShadow) return accountLikeShadow
  if (!accountLikeShadow) return objectShadow
  return {...objectShadow, ...accountLikeShadow}
}

/**
 * Use with caution! This function returns the raw shadow data for a post.
 * Prefer using `usePostShadow`.
 */
export function dangerousGetPostShadow(
  post: app.bsky.feed.defs.PostView,
  accountDid?: string,
) {
  return getStoredPostShadow(post, accountDid)
}

export function usePostShadow(
  post: app.bsky.feed.defs.PostView,
  accountDid?: string,
): Shadow<app.bsky.feed.defs.PostView> | typeof POST_TOMBSTONE {
  const [shadow, setShadow] = useState(() =>
    getStoredPostShadow(post, accountDid),
  )
  const [prevPost, setPrevPost] = useState(post)
  const [prevAccountDid, setPrevAccountDid] = useState(accountDid)
  if (post !== prevPost || accountDid !== prevAccountDid) {
    setPrevPost(post)
    setPrevAccountDid(accountDid)
    setShadow(getStoredPostShadow(post, accountDid))
  }

  useEffect(() => {
    function onUpdate() {
      setShadow(getStoredPostShadow(post, accountDid))
    }
    emitter.addListener(post.uri, onUpdate)
    return () => {
      emitter.removeListener(post.uri, onUpdate)
    }
  }, [post, accountDid, setShadow])

  return useMemo(() => {
    if (shadow) {
      return mergeShadow(post, shadow)
    } else {
      return castAsShadow(post)
    }
  }, [post, shadow])
}

function mergeShadow(
  post: app.bsky.feed.defs.PostView,
  shadow: Partial<PostShadow>,
): Shadow<app.bsky.feed.defs.PostView> | typeof POST_TOMBSTONE {
  if (shadow.isDeleted) {
    return POST_TOMBSTONE
  }

  let likeCount = post.likeCount ?? 0
  if ('likeUri' in shadow) {
    const wasLiked = !!post.viewer?.like
    const isLiked = !!shadow.likeUri
    if (wasLiked && !isLiked) {
      likeCount--
    } else if (!wasLiked && isLiked) {
      likeCount++
    }
    likeCount = Math.max(0, likeCount)
  }

  let bookmarkCount = post.bookmarkCount ?? 0
  if ('bookmarked' in shadow) {
    const wasBookmarked = !!post.viewer?.bookmarked
    const isBookmarked = !!shadow.bookmarked
    if (wasBookmarked && !isBookmarked) {
      bookmarkCount--
    } else if (!wasBookmarked && isBookmarked) {
      bookmarkCount++
    }
    bookmarkCount = Math.max(0, bookmarkCount)
  }

  let repostCount = post.repostCount ?? 0
  if ('repostUri' in shadow) {
    const wasReposted = !!post.viewer?.repost
    const isReposted = !!shadow.repostUri
    if (wasReposted && !isReposted) {
      repostCount--
    } else if (!wasReposted && isReposted) {
      repostCount++
    }
    repostCount = Math.max(0, repostCount)
  }

  let replyCount = post.replyCount ?? 0
  if ('optimisticReplyCount' in shadow) {
    replyCount = shadow.optimisticReplyCount ?? replyCount
  }

  let embed: typeof post.embed
  if ('embed' in shadow) {
    if (
      (bsky.isType(app.bsky.embed.record.view, post.embed) &&
        bsky.isType(app.bsky.embed.record.view, shadow.embed)) ||
      (bsky.isType(app.bsky.embed.recordWithMedia.view, post.embed) &&
        bsky.isType(app.bsky.embed.recordWithMedia.view, shadow.embed))
    ) {
      /*
       * `isType` asserts a present, matching `$type` at runtime but narrows to
       * the schema's input type, whose `$type` is optional - so the value does
       * not satisfy the `$Typed` arm of `PostView['embed']` without this cast.
       */
      embed = shadow.embed as typeof post.embed
    }
  }

  return castAsShadow({
    ...post,
    embed: embed || post.embed,
    likeCount: likeCount,
    repostCount: repostCount,
    replyCount: replyCount,
    bookmarkCount: bookmarkCount,
    viewer: {
      ...(post.viewer || {}),
      /*
       * The optimistic `'pending'` sentinel is not a real at-uri; consumers only
       * test these for presence while the write is in flight.
       */
      like: (('likeUri' in shadow ? shadow.likeUri : post.viewer?.like) ??
        undefined) as AtUriString | undefined,
      repost: (('repostUri' in shadow
        ? shadow.repostUri
        : post.viewer?.repost) ?? undefined) as AtUriString | undefined,
      pinned: 'pinned' in shadow ? shadow.pinned : post.viewer?.pinned,
      bookmarked:
        'bookmarked' in shadow ? shadow.bookmarked : post.viewer?.bookmarked,
    },
  })
}

export function updatePostShadow(
  queryClient: QueryClient,
  uri: string,
  value: Partial<PostShadow>,
  accountDid?: string,
) {
  if (accountDid && 'likeUri' in value) {
    setAccountScopedLikeShadow(accountDid, uri, value.likeUri)
  }

  const cachedPosts = findPostsInCache(queryClient, uri)
  for (let post of cachedPosts) {
    const nextShadow = {...shadows.get(post), ...value}
    /*
     * Like state is account-scoped. Do not leave an unscoped copy on the
     * object, because that object can outlive the account that authored the
     * interaction. The account-scoped entry above is what renders it.
     */
    if (accountDid && 'likeUri' in value) {
      delete nextShadow.likeUri
    }
    shadows.set(post, nextShadow)
  }
  batchedUpdates(() => {
    emitter.emit(uri)
  })
}

function* findPostsInCache(
  queryClient: QueryClient,
  uri: string,
): Generator<app.bsky.feed.defs.PostView, void> {
  // A post opened directly (including its quotes/likes views) is cached under
  // the single-post query rather than one of the collection query shapes below.
  // Include both the normal and public-fallback keys so likes feel immediate
  // on direct views as well as in feeds. The shadow is still reconciled with
  // the PDS result by the mutation queue; this is only local UI state.
  yield* findDirectPostsInQueryCache(queryClient, uri)
  for (let post of findAllPostsInFeedQueryData(queryClient, uri)) {
    yield post
  }
  for (let post of findAllPostsInNotifsQueryData(queryClient, uri)) {
    yield post
  }
  for (let post of findAllPostsInThreadV2QueryData(queryClient, uri)) {
    yield post
  }
  for (let post of findAllPostsInSearchQueryData(queryClient, uri)) {
    yield post
  }
  for (let post of findAllPostsInQuoteQueryData(queryClient, uri)) {
    yield post
  }
  for (let post of findAllPostsInExploreFeedPreviewsQueryData(
    queryClient,
    uri,
  )) {
    yield post
  }
  for (let post of findAllPostsInBookmarksQueryData(queryClient, uri)) {
    yield post
  }
}
