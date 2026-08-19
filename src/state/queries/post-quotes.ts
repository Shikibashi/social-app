import {AtUri} from '@atproto/syntax'
import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
} from '@tanstack/react-query'

import {useAppviewClient, usePublicAppviewClient} from '#/state/session'
import {type app} from '#/lexicons'
import {fetchPostQuotesPage, type RQPageParam} from './post-quotes-fetch'
import {
  didOrHandleUriMatches,
  embedViewRecordToPostView,
  getEmbeddedPost,
} from './util'

const RQKEY_ROOT = 'post-quotes'
export const RQKEY = (resolvedUri: string, expectedQuoteCount = 0) => [
  RQKEY_ROOT,
  resolvedUri,
  expectedQuoteCount,
]

export {isQuotePostForUri, quoteSearchPostsToPage} from './post-quotes-helpers'

export function usePostQuotesQuery(
  resolvedUri: string | undefined,
  expectedQuoteCount = 0,
) {
  const client = useAppviewClient()
  const publicClient = usePublicAppviewClient()
  return useInfiniteQuery<
    app.bsky.feed.getQuotes.$OutputBody,
    Error,
    InfiniteData<app.bsky.feed.getQuotes.$OutputBody>,
    QueryKey,
    RQPageParam
  >({
    queryKey: RQKEY(resolvedUri || '', expectedQuoteCount),
    queryFn: ({pageParam}: {pageParam: RQPageParam}) =>
      fetchPostQuotesPage({
        client,
        publicClient,
        resolvedUri: resolvedUri || '',
        expectedQuoteCount,
        pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: lastPage => lastPage.cursor,
    enabled: !!resolvedUri,
  })
}

export function* findAllProfilesInQueryData(
  queryClient: QueryClient,
  did: string,
): Generator<app.bsky.actor.defs.ProfileViewBasic, void> {
  const queryDatas = queryClient.getQueriesData<
    InfiniteData<app.bsky.feed.getQuotes.$OutputBody>
  >({
    queryKey: [RQKEY_ROOT],
  })
  for (const [_queryKey, queryData] of queryDatas) {
    if (!queryData?.pages) {
      continue
    }
    for (const page of queryData?.pages) {
      for (const item of page.posts) {
        if (item.author.did === did) {
          yield item.author
        }
        const quotedPost = getEmbeddedPost(item.embed)
        if (quotedPost?.author.did === did) {
          yield quotedPost.author
        }
      }
    }
  }
}

export function* findAllPostsInQueryData(
  queryClient: QueryClient,
  uri: string,
): Generator<app.bsky.feed.defs.PostView, undefined> {
  const queryDatas = queryClient.getQueriesData<
    InfiniteData<app.bsky.feed.getQuotes.$OutputBody>
  >({
    queryKey: [RQKEY_ROOT],
  })
  const atUri = new AtUri(uri)
  for (const [_queryKey, queryData] of queryDatas) {
    if (!queryData?.pages) {
      continue
    }
    for (const page of queryData?.pages) {
      for (const post of page.posts) {
        if (didOrHandleUriMatches(atUri, post)) {
          yield post
        }

        const quotedPost = getEmbeddedPost(post.embed)
        if (quotedPost && didOrHandleUriMatches(atUri, quotedPost)) {
          yield embedViewRecordToPostView(quotedPost)
        }
      }
    }
  }
}
