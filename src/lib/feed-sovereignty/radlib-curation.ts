/**
 * Local curation is deliberately vocabulary-free.
 *
 * The old implementation bundled a project-specific topic taxonomy and
 * weights into the client. That made a supposedly neutral client carry one
 * person's interests as hidden ranking policy. The only positive ranking
 * inputs now come from `curationTerms` in the current account's local state.
 *
 * `branchWeights` remains readable only so older portable profiles can be
 * imported without data-loss or schema confusion.
 * They are not rendered, interpreted, or exported for new accounts.
 */

export type RadlibCurationConfig = {
  enabled: boolean
  removeReplies: boolean
  maxPostsPerAuthor: number
  /** Legacy compatibility only. Never used for ranking or shown in settings. */
  branchWeights?: Record<string, number>
  /** Positive, user-authored terms used by this account's local curation. */
  curationTerms?: string[]
  /** User-authored ordering exclusions, not a protocol-level block or mute. */
  excludedTerms: string[]
  excludedAuthorDids: string[]
}

export type RadlibCurationCandidate = {
  uri: string
  authorDid: string
  text: string
  indexedAt?: string
  likeCount?: number
  repostCount?: number
  replyCount?: number
  quoteCount?: number
  isReply?: boolean
}

export type RadlibCurationTrace = {
  uri: string
  included: boolean
  score: number
  /** Always empty in the current vocabulary-free implementation. */
  branchMatches: Record<string, string[]>
  /** Normalized terms explicitly supplied by the current account. */
  matchedTerms: string[]
  /** The first matched user term, for explicit-interest/profile scoring. */
  topic?: string
  reasons: string[]
  excludedReason?: 'reply' | 'author' | 'term'
}

export type ExplicitFeedPreference = {
  uri: string
  preference: 'prefer' | 'avoid'
}

export type ExplicitAuthorPreference = {
  did: string
  preference: 'prefer' | 'avoid'
}

export const RADLIB_CURATION_PROFILE_ID = 'org.radical-liberal.curation/1'
export const RADLIB_CURATION_PROFILE_VERSION = 1 as const

/**
 * Compatibility fixture for the old profile shape. It contains no content
 * vocabulary. Existing profiles with user-authored terms are never matched
 * by the legacy-default migration check and therefore remain intact.
 */
export const legacyRadlibCurationConfig: RadlibCurationConfig = {
  enabled: false,
  removeReplies: true,
  maxPostsPerAuthor: 2,
  curationTerms: [],
  excludedTerms: [],
  excludedAuthorDids: [],
}

/**
 * Neutral per-account starter profile. No topic, exclusion, or branch weight
 * is selected until this account explicitly chooses it.
 */
export const defaultLocalCurationConfig: RadlibCurationConfig = {
  enabled: false,
  removeReplies: false,
  maxPostsPerAuthor: 2,
  curationTerms: [],
  excludedTerms: [],
  excludedAuthorDids: [],
}

/** @deprecated Use defaultLocalCurationConfig for new account state. */
export const defaultRadlibCurationConfig = legacyRadlibCurationConfig

export function isLegacyRadlibCurationConfig(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const candidate = value as Partial<RadlibCurationConfig>
  return (
    candidate.enabled === legacyRadlibCurationConfig.enabled &&
    candidate.removeReplies === legacyRadlibCurationConfig.removeReplies &&
    candidate.maxPostsPerAuthor === legacyRadlibCurationConfig.maxPostsPerAuthor &&
    (candidate.branchWeights === undefined ||
      (typeof candidate.branchWeights === 'object' &&
        candidate.branchWeights !== null &&
        Object.keys(candidate.branchWeights).length === 0)) &&
    (!candidate.curationTerms || candidate.curationTerms.length === 0) &&
    Array.isArray(candidate.excludedTerms) &&
    candidate.excludedTerms.length === 0 &&
    Array.isArray(candidate.excludedAuthorDids) &&
    candidate.excludedAuthorDids.length === 0
  )
}

export function retainReplyForExplicitPreference(
  candidate: Pick<RadlibCurationCandidate, 'uri' | 'authorDid' | 'isReply'>,
  postPreferences: ExplicitFeedPreference[],
  authorPreferences: ExplicitAuthorPreference[],
): boolean {
  if (!candidate.isReply) return true
  const postPreference = postPreferences.find(
    preference => preference.uri === candidate.uri,
  )?.preference
  if (postPreference) return postPreference === 'prefer'
  return (
    authorPreferences.find(preference => preference.did === candidate.authorDid)
      ?.preference === 'prefer'
  )
}

