export type FeedProvenance = {
  feedName: string
  algorithmName: string
  algorithmVersion: string
  provider: string
  providerDid?: string
  feedProviderDid?: string
  feedOwnerDid?: string
  feedUri?: string
  manifestStatus: 'verified' | 'unverified' | 'revoked'
  objective: string
  privacy: string
  health?: 'healthy' | 'degraded' | 'circuit-open' | 'stale'
}

export type FeedProviderContext = {
  provider?: string
  algorithm?: string
  version?: string
  policyVersion?: string
  /** A provider may supply a bounded public explanation for its ranking. */
  reason?: string
}

/**
 * Feed context is an untrusted, provider-supplied explanation channel. Keep
 * parsing deliberately narrow: it may improve attribution, but it must not
 * be treated as a verified manifest or a permission to expose private data.
 */
export function parseFeedProviderContext(
  value?: string,
): FeedProviderContext | undefined {
  if (!value) return

  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return

    const context = parsed as Record<string, unknown>
    const result: FeedProviderContext = {}
    for (const key of [
      'provider',
      'algorithm',
      'version',
      'policyVersion',
      'reason',
    ]) {
      const field = context[key]
      if (typeof field === 'string' && field.length > 0) {
        result[key as keyof FeedProviderContext] = field.slice(0, 200)
      }
    }

    return Object.keys(result).length ? result : undefined
  } catch {
    return
  }
}

/**
 * Return only a provider-declared public reason. A missing reason is itself
 * meaningful: the client must say that the provider did not explain the
 * ranking instead of substituting local signals or confidential heuristics.
 */
export function providerRankingExplanation(
  feedContext?: string,
): string | undefined {
  const context = parseFeedProviderContext(feedContext)
  if (context?.reason) return `provider supplied: ${context.reason}`
  return feedContext
    ? 'provider did not supply a ranking explanation'
    : undefined
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
