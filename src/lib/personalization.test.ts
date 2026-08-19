import {beforeEach} from '@jest/globals'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  contextualContentFilterPolicy,
  defaultContentFilterPolicy,
} from './feed-sovereignty/content-filter'
import {
  defaultRadlibCurationConfig,
  legacyRadlibCurationConfig,
} from './feed-sovereignty/radlib-curation'
import {
  clearExplicitPostPreference,
  createPersonalizationState,
  decryptPersonalization,
  defaultExplicitPreferences,
  defaultLearnedProfile,
  defaultServiceConfiguration,
  encryptPersonalization,
  exportPersonalization,
  importPersonalization,
  loadPersonalization,
  PERSONALIZATION_STORAGE_PREFIX,
  type PersonalizationState,
  resetLearnedState,
  setExplicitPostPreference,
} from './personalization'

const did = 'did:plc:t3myuj4fumsmxgtcoxdr5lg5'

beforeEach(async () => {
  await AsyncStorage.clear()
})

function state(): PersonalizationState {
  return createPersonalizationState(did, {
    explicit: {
      ...defaultExplicitPreferences,
      selectedFeedPreset: 'discover',
      explicitInterests: ['privacy'],
    },
    learned: {
      ...defaultLearnedProfile,
      inferredTopics: {politics: 0.8},
    },
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
          services: {
            ...defaultServiceConfiguration,
            appView: 'Bearer service-auth-jwt',
          },
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

  it('round-trips the opt-in curation profile as portable preference state', () => {
    const current = createPersonalizationState(did, {
      explicit: {
        ...defaultExplicitPreferences,
        radlibCuration: {
          ...defaultRadlibCurationConfig,
          enabled: true,
          excludedAuthorDids: ['did:plc:ewvi7nxzyoun6w2n6xq4y5c4'],
        },
      },
    })
    const restored = importPersonalization(
      exportPersonalization(current, 'settings'),
      did,
    )
    expect(restored.explicit.radlibCuration?.enabled).toBe(true)
    expect(restored.explicit.radlibCuration?.excludedAuthorDids).toEqual([
      'did:plc:ewvi7nxzyoun6w2n6xq4y5c4',
    ])
  })

  it('round-trips the selected Balanced feed algorithm as explicit state', () => {
    const current = createPersonalizationState(did, {
      explicit: {
        ...defaultExplicitPreferences,
        selectedFeedPreset: 'balanced',
      },
    })
    const restored = importPersonalization(
      exportPersonalization(current, 'settings'),
      did,
    )
    expect(restored.explicit.selectedFeedPreset).toBe('balanced')
  })

  it('round-trips content filtering without exporting credentials', () => {
    const current = createPersonalizationState(did, {
      explicit: {
        ...defaultExplicitPreferences,
        contentFilterPolicy: {
          ...defaultContentFilterPolicy,
          enabled: true,
          strictProgressive: true,
          customTerms: ['authoritarian populism'],
          excludedAuthorDids: ['did:plc:ewvi7nxzyoun6w2n6xq4y5c4'],
        },
      },
    })
    const serialized = exportPersonalization(current, 'settings')
    const restored = importPersonalization(serialized, did)
    expect(restored.explicit.contentFilterPolicy).toMatchObject({
      enabled: true,
      strictProgressive: true,
      customTerms: ['authoritarian populism'],
    })
    expect(serialized).not.toMatch(
      /password|accessToken|refreshToken|service.?auth|recovery|privateKey/i,
    )
  })

  it('reset learned preserves explicit settings', () => {
    const next = resetLearnedState(state())
    expect(next.explicit.explicitInterests).toEqual(['privacy'])
    expect(next.learned.inferredTopics).toEqual({})
  })

  it('defaults public post metrics to hidden until the user opts out', () => {
    expect(defaultExplicitPreferences.quietMode).toEqual({
      enabled: true,
      userConfigured: false,
    })
  })

  it('migrates older stored state to an explicit inferred-interest choice', async () => {
    const current = state()
    const legacyExplicit = {...current.explicit}
    delete legacyExplicit.inferredInterestsEnabled
    await AsyncStorage.setItem(
      PERSONALIZATION_STORAGE_PREFIX + did,
      JSON.stringify({...current, explicit: legacyExplicit}),
    )
    expect(
      (await loadPersonalization(did)).explicit.inferredInterestsEnabled,
    ).toBe(true)
  })

  it('keeps personalization account-scoped and removes only implicit legacy defaults', async () => {
    const otherDid = 'did:plc:2xq7z5t4a4zv4aq6d4e6n2r3'
    const legacy = createPersonalizationState(did, {
      explicit: {
        ...defaultExplicitPreferences,
        contentFilterPolicy: contextualContentFilterPolicy,
        radlibCuration: legacyRadlibCurationConfig,
      },
    })
    await AsyncStorage.setItem(
      PERSONALIZATION_STORAGE_PREFIX + did,
      JSON.stringify(legacy),
    )

    const migrated = await loadPersonalization(did)
    expect(migrated.explicit.contentFilterPolicy?.termPacks).toEqual([])
    expect(migrated.explicit.radlibCuration?.excludedTerms).toEqual([])
    expect(migrated.explicit.radlibCuration?.branchWeights).toBeUndefined()

    const other = await loadPersonalization(otherDid)
    expect(other.accountDid).toBe(otherDid)
    expect(other.explicit.contentFilterPolicy?.termPacks).toEqual([])
    expect(other.explicit.radlibCuration?.excludedTerms).toEqual([])
    expect(other.explicit.radlibCuration).not.toBe(
      migrated.explicit.radlibCuration,
    )
  })

  it('preserves an edited profile during legacy-default migration', async () => {
    const customized = createPersonalizationState(did, {
      explicit: {
        ...defaultExplicitPreferences,
        radlibCuration: {
          ...legacyRadlibCurationConfig,
          branchWeights: {
            legacyWeight: 10,
          },
        },
      },
    })
    await AsyncStorage.setItem(
      PERSONALIZATION_STORAGE_PREFIX + did,
      JSON.stringify(customized),
    )

    const restored = await loadPersonalization(did)
    expect(restored.explicit.radlibCuration?.branchWeights?.legacyWeight).toBe(10)
    expect(restored.explicit.radlibCuration?.excludedTerms).toEqual(
      legacyRadlibCurationConfig.excludedTerms,
    )
  })

  it('persists and clears the post preference used by the vote controls', async () => {
    const uri = 'at://did:plc:t3myuj4fumsmxgtcoxdr5lg5/app.bsky.feed.post/vote'

    await setExplicitPostPreference(did, uri, 'prefer')
    expect(
      (await loadPersonalization(did)).explicit.explicitPostPreferences,
    ).toEqual([{uri, preference: 'prefer'}])

    await setExplicitPostPreference(did, uri, 'avoid')
    expect(
      (await loadPersonalization(did)).explicit.explicitPostPreferences,
    ).toEqual([{uri, preference: 'avoid'}])

    await clearExplicitPostPreference(did, uri)
    expect(
      (await loadPersonalization(did)).explicit.explicitPostPreferences,
    ).toEqual([])
  })
})
