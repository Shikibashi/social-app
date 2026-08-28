import {useCallback} from 'react'
import {type Client} from '@atproto/lex'
import {AtUri, type AtUriString, type HandleString} from '@atproto/syntax'
import {deleteLike, deletePost, deleteRepost, like, repost} from '@bsky/sdk'
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {fetchAccountPost} from '#/lib/api/account-posts'
import {useToggleMutationQueue} from '#/lib/hooks/useToggleMutationQueue'
import {updatePostShadow} from '#/state/cache/post-shadow'
import {type Shadow} from '#/state/cache/types'
import {RQKEY_ROOT as POST_FEED_RQKEY_ROOT} from '#/state/queries/post-feed'
import {hasDirectViewerBlock} from '#/state/queries/public-visibility'
import {hasViewerBlockBoundary} from '#/state/queries/usePostThread/blocked'
import {
  useAppviewClient,
  useMaybePdsClient,
  usePdsClient,
  usePublicAppviewClient,
  useSession,
} from '#/state/session'
import * as userActionHistory from '#/state/userActionHistory'
import {useAnalytics} from '#/analytics'
import {type Metrics, toClout} from '#/analytics/metrics'
import {app, com} from '#/lexicons'
import {useIsThreadMuted, useSetThreadMute} from '../cache/thread-mutes'
import {findProfileQueryData} from './profile'

async function viewerOwnsDirectBlockForPost(
  client: Client,
  uri: string,
): Promise<boolean> {
  try {
    const urip = new AtUri(uri)
    if (!urip.host.startsWith('did:')) {
      const data = await client.call(com.atproto.identity.resolveHandle, {
        handle: urip.host as HandleString,
      })
      urip.host = data.did
    }
    const profile = await client.call(app.bsky.actor.getProfile, {
      actor: urip.host,
    })
    return hasDirectViewerBlock(profile)
  } catch {
    // Relationship authority is required before crossing to a public read.
    return true
  }
}

const RQKEY_ROOT = 'post'
export const RQKEY = (postUri: string, allowPublicFallback = false) =>
  allowPublicFallback ? [RQKEY_ROOT, postUri, true] : [RQKEY_ROOT, postUri]

export function usePostQuery(
  uri: string | undefined,
  opts: {allowPublicFallback?: boolean} = {},
) {
  const client = useAppviewClient()
  const publicClient = usePublicAppviewClient()
  const pdsClient = useMaybePdsClient()
  const {currentAccount} = useSession()
  const allowPublicFallback = opts.allowPublicFallback === true
  return useQuery<app.bsky.feed.defs.PostView>({
    queryKey: RQKEY(uri || '', allowPublicFallback),
    queryFn: async () => {
      if (!uri) throw new Error('[unreachable] No URI provided')

      let post: app.bsky.feed.defs.PostView | undefined
      let primaryError: Error | undefined
      try {
        post = await fetchPost(client, uri)
      } catch (error) {
        primaryError = error instanceof Error ? error : new Error(String(error))
      }

      if (!post && pdsClient && currentAccount?.did) {
        try {
          post = await fetchAccountPost({
            pdsClient,
            appviewClient: client,
            actor: currentAccount.did,
            uri,
          })
        } catch {
          // Continue to the existing public fallback/error behavior below.
        }
      }

      if (!post && primaryError && !allowPublicFallback) {
        throw primaryError
      }

      if (!post && allowPublicFallback) {
        if (await viewerOwnsDirectBlockForPost(client, uri)) {
          if (primaryError) throw primaryError
          throw new Error('No data')
        }
        try {
          post = await fetchPost(publicClient, uri)
        } catch {
          if (primaryError) throw primaryError
          throw new Error('No data')
        }
      }

      const viewer = post?.author.viewer
      const needsPublicRead = Boolean(
        allowPublicFallback &&
        post &&
        viewer?.blockedBy &&
        !hasViewerBlockBoundary(post),
      )
      if (allowPublicFallback && (!post || needsPublicRead)) {
        if (!post || !hasDirectViewerBlock(post.author)) {
          try {
            const publicPost = await fetchPost(publicClient, uri)
            if (publicPost) post = publicPost
          } catch {
            // Keep the authenticated post when the public retry is unavailable.
          }
        }
      }
      if (post) {
        return post
      }

      throw new Error('No data')
    },
    enabled: !!uri,
  })
}

