import {
  type ProviderCompositionResult,
  type ProviderCompositionStatus,
  type ProviderIndependence,
} from '#/lib/provider-composition'
import {type app} from '#/lexicons'

export type FeedProviderProvenance = {
  id: string
  displayName: string
  endpoint: string
  serviceDid?: string
  operatorId?: string
}

export interface FeedAPIResponse {
  cursor?: string
  feedContext?: string
  feed: app.bsky.feed.defs.FeedViewPost[]
  /** The provider(s) selected by the local reconciliation policy. */
  providerProvenance?: FeedProviderProvenance[]
  /** Evidence status is retained separately from the selected feed value. */
  providerCompositionStatus?: ProviderCompositionStatus
  /** Declared operator identity is not proof of independent control. */
  providerIndependence?: ProviderIndependence
  /** Complete provider observations remain available for progressive inspection. */
  providerComposition?: ProviderCompositionResult<unknown>
}

export interface FeedAPI {
  peekLatest(): Promise<app.bsky.feed.defs.FeedViewPost>
  fetch({
    cursor,
    limit,
    signal,
  }: {
    cursor: string | undefined
    limit: number
    signal?: AbortSignal
  }): Promise<FeedAPIResponse>
}

export interface ReasonFeedSource {
  $type: 'reasonFeedSource'
  uri: string
  href: string
}

export function isReasonFeedSource(v: unknown): v is ReasonFeedSource {
  return (
    !!v &&
    typeof v === 'object' &&
    '$type' in v &&
    v.$type === 'reasonFeedSource'
  )
}
