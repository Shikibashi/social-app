import {type CidString, type Client} from '@atproto/lex'
import {
  type AtIdentifierString,
  AtUri,
  type AtUriString,
  type DidString,
  type HandleString,
} from '@atproto/syntax'

import {app, com} from '#/lexicons'
import * as bsky from '#/types/bsky'

type AccountPostRecord = {
  cid: CidString
  uri: AtUriString
  value: unknown
}

export type AccountPostFeed = {
  cursor?: string
  feed: app.bsky.feed.defs.FeedViewPost[]
}

/**
 * Account-owned records are authoritative for the signed-in actor. The
 * public AppView can lag behind a PDS, so only use this path when the client
 * is actually authenticated as the actor being read.
 */
export function canReadAccountPosts(
  client: Client | null | undefined,
  actor: string,
): client is Client {
  return client?.assertDid === actor
}

export async function fetchAccountPostFeed({
  pdsClient,
  appviewClient,
  actor,
  cursor,
  limit,
  filter,
}: {
  pdsClient: Client
  appviewClient: Client
  actor: string
  cursor: string | undefined
  limit: number
  filter?: string
}): Promise<AccountPostFeed> {
  if (!canReadAccountPosts(pdsClient, actor)) {
    throw new Error('Account PDS client does not own this actor')
  }

  const data = await pdsClient.call(com.atproto.repo.listRecords, {
    repo: actor as AtIdentifierString,
    collection: app.bsky.feed.post.$type,
    cursor,
    limit,
  })
  const records = data.records.flatMap(record => {
    if (!record.cid || !matchesAuthorFilter(record.value, filter)) return []
    return [
      {
        cid: record.cid,
        uri: record.uri,
        value: record.value,
      },
    ]
  })
  const posts = await hydrateAccountPostRecords(appviewClient, records)
  const postsByUri = new Map(posts.map(post => [post.uri, post]))
  const author = records.some(record => !postsByUri.has(record.uri))
    ? await getAccountPostAuthor(appviewClient, actor)
    : undefined

  return {
    cursor: data.cursor,
    feed: records
      .map(record => {
        const post =
          postsByUri.get(record.uri) ||
          (author && postRecordToView(record, author))
        return post ? {post} : undefined
      })
      .filter(
        (item): item is app.bsky.feed.defs.FeedViewPost => item !== undefined,
      ),
  }
}

export async function fetchAccountPost({
  pdsClient,
  appviewClient,
  actor,
  uri,
}: {
  pdsClient: Client
  appviewClient: Client
  actor: string
  uri: string
}): Promise<app.bsky.feed.defs.PostView | undefined> {
  if (!canReadAccountPosts(pdsClient, actor)) return undefined

  const atUri = new AtUri(uri)
  if (!atUri.host.startsWith('did:')) {
    const resolved = await appviewClient.call(
      com.atproto.identity.resolveHandle,
      {handle: atUri.host as HandleString},
    )
    atUri.host = resolved.did
  }
  if (atUri.host !== actor || atUri.collection !== app.bsky.feed.post.$type) {
    return undefined
  }

  const record = await pdsClient.call(com.atproto.repo.getRecord, {
    repo: actor,
    collection: app.bsky.feed.post.$type,
    rkey: atUri.rkeySafe,
  })
  if (!record.cid || !bsky.isType(app.bsky.feed.post, record.value)) {
    return undefined
  }

  const author = await getAccountPostAuthor(appviewClient, actor)
  return postRecordToView(
    {
      cid: record.cid,
      uri: record.uri,
      value: record.value,
    },
    author,
  )
}

function matchesAuthorFilter(value: unknown, filter: string | undefined) {
  if (!bsky.isType(app.bsky.feed.post, value)) return false
  if (filter === 'posts_no_replies') return !value.reply
  if (filter === 'posts_with_media') {
    return (
      bsky.isType(app.bsky.embed.images.main, value.embed) ||
      bsky.isType(app.bsky.embed.gallery.main, value.embed) ||
      bsky.isType(app.bsky.embed.video.main, value.embed)
    )
  }
  if (filter === 'posts_with_video') {
    return bsky.isType(app.bsky.embed.video.main, value.embed)
  }
  return true
}

async function hydrateAccountPostRecords(
  client: Client,
  records: AccountPostRecord[],
): Promise<app.bsky.feed.defs.PostView[]> {
  const posts: app.bsky.feed.defs.PostView[] = []
  for (let i = 0; i < records.length; i += 25) {
    try {
      const data = await client.call(app.bsky.feed.getPosts, {
        uris: records.slice(i, i + 25).map(record => record.uri),
      })
      posts.push(...data.posts)
    } catch {
      // A missing or lagging AppView should only lose its decoration. The
      // caller builds a plain post view from the authoritative record below.
    }
  }
  return posts
}

async function getAccountPostAuthor(
  client: Client,
  actor: string,
): Promise<app.bsky.actor.defs.ProfileViewBasic> {
  try {
    const profile = await client.call(app.bsky.actor.getProfile, {
      actor: actor as AtIdentifierString,
    })
    return {
      ...profile,
      $type: 'app.bsky.actor.defs#profileViewBasic',
    }
  } catch {
    return {
      did: actor as DidString,
      handle: actor as HandleString,
    }
  }
}

function postRecordToView(
  record: AccountPostRecord,
  author: app.bsky.actor.defs.ProfileViewBasic,
): app.bsky.feed.defs.PostView | undefined {
  if (!bsky.isType(app.bsky.feed.post, record.value)) return undefined
  return {
    cid: record.cid,
    uri: record.uri,
    author,
    record: record.value,
    indexedAt: record.value.createdAt,
  }
}
