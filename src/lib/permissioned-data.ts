import {TID} from '@atproto/common-web'
import {type Client} from '@atproto/lex'
import {toDatetimeString} from '@atproto/syntax'
import {type RichText} from '@bsky/sdk/richtext'

import {org} from '#/lexicons'

export const PRIVATE_POST_COLLECTION = 'org.radlib.private.post' as const

/**
 * Build the text-only private-post value used by the fork-owned permissioned
 * API. This is intentionally not an app.bsky.feed.post record: the caller
 * must send it through org.radlib.private.putRecord so it never enters the
 * public repository/sequencer path.
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
  return client.call(org.radlib.private.putRecord, {
    space,
    collection: PRIVATE_POST_COLLECTION,
    rkey: TID.nextStr(),
    record: buildPrivatePostValue(richtext, langs),
  })
}