/**
 * Read one post by AT-URI, resolving a handle authority first when the URI
 * carries one.
 *
 * The appview response is asserted to the generated view at this single
 * boundary rather than at every consumer.
 */
async function fetchPost(
  client: Client,
  uri: string,
): Promise<app.bsky.feed.defs.PostView | undefined> {
  const urip = new AtUri(uri)

  if (!urip.host.startsWith('did:')) {
    const data = await client.call(com.atproto.identity.resolveHandle, {
      handle: urip.host as HandleString,
    })
    urip.host = data.did
  }

  const data = await client.call(app.bsky.feed.getPosts, {
    uris: [urip.toString()],
  })
  return data.posts[0]
}

export function precachePost(
  queryClient: QueryClient,
  uri: string,
  post: app.bsky.feed.defs.PostView,
) {
  queryClient.setQueryData(RQKEY(uri), post)
}

export function useGetPost() {
  const queryClient = useQueryClient()
  const client = useAppviewClient()
  return useCallback(
    async ({uri}: {uri: string}) => {
      return queryClient.fetchQuery({
        queryKey: RQKEY(uri || ''),
        async queryFn() {
          const post = await fetchPost(client, uri)
          if (post) {
            return post
          }

          throw new Error('useGetPost: post not found')
        },
      })
    },
    [queryClient, client],
  )
}

export function useGetPosts() {
  const queryClient = useQueryClient()
  const client = useAppviewClient()
  return useCallback(
    async ({uris}: {uris: string[]}) => {
      return queryClient.fetchQuery({
        queryKey: RQKEY(uris.join(',') || ''),
        async queryFn() {
          const data = await client.call(app.bsky.feed.getPosts, {
            uris: uris as AtUriString[],
          })
          // See the note on `fetchPost` about the view shapes.
          return data.posts
        },
      })
    },
    [queryClient, client],
  )
}

export function usePostLikeMutationQueue(
  post: Shadow<app.bsky.feed.defs.PostView>,
  viaRepost: {uri: string; cid: string} | undefined,
  feedDescriptor: string | undefined,
  logContext: Metrics['post:like']['logContext'],
) {
  const queryClient = useQueryClient()
  const {currentAccount} = useSession()
  const postUri = post.uri
  const postCid = post.cid
  const initialLikeUri = post.viewer?.like
  const likeMutation = usePostLikeMutation(feedDescriptor, logContext, post)
  const unlikeMutation = usePostUnlikeMutation(feedDescriptor, logContext, post)

  const queueToggle = useToggleMutationQueue({
    initialState: initialLikeUri,
    runMutation: async (prevLikeUri, shouldLike) => {
      if (shouldLike) {
        const {uri: likeUri} = await likeMutation.mutateAsync({
          uri: postUri,
          cid: postCid,
          via: viaRepost,
        })
        userActionHistory.like([postUri])
        return likeUri
      } else {
        if (prevLikeUri) {
          await unlikeMutation.mutateAsync({
            postUri: postUri,
            likeUri: prevLikeUri,
          })
          userActionHistory.unlike([postUri])
        }
        return undefined
      }
    },
    onSuccess(finalLikeUri) {
      // finalize
      updatePostShadow(queryClient, postUri, {
        likeUri: finalLikeUri,
      })
      if (currentAccount?.did) {
        void queryClient.invalidateQueries({
          queryKey: [POST_FEED_RQKEY_ROOT, `likes|${currentAccount.did}`],
        })
      }
    },
  })

  const queueLike = useCallback(() => {
    // optimistically update
    updatePostShadow(queryClient, postUri, {
      likeUri: 'pending',
    })
    return queueToggle(true)
  }, [queryClient, postUri, queueToggle])

  const queueUnlike = useCallback(() => {
    // optimistically update
    updatePostShadow(queryClient, postUri, {
      likeUri: undefined,
    })
    return queueToggle(false)
  }, [queryClient, postUri, queueToggle])

  return [queueLike, queueUnlike] as const
}