export function repartitionCurationSlices<T>(
  orderedSlices: T[],
  pageCapacities: number[],
): T[][] {
  let offset = 0
  return pageCapacities.map(capacity => {
    const count = Math.max(0, Math.floor(capacity))
    const page = orderedSlices.slice(offset, offset + count)
    offset += count
    return page
  })
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('und')
    .replace(/[’‘‛′]/g, "'")
    .replace(/[‐‑‒–—−]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
}

function termMatches(text: string, term: string): boolean {
  const normalizedTerm = normalize(term)
  if (!normalizedTerm) return false
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(^|[^\\p{L}\\p{N}_'])${escaped}(?=$|[^\\p{L}\\p{N}_'])`,
    'u',
  ).test(text)
}

function freshnessFor(indexedAt: string | undefined, now: number): number {
  const parsed = indexedAt ? Date.parse(indexedAt) : Number.NaN
  const ageHours = Number.isFinite(parsed) ? (now - parsed) / 3_600_000 : 24
  return Math.exp(-Math.max(0, ageHours) / 24)
}

function engagementFor(candidate: RadlibCurationCandidate): number {
  const total = [
    candidate.likeCount,
    candidate.repostCount,
    candidate.replyCount,
    candidate.quoteCount,
  ].reduce<number>((sum, value) => sum + Math.max(0, value ?? 0), 0)
  return clamp(Math.log1p(total) / Math.log1p(1_000))
}

export function validateRadlibCurationConfig(
  value: unknown,
): asserts value is RadlibCurationConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Radical-liberal curation settings are invalid')
  const candidate = value as Record<string, unknown>
  const allowed = [
    'enabled',
    'removeReplies',
    'maxPostsPerAuthor',
    'branchWeights',
    'curationTerms',
    'excludedTerms',
    'excludedAuthorDids',
  ]
  for (const key of Object.keys(candidate)) {
    if (!allowed.includes(key))
      throw new Error(`Unsupported radical-liberal curation field: ${key}`)
  }
  if (
    typeof candidate.enabled !== 'boolean' ||
    typeof candidate.removeReplies !== 'boolean'
  )
    throw new Error('Radical-liberal curation toggles are invalid')
  if (
    typeof candidate.maxPostsPerAuthor !== 'number' ||
    !Number.isInteger(candidate.maxPostsPerAuthor) ||
    candidate.maxPostsPerAuthor < 1 ||
    candidate.maxPostsPerAuthor > 5
  )
    throw new Error('Radical-liberal curation author cap is invalid')
  if (candidate.branchWeights !== undefined) {
    if (
      typeof candidate.branchWeights !== 'object' ||
      candidate.branchWeights === null ||
      Array.isArray(candidate.branchWeights)
    )
      throw new Error('Radical-liberal curation branch weights are invalid')
    const weights = candidate.branchWeights as Record<string, unknown>
    if (Object.keys(weights).length > 100) {
      throw new Error('Radical-liberal curation branch weights are invalid')
    }
    for (const [key, value] of Object.entries(weights)) {
      if (
        key.length === 0 ||
        key.length > 160 ||
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 10
      )
        throw new Error(`Radical-liberal curation weight is invalid: ${key}`)
    }
  }
  if (
    candidate.curationTerms !== undefined &&
    (!Array.isArray(candidate.curationTerms) ||
      candidate.curationTerms.length > 100 ||
      candidate.curationTerms.some(
        term =>
          typeof term !== 'string' ||
          normalize(term).length < 1 ||
          normalize(term).length > 160,
      ))
  )
    throw new Error('Radical-liberal curation terms are invalid')
  if (
    !Array.isArray(candidate.excludedTerms) ||
    candidate.excludedTerms.length > 100 ||
    candidate.excludedTerms.some(
      term =>
        typeof term !== 'string' ||
        normalize(term).length < 1 ||
        normalize(term).length > 160,
    )
  )
    throw new Error('Radical-liberal curation excluded terms are invalid')
  if (
    !Array.isArray(candidate.excludedAuthorDids) ||
    candidate.excludedAuthorDids.length > 2_000 ||
    candidate.excludedAuthorDids.some(
      did => typeof did !== 'string' || did.length === 0 || did.length > 256,
    )
  )
    throw new Error('Radical-liberal curation excluded authors are invalid')
}

function emptyTrace(
  candidate: RadlibCurationCandidate,
  included: boolean,
  excludedReason?: RadlibCurationTrace['excludedReason'],
): RadlibCurationTrace {
  return {
    uri: candidate.uri,
    included,
    score: 0,
    branchMatches: {},
    matchedTerms: [],
    reasons: [],
    ...(excludedReason ? {excludedReason} : {}),
  }
}

export function scoreRadlibCuration(
  candidate: RadlibCurationCandidate,
  config: RadlibCurationConfig,
  now = Date.now(),
  options: {explicitOverride?: boolean} = {},
): RadlibCurationTrace {
  if (!config.enabled) return emptyTrace(candidate, true)
  if (config.removeReplies && candidate.isReply && !options.explicitOverride) {
    return emptyTrace(candidate, false, 'reply')
  }
  // Author and term exclusions are local ordering policy. More-like-this can
  // affect surviving candidates, but cannot resurrect one that is excluded.
  if (config.excludedAuthorDids.includes(candidate.authorDid)) {
    return emptyTrace(candidate, false, 'author')
  }
  const text = normalize(candidate.text)
  const excludedTerm = config.excludedTerms.find(term =>
    termMatches(text, term),
  )
  if (excludedTerm) return emptyTrace(candidate, false, 'term')

  const matchedTerms = Array.from(
    new Set(
      (config.curationTerms ?? [])
        .filter(term => termMatches(text, term))
        .map(normalize),
    ),
  )
  const freshness = freshnessFor(candidate.indexedAt, now)
  const engagement = engagementFor(candidate)
  const explicitTermScore = Math.min(6, matchedTerms.length * 2)
  const reasons: string[] = []
  if (matchedTerms.length > 0) {
    reasons.push('local curation: explicit term match')
  }
  if (reasons.length === 0 && (freshness >= 0.7 || engagement >= 0.25)) {
    reasons.push('local curation: freshness and normalized engagement')
  }
  return {
    uri: candidate.uri,
    included: true,
    score: explicitTermScore + 2.5 * freshness + 1.5 * engagement,
    branchMatches: {},
    matchedTerms,
    ...(matchedTerms[0] ? {topic: matchedTerms[0]} : {}),
    reasons,
  }
}
