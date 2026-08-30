export type ResolutionStatus =
  | 'verified'
  | 'unresolved'
  | 'stale-cache'
  | 'mismatched'
  | 'resolver-unavailable'
  | 'invalid'
  | 'revoked'
export type ResolutionProvenance = {
  resolver: string
  resolvedAt: number
  fromCache: boolean
  cacheAgeMs: number
  documentVersion?: string
}

export type IdentityDocumentEvidenceComposition =
  | 'agreement'
  | 'disagreement'
  | 'partial'
  | 'unavailable'
  | 'empty'
  | 'tombstoned'
  | 'not-checked'

export type IdentityResolverEvidence = {
  resolverId: string
  displayName?: string
  endpoint?: string
  operatorId?: string
  retrievedAt?: string
  status: 'verified' | 'tombstoned' | 'invalid' | 'empty' | 'unavailable'
  historyLength?: number
  verifiedOperations?: number
  headCid?: string
  error?: string
}

/**
 * Evidence about the document behind an identity claim. This is deliberately
 * a summary rather than a second DID document model: the PLC verifier remains
 * the authority for cryptographic validation, while the client keeps enough
 * provenance to explain which sources agreed, disagreed, or were unavailable.
 */
export type IdentityDocumentEvidence = {
  method: 'plc' | 'did:web' | 'direct'
  composition: IdentityDocumentEvidenceComposition
  resolvers: IdentityResolverEvidence[]
  distinctDocumentCount: number
  declaredOperatorIds?: string[]
  operatorIndependence?: 'declared-distinct' | 'not-established'
  selectedResolverId?: string
}

export type IdentityResolution = {
  did?: string
  handle?: string
  endpoint?: string
  status: ResolutionStatus
  provenance: ResolutionProvenance
  evidence?: IdentityDocumentEvidence
}

/**
 * A resolution claim is attributable to one resolver provider. The provider
 * id is intentionally separate from the DID: a DID is the subject of the
 * claim, not evidence that the provider owns that identity.
 */
export type IdentityClaim = IdentityResolution & {
  providerId: string
}

export type IdentityResolutionPolicy =
  | {mode: 'require-agreement'}
  | {mode: 'first-verified'}
  | {mode: 'prefer-provider'; preferredProviderId: string}

export const DEFAULT_IDENTITY_RESOLUTION_POLICY: IdentityResolutionPolicy = {
  mode: 'require-agreement',
}

export type IdentityClaimsResult = {
  input: string
  claims: IdentityClaim[]
  evidence: IdentityDocumentEvidence[]
  /** Providers that did not produce a safe, usable claim. */
  unavailableResolvers: string[]
  /** The evidence state, independent of whether an explicit policy selected a claim. */
  status: 'verified' | 'disagreement' | 'resolver-unavailable' | 'invalid'
  /** The policy-selected claim. It is absent when the policy fails closed. */
  selected?: IdentityClaim
}

/**
 * The authenticated session already binds the current handle to its DID. Use
 * that binding for the owner's own profile instead of requiring an optional
 * public identity resolver capability just to open the Profile navigation
 * target. Other handles continue through the configured resolver policy.
 */
export function getKnownAccountDidForHandle(
  input: string | undefined,
  account: {did: string; handle?: string} | undefined,
): string | undefined {
  if (!input || !account?.handle) return undefined
  const normalize = (value: string) =>
    value.trim().replace(/^@/, '').toLowerCase()
  return normalize(input) === normalize(account.handle)
    ? account.did
    : undefined
}

