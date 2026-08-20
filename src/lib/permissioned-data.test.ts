import {RichText} from '@bsky/sdk/richtext'

import {
  buildPrivatePostValue,
  PRIVATE_POST_COLLECTION,
  writePrivateTextPost,
} from './permissioned-data'

jest.mock('#/env', () => ({
  LEGACY_RADLIB_PRIVATE_ENABLED: true,
  SPACES_ALPHA_ENABLED: false,
}))

describe('permissioned data client boundary', () => {
  it('builds a private post without using the public post collection', () => {
    const value = buildPrivatePostValue(new RichText({text: 'private text'}), [
      'en',
      'fr',
      'de',
      'ja',
    ])

    expect(value.$type).toBe(PRIVATE_POST_COLLECTION)
    expect(value.text).toBe('private text')
    expect(value.langs).toEqual(['en', 'fr', 'de'])
    expect(value).not.toHaveProperty('embed')
    expect(value).not.toHaveProperty('reply')
    expect(value.$type).not.toBe('app.bsky.feed.post')
  })

  it('uses the fork-owned permissioned XRPC instead of a public post write', async () => {
    const call = jest.fn().mockResolvedValue({
      space: 'at://did:plc:owner/space/org.radlib.account/private',
      repo: 'did:plc:owner',
      collection: PRIVATE_POST_COLLECTION,
      rkey: '3jzfcwz3q7s2a',
      cid: 'bafyprivate',
    })

    await writePrivateTextPost(
      {call} as never,
      'at://did:plc:owner/space/org.radlib.account/private',
      new RichText({text: 'permissioned write'}),
      ['en'],
    )

    expect(call).toHaveBeenCalledTimes(1)
    const [procedure, input] = call.mock.calls[0] as [
      {$nsid: string},
      {collection: string; record: {$type: string}},
    ]
    expect(procedure.$nsid).toBe('org.radlib.private.putRecord')
    expect(input.collection).toBe(PRIVATE_POST_COLLECTION)
    expect(input.record.$type).toBe(PRIVATE_POST_COLLECTION)
  })
})
