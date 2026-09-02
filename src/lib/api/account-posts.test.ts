import {describe, expect, it} from '@jest/globals'

import {type app} from '#/lexicons'
import {mergeAccountPostView} from './account-posts'

function makePostView(
  values: Record<string, unknown>,
): app.bsky.feed.defs.PostView {
  /*
   * These fixtures deliberately contain only the fields the merge boundary
   * reads. Lexicon validation belongs to the generated-client tests; this
   * suite protects the PDS-versus-AppView merge rule.
   */
  return values as unknown as app.bsky.feed.defs.PostView
}

describe('account post views', () => {
  it('keeps the PDS record while retaining same-CID AppView engagement data', () => {
    const authoritativeRecord = {
      $type: 'app.bsky.feed.post' as const,
      text: 'The PDS-owned text is current.',
      createdAt: '2026-08-29T00:00:00.000Z',
    }
    const authoritative = makePostView({
      cid: 'bafyreiauthoritative',
      uri: 'at://did:plc:viewer/app.bsky.feed.post/post1',
      author: {did: 'did:plc:viewer', handle: 'viewer.example.com'},
      record: authoritativeRecord,
      indexedAt: authoritativeRecord.createdAt,
    })
    const decorated = makePostView({
      ...authoritative,
      record: {
        ...authoritativeRecord,
        text: 'The stale AppView text must not win.',
      },
      likeCount: 4,
      repostCount: 2,
      replyCount: 1,
      quoteCount: 1,
    })

    const merged = mergeAccountPostView(decorated, authoritative)

    expect(merged).toMatchObject({
      cid: authoritative.cid,
      uri: authoritative.uri,
      record: authoritativeRecord,
      likeCount: 4,
      repostCount: 2,
      replyCount: 1,
      quoteCount: 1,
    })
    expect(merged.record).toBe(authoritativeRecord)
  })
})