function usePostLikeMutation(
  feedDescriptor: string | undefined,
  logContext: Metrics['post:like']['logContext'],
  post: Shadow<app.bsky.feed.defs.PostView>,
) {
  const {currentAccount} = useSession()
  const queryClient = useQueryClient()
  const postAuthor = post.author
  const pdsClient = usePdsClient()
  const ax = useAnalytics()
  return useMutation<
    {uri: AtUriString}, // responds with the uri of the like
    Error,
    {uri: string; cid: string; via?: {uri: string; cid: string}} // the post's uri and cid, and the repost uri/cid if present
  >({
    mutationFn: ({uri, cid, via}) => {
      let ownProfile: app.bsky.actor.defs.ProfileViewDetailed | undefined
      if (currentAccount) {
        ownProfile = findProfileQueryData(queryClient, currentAccount.did)
      }
      ax.metric('post:like', {
        uri,
        authorDid: postAuthor.did,
        logContext,
        doesPosterFollowLiker: postAuthor.viewer
          ? Boolean(postAuthor.viewer.followedBy)
          : undefined,
        doesLikerFollowPoster: postAuthor.viewer
          ? Boolean(postAuthor.viewer.following)
          : undefined,
        likerClout: toClout(ownProfile?.followersCount),
        postClout:
          post.likeCount != null &&
          post.repostCount != null &&
          post.replyCount != null
            ? toClout(post.likeCount + post.repostCount + post.replyCount)
            : undefined,
        feedDescriptor: feedDescriptor,
      })
      return pdsClient.call(like, {
        uri: uri as AtUriString,
        cid: cid,
        via: via ? {uri: via.uri as AtUriString, cid: via.cid} : undefined,
      })
    },
  })
}

function usePostUnlikeMutation(
  feedDescriptor: string | undefined,
  logContext: Metrics['post:unlike']['logContext'],
  post: Shadow<app.bsky.feed.defs.PostView>,
) {
  const pdsClient = usePdsClient()
  const ax = useAnalytics()
  return useMutation<void, Error, {postUri: string; likeUri: string}>({
    mutationFn: ({postUri, likeUri}) => {
      ax.metric('post:unlike', {
        uri: postUri,
        authorDid: post.author.did,
        logContext,
        feedDescriptor,
      })
      return pdsClient.call(deleteLike, likeUri as AtUriString)
    },
  })
}

export function usePostRepostMutationQueue(
  post: Shadow<app.bsky.feed.defs.PostView>,
  viaRepost: {uri: string; cid: string} | undefined,
  feedDescriptor: string | undefined,
  logContext: Metrics['post:repost']['logContext'],
) {
  const queryClient = useQueryClient()
  const postUri = post.uri
  const postCid = post.cid
  const initialRepostUri = post.viewer?.repost
  const repostMutation = usePostRepostMutation(feedDescriptor, logContext, post)
  const unrepostMutation = usePostUnrepostMutation(
    feedDescriptor,
    logContext,
    post,
  )

  const queueToggle = useToggleMutationQueue({
    initialState: initialRepostUri,
    runMutation: async (prevRepostUri, shouldRepost) => {
      if (shouldRepost) {
        const {uri: repostUri} = await repostMutation.mutateAsync({
          uri: postUri,
          cid: postCid,
          via: viaRepost,
        })
        return repostUri
      } else {
        if (prevRepostUri) {
          await unrepostMutation.mutateAsync({
            postUri: postUri,
            repostUri: prevRepostUri,
          })
        }
        return undefined
      }
    },
    onSuccess(finalRepostUri) {
      // finalize
      updatePostShadow(queryClient, postUri, {
        repostUri: finalRepostUri,
      })
    },
  })

  const queueRepost = useCallback(() => {
    // optimistically update
    updatePostShadow(queryClient, postUri, {
      repostUri: 'pending',
    })
    return queueToggle(true)
  }, [queryClient, postUri, queueToggle])

  const queueUnrepost = useCallback(() => {
    // optimistically update
    updatePostShadow(queryClient, postUri, {
      repostUri: undefined,
    })
    return queueToggle(false)
  }, [queryClient, postUri, queueToggle])

  return [queueRepost, queueUnrepost] as const
}