export type ResolverProvider = {
  id: string
  resolveHandle: (handle: string) => Promise<{did: string}>
  resolveDid: (did: string) => Promise<{
    handle?: string
    endpoint?: string
    version?: string
    evidence?: IdentityDocumentEvidence
  }>
}
export function validateIdentityEndpoint(
  endpoint: string | undefined,
): boolean {
  if (!endpoint) return true
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    if (url.username || url.password || url.port === '0') return false
    const host = url.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      host.startsWith('172.16.') ||
      host.startsWith('172.17.') ||
      host.startsWith('172.18.') ||
      host.startsWith('172.19.') ||
      host.startsWith('172.2') ||
      host.startsWith('172.3')
    )
      return false
    return true
  } catch {
    return false
  }
}
export class IdentityCache {
  private entries = new Map<
    string,
    {value: IdentityResolution; expires: number; staleUntil: number}
  >()
  constructor(
    private positiveTtlMs = 300000,
    private negativeTtlMs = 30000,
    private maxStaleMs = 3600000,
  ) {}
  get(key: string, now = Date.now(), requireFresh = false) {
    const e = this.entries.get(key)
    if (!e) return
    const age = now - e.value.provenance.resolvedAt
    if (now < e.expires)
      return {
        ...e.value,
        provenance: {...e.value.provenance, fromCache: true, cacheAgeMs: age},
      }
    if (!requireFresh && now < e.staleUntil)
      return {
        ...e.value,
        status: 'stale-cache' as const,
        provenance: {...e.value.provenance, fromCache: true, cacheAgeMs: age},
      }
  }
  set(key: string, value: IdentityResolution, now = Date.now()) {
    const ttl =
      value.status === 'verified' ? this.positiveTtlMs : this.negativeTtlMs
    this.entries.set(key, {
      value,
      expires: now + ttl,
      staleUntil: now + ttl + this.maxStaleMs,
    })
  }
  invalidate(key: string) {
    this.entries.delete(key)
  }
  clear() {
    this.entries.clear()
  }
}

function isValidIdentityInput(input: string): boolean {
  return /^did:(plc|web):[A-Za-z0-9._:%-]+$|^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(
    input,
  )
}

function isSupportedDid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^did:(plc|web):[A-Za-z0-9._:%-]+$/i.test(value)
  )
}

function identityClaimKey(claim: IdentityClaim): string {
  return [
    claim.did?.toLowerCase() ?? '',
    claim.endpoint?.replace(/\/$/, '').toLowerCase() ?? '',
  ].join('|')
}

function makeIdentityClaim(
  input: string,
  provider: ResolverProvider,
  did: string,
  doc: {
    handle?: string
    endpoint?: string
    version?: string
    evidence?: IdentityDocumentEvidence
  },
  now: number,
): IdentityClaim {
  let status: ResolutionStatus =
    input.startsWith('did:') ||
    !doc.handle ||
    doc.handle.toLowerCase() === input.toLowerCase()
      ? 'verified'
      : 'mismatched'

  if (doc.evidence?.composition === 'tombstoned') status = 'revoked'
  if (
    doc.evidence?.composition === 'unavailable' ||
    doc.evidence?.composition === 'empty'
  ) {
    status = 'resolver-unavailable'
  }

  return {
    providerId: provider.id,
    did,
    handle: doc.handle,
    endpoint: doc.endpoint,
    status,
    evidence: doc.evidence,
    provenance: {
      resolver: provider.id,
      resolvedAt: now,
      fromCache: false,
      cacheAgeMs: 0,
      documentVersion: doc.version,
    },
  }
}

/**
 * Apply a user-owned reconciliation policy to collected claims.
 *
 * The evidence status is never rewritten to "verified" merely because a
 * policy selected one claim. A preferred or first-verified policy is an
 * explicit local choice and still returns `status: "disagreement"` when the
 * providers disagree. `require-agreement` is the safe default for identity
 * and authentication-sensitive callers.
 */
export function reconcileIdentityClaims(
  result: IdentityClaimsResult,
  policy: IdentityResolutionPolicy = DEFAULT_IDENTITY_RESOLUTION_POLICY,
): IdentityClaimsResult {
  if (result.status === 'invalid' || result.claims.length === 0)
    return {...result, selected: undefined}

  const verifiedClaims = result.claims.filter(isSelectableIdentityClaim)
  let selected: IdentityClaim | undefined

  if (result.status === 'verified') {
    selected = verifiedClaims[0]
  } else if (policy.mode === 'prefer-provider') {
    selected = verifiedClaims.find(
      claim => claim.providerId === policy.preferredProviderId,
    )
  } else if (policy.mode === 'first-verified') {
    selected = verifiedClaims[0]
  }

  return {...result, selected}
}

