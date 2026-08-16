export type FeedPreferences = {
  freshness: number
  discovery: number
  familiarity: number
  conversationActivity: number
  languages: string[]
  topics: Record<string, number>
  classifierModules: Record<string, 'prefer' | 'neutral' | 'avoid'>
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

const clamp = (value: number) => Math.max(0, Math.min(1, value))

export function scoreCandidate(candidate: Candidate, preferences: FeedPreferences): number {
  const topic = candidate.topic ? preferences.topics[candidate.topic] ?? 0 : 0
  const topicScore = (topic + 1) / 2
  const score =
    preferences.freshness * clamp(candidate.freshness) +
    preferences.discovery * clamp(candidate.networkRelevance) +
    preferences.conversationActivity * clamp(candidate.conversationActivity) +
    0.2 * clamp(candidate.integrityWeight) +
    0.2 * topicScore
  return candidate.seen ? score * 0.05 : score
}

export function rerankLocally(
  candidates: Candidate[],
  preferences: FeedPreferences,
  options: { maxAuthorPerWindow?: number; explorationFloor?: number } = {},
): Candidate[] {
  const maxAuthor = options.maxAuthorPerWindow ?? 2
  const explorationFloor = options.explorationFloor ?? 0.1
  const ranked = [...candidates].sort((a, b) => scoreCandidate(b, preferences) - scoreCandidate(a, preferences))
  const selected: Candidate[] = []
  const counts = new Map<string, number>()
  const exploration = ranked.filter(candidate => candidate.explorationEligible)
  const targetExploration = Math.ceil(ranked.length * explorationFloor)

  const add = (candidate: Candidate) => {
    const count = counts.get(candidate.authorDid) ?? 0
    if (count >= maxAuthor || selected.some(item => item.uri === candidate.uri)) return false
    selected.push(candidate)
    counts.set(candidate.authorDid, count + 1)
    return true
  }

  for (const candidate of exploration) {
    if (selected.filter(item => item.explorationEligible).length >= targetExploration) break
    add(candidate)
  }
  for (const candidate of ranked) add(candidate)
  return selected
}

export function exportPortableProfile(profile: Omit<PortableProfile, 'schema' | 'createdAt'>): string {
  const portable: PortableProfile = {
    schema: 'org.example.feed-profile/1',
    createdAt: new Date().toISOString(),
    ...profile,
  }
  return JSON.stringify(portable)
}

export function importPortableProfile(serialized: string): PortableProfile {
  const parsed = JSON.parse(serialized) as PortableProfile
  if (parsed.schema !== 'org.example.feed-profile/1') throw new Error('Unsupported feed profile schema')
  if (!parsed.explicitPreferences || !Array.isArray(parsed.explicitPreferences.languages)) {
    throw new Error('Invalid feed profile')
  }
  return parsed
}
export function explainCandidate(candidate: Candidate, preferences: FeedPreferences): string[] {
  const reasons: string[] = []
  if (candidate.freshness >= 0.7) reasons.push('recent')
  if (candidate.topic && (preferences.topics[candidate.topic] ?? 0) > 0) reasons.push(`topic:${candidate.topic}`)
  if (candidate.explorationEligible) reasons.push('exploration-slot')
  if (candidate.seen) reasons.push('seen-suppressed')
  if (candidate.integrityWeight < 1) reasons.push('integrity-adjusted')
  return reasons
}

export async function encryptPortableProfile(serialized: string, password: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Authenticated platform cryptography is unavailable')
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(serialized))
  return JSON.stringify({ schema: 'org.example.feed-profile/encrypted-1', salt: [...salt], iv: [...iv], ciphertext: [...new Uint8Array(ciphertext)] })
}
