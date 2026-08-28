import {type Client, type XrpcRequestParams} from '@atproto/lex'
import {type AtUriString} from '@atproto/syntax'

import {
  canReadAccountPosts,
  fetchPostFromAuthorPds,
  type MissingPostResolver,
} from '#/lib/api/account-posts'
import {filterPublicPostsForViewer} from '#/state/queries/public-visibility'
import {app, com} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {type FeedAPI, type FeedAPIResponse} from './types'

type GetActorLikesParams = XrpcRequestParams<
  typeof app.bsky.feed.getActorLikes.main
>

export class LikesFeedAPI implements FeedAPI {
  client: Client
  accountClient?: Client
  params: GetActorLikesParams
  private readonly resolveMissingPost: MissingPostResolver

  constructor({
    client,
    accountClient,
    feedParams,
    resolveMissingPost,
  }: {
    client: Client
    accountClient?: Client | null
    feedParams: GetActorLikesParams
    resolveMissingPost?: MissingPostResolver
  }) {
    this.client = client
    this.accountClient = accountClient ?? undefined
    this.params = feedParams
    this.resolveMissingPost =
      resolveMissingPost ??
      (uri => fetchPostFromAuthorPds({appviewClient: client, uri}))
  }

  async peekLatest(): Promise<app.bsky.feed.defs.FeedViewPost> {
    const data = await this.fetch({cursor: undefined, limit: 1})
    return data.feed[0]
  }

  async fetch({
    cursor,
    limit,
  }: {
    cursor: string | undefined
    limit: number
  }): Promise<FeedAPIResponse> {
    if (canReadAccountPosts(this.accountClient, this.params.actor)) {
      try {
        return await this.fetchFromAccountPds({cursor, limit})
      } catch {
        // Keep the AppView path as a compatibility fallback for providers
        // whose account service does not expose repo.listRecords.
      }
    }

    /*
     * A failed request rejects rather than resolving, so the error propagates
     * to the query and drives the feed error UI. The agent behaved the same
     * way - its `success` flag was only ever true - so the empty-page branch
     * this replaces was unreachable.
     */
    const data = await this.client.call(app.bsky.feed.getActorLikes, {
      ...this.params,
      cursor,
      limit,
    })
    // HACKFIX: the API incorrectly returns a cursor when there are no items -sfn
    const isEmptyPage = data.feed.length === 0
    return {
      cursor: isEmptyPage ? undefined : data.cursor,
      feed: data.feed,
    }
  }

  private async fetchFromAccountPds({
    cursor,
    limit,
  }: {
    cursor: string | undefined
    limit: number
  }): Promise<FeedAPIResponse> {
    const data = await this.accountClient!.call(com.atproto.repo.listRecords, {
      repo: this.params.actor,
      collection: app.bsky.feed.like.$type,
      cursor,
      limit,
    })

    const subjectUris = data.records.flatMap(record => {
      if (!bsky.isType(app.bsky.feed.like, record.value)) return []
      return [record.value.subject.uri]
    })
    const posts = await getPostsInBatches(this.client, subjectUris).catch(
      () => [],
    )
    const postsByUri = new Map(posts.map(post => [post.uri, post]))
    const missingUris = subjectUris.filter(uri => !postsByUri.has(uri))
    const recovered: Array<app.bsky.feed.defs.PostView | undefined> =
      await Promise.all(
        missingUris.map(uri =>
          this.resolveMissingPost(uri).catch(() => undefined),
        ),
      )
    const recoveredPosts = recovered.filter(
      (post): post is app.bsky.feed.defs.PostView => post !== undefined,
    )
    const visibleRecovered =
      await filterPublicPostsForViewer<app.bsky.feed.defs.PostView>(
        this.client,
        recoveredPosts,
      )
    for (const post of visibleRecovered) {
      postsByUri.set(post.uri, post)
    }

    return {
      cursor: data.cursor,
      feed: subjectUris
        .map(uri => postsByUri.get(uri))
        .filter(
          (post): post is app.bsky.feed.defs.PostView => post !== undefined,
        )
        .map(post => ({post})),
    }
  }
}

async function getPostsInBatches(
  client: Client,
  uris: AtUriString[],
): Promise<app.bsky.feed.defs.PostView[]> {
  const posts: app.bsky.feed.defs.PostView[] = []
  for (let i = 0; i < uris.length; i += 25) {
    const data = await client.call(app.bsky.feed.getPosts, {
      uris: uris.slice(i, i + 25),
    })
    posts.push(...data.posts)
  }
  return posts
}
