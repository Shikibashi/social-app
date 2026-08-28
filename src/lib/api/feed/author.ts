import {type Client, type XrpcRequestParams} from '@atproto/lex'

import {
  canReadAccountPosts,
  fetchAccountPostFeed,
} from '#/lib/api/account-posts'
import {
  filterPublicPostsForViewer,
  hasDirectViewerBlock,
} from '#/state/queries/public-visibility'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {type FeedAPI, type FeedAPIResponse} from './types'

type GetAuthorFeedParams = XrpcRequestParams<
  typeof app.bsky.feed.getAuthorFeed.main
>

export class AuthorFeedAPI implements FeedAPI {
  client: Client
  fallbackClient?: Client
  accountClient?: Client
  _params: GetAuthorFeedParams

  constructor({
    client,
    fallbackClient,
    accountClient,
    feedParams,
  }: {
    client: Client
    fallbackClient?: Client
    accountClient?: Client | null
    feedParams: GetAuthorFeedParams
  }) {
    this.client = client
    this.fallbackClient = fallbackClient
    this.accountClient = accountClient ?? undefined
    this._params = feedParams
  }

  get params() {
    const params = {...this._params}
    params.includePins = params.filter === 'posts_and_author_threads'
    return params
  }

  async peekLatest(): Promise<app.bsky.feed.defs.FeedViewPost> {
    if (canReadAccountPosts(this.accountClient, this.params.actor)) {
      try {
        const data = await this.fetchFromAccountPds({
          cursor: undefined,
          limit: 1,
        })
        return data.feed[0]
      } catch {
        // Keep the AppView path as a compatibility fallback when the account
        // PDS is temporarily unavailable.
      }
    }
    const data = await this.client.call(app.bsky.feed.getAuthorFeed, {
      ...this.params,
      limit: 1,
    })
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
        // Keep the AppView path as a compatibility fallback when the account
        // PDS is temporarily unavailable.
      }
    }

    /*
     * A failed request rejects rather than resolving, so the error propagates
     * to the query and drives the feed error UI (blocked actor, rate limit).
     * The agent behaved the same way - its `success` flag was only ever true -
     * so the empty-page branch this replaces was unreachable.
     */
    const params = {
      ...this.params,
      cursor,
      limit,
    }
    let data: app.bsky.feed.getAuthorFeed.$OutputBody
    try {
      data = await this.client.call(app.bsky.feed.getAuthorFeed, params)
    } catch (error) {
      if (!this.fallbackClient || (await this.viewerOwnsDirectBlock())) {
        throw error
      }
      try {
        const publicData = await this.fallbackClient.call(
          app.bsky.feed.getAuthorFeed,
          params,
        )
        return {
          cursor: publicData.cursor,
          feed: this._filter(await this.filterPublicFeed(publicData.feed)),
        }
      } catch {
        throw error
      }
    }
    if (!this.fallbackClient) {
      return {
        cursor: data.cursor,
        feed: this._filter(data.feed),
      }
    }

    if (await this.viewerOwnsDirectBlock()) {
      return {
        cursor: data.cursor,
        feed: this._filter(data.feed),
      }
    }

    try {
      const publicData = await this.fallbackClient.call(
        app.bsky.feed.getAuthorFeed,
        params,
      )
      if (publicData.feed.length > 0) {
        return {
          cursor: publicData.cursor,
          feed: this._filter(await this.filterPublicFeed(publicData.feed)),
        }
      }
    } catch {
      // Keep the authenticated response if the public-read retry is
      // unavailable. A provider outage must not masquerade as success.
    }

    return {
      cursor: data.cursor,
      feed: this._filter(data.feed),
    }
  }

  private fetchFromAccountPds({
    cursor,
    limit,
  }: {
    cursor: string | undefined
    limit: number
  }): Promise<FeedAPIResponse> {
    return fetchAccountPostFeed({
      pdsClient: this.accountClient!,
      appviewClient: this.client,
      actor: this.params.actor,
      cursor,
      limit,
      filter: this.params.filter,
    })
  }

  private async viewerOwnsDirectBlock(): Promise<boolean> {
    try {
      const profile = await this.client.call(app.bsky.actor.getProfile, {
        actor: this.params.actor,
      })
      return hasDirectViewerBlock(profile)
    } catch {
      // Do not use a public retry when the relationship authority cannot be
      // checked. Failing closed preserves a local direct block.
      return true
    }
  }

  private async filterPublicFeed(
    feed: app.bsky.feed.defs.FeedViewPost[],
  ): Promise<app.bsky.feed.defs.FeedViewPost[]> {
    const posts = await filterPublicPostsForViewer(
      this.client,
      feed.map(item => item.post),
    )
    const allowedUris = new Set(posts.map(post => post.uri))
    return feed.filter(item => allowedUris.has(item.post.uri))
  }

  _filter(feed: app.bsky.feed.defs.FeedViewPost[]) {
    if (this.params.filter === 'posts_and_author_threads') {
      return feed.filter(post => {
        const isReply = post.reply
        const isRepost = bsky.isType(
          app.bsky.feed.defs.reasonRepost,
          post.reason,
        )
        const isPin = bsky.isType(app.bsky.feed.defs.reasonPin, post.reason)
        if (!isReply) return true
        if (isRepost || isPin) return true
        return isReply && isAuthorReplyChain(this.params.actor, post, feed)
      })
    }

    return feed
  }
}

function isAuthorReplyChain(
  actor: string,
  post: app.bsky.feed.defs.FeedViewPost,
  posts: app.bsky.feed.defs.FeedViewPost[],
): boolean {
  // current post is by a different user (shouldn't happen)
  if (post.post.author.did !== actor) return false

  const replyParent = post.reply?.parent

  if (bsky.isType(app.bsky.feed.defs.postView, replyParent)) {
    // reply parent is by a different user
    if (replyParent.author.did !== actor) return false

    // A top-level post that matches the parent of the current post.
    const parentPost = posts.find(p => p.post.uri === replyParent.uri)

    /*
     * Either we haven't fetched the parent at the top level, or the only
     * record we have is on feedItem.reply.parent, which we've already checked
     * above.
     */
    if (!parentPost) return true

    // Walk up to parent
    return isAuthorReplyChain(actor, parentPost, posts)
  }

  // Just default to showing it
  return true
}
