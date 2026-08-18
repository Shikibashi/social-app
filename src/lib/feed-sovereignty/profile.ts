export type FeedPreferences = {
  freshness: number
  discovery: number
  familiarity: number
  conversationActivity: number
  explorationLevel: number
  languages: string[]
  topics: Record<string, number>
  classifierModules: Record<string, 'prefer' | 'neutral' | 'avoid'>
  explicitInterests: string[]
  explicitAuthors: Array<{did: string; preference: 'prefer' | 'avoid'}>
  explicitPostPreferences: Array<{uri: string; preference: 'prefer' | 'avoid'}>
  inferredTopics: Record<string, number>
}

export type Candidate = {
  uri: string
  authorDid: string
  topic?: string
  freshness: number
  networkRelevance: number
  conversationActivity: number
  integrityWeight: number
  explorationEligible: boolean
  seen: boolean
}

export type PortableProfile = {
  schema: 'org.example.feed-profile/1'
  createdAt: string
  explicitPreferences: FeedPreferences
  feedSubscriptions: string[]
  classifierPreferences: Record<string, string>
  constitutionalPreferences: {
    maxAuthorPerWindow: number
    explorationFloor: number
  }
}

export type LocalRankingTrace = {
  uri: string
  score: number
  baseScore: number
  explicitPreference: 'prefer' | 'avoid' | undefined
  selected: boolean
  rank: number | undefined
  explorationSelected: boolean
  authorCapApplied: boolean
  reasons: string[]
}