/**
 * Collect identity claims from every configured resolver and reconcile them
 * without silently treating the first network response as canonical.
 *
 * A provider failure is retained in `unavailableResolvers`. Under the default
 * agreement policy, a partial result is not selected. Callers that deliberately
 * accept `first-verified` or `prefer-provider` remain able to make that choice,
 * while the result continues to expose the incomplete/disputed evidence.
 */
export async function resolveIdentityClaims(
  input: string,
  providers: ResolverProvider[],
  policy: IdentityResolutionPolicy = DEFAULT_IDENTITY_RESOLUTION_POLICY,
  now = Date.now(),
): Promise<IdentityClaimsResult> {
  if (!isValidIdentityInput(input)) {
    return {
      input,
      claims: [],
      evidence: [],
      unavailableResolvers: [],
      status: 'invalid',
    }
  }

  const inputIsDid = input.startsWith('did:')
  const outcomes = await Promise.all(
    providers.map(async provider => {
      try {
        const did = inputIsDid
          ? input
          : (await provider.resolveHandle(input)).did
        if (!isSupportedDid(did)) return {providerId: provider.id}
        const doc = await provider.resolveDid(did)
        if (!validateIdentityEndpoint(doc.endpoint)) {
          return {providerId: provider.id, evidence: doc.evidence}
        }
        return {
          claim: makeIdentityClaim(input, provider, did, doc, now),
          evidence: doc.evidence,
        }
      } catch {
        return {providerId: provider.id}
      }
    }),
  )

  const claims: IdentityClaim[] = []
  const evidence: IdentityDocumentEvidence[] = []
  const unavailableResolvers: string[] = []
  for (const outcome of outcomes) {
    if ('claim' in outcome && outcome.claim) claims.push(outcome.claim)
    else if ('providerId' in outcome)
      unavailableResolvers.push(outcome.providerId)
    if ('evidence' in outcome && outcome.evidence)
      evidence.push(outcome.evidence)
  }
  const verifiedClaims = claims.filter(isSelectableIdentityClaim)
  const distinctClaims = new Set(verifiedClaims.map(identityClaimKey))
  const hasMismatchedClaim = claims.some(
    claim => claim.status === 'mismatched' || claim.status === 'revoked',
  )
  const hasUnavailableClaim = claims.some(
    claim => claim.status === 'resolver-unavailable',
  )
  const hasEvidenceDisagreement = evidence.some(
    item => item.composition === 'disagreement',
  )
  const hasEvidenceUnavailable = evidence.some(item =>
    ['partial', 'unavailable', 'empty'].includes(item.composition),
  )
  const hasEvidenceTombstone = evidence.some(
    item => item.composition === 'tombstoned',
  )
  const hasDisagreement =
    distinctClaims.size > 1 ||
    hasMismatchedClaim ||
    hasEvidenceDisagreement ||
    hasEvidenceTombstone
  const result: IdentityClaimsResult = {
    input,
    claims,
    evidence: uniqueIdentityEvidence(evidence),
    unavailableResolvers,
    status:
      claims.length === 0
        ? 'resolver-unavailable'
        : hasDisagreement
          ? 'disagreement'
          : hasUnavailableClaim ||
              hasEvidenceUnavailable ||
              unavailableResolvers.length > 0
            ? 'resolver-unavailable'
            : 'verified',
  }
  return reconcileIdentityClaims(result, policy)
}

function isSelectableIdentityClaim(claim: IdentityClaim): boolean {
  return (
    claim.status === 'verified' &&
    claim.evidence?.composition !== 'unavailable' &&
    claim.evidence?.composition !== 'empty' &&
    claim.evidence?.composition !== 'tombstoned'
  )
}

