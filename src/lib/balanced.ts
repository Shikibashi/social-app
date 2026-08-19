import {type Candidate, type CandidateBatch} from './candidate-protocol'
import {type ExplicitPreferences, type LearnedProfile} from './personalization'

export const BALANCED_MANIFEST = {
  id: 'org.radical-liberal.balanced',
  version: '1',
  constitutionalVersion: 'attention-v1',
  protocolVersion: 'candidate-v1',
  featureBounds: {
    freshness: [0, 1],
    graphProximity: [0, 1],
    engagement: [0, 1],
    explicitInterest: [-1, 1],
    explicitPreferenceOverride: [-1, 1],
    inferredInterest: [-1, 1],
    familiarity: [0, 1],
    variety: [0, 1],
    conversationActivity: [0, 1],
    feedback: [-1, 1],
    novelty: [0, 1],
    exploration: [0, 1],
    integrity: [0, 1],
    harassmentAmplificationRisk: [0, 1],
  },
  candidateSources: [
    'followed-network',
    'graph-near-discovery',
    'broader-exploration',
    'explicit-interest',
    'new-low-exposure',
  ],
} as const

export type BalancedCandidate = Candidate & {
  authorDid?: string
  sourceCategory?: (typeof BALANCED_MANIFEST.candidateSources)[number]
  topics?: string[]
  language?: string
  features?: Partial<
    Record<keyof typeof BALANCED_MANIFEST.featureBounds, number>
  > & {engagementCount?: number; duplicateGroup?: string; accountBurst?: number}
}
export type BalancedTrace = {
  uri: string
  sourceCategory: string
  features: Record<string, number>
  contributions: Record<string, number>
  penalties: Record<string, number>
  score: number
  reason: string
}
export type BalancedResult = {
  algorithm: typeof BALANCED_MANIFEST.id
  version: '1'
  ordered: BalancedCandidate[]
  traces: BalancedTrace[]
  sourceComposition: Record<string, number>
}

const WEIGHTS = {
  freshness: 0.2,
  graphProximity: 0.16,
  engagement: 0.06,
  explicitInterest: 0.22,
  explicitPreferenceOverride: 2.5,
  inferredInterest: 0.1,
  familiarity: 0.08,
  variety: 0.08,
  conversationActivity: 0.08,
  feedback: 0.16,
  novelty: 0.1,
  exploration: 0.08,
  integrity: 0.08,
  harassmentAmplificationRisk: 0.18,
} as const

export function composeCandidatePools(
  candidates: BalancedCandidate[],
  limits: Partial<
    Record<(typeof BALANCED_MANIFEST.candidateSources)[number], number>
  > = {},
): BalancedCandidate[] {
  const used: Record<string, number> = {}
  const output: BalancedCandidate[] = []
  for (const candidate of candidates) {
    const category = candidate.sourceCategory ?? 'broader-exploration'
    const limit = limits[category] ?? 100
    if ((used[category] ?? 0) >= limit) continue
    used[category] = (used[category] ?? 0) + 1
    output.push(candidate)
  }
  return output
}

export function rankBalanced(
  batch: CandidateBatch,
  explicit: ExplicitPreferences,
  learned: LearnedProfile,
  options: {
    now?: number
    poolLimits?: Partial<
      Record<(typeof BALANCED_MANIFEST.candidateSources)[number], number>
    >
  } = {},
): BalancedResult {
  return rankBalancedCandidates(batch.candidates, explicit, learned, options)
}

/**
 * Rank an already-hydrated local candidate set without manufacturing a
 * network candidate-batch envelope. Network providers use rankBalanced above;
 * the client uses this entry point after the AppView has supplied normal feed
 * views and before local ordering is applied.
 */
