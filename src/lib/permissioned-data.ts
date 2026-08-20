import {TID} from '@atproto/common-web'
import {type Client} from '@atproto/lex'
import {toDatetimeString} from '@atproto/syntax'
import {type RichText} from '@bsky/sdk/richtext'

import {spacesClient} from '#/lib/atproto/spaces'
import {LEGACY_RADLIB_PRIVATE_ENABLED, SPACES_ALPHA_ENABLED} from '#/env'
import {org} from '#/lexicons'

export const PRIVATE_POST_COLLECTION = 'org.radlib.private.post' as const

/**
 * Build the text-only private-post value used by the fork-owned permissioned
 * API. This is intentionally not an app.bsky.feed.post record. In alpha mode
 * it is written through com.atproto.space.putRecord; legacy mode retains the
 * old adapter for existing test/development PDS deployments.
 */
export function buildPrivatePostValue(
  richtext: RichText,
  langs: string[],
  createdAt = new Date(),
) {
  return {
    $type: PRIVATE_POST_COLLECTION,
    text: richtext.text,
    ...(richtext.facets?.length ? {facets: richtext.facets} : {}),
    createdAt: toDatetimeString(createdAt),
    ...(langs.length ? {langs: langs.slice(0, 3)} : {}),
  }
}

export async function writePrivateTextPost(
  client: Client,
  space: string,
  richtext: RichText,
  langs: string[],
) {
  const input = {
    space,
    collection: PRIVATE_POST_COLLECTION,
    rkey: TID.nextStr(),
    record: buildPrivatePostValue(richtext, langs),
  }
  if (SPACES_ALPHA_ENABLED) return spacesClient(client).putRecord(input)
  if (!LEGACY_RADLIB_PRIVATE_ENABLED) {
    throw new Error(
      'Permissioned-data transport is disabled: enable Spaces alpha or the legacy Radlib adapter',
    )
  }
  return client.call(org.radlib.private.putRecord, input)
}
