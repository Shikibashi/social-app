import {RichText} from '@bsky/sdk/richtext'

import {spacesClient} from '#/lib/atproto/spaces'
import {writePrivateTextPost} from './permissioned-data'

jest.mock('#/env', () => ({
  LEGACY_RADLIB_PRIVATE_ENABLED: false,
  SPACES_ALPHA_ENABLED: true,
}))

jest.mock('#/lib/atproto/spaces', () => ({
  spacesClient: jest.fn(),
}))

describe('permissioned data Spaces transport', () => {
  it('writes through the signed-in PDS client in Spaces alpha mode', async () => {
    const putRecord = jest.fn().mockResolvedValue({uri: 'at://test'})
    ;(spacesClient as jest.MockedFunction<typeof spacesClient>).mockReturnValue(
      {putRecord} as never,
    )
    const client = {did: 'did:plc:writer', call: jest.fn()} as never

    await writePrivateTextPost(
      client,
      'at://did:plc:owner/space/org.radlib.community/test',
      new RichText({text: 'private board note'}),
      ['en'],
    )

    expect(spacesClient).toHaveBeenCalledWith(client)
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        space: 'at://did:plc:owner/space/org.radlib.community/test',
        collection: 'org.radlib.private.post',
        record: expect.objectContaining({
          $type: 'org.radlib.private.post',
          text: 'private board note',
        }),
      }),
    )
  })
})
