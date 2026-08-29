/**
 * Shared boundary for public-provider composition.
 *
 * This module deliberately knows nothing about AppView, PDS, or UI state. A
 * caller supplies a provider descriptor and a query function, and receives
 * every observation rather than an unlabelled winner. That keeps provider
 * selection, reconciliation, and authority separate from the response type.
 */
export const PROVIDER_SURFACES = [
  'identity-resolution',
  'profiles',
  'threads',
  'feeds',
  'search',
  'notifications',
  'labels',
  'media',
  'communities',
] as const

export type ProviderSurface = (typeof PROVIDER_SURFACES)[number]

export const PROVIDER_RECONCILIATION_MODES = [
  'require-agreement',
  'first-verified',
  'prefer-provider',
  'merge',
] as const

export type ProviderReconciliationMode =
  (typeof PROVIDER_RECONCILIATION_MODES)[number]

export type ProviderReconciliationPolicy = {
  mode: ProviderReconciliationMode
  preferredProviderId?: string
}

export type ProviderDescriptor = {
  id: string
  displayName: string
  endpoint: string
  /** Operator identity is an assertion, not cryptographic proof of independence. */
  operatorId?: string
}

export type ProviderQueryResult<T> = {
  value: T
  /** Public AppView responses are normally unverified; signed data may be verified. */
  verification?: 'verified' | 'unverified'
  retrievedAt?: string
  stale?: boolean
}

export type ProviderObservation<T> = {
  provider: ProviderDescriptor
  retrievedAt?: string
  value?: T
  error?: string
  status: 'ok' | 'unavailable' | 'invalid' | 'stale'
  verification: 'verified' | 'unverified' | 'invalid'
}

export type ProviderCompositionStatus =
  'agreement' | 'disagreement' | 'partial' | 'unavailable' | 'empty'

export type ProviderCompositionResult<T> = {
  surface: ProviderSurface
  policy: ProviderReconciliationPolicy
  status: ProviderCompositionStatus
  observations: ProviderObservation<T>[]
  /** Every value selected by the policy before any optional merge function. */
  selectedValues: T[]
  selected?: T
  selectedProviderIds: string[]
  distinctResultKeys: string[]
  /** Only counts explicitly declared operator IDs; it does not prove independence. */
  declaredOperatorIds: string[]
  independence: 'declared-distinct' | 'not-established'
}

export type ComposeProviderOptions<T> = {
  surface: ProviderSurface
  policy?: ProviderReconciliationPolicy
  now?: number
  maxAgeMs?: number
  allowStale?: boolean
  verify?: (
    value: T,
    provider: ProviderDescriptor,
  ) => boolean | Promise<boolean>
  claimKey?: (value: T) => string
  /**
   * Explicitly reconcile multiple values for `merge` mode. Without this
   * function the claims remain available in `selectedValues`, but no value is
   * silently promoted to the result.
   */
  merge?: (
    values: readonly T[],
    providers: readonly ProviderDescriptor[],
  ) => T | undefined | Promise<T | undefined>
}

export async function composeProviderResults<T>(
  providers: readonly ProviderDescriptor[],
  query: (provider: ProviderDescriptor) => Promise<ProviderQueryResult<T>>,
  options: ComposeProviderOptions<T>,
): Promise<ProviderCompositionResult<T>> {
  const policy = options.policy ?? {mode: 'require-agreement'}
  const observations: ProviderObservation<T>[] = await Promise.all(
    providers.map(async (provider): Promise<ProviderObservation<T>> => {
      try {
        const result = await query(provider)
        const retrievedAt = result.retrievedAt
        const stale =
          result.stale === true ||
          (retrievedAt !== undefined &&
            options.maxAgeMs !== undefined &&
            isOlderThan(
              retrievedAt,
              options.now ?? Date.now(),
              options.maxAgeMs,
            ))
        if (stale && !options.allowStale) {
          return {
            provider,
            retrievedAt,
            value: result.value,
            status: 'stale' as const,
            verification:
              result.verification === 'verified' ? 'verified' : 'unverified',
          }
        }
        if (options.verify && !(await options.verify(result.value, provider))) {
          return {
            provider,
            retrievedAt,
            value: result.value,
            status: 'invalid' as const,
            verification: 'invalid' as const,
          }
        }
        return {
          provider,
          retrievedAt,
          value: result.value,
          status: 'ok' as const,
          verification:
            result.verification === 'verified' ? 'verified' : 'unverified',
        }
      } catch (error) {
        return {
          provider,
          status: 'unavailable' as const,
          verification: 'invalid' as const,
          error: safeErrorMessage(error),
        }
      }
    }),
  )

  const usable = observations.filter(
    (observation): observation is ProviderObservation<T> & {value: T} =>
      observation.status === 'ok' && observation.value !== undefined,
  )
  const claimKey = options.claimKey ?? stableProviderValue
  const distinctResultKeys = [
    ...new Set(usable.map(item => claimKey(item.value))),
  ]
  const failed = observations.some(observation => observation.status !== 'ok')
  const status: ProviderCompositionStatus =
    usable.length === 0
      ? observations.length === 0
        ? 'empty'
        : 'unavailable'
      : distinctResultKeys.length > 1
        ? 'disagreement'
        : failed
          ? 'partial'
          : 'agreement'

  const selected = selectObservations(usable, observations, policy, status)
  const selectedValues = selected.map(item => item.value)
  const selectedValue =
    policy.mode === 'merge'
      ? options.merge
        ? await options.merge(
            selectedValues,
            selected.map(item => item.provider),
          )
        : undefined
      : selectedValues[0]
  const declaredOperatorIds = [
    ...new Set(
      providers
        .map(provider => provider.operatorId)
        .filter((operatorId): operatorId is string => Boolean(operatorId)),
    ),
  ]

  return {
    surface: options.surface,
    policy,
    status,
    observations,
    selectedValues,
    selected: selectedValue,
    selectedProviderIds: selected.map(item => item.provider.id),
    distinctResultKeys,
    declaredOperatorIds,
    independence:
      declaredOperatorIds.length >= 2 ? 'declared-distinct' : 'not-established',
  }
}

function selectObservations<T>(
  usable: Array<ProviderObservation<T> & {value: T}>,
  observations: ProviderObservation<T>[],
  policy: ProviderReconciliationPolicy,
  status: ProviderCompositionStatus,
): Array<ProviderObservation<T> & {value: T}> {
  if (policy.mode === 'merge') return usable
  if (policy.mode === 'prefer-provider') {
    return usable.filter(
      item => item.provider.id === policy.preferredProviderId,
    )
  }
  if (policy.mode === 'first-verified') {
    const verified = usable.find(item => item.verification === 'verified')
    return verified ? [verified] : usable.slice(0, 1)
  }
  if (
    status !== 'agreement' ||
    observations.some(item => item.status !== 'ok')
  ) {
    return []
  }
  return usable.slice(0, 1)
}

function isOlderThan(value: string, now: number, maxAgeMs: number): boolean {
  const timestamp = Date.parse(value)
  return !Number.isFinite(timestamp) || now - timestamp > maxAgeMs
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function stableProviderValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(item => stableProviderValue(item)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableProviderValue(item)}`)
  return `{${entries.join(',')}}`
}