export type LocalRankingResult = {
  ordered: Candidate[]
  traces: LocalRankingTrace[]
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const EXPLICIT_PREFERENCE_WEIGHT = 2.5

function getExplicitPreference(
  candidate: Candidate,
  preferences: FeedPreferences,
): 'prefer' | 'avoid' | undefined {
  const postPreference = preferences.explicitPostPreferences.find(
    item => item.uri === candidate.uri,
  )?.preference
  if (postPreference) return postPreference

  const authorPreference = preferences.explicitAuthors.find(
    item => item.did === candidate.authorDid,
  )?.preference
  if (authorPreference) return authorPreference

  if (
    candidate.topic &&
    (preferences.explicitInterests.includes(candidate.topic) ||
      (preferences.topics[candidate.topic] ?? 0) > 0)
  ) {
    return 'prefer'
  }
  return undefined
}

function explicitTier(preference: 'prefer' | 'avoid' | undefined): number {
  return preference === 'prefer' ? 1 : preference === 'avoid' ? -1 : 0
}

export function traceCandidate(
  candidate: Candidate,
  preferences: FeedPreferences,
): Omit<
  LocalRankingTrace,
  'selected' | 'rank' | 'explorationSelected' | 'authorCapApplied' | 'reasons'
> {
  const topic = candidate.topic ? (preferences.topics[candidate.topic] ?? 0) : 0
  const topicScore = (topic + 1) / 2
  const inferredInterest = candidate.topic
    ? (preferences.inferredTopics[candidate.topic] ?? 0)
    : 0
  const baseScore =
    preferences.freshness * clamp(candidate.freshness) +
    preferences.discovery * clamp(candidate.networkRelevance) +
    preferences.conversationActivity * clamp(candidate.conversationActivity) +
    0.2 * clamp(candidate.integrityWeight) +
    0.2 * topicScore +
    0.15 * clamp(inferredInterest)
  const explicitPreference = getExplicitPreference(candidate, preferences)
  const unadjustedScore =
    baseScore + explicitTier(explicitPreference) * EXPLICIT_PREFERENCE_WEIGHT
  return {
    uri: candidate.uri,
    score: candidate.seen ? unadjustedScore * 0.05 : unadjustedScore,
    baseScore,
    explicitPreference,
  }
}

export function scoreCandidate(
  candidate: Candidate,
  preferences: FeedPreferences,
): number {
  return traceCandidate(candidate, preferences).score
}

export function rankLocallyWithTrace(
  candidates: Candidate[],
  preferences: FeedPreferences,
  options: {maxAuthorPerWindow?: number; explorationFloor?: number} = {},
): LocalRankingResult {
  const maxAuthor = options.maxAuthorPerWindow ?? 2
  const explorationFloor = options.explorationFloor ?? 0.1
  const scored = candidates.map(candidate => ({
    candidate,
    trace: traceCandidate(candidate, preferences),
  }))
  const ranked = scored.sort(
    (a, b) =>
      explicitTier(b.trace.explicitPreference) -
        explicitTier(a.trace.explicitPreference) ||
      b.trace.score - a.trace.score ||
      a.candidate.uri.localeCompare(b.candidate.uri),
  )
  const selected: Candidate[] = []
  const counts = new Map<string, number>()
  const explorationUris = new Set<string>()
  const targetExploration = Math.ceil(ranked.length * clamp(explorationFloor))

  const add = (candidate: Candidate, explorationSelected = false) => {
    const count = counts.get(candidate.authorDid) ?? 0
    if (count >= maxAuthor || selected.some(item => item.uri === candidate.uri))
      return false
    selected.push(candidate)
    counts.set(candidate.authorDid, count + 1)
    if (explorationSelected) explorationUris.add(candidate.uri)
    return true
  }

  for (const item of ranked) {
    if (explorationUris.size >= targetExploration) break
    if (
      item.candidate.explorationEligible &&
      item.trace.explicitPreference === undefined
    ) {
      add(item.candidate, true)
    }
  }
  for (const item of ranked) add(item.candidate)

  const selectedUris = new Set(selected.map(candidate => candidate.uri))
  const traces: LocalRankingTrace[] = selected.map((candidate, index) => {
    const scoredCandidate = scored.find(
      item => item.candidate.uri === candidate.uri,
    )!
    const trace = scoredCandidate.trace
    const fullTrace: LocalRankingTrace = {
      ...trace,
      selected: true,
      rank: index + 1,
      explorationSelected: explorationUris.has(candidate.uri),
      authorCapApplied: false,
      reasons: [],
    }
    return {
      ...fullTrace,
      reasons: explainCandidate(candidate, preferences, fullTrace),
    }
  })

  for (const item of scored) {
    if (!selectedUris.has(item.candidate.uri)) {
      traces.push({
        ...item.trace,
        selected: false,
        rank: undefined,
        explorationSelected: false,
        authorCapApplied: true,
        reasons: [],
      })
    }
  }
  return {ordered: selected, traces}
}

export function rerankLocally(
  candidates: Candidate[],
  preferences: FeedPreferences,
  options: {maxAuthorPerWindow?: number; explorationFloor?: number} = {},
): Candidate[] {
  return rankLocallyWithTrace(candidates, preferences, options).ordered
}

export function explainCandidate(
  candidate: Candidate,
  preferences: FeedPreferences,
  trace?: LocalRankingTrace,
): string[] {
  const current = trace ?? {
    ...traceCandidate(candidate, preferences),
    selected: false,
    rank: undefined,
    explorationSelected: false,
    authorCapApplied: false,
    reasons: [],
  }
  const reasons: string[] = []
  if (current.explicitPreference === 'prefer') {
    reasons.push('explicit preference: more like this')
  } else if (current.explicitPreference === 'avoid') {
    if (current.selected) {
      reasons.push('shown despite your less-like-this preference')
    }
  } else if (
    candidate.topic &&
    preferences.explicitInterests.includes(candidate.topic)
  ) {
    reasons.push('an interest you chose')
  } else if (
    candidate.topic &&
    (preferences.inferredTopics[candidate.topic] ?? 0) > 0.5
  ) {
    reasons.push('an interest inferred on this device')
  }
  if (candidate.freshness >= 0.7) reasons.push('freshness')
  if (current.explorationSelected) reasons.push('exploration setting')
  if (candidate.integrityWeight < 1) reasons.push('integrity adjustment')
  if (candidate.seen) reasons.push('seen suppression')
  if (reasons.length === 0) reasons.push('your local feed settings')
  return reasons
}

export function explorationFloorForLevel(level: number): number {
  return 0.05 + 0.35 * clamp(level)
}

export function exportPortableProfile(
  profile: Omit<PortableProfile, 'schema' | 'createdAt'>,
): string {
  const portable: PortableProfile = {
    schema: 'org.example.feed-profile/1',
    createdAt: new Date().toISOString(),
    ...profile,
  }
  return JSON.stringify(portable)
}

export function importPortableProfile(serialized: string): PortableProfile {
  const parsed = JSON.parse(serialized) as PortableProfile
  if (parsed.schema !== 'org.example.feed-profile/1')
    throw new Error('Unsupported feed profile schema')
  if (
    !parsed.explicitPreferences ||
    !Array.isArray(parsed.explicitPreferences.languages)
  ) {
    throw new Error('Invalid feed profile')
  }
  return parsed
}

export async function encryptPortableProfile(
  serialized: string,
  password: string,
): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error('Authenticated platform cryptography is unavailable')
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256'},
    baseKey,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt'],
  )
  const ciphertext = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    key,
    encoder.encode(serialized),
  )
  return JSON.stringify({
    schema: 'org.example.feed-profile/encrypted-1',
    salt: [...salt],
    iv: [...iv],
    ciphertext: [...new Uint8Array(ciphertext)],
  })
}
