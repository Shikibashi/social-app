export type FeedProvenance = {
  feedName: string
  algorithmName: string
  algorithmVersion: string
  provider: string
  providerDid?: string
  feedOwnerDid?: string
  manifestStatus: 'verified' | 'unverified' | 'revoked'
  objective: string
  privacy: string
  health?: 'healthy' | 'degraded' | 'circuit-open' | 'stale'
}

export type WhyPostCategory =
  | 'followed'
  | 'explicit-interest'
  | 'inferred-interest'
  | 'exploration'
  | 'fresh'
  | 'graph-near'
  | 'new-creator'

export type PublicRankingTrace = {
  category: WhyPostCategory
  label: string
  confidentialSignalsOmitted: true
}

const labels: Record<WhyPostCategory, string> = {
  followed: 'From someone you follow',
  'explicit-interest': 'Related to an interest you chose',
  'inferred-interest': 'Related to an interest learned on this device',
  exploration: 'Exploration',
  fresh: 'A fresh post',
  'graph-near': 'From a graph-near account',
  'new-creator': 'A less-popular or new creator',
}

export function publicRankingTrace(
  category: WhyPostCategory,
): PublicRankingTrace {
  return {category, label: labels[category], confidentialSignalsOmitted: true}
}
export function healthLabel(health?: FeedProvenance['health']): string {
  return health === 'healthy'
    ? 'Service healthy'
    : health === 'circuit-open'
      ? 'Provider unavailable; showing your selected fallback'
      : health === 'stale'
        ? 'Showing stale data'
        : health === 'degraded'
          ? 'Provider degraded'
          : 'Service health unknown'
}
