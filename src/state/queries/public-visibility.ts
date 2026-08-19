import {type Client} from '@atproto/lex'
import {type AtIdentifierString,AtUri} from '@atproto/syntax'

import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'

type PostView = app.bsky.feed.defs.PostView
type ActorViewerState = app.bsky.actor.defs.ViewerState
type CompatibilityActorViewerState = ActorViewerState & {
  /** Older/remote providers may still send this legacy field. */
  blockedByList?: unknown
}

type PostWithAuthor = {
  author?: {
    did: string
    viewer?: ActorViewerState
  }
}

/**
 * The upstream view shape historically exposed listblock state through the
 * same `blocking` field as a direct block. The fork accepts only the
 * individual block collection as a hard boundary; list URIs are inert even
 * when a provider omits the companion `blockingByList` field.
 */
export function hasDirectViewerBlock(actor: {
  viewer?: ActorViewerState
}): boolean {
  const viewer = actor.viewer
  if (!viewer?.blocking) return false
  try {
    return new AtUri(viewer.blocking).collection === app.bsky.graph.block.$type
  } catch {
    return false
  }
}

/** The viewer's own direct block is the only relationship that hides content. */
export function viewerHidesActor(actor: {viewer?: ActorViewerState}): boolean {
  return hasDirectViewerBlock(actor)
}

/**
 * Filter records recovered from an unauthenticated/public read without
 * turning that read into a way around the viewer's own direct blocks.
 *
 * Public responses normally omit `author.viewer`, so relationship authority is
 * checked against the authenticated client once per author. If that authority
 * lookup fails, the record is withheld rather than guessing that a hard local
 * boundary does not exist.
 */
export async function filterPublicPostsForViewer<T extends PostWithAuthor>(
  client: Client,
  posts: T[],
): Promise<T[]> {
  const directBlockByDid = new Map<string, boolean>()

  const viewerHidesPostAuthor = async (post: T): Promise<boolean> => {
    const author = post.author
    if (!author?.did) return true
    if (hasDirectViewerBlock(author)) return true
    if (author.viewer) return false

    const cached = directBlockByDid.get(author.did)
    if (cached !== undefined) return cached

    let directBlock = true
    try {
      const profile = await client.call(app.bsky.actor.getProfile, {
        actor: author.did as AtIdentifierString,
      })
      directBlock = hasDirectViewerBlock(profile)
    } catch {
      // Do not let an unavailable relationship authority bypass a direct
      // block. The recovered public record is safe to omit.
    }
    directBlockByDid.set(author.did, directBlock)
    return directBlock
  }

  const results = await Promise.all(
    posts.map(async post => ({
      post,
      hidden: await viewerHidesPostAuthor(post),
    })),
  )
  return results.filter(({hidden}) => !hidden).map(({post}) => post)
}

/** The remote actor has authored a hard interaction boundary against us. */
export function viewerIsBlockedByActor(actor: {
  viewer?: ActorViewerState
}): boolean {
  return Boolean(actor.viewer?.blockedBy)
}

/** Bidirectional interaction policy; deliberately not a visibility predicate. */
export function interactionBlocked(actor: {
  viewer?: ActorViewerState
}): boolean {
  return viewerHidesActor(actor) || viewerIsBlockedByActor(actor)
}

/**
 * A local list block is intentionally not an interaction boundary in this
 * fork. Incoming blocks and individually authored direct blocks still are.
 */
export function hasViewerInteractionBoundary(actor: {
  viewer?: ActorViewerState
}): boolean {
  return interactionBlocked(actor)
}

/**
 * Public-read policy for this fork.
 *
 * A viewer's own direct block remains a hard local boundary. Incoming
 * `blockedBy` state and legacy listblock state are not universal authority
 * over public records, so they must not be turned into a local content filter.
 * This only changes the view passed to public-read moderation; it does not
 * alter the server's relationship records or promise that a write will be
 * accepted by a remote service.
 */
export function stripNonLocalBlockVisibility<T extends PostView>(post: T): T {
  const author = stripNonLocalActorBlockVisibility(post.author)
  const embed = stripEmbedBlockVisibility(post.embed)

  if (author === post.author && embed === post.embed) {
    return post
  }

  return {
    ...post,
    author,
    embed,
  }
}

export function stripNonLocalActorBlockVisibility<
  T extends {viewer?: ActorViewerState},
>(actor: T): T {
  const viewer = actor.viewer
  if (!viewer) return actor
  const compatibilityViewer = viewer as CompatibilityActorViewerState

  const directBlocking = hasDirectViewerBlock(actor)
  const hasNonLocalBlockState = Boolean(
    compatibilityViewer.blockedBy ||
    compatibilityViewer.blockedByList ||
    compatibilityViewer.blockingByList ||
    (compatibilityViewer.blocking && !directBlocking),
  )
  if (!hasNonLocalBlockState) return actor

  // Public fallback may receive upstream list-derived fields. Remove every
  // list/incoming visibility marker while preserving a separate direct block.
  const {
    blockedBy: _blockedBy,
    blockedByList: _blockedByList,
    blockingByList: _blockingByList,
    ...restViewer
  } = compatibilityViewer
  const nextViewer = {
    ...restViewer,
    blocking: directBlocking ? restViewer.blocking : undefined,
  }

  return {
    ...actor,
    viewer: nextViewer,
  }
}

function stripEmbedBlockVisibility(
  embed: PostView['embed'],
): PostView['embed'] {
  if (bsky.isType(app.bsky.embed.record.view, embed)) {
    const originalRecord = embed.record
    const record = stripRecordViewBlockVisibility(originalRecord)
    return record === originalRecord
      ? embed
      : ({...embed, record} as unknown as typeof embed)
  }

  if (bsky.isType(app.bsky.embed.recordWithMedia.view, embed)) {
    const originalRecord = embed.record
    const record = stripRecordViewBlockVisibility(originalRecord)
    return record === originalRecord
      ? embed
      : ({...embed, record} as unknown as typeof embed)
  }

  return embed
}

function stripRecordViewBlockVisibility(record: unknown): unknown {
  if (bsky.isType(app.bsky.embed.record.viewRecord, record)) {
    const viewRecord = record
    const author = stripNonLocalActorBlockVisibility(viewRecord.author)
    const embeds = viewRecord.embeds?.map(stripNestedEmbedBlockVisibility) as
      typeof viewRecord.embeds | undefined
    if (author === viewRecord.author && embeds === viewRecord.embeds) {
      return viewRecord
    }
    return {
      ...viewRecord,
      author,
      embeds,
    }
  }

  if (bsky.isType(app.bsky.embed.record.viewBlocked, record)) {
    const viewBlocked = record
    const author = stripNonLocalActorBlockVisibility(viewBlocked.author)
    return author === viewBlocked.author
      ? viewBlocked
      : {...viewBlocked, author}
  }

  return record
}

function stripNestedEmbedBlockVisibility(embed: unknown) {
  if (bsky.isType(app.bsky.embed.record.view, embed)) {
    const originalRecord = embed.record
    const record = stripRecordViewBlockVisibility(originalRecord)
    return record === originalRecord
      ? embed
      : ({...embed, record} as unknown as typeof embed)
  }

  if (bsky.isType(app.bsky.embed.recordWithMedia.view, embed)) {
    const originalRecord = embed.record
    const record = stripRecordViewBlockVisibility(originalRecord)
    return record === originalRecord
      ? embed
      : ({...embed, record} as unknown as typeof embed)
  }

  return embed
}
