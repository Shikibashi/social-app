import {AtUri, type AtUriString} from '@atproto/syntax'

import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {getEmbeddedPost} from './util'

/**
 * Returns whether a post embeds the target URI. Search results may expose the
 * embedded view, while a blocked/detached view may expose only the original
 * strong reference in the outer record, so check both representations.
 */
export function isQuotePostForUri(
  post: app.bsky.feed.defs.PostView,
  targetUri: string,
): boolean {
  const target = new AtUri(targetUri).href
  const embedded = getEmbeddedPost(post.embed)
  if (embedded?.uri === target) {
    return true
  }

  if (!bsky.isType(app.bsky.feed.post, post.record)) {
    return false
  }

  const embed = post.record.embed
  if (bsky.isType(app.bsky.embed.record.main, embed)) {
    return embed.record.uri === target
  }
  if (bsky.isType(app.bsky.embed.recordWithMedia.main, embed)) {
    return embed.record.record.uri === target
  }
  return false
}

/** Keep the quote endpoint's page shape when using the search fallback. */
export function quoteSearchPostsToPage(
  data: app.bsky.feed.searchPostsV2.$OutputBody,
  targetUri: string,
): app.bsky.feed.getQuotes.$OutputBody {
  return {
    uri: targetUri as AtUriString,
    posts: data.posts.filter(post => isQuotePostForUri(post, targetUri)),
    // Search cursors are not compatible with getQuotes cursors. The fallback
    // asks for a sufficiently large first page and deliberately stops here.
    cursor: undefined,
  }
}