export function rankBalancedCandidates(
  input: BalancedCandidate[],
  explicit: ExplicitPreferences,
  learned: LearnedProfile,
  options: {
    now?: number
    poolLimits?: Partial<
      Record<(typeof BALANCED_MANIFEST.candidateSources)[number], number>
    >
  } = {},
): BalancedResult {
  const now = options.now ?? Date.now()
  const candidates = composeCandidatePools(input, options.poolLimits)
  const authorCounts = new Map<string, number>()
  const duplicateCounts = new Map<string, number>()
  const traces: BalancedTrace[] = []
  const scored = candidates.map(candidate => {
    const features = featureVector(candidate, explicit, learned, now)
    const contributions: Record<string, number> = {}
    const penalties: Record<string, number> = {}
    let score = 0
    for (const [name, weight] of Object.entries(WEIGHTS)) {
      const value = features[name] ?? 0
      const contribution =
        value * weight * (name === 'harassmentAmplificationRisk' ? -1 : 1)
      contributions[name] = contribution
      score += contribution
    }
    const author = candidate.authorDid ?? 'unknown'
    const duplicate = candidate.features?.duplicateGroup
    const authorPenalty =
      Math.max(0, (authorCounts.get(author) ?? 0) - 1) * 0.12
    const duplicatePenalty = duplicate
      ? Math.max(0, duplicateCounts.get(duplicate) ?? 0) * 0.2
      : 0
    const concentrationPenalty = authorPenalty + duplicatePenalty
    penalties.authorConcentration = authorPenalty
    penalties.duplicateConcentration = duplicatePenalty
    score -= concentrationPenalty
    authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1)
    if (duplicate)
      duplicateCounts.set(duplicate, (duplicateCounts.get(duplicate) ?? 0) + 1)
    const sourceCategory = candidate.sourceCategory ?? 'broader-exploration'
    const trace: BalancedTrace = {
      uri: candidate.uri,
      sourceCategory,
      features,
      contributions,
      penalties,
      score,
      reason: explain(features, concentrationPenalty),
    }
    traces.push(trace)
    return {candidate, score, trace}
  })
  scored.sort(
    (a, b) =>
      b.score - a.score || a.candidate.uri.localeCompare(b.candidate.uri),
  )
  const sourceComposition: Record<string, number> = {}
  for (const item of scored)
    sourceComposition[item.trace.sourceCategory] =
      (sourceComposition[item.trace.sourceCategory] ?? 0) + 1
  return {
    algorithm: BALANCED_MANIFEST.id,
    version: '1',
    ordered: scored.map(item => item.candidate),
    traces: scored.map(item => item.trace),
    sourceComposition,
  }
}

function featureVector(
  candidate: BalancedCandidate,
  explicit: ExplicitPreferences,
  learned: LearnedProfile,
  now: number,
): Record<string, number> {
  const raw = candidate.features ?? {}
  const age = Math.max(0, now - Date.parse(candidate.candidateTimestamp))
  const freshness = clamp(1 - age / (7 * 86400000))
  const topicValues = candidate.topics ?? []
  const explicitPost = explicit.explicitPostPreferences?.find(
    item => item.uri === candidate.uri,
  )?.preference
  const explicitAuthor = candidate.authorDid
    ? explicit.explicitAuthors.find(item => item.did === candidate.authorDid)
        ?.preference
    : undefined
  const explicitPreference = explicitPost ?? explicitAuthor
  const explicitInterest = explicitPreference
    ? explicitPreference === 'avoid'
      ? -1
      : 1
    : topicValues.some(topic => explicit.explicitInterests.includes(topic))
      ? 1
      : 0
  const explicitPreferenceOverride =
    explicitPreference === 'avoid'
      ? -1
      : explicitPreference === 'prefer'
        ? 1
        : 0
  const inferredInterest = Math.max(
    ...(explicit.inferredInterestsEnabled === false
      ? []
      : topicValues.map(topic => learned.inferredTopics[topic] ?? 0)),
    0,
  )
  const feedback =
    candidate.uri in learned.interactionWeights
      ? learned.interactionWeights[candidate.uri]
      : 0
  const engagement =
    Math.log1p(Math.max(0, raw.engagementCount ?? 0)) / Math.log1p(1_000_000)
  const novelty =
    raw.novelty ?? (learned.explorationHistory.includes(candidate.uri) ? 0 : 1)
  const exploration = raw.exploration ?? explicit.explorationLevel
  const graphProximity = raw.graphProximity ?? 0
  const familiarity =
    raw.familiarity ?? (candidate.sourceCategory === 'followed-network' ? 1 : 0)
  const variety =
    raw.variety ?? (candidate.sourceCategory === 'followed-network' ? 0.25 : 1)
  const conversationActivity = raw.conversationActivity ?? 0
  const integrity = raw.integrity ?? 0.5
  const risk =
    raw.harassmentAmplificationRisk ?? clamp((raw.accountBurst ?? 0) / 20)
  return {
    freshness: clamp(freshness * explicit.freshness),
    graphProximity: clamp(graphProximity * explicit.discovery),
    engagement: clamp(engagement),
    explicitInterest: clamp(explicitInterest, -1, 1),
    explicitPreferenceOverride: clamp(explicitPreferenceOverride, -1, 1),
    inferredInterest: clamp(inferredInterest, -1, 1),
    familiarity: clamp(familiarity * explicit.familiarity),
    variety: clamp(variety * explicit.variety),
    conversationActivity: clamp(
      conversationActivity * explicit.conversationActivity,
    ),
    feedback: clamp(feedback, -1, 1),
    novelty: clamp(novelty),
    exploration: clamp(exploration * explicit.explorationLevel),
    integrity: clamp(integrity),
    harassmentAmplificationRisk: clamp(risk),
  }
}
function explain(features: Record<string, number>, penalty: number): string {
  const top =
    Object.entries(features)
      .filter(([, value]) => value > 0.5)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'balanced objective'
  return `${top}${penalty ? '; concentration dampened' : ''}`
}
function clamp(value: number, min = 0, max = 1): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min
}
