import {
  type PlcDocumentData,
  type PlcHistoryVerification,
  verifyPlcHistory,
} from './plc-history'

export type PlcResolverDescriptor = {
  id: string
  displayName: string
  endpoint: string
  /** A declared operator identity, not proof of independent operation. */
  operatorId: string
}

export type PlcResolverClaim = {
  resolver: PlcResolverDescriptor
  retrievedAt: string
  verification?: PlcHistoryVerification
  historyLength?: number
  error?: string
}

export type PlcResolverCompositionStatus =
  | 'agreement'
  | 'disagreement'
  | 'partial'
  | 'unavailable'
  | 'empty'
  | 'tombstoned'

export type PlcResolverCompositionResult = {
  did: string
  status: PlcResolverCompositionStatus
  claims: PlcResolverClaim[]
  selected?: PlcDocumentData
  distinctDocumentKeys: string[]
  declaredOperatorIds: string[]
  /** This only reflects declarations; external control evidence is required. */
  independence: 'declared-distinct' | 'not-established'
}

export type PlcResolverFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type PlcResolverOptions = {
  fetcher?: PlcResolverFetch
  timeoutMs?: number
}

/**
 * Query each configured PLC read replica, validate its complete audit history,
 * and retain every claim. A resolver response is never accepted merely because
 * it returned HTTP 200 or because it is the first response to arrive.
 */
export async function resolvePlcWithResolvers(
  did: string,
  resolvers: readonly PlcResolverDescriptor[],
  options: PlcResolverOptions = {},
): Promise<PlcResolverCompositionResult> {
  const fetcher = options.fetcher ?? defaultFetch
  const claims: PlcResolverClaim[] = await Promise.all(
    resolvers.map(async (resolver): Promise<PlcResolverClaim> => {
      const retrievedAt = new Date().toISOString()
      try {
        const response = await fetcher(auditLogUrl(resolver.endpoint, did), {
          headers: {accept: 'application/json'},
          redirect: 'error',
          signal: timeoutSignal(options.timeoutMs ?? 10_000),
        })
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} from ${resolver.displayName}`,
          )
        }
        const raw = (await response.json()) as unknown
        const history = auditOperations(raw)
        const verification = await verifyPlcHistory(did, history)
        return {
          resolver,
          retrievedAt,
          verification,
          historyLength: history.length,
        }
      } catch (error) {
        return {
          resolver,
          retrievedAt,
          error: safeErrorMessage(error),
        }
      }
    }),
  )

  const usable = claims.filter(
    (
      claim,
    ): claim is PlcResolverClaim & {
      verification: PlcHistoryVerification
      historyLength: number
    } =>
      claim.verification?.status === 'verified' ||
      claim.verification?.status === 'tombstoned',
  )
  const distinctDocumentKeys = [
    ...new Set(
      usable.map(claim =>
        claim.verification.status === 'tombstoned'
          ? 'tombstoned'
          : documentKey(claim.verification.document),
      ),
    ),
  ]
  // A response that parsed but failed cryptographic verification is still a
  // failed provider claim. Do not let a malicious or stale replica disappear
  // from the composition merely because it returned HTTP 200.
  const hasFailures = claims.some(
    claim =>
      !claim.verification ||
      !['verified', 'tombstoned'].includes(claim.verification.status),
  )
  const allTombstoned =
    usable.length > 0 &&
    usable.every(claim => claim.verification.status === 'tombstoned')
  const status: PlcResolverCompositionStatus =
    resolvers.length === 0
      ? 'empty'
      : usable.length === 0
        ? 'unavailable'
        : allTombstoned && !hasFailures
          ? 'tombstoned'
          : distinctDocumentKeys.length > 1
            ? 'disagreement'
            : hasFailures
              ? 'partial'
              : 'agreement'

  const selectedClaim =
    status === 'agreement' || status === 'partial'
      ? usable.find(claim => claim.verification.status === 'verified')
      : undefined
  const declaredOperatorIds = [
    ...new Set(
      resolvers
        .map(resolver => resolver.operatorId)
        .filter(operatorId => Boolean(operatorId)),
    ),
  ]

  return {
    did,
    status,
    claims,
    selected: selectedClaim?.verification.document,
    distinctDocumentKeys,
    declaredOperatorIds,
    independence:
      declaredOperatorIds.length >= 2 ? 'declared-distinct' : 'not-established',
  }
}

export function auditLogUrl(endpoint: string, did: string): string {
  const base = endpoint.endsWith('/') ? endpoint : `${endpoint}/`
  return new URL(`${encodeURIComponent(did)}/log/audit`, base).toString()
}

function auditOperations(value: unknown): readonly unknown[] {
  if (!Array.isArray(value))
    throw new Error('PLC audit response is not an array')
  return value.map(entry => {
    if (isRecord(entry) && 'operation' in entry) return entry.operation
    return entry
  })
}

function documentKey(document: PlcDocumentData | undefined): string {
  if (!document) return 'missing-document'
  return stableValue({
    verificationMethods: document.verificationMethods,
    rotationKeys: document.rotationKeys,
    alsoKnownAs: document.alsoKnownAs,
    services: document.services,
  })
}

function stableValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`)
    .join(',')}}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function timeoutSignal(timeoutMs: number): AbortSignal | undefined {
  return typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined
}

function defaultFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, init)
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
