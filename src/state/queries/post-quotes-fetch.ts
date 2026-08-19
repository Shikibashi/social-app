import {type Client} from '@atproto/lex'
import {AtUri, type AtUriString} from '@atproto/syntax'

import {app} from '#/lexicons'
import {quoteSearchPostsToPage} from './post-quotes-helpers'
import {
  filterPublicPostsForViewer,
  hasDirectViewerBlock,
} from './public-visibility'

const PAGE_SIZE = 30
export type RQPageParam = string | undefined

async function viewerOwnsDirectBlockForPost(
  client: Client,
  resolvedUri: string,
): Promise<boolean> {
  try {
    const actor = new AtUri(resolvedUri).host
    const profile = await client.call(app.bsky.actor.getProfile, {actor})
    return hasDirectViewerBlock(profile)
  } catch {
    // Do not cross the boundary when relationship authority is unavailable.
    return true
  }
}

export async function fetchPostQuotesPage({
  client,
  publicClient,
  resolvedUri,
  expectedQuoteCount,
  pageParam,
}: {
  client: Client
  publicClient: Client
  resolvedUri: string
  expectedQuoteCount: number
  pageParam: RQPageParam
}): Promise<app.bsky.feed.getQuotes.$OutputBody> {
  const loadPublicFallback = async () => {
    try {
      const publicPage = await publicClient.call(app.bsky.feed.getQuotes, {
        uri: resolvedUri as AtUriString,
        limit: PAGE_SIZE,
        cursor: pageParam,
      })
      if (publicPage.posts.length > 0) {
        return {
          ...publicPage,
          posts: await filterPublicPostsForViewer(client, publicPage.posts),
        }
      }
    } catch {
      // Continue to the structured search fallback below.
    }

    /*
     * Some providers expose a non-zero quoteCount but omit the records
     * from getQuotes when a relationship boundary is involved. Search
     * has a structured embeddedAtUris filter and can recover the public
     * outer quote post without treating a provider omission as "no
     * quotes".
     */
    try {
      const fallback = await publicClient.call(app.bsky.feed.searchPostsV2, {
        embeddedAtUris: [resolvedUri as AtUriString],
        sort: 'recent',
        allTime: true,
        limit: Math.min(100, Math.max(PAGE_SIZE, expectedQuoteCount)),
      })
      const page = quoteSearchPostsToPage(fallback, resolvedUri)
      return {
        ...page,
        posts: await filterPublicPostsForViewer(client, page.posts),
      }
    } catch {
      return undefined
    }
  }

  let page: app.bsky.feed.getQuotes.$OutputBody
  try {
    page = await client.call(app.bsky.feed.getQuotes, {
      uri: resolvedUri as AtUriString,
      limit: PAGE_SIZE,
      cursor: pageParam,
    })
  } catch (error) {
    // A provider may reject the authenticated request for an incoming
    // block even though the quote record is public. Only the first page
    // with a provider-reported quote count may cross this boundary; a
    // pagination failure must remain an honest query error.
    if (pageParam !== undefined || expectedQuoteCount <= 0) {
      throw error
    }
    if (await viewerOwnsDirectBlockForPost(client, resolvedUri)) {
      throw error
    }
    const fallback = await loadPublicFallback()
    if (fallback) return fallback
    throw error
  }

  if (
    page.posts.length > 0 ||
    pageParam !== undefined ||
    expectedQuoteCount <= 0
  ) {
    return page
  }

  if (await viewerOwnsDirectBlockForPost(client, resolvedUri)) {
    return page
  }

  const fallback = await loadPublicFallback()
  // Preserve the provider's original response. The screen will show an
  // honest provider-unavailable state rather than fabricating a quote.
  return fallback ?? page
}