function uniqueIdentityEvidence(
  evidence: IdentityDocumentEvidence[],
): IdentityDocumentEvidence[] {
  const seen = new Set<string>()
  return evidence.filter(item => {
    const key = JSON.stringify(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export class IdentityResolutionDisagreementError extends Error {
  readonly result: IdentityClaimsResult

  constructor(result: IdentityClaimsResult) {
    super(`Identity resolvers disagree for ${result.input}`)
    this.name = 'IdentityResolutionDisagreementError'
    this.result = result
  }
}

export class IdentityResolutionUnavailableError extends Error {
  readonly result: IdentityClaimsResult

  constructor(result: IdentityClaimsResult) {
    super(`Identity resolution is unavailable for ${result.input}`)
    this.name = 'IdentityResolutionUnavailableError'
    this.result = result
  }
}

export async function resolveIdentity(
  input: string,
  providers: ResolverProvider[],
  cache = new IdentityCache(),
  now = Date.now(),
  requireFresh = false,
): Promise<IdentityResolution> {
  const key = input.toLowerCase()
  const cached = cache.get(key, now, requireFresh)
  if (cached) return cached
  if (!isValidIdentityInput(input)) {
    const r: IdentityResolution = {
      status: 'invalid',
      provenance: {
        resolver: 'none',
        resolvedAt: now,
        fromCache: false,
        cacheAgeMs: 0,
      },
    }
    cache.set(key, r, now)
    return r
  }
  for (const provider of providers) {
    try {
      const did = input.startsWith('did:')
        ? input
        : (await provider.resolveHandle(input)).did
      const doc = await provider.resolveDid(did)
      if (!validateIdentityEndpoint(doc.endpoint)) continue
      const status: ResolutionStatus =
        input.startsWith('did:') ||
        !doc.handle ||
        doc.handle.toLowerCase() === input.toLowerCase()
          ? 'verified'
          : 'mismatched'
      const r: IdentityResolution = {
        did,
        handle: doc.handle,
        endpoint: doc.endpoint,
        status,
        evidence: doc.evidence,
        provenance: {
          resolver: provider.id,
          resolvedAt: now,
          fromCache: false,
          cacheAgeMs: 0,
          documentVersion: doc.version,
        },
      }
      cache.set(key, r, now)
      return r
    } catch {
      continue
    }
  }
  const r: IdentityResolution = {
    status: 'resolver-unavailable',
    provenance: {
      resolver: 'none',
      resolvedAt: now,
      fromCache: false,
      cacheAgeMs: 0,
    },
  }
  cache.set(key, r, now)
  return r
}
export class IdentityRuntimeCoordinator {
  constructor(public readonly cache: IdentityCache) {}
  onIdentityTransition() {
    this.cache.clear()
  }
  onMigration() {
    this.cache.clear()
  }
  onRecovery() {
    this.cache.clear()
  }
  onLockdown() {
    this.cache.clear()
  }
}
export type MigrationState =
  | 'idle'
  | 'validating_destination'
  | 'preparing'
  | 'transferring_repository'
  | 'transferring_blobs'
  | 'updating_identity'
  | 'activating_destination'
  | 'revoking_old_authority'
  | 'verifying'
  | 'complete'
  | 'blocked'
  | 'recoverable_failure'
  | 'terminal_failure'
export type MigrationReceipt = {
  migrationId: string
  did: string
  fromPds: string
  toPds: string
  state: MigrationState
  simulated: boolean
  preferencesRestored: boolean
  oldAuthorityRevoked: boolean
  updatedAt: string
}
export class MigrationMachine {
  constructor(public receipt: MigrationReceipt) {}
  transition(next: MigrationState) {
    const allowed: Record<MigrationState, MigrationState[]> = {
      idle: ['validating_destination'],
      validating_destination: ['preparing', 'blocked'],
      preparing: ['transferring_repository', 'recoverable_failure'],
      transferring_repository: ['transferring_blobs', 'recoverable_failure'],
      transferring_blobs: ['updating_identity', 'recoverable_failure'],
      updating_identity: ['activating_destination', 'terminal_failure'],
      activating_destination: ['revoking_old_authority', 'recoverable_failure'],
      revoking_old_authority: ['verifying'],
      verifying: ['complete', 'blocked'],
      complete: [],
      blocked: ['validating_destination', 'terminal_failure'],
      recoverable_failure: ['preparing', 'terminal_failure'],
      terminal_failure: [],
    }
    if (!allowed[this.receipt.state].includes(next))
      throw new Error(
        `Invalid migration transition ${this.receipt.state} -> ${next}`,
      )
    this.receipt = {
      ...this.receipt,
      state: next,
      updatedAt: new Date().toISOString(),
    }
    return this.receipt
  }
}
