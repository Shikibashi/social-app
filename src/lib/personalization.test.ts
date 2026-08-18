import {
  createPersonalizationState,
  decryptPersonalization,
  encryptPersonalization,
  exportPersonalization,
  importPersonalization,
  type PersonalizationState,
  resetLearnedState,
} from './personalization'

const did = 'did:plc:t3myuj4fumsmxgtcoxdr5lg5'

function state(): PersonalizationState {
  return createPersonalizationState(did, {
    explicit: {selectedFeedPreset: 'discover', explicitInterests: ['privacy']},
    learned: {inferredTopics: {politics: 0.8}},
  })
}

describe('portable personalization', () => {
  it('keeps settings and learned profile in separate export levels', () => {
    const current = state()
    const settings = JSON.parse(exportPersonalization(current, 'settings')) as {
      profile: {explicit: {explicitInterests: string[]}; learned?: unknown}
    }
    const profile = JSON.parse(exportPersonalization(current, 'profile')) as {
      profile: {learned: {inferredTopics: Record<string, number>}}
    }
    expect(settings.profile.explicit.explicitInterests).toEqual(['privacy'])
    expect(settings.profile.learned).toBeUndefined()
    expect(profile.profile.learned.inferredTopics.politics).toBe(0.8)
  })

  it('migrates a synthetic legacy version without guessing fields', () => {
    const legacy = exportPersonalization(state(), 'settings').replace(
      '"version":1',
      '"version":0',
    )
    expect(importPersonalization(legacy, did).version).toBe(1)
  })
  it('rejects malformed, oversized, credential-bearing, and mismatched imports', () => {
    expect(() => importPersonalization('{}')).toThrow()
    expect(() => importPersonalization('x'.repeat(1_000_001))).toThrow()
    const exported = exportPersonalization(state(), 'settings')
    expect(() =>
      importPersonalization(exported, 'did:plc:xbyl3r5sn4aktwat4b7a2vjd'),
    ).toThrow()
    expect(() =>
      importPersonalization(
        exported.replace('"profile"', '"accessToken":"secret","profile"'),
      ),
    ).toThrow()
    expect(() =>
      importPersonalization(
        exported.replace('"profile"', '"privateKey":"secret","profile"'),
      ),
    ).toThrow()
  })

  it('does not encrypt unvalidated credential-bearing payloads', async () => {
    await expect(
      encryptPersonalization('{"privateKey":"secret"}', 'password'),
    ).rejects.toThrow()
  })

  it('rejects credential-like service values rather than exporting them', () => {
    expect(() =>
      exportPersonalization(
        createPersonalizationState(did, {
          services: {appView: 'Bearer service-auth-jwt'},
        }),
        'settings',
      ),
    ).toThrow('Credential-like personalization value')
  })

  it('round-trips encrypted archives and fails closed on password or tampering', async () => {
    const encrypted = await encryptPersonalization(
      exportPersonalization(state(), 'archive'),
      'correct horse',
    )
    const restored = await decryptPersonalization(
      encrypted,
      'correct horse',
      did,
    )
    expect(restored.explicit.selectedFeedPreset).toBe('discover')
    await expect(
      decryptPersonalization(encrypted, 'wrong', did),
    ).rejects.toThrow()
    const parsed = JSON.parse(encrypted) as {ciphertext: number[]}
    parsed.ciphertext[0] ^= 1
    await expect(
      decryptPersonalization(JSON.stringify(parsed), 'correct horse', did),
    ).rejects.toThrow()
  })

  it('reset learned preserves explicit settings', () => {
    const next = resetLearnedState(state())
    expect(next.explicit.explicitInterests).toEqual(['privacy'])
    expect(next.learned.inferredTopics).toEqual({})
  })
})
