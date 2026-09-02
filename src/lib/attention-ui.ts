import {type FeedProviderProvenance} from '#/lib/api/feed/types'
import {
  type ProviderCompositionResult,
  type ProviderCompositionStatus,
  type ProviderIndependence,
} from '#/lib/provider-composition'

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
  providerProvenance?: FeedProviderProvenance[]
  providerCompositionStatus?: ProviderCompositionStatus
  providerIndependence?: ProviderIndependence
  providerComposition?: ProviderCompositionResult<unknown>
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

export type WhyThisPostModel = {
  postUri: string
  localReasons: string[]
  providerExplanation?: string
  providerProvenance?: FeedProviderProvenance[]
  providerCompositionStatus?: ProviderCompositionStatus
  providerIndependence?: ProviderIndependence
  feed?: {
    name: string
    owner: string
    uri: string
  }
  feedDescriptor?: string
}

/**
 * Build the public portion of a post-placement explanation. The input may
 * contain provider-controlled values, so this intentionally carries only
 * bounded public reasons and inspectable identifiers. It does not expose
 * scores, weights, private signals, or an inferred explanation.
 */
export function buildWhyThisPostModel({
  postUri,
  localExplanation,
  feedContext,
  feedDescriptor,
  feedSource,
  providerProvenance,
  providerCompositionStatus,
  providerIndependence,
}: {
  postUri: string
  localExplanation?: readonly string[]
  feedContext?: string
  feedDescriptor?: string
  feedSource?: {
    displayName: string
    creatorHandle: string
    uri: string
  }
  providerProvenance?: readonly FeedProviderProvenance[]
  providerCompositionStatus?: ProviderCompositionStatus
  providerIndependence?: ProviderIndependence
}): WhyThisPostModel {
  const localReasons = (localExplanation ?? [])
    .map(reason => reason.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 5)
  const providerExplanation = providerRankingExplanation(feedContext)
  const normalizedDescriptor = feedDescriptor?.trim()
  const normalizedProviderProvenance = (providerProvenance ?? [])
    .map(provider => ({
      id: provider.id.trim().slice(0, 200),
      displayName: provider.displayName.trim().slice(0, 200),
      endpoint: provider.endpoint.trim().slice(0, 500),
      serviceDid: provider.serviceDid?.trim().slice(0, 200),
      operatorId: provider.operatorId?.trim().slice(0, 200),
    }))
    .filter(
      provider => provider.id && provider.displayName && provider.endpoint,
    )
    .slice(0, 5)

  return {
    postUri,
    localReasons,
    providerExplanation,
    providerProvenance: normalizedProviderProvenance.length
      ? normalizedProviderProvenance
      : undefined,
    providerCompositionStatus,
    providerIndependence,
    feed:
      feedSource &&
      feedSource.displayName.trim() &&
      feedSource.creatorHandle.trim() &&
      feedSource.uri.trim()
        ? {
            name: feedSource.displayName,
            owner: feedSource.creatorHandle,
            uri: feedSource.uri,
          }
        : undefined,
    feedDescriptor: normalizedDescriptor || undefined,
  }
}

export function hasWhyThisPostDetails(model: WhyThisPostModel): boolean {
  return Boolean(
    model.localReasons.length ||
    model.providerExplanation ||
    model.providerProvenance?.length ||
    model.providerCompositionStatus ||
    model.providerIndependence ||
    model.feed ||
    model.feedDescriptor,
  )
}

/**
 * A feed boundary already identifies the selected feed, its reader, and its
 * ordinary reconciliation state once. Repeat a placement affordance on an
 * individual post only when this post has a public reason of its own or when
 * the read path is degraded or contested.
 */
export function hasWhyThisPostPlacementDetails(
  model: WhyThisPostModel,
): boolean {
  return Boolean(
    model.localReasons.length ||
    model.providerExplanation ||
    (model.providerCompositionStatus &&
      model.providerCompositionStatus !== 'agreement'),
  )
}

/**
 * A direct thread route always has a stable post address, but it does not
 * necessarily retain feed-placement evidence. Keep that record identity
 * inspectable without relabeling it as an explanation for why the post was
 * shown.
 */
export function getPostProvenanceDisclosureKind(
  model: WhyThisPostModel,
  {includeRecordDetails = false}: {includeRecordDetails?: boolean} = {},
): 'placement' | 'record' | undefined {
  if (hasWhyThisPostPlacementDetails(model)) return 'placement'
  return includeRecordDetails ? 'record' : undefined
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
