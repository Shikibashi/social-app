import {type FeedPreferences} from './profile'

export type RankingPreset = NonNullable<FeedPreferences['rankingPreset']>

export type LocalFeedState<Preferences extends {
  rankingPreset?: RankingPreset
} = FeedPreferences> = {
  enabled: boolean
  preferences: Preferences
}

export function applyRankingPreset<
  Preferences extends {rankingPreset?: RankingPreset},
>(
  state: LocalFeedState<Preferences>,
  rankingPreset: RankingPreset,
): LocalFeedState<Preferences> {
  return {
    ...state,
    enabled: rankingPreset === 'balanced' ? true : state.enabled,
    preferences: {...state.preferences, rankingPreset},
  }
}
