import {TID} from '@atproto/common-web'
import {type Client, type LexMap} from '@atproto/lex'
import {toDatetimeString} from '@atproto/syntax'
import {type RichText} from '@bsky/sdk/richtext'

import {type SpacesClient, spacesClient} from '#/lib/atproto/spaces'
import {LEGACY_RADLIB_PRIVATE_ENABLED, SPACES_ALPHA_ENABLED} from '#/env'
import {org} from '#/lexicons'

export const PRIVATE_POST_COLLECTION = 'org.radlib.private.post' as const

/**
 * Build the private-post value used by the fork-owned permissioned API. This
 * is intentionally not an app.bsky.feed.post record. In alpha mode
 * it is written through com.atproto.space.putRecord; the legacy adapter is an
 * explicit migration-only escape hatch and is disabled by default.
 */
export function buildPrivatePostValue(
  richtext: RichText,
  langs: string[],
  createdAt = new Date(),
  embed?: LexMap,
  reply?: LexMap,
) {
  return {
    $type: PRIVATE_POST_COLLECTION,
    text: richtext.text,
    ...(richtext.facets?.length ? {facets: richtext.facets} : {}),
    createdAt: toDatetimeString(createdAt),
    ...(langs.length ? {langs: langs.slice(0, 3)} : {}),
    ...(embed ? {embed} : {}),
    ...(reply ? {reply} : {}),
  }
}

export async function writePrivateTextPost(
  client: Client,
  space: string,
  richtext: RichText,
  langs: string[],
  embed?: LexMap,
  reply?: LexMap,
) {
  const input = buildPrivatePostInput(space, richtext, langs, embed, reply)
  if (SPACES_ALPHA_ENABLED)
    return writePrivateSpaceTextPost(spacesClient(client), input)
  if (!LEGACY_RADLIB_PRIVATE_ENABLED) {
    throw new Error(
      'Spaces alpha transport is disabled; the legacy Radlib adapter is migration-only',
    )
  }
  return client.call(org.radlib.private.putRecord, input)
}

/** Write a note with a DPoP-bound client for a community owned by another DID. */
export async function writePrivateTextPostToSpace(
  client: SpacesClient,
  space: string,
  richtext: RichText,
  langs: string[],
  embed?: LexMap,
  reply?: LexMap,
) {
  if (!SPACES_ALPHA_ENABLED) {
    throw new Error('Community boards require Spaces alpha transport')
  }
  return writePrivateSpaceTextPost(
    client,
    buildPrivatePostInput(space, richtext, langs, embed, reply),
  )
}

function buildPrivatePostInput(
  space: string,
  richtext: RichText,
  langs: string[],
  embed?: LexMap,
  reply?: LexMap,
) {
  return {
    space,
    collection: PRIVATE_POST_COLLECTION,
    rkey: TID.nextStr(),
    record: buildPrivatePostValue(richtext, langs, new Date(), embed, reply),
  }
}

function writePrivateSpaceTextPost(
  client: Pick<SpacesClient, 'putRecord'>,
  input: ReturnType<typeof buildPrivatePostInput>,
) {
  return client.putRecord(input)
}
