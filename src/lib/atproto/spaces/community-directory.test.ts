import {describe, expect, it} from '@jest/globals'

import {
  type CommunityDirectoryEntry,
  type CommunityDirectorySource,
  composeCommunityDirectory,
} from './community-directory'

const baseCommunity: CommunityDirectoryEntry = {
  uri: 'at://did:plc:community-authority/space/org.radlib.community/main',
  authorityDid: 'did:plc:community-authority',
  kind: 'community',
  name: 'Main room',
  visibility: 'public',
}

function source(
  id: string,
  result: readonly CommunityDirectoryEntry[] | Error,
): CommunityDirectorySource {
  return {
    id,
    displayName: id,
    endpoint: `https://${id}.example.test`,
    kind: 'account-pds',
    read: () => {
      if (result instanceof Error) return Promise.reject(result)
      return Promise.resolve(result)
    },
  }
}

describe('community directory composition', () => {
  it('merges directory sources while retaining metadata disagreement', async () => {
    const secondClaim = {
      ...baseCommunity,
      name: 'Renamed by another source',
    }
    const result = await composeCommunityDirectory([
      source('account-pds', [baseCommunity]),
      source('authority-pds', [secondClaim]),
    ])

    expect(result.spaces).toEqual([baseCommunity])
    expect(result.composition).toMatchObject({
      surface: 'communities',
      policy: {mode: 'merge'},
      status: 'disagreement',
      selectedProviderIds: ['account-pds', 'authority-pds'],
    })
    expect(result.composition.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: expect.objectContaining({id: 'account-pds'}),
          status: 'ok',
          value: [baseCommunity],
        }),
        expect.objectContaining({
          provider: expect.objectContaining({id: 'authority-pds'}),
          status: 'ok',
          value: [secondClaim],
        }),
      ]),
    )
  })

  it('keeps a usable directory visible while exposing a source outage', async () => {
    const result = await composeCommunityDirectory([
      source('account-pds', [baseCommunity]),
      source('authority-pds', new Error('authority temporarily unavailable')),
    ])

    expect(result.spaces).toEqual([baseCommunity])
    expect(result.composition.status).toBe('partial')
    expect(result.composition.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: expect.objectContaining({id: 'authority-pds'}),
          status: 'unavailable',
          error: 'authority temporarily unavailable',
        }),
      ]),
    )
  })

  it('does not promote an empty or wholly unavailable directory', async () => {
    await expect(
      composeCommunityDirectory([
        source('authority-pds', new Error('not authorized')),
      ]),
    ).rejects.toMatchObject({
      name: 'ProviderCompositionError',
      composition: {status: 'unavailable', selected: []},
    })
  })

  it('keeps credentials outside the directory evidence contract', async () => {
    const result = await composeCommunityDirectory([
      source('account-pds', [baseCommunity]),
    ])

    const evidence = JSON.stringify(result)
    expect(evidence).not.toContain('accessToken')
    expect(evidence).not.toContain('refreshToken')
    expect(evidence).not.toContain('Authorization')
  })
})
