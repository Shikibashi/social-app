/**
 * A portable, user-selected content policy.
 *
 * This layer intentionally has no built-in vocabulary. A content boundary is
 * meaningful only when the current account supplies its own terms or author
 * exclusions. `termPacks` and `strictProgressive` remain in the serialized
 * shape as inert compatibility fields for older imported profiles; they are
 * not rendered, populated, or interpreted by this client.
 */

export const CONTENT_FILTER_PROFILE_ID = 'org.radical-liberal.content-filter/1'
export const CONTENT_FILTER_PROFILE_VERSION = 1 as const

/** Opaque legacy identifiers accepted during import but never evaluated. */
export type ContentFilterTermPack = string

export type ContentFilterPolicy = {
  version: typeof CONTENT_FILTER_PROFILE_VERSION
  enabled: boolean
  termPacks: ContentFilterTermPack[]
  /** Legacy compatibility only; no implicit term is associated with it. */
  strictProgressive: boolean
  customTerms: string[]
  excludedAuthorDids: string[]
  actorTarget: 'all'
  hardExclude: true
  semanticMode: 'rules-only'
}

export type ContentFilterMatch = {
  term: string
  source: 'custom'
}

export type ContentFilterTrace = {
  included: boolean
  matchedTerms: ContentFilterMatch[]
  excludedReason?: 'term' | 'author'
  reasons: string[]
}

/**
 * Compatibility profile for old serialized states that contained a built-in
 * pack. It is deliberately not a source of terms. New accounts use the
 * neutral profile below, and custom terms remain account-local.
 */
export const contextualContentFilterPolicy: ContentFilterPolicy = {
  version: CONTENT_FILTER_PROFILE_VERSION,
  enabled: false,
  termPacks: ['imported-profile'],
  strictProgressive: false,
  customTerms: [],
  excludedAuthorDids: [],
  actorTarget: 'all',
  hardExclude: true,
  semanticMode: 'rules-only',
}

/** Neutral per-account starter policy. */
export const defaultContentFilterPolicy: ContentFilterPolicy = {
  version: CONTENT_FILTER_PROFILE_VERSION,
  enabled: false,
  termPacks: [],
  strictProgressive: false,
  customTerms: [],
  excludedAuthorDids: [],
  actorTarget: 'all',
  hardExclude: true,
  semanticMode: 'rules-only',
}

export function isContextualContentFilterPolicy(
  value: unknown,
): value is ContentFilterPolicy {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const candidate = value as Partial<ContentFilterPolicy>
  return (
    candidate.version === contextualContentFilterPolicy.version &&
    candidate.enabled === contextualContentFilterPolicy.enabled &&
    candidate.strictProgressive === contextualContentFilterPolicy.strictProgressive &&
    candidate.actorTarget === contextualContentFilterPolicy.actorTarget &&
    candidate.hardExclude === contextualContentFilterPolicy.hardExclude &&
    candidate.semanticMode === contextualContentFilterPolicy.semanticMode &&
    Array.isArray(candidate.termPacks) &&
    candidate.termPacks.length > 0 &&
    Array.isArray(candidate.customTerms) &&
    candidate.customTerms.length === 0 &&
    Array.isArray(candidate.excludedAuthorDids) &&
    candidate.excludedAuthorDids.length === 0
  )
}

/** Normalize user input consistently across web and native runtimes. */
export function normalizeContentFilterText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('und')
    .replace(/[’‘‛′]/g, "'")
    .replace(/[‐‑‒–—−]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesWholeTerm(text: string, term: string): boolean {
  const normalizedTerm = normalizeContentFilterText(term)
  if (!normalizedTerm) return false
  const escaped = escapeRegExp(normalizedTerm)
  return new RegExp(
    `(^|[^\\p{L}\\p{N}_'])${escaped}(?=$|[^\\p{L}\\p{N}_'])`,
    'u',
  ).test(text)
}

function matchesForPolicy(
  text: string,
  policy: ContentFilterPolicy,
): ContentFilterMatch[] {
  return Array.from(
    new Set(
      policy.customTerms
        .filter(term => matchesWholeTerm(text, term))
        .map(normalizeContentFilterText),
    ),
  ).map(term => ({term, source: 'custom'}))
}

export function matchContentFilter(
  candidate: Pick<{text: string; authorDid: string}, 'text' | 'authorDid'>,
  policy: ContentFilterPolicy | undefined,
): ContentFilterTrace {
  if (!policy?.enabled) {
    return {included: true, matchedTerms: [], reasons: []}
  }
  if (policy.excludedAuthorDids.includes(candidate.authorDid)) {
    return {
      included: false,
      matchedTerms: [],
      excludedReason: 'author',
      reasons: ['local content filter: excluded author'],
    }
  }
  const matches = matchesForPolicy(
    normalizeContentFilterText(candidate.text),
    policy,
  )
  if (matches.length === 0) {
    return {included: true, matchedTerms: [], reasons: []}
  }
  return {
    included: false,
    matchedTerms: matches,
    excludedReason: 'term',
    reasons: ['local content filter: hard exclusion'],
  }
}

export function contentFilterTermsForPolicy(
  policy: ContentFilterPolicy,
): string[] {
  return [...policy.customTerms]
}

export function validateContentFilterPolicy(
  value: unknown,
): asserts value is ContentFilterPolicy {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Content filter policy is invalid')
  }
  const candidate = value as Record<string, unknown>
  const allowed = [
    'version',
    'enabled',
    'termPacks',
    'strictProgressive',
    'customTerms',
    'excludedAuthorDids',
    'actorTarget',
    'hardExclude',
    'semanticMode',
  ]
  for (const key of Object.keys(candidate)) {
    if (!allowed.includes(key))
      throw new Error(`Unsupported content filter field: ${key}`)
  }
  if (
    candidate.version !== CONTENT_FILTER_PROFILE_VERSION ||
    typeof candidate.enabled !== 'boolean' ||
    typeof candidate.strictProgressive !== 'boolean' ||
    candidate.actorTarget !== 'all' ||
    candidate.hardExclude !== true ||
    candidate.semanticMode !== 'rules-only'
  ) {
    throw new Error('Content filter policy metadata is invalid')
  }
  if (
    !Array.isArray(candidate.termPacks) ||
    candidate.termPacks.length > 100 ||
    candidate.termPacks.some(
      pack =>
        typeof pack !== 'string' ||
        normalizeContentFilterText(pack).length < 1 ||
        normalizeContentFilterText(pack).length > 160,
    )
  ) {
    throw new Error('Content filter term packs are invalid')
  }
  if (
    !Array.isArray(candidate.customTerms) ||
    candidate.customTerms.length > 200 ||
    candidate.customTerms.some(
      term =>
        typeof term !== 'string' ||
        normalizeContentFilterText(term).length < 2 ||
        normalizeContentFilterText(term).length > 160,
    )
  ) {
    throw new Error('Content filter custom terms are invalid')
  }
  if (
    !Array.isArray(candidate.excludedAuthorDids) ||
    candidate.excludedAuthorDids.length > 2_000 ||
    candidate.excludedAuthorDids.some(
      did => typeof did !== 'string' || did.length === 0 || did.length > 256,
    )
  ) {
    throw new Error('Content filter excluded authors are invalid')
  }
}