function usePostRepostMutation(
  feedDescriptor: string | undefined,
  logContext: Metrics['post:repost']['logContext'],
  post: Shadow<app.bsky.feed.defs.PostView>,
) {
  const pdsClient = usePdsClient()
  const ax = useAnalytics()
  return useMutation<
    {uri: AtUriString}, // responds with the uri of the repost
    Error,
    {uri: string; cid: string; via?: {uri: string; cid: string}} // the post's uri and cid, and the repost uri/cid if present
  >({
    mutationFn: ({uri, cid, via}) => {
      ax.metric('post:repost', {
        uri,
        authorDid: post.author.did,
        logContext,
        feedDescriptor,
      })
      return pdsClient.call(repost, {
        uri: uri as AtUriString,
        cid: cid,
        via: via ? {uri: via.uri as AtUriString, cid: via.cid} : undefined,
      })
    },
  })
}

function usePostUnrepostMutation(
  feedDescriptor: string | undefined,
  logContext: Metrics['post:unrepost']['logContext'],
  post: Shadow<app.bsky.feed.defs.PostView>,
) {
  const pdsClient = usePdsClient()
  const ax = useAnalytics()
  return useMutation<void, Error, {postUri: string; repostUri: string}>({
    mutationFn: ({postUri, repostUri}) => {
      ax.metric('post:unrepost', {
        uri: postUri,
        authorDid: post.author.did,
        logContext,
        feedDescriptor,
      })
      return pdsClient.call(deleteRepost, repostUri as AtUriString)
    },
  })
}

export function usePostDeleteMutation() {
  const queryClient = useQueryClient()
  const pdsClient = usePdsClient()
  return useMutation<void, Error, {uri: string}>({
    mutationFn: async ({uri}) => {
      await pdsClient.call(deletePost, uri as AtUriString)
    },
    onSuccess(_, variables) {
      updatePostShadow(queryClient, variables.uri, {isDeleted: true})
    },
  })
}

export function useThreadMuteMutationQueue(
  post: Shadow<app.bsky.feed.defs.PostView>,
  rootUri: string,
) {
  const threadMuteMutation = useThreadMuteMutation()
  const threadUnmuteMutation = useThreadUnmuteMutation()
  const isThreadMuted = useIsThreadMuted(rootUri, post.viewer?.threadMuted)
  const setThreadMute = useSetThreadMute()

  const queueToggle = useToggleMutationQueue<boolean>({
    initialState: isThreadMuted,
    runMutation: async (_prev, shouldMute) => {
      if (shouldMute) {
        await threadMuteMutation.mutateAsync({
          uri: rootUri,
        })
        return true
      } else {
        await threadUnmuteMutation.mutateAsync({
          uri: rootUri,
        })
        return false
      }
    },
    onSuccess(finalIsMuted) {
      // finalize
      setThreadMute(rootUri, finalIsMuted)
    },
  })

  const queueMuteThread = useCallback(() => {
    // optimistically update
    setThreadMute(rootUri, true)
    return queueToggle(true)
  }, [setThreadMute, rootUri, queueToggle])

  const queueUnmuteThread = useCallback(() => {
    // optimistically update
    setThreadMute(rootUri, false)
    return queueToggle(false)
  }, [rootUri, setThreadMute, queueToggle])

  return [isThreadMuted, queueMuteThread, queueUnmuteThread] as const
}

function useThreadMuteMutation() {
  const appviewClient = useAppviewClient()
  return useMutation<
    {},
    Error,
    {uri: string} // the root post's uri
  >({
    mutationFn: async ({uri}) => {
      await appviewClient.call(app.bsky.graph.muteThread, {
        root: uri as AtUriString,
      })
      return {}
    },
  })
}

function useThreadUnmuteMutation() {
  const appviewClient = useAppviewClient()
  return useMutation<{}, Error, {uri: string}>({
    mutationFn: async ({uri}) => {
      await appviewClient.call(app.bsky.graph.unmuteThread, {
        root: uri as AtUriString,
      })
      return {}
    },
  })
}
