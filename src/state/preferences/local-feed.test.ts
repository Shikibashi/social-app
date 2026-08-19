import {
  applyRankingPreset,
  type LocalFeedState,
} from '#/lib/feed-sovereignty/local-feed-state'

type TestPreferences = {
  rankingPreset?: 'following' | 'balanced'
  discovery: number
  explicitInterests: string[]
}

describe('local feed ranking preset state', () => {
  it('enables local ranking atomically when Balanced is selected', () => {
    const state: LocalFeedState<TestPreferences> = {
      enabled: false,
      preferences: {
        rankingPreset: 'following',
        discovery: 0.2,
        explicitInterests: ['topic:music'],
      },
    }

    const next = applyRankingPreset(state, 'balanced')

    expect(next).toMatchObject({
      enabled: true,
      preferences: {
        rankingPreset: 'balanced',
        discovery: 0.2,
        explicitInterests: ['topic:music'],
      },
    })
    expect(state.enabled).toBe(false)
    expect(state.preferences.rankingPreset).toBe('following')
  })

  it('switches back without disabling an already-enabled local feed', () => {
    const state: LocalFeedState<TestPreferences> = {
      enabled: true,
      preferences: {
        rankingPreset: 'balanced',
        discovery: 0.5,
        explicitInterests: [],
      },
    }

    expect(applyRankingPreset(state, 'following')).toMatchObject({
      enabled: true,
      preferences: {rankingPreset: 'following'},
    })
  })
})
