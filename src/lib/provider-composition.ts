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

/** Keep provider fan-out bounded even when a user registers many services. */
export const DEFAULT_MAX_CONCURRENT_PROVIDERS = 3

export type ProviderSurface = (typeof PROVIDER_SURFACES)[number]

export type ProviderSurfaceSupport = 'runtime-composed' | 'boundary-owned'

export type ProviderSurfaceDetails = {
  support: ProviderSurfaceSupport
  /** The authority boundary that owns this surface today. */
  authority: string
  /** Short text suitable for a service/workbench inspector. */
  description: string
}

/**
 * The registry is deliberately broader than the currently composed AppView
 * reads. Keeping the distinction here prevents a capability declaration from
 * being mistaken for a working runtime route.
 */
export const PROVIDER_SURFACE_DETAILS = {
  'identity-resolution': {
    support: 'runtime-composed',
    authority: 'Configured identity-capable resolver providers',
    description:
      'DID and handle claims are composed from the enabled identity providers.',
  },
  profiles: {
    support: 'runtime-composed',
    authority: 'Selected AppView providers',
    description:
      'Profile reads retain provider observations and use the local reconciliation policy.',
  },
  threads: {
    support: 'runtime-composed',
    authority: 'Selected AppView providers',
    description:
      'Post and thread reads retain provider observations and use the local reconciliation policy.',
  },
  feeds: {
    support: 'runtime-composed',
    authority: 'Selected feed/AppView providers',
    description:
      'Feed metadata and custom-feed reads retain provider provenance and outage state.',
  },
  search: {
    support: 'runtime-composed',
    authority: 'Selected AppView providers',
    description:
      'Search reads retain provider observations instead of silently choosing a winner.',
  },
  notifications: {
    support: 'runtime-composed',
    authority: 'Selected authenticated AppView providers',
    description:
      'Account-scoped notification reads require an explicit authenticated provider boundary.',
  },
  labels: {
    support: 'runtime-composed',
    authority: 'Selected labeler/AppView providers',
    description:
      'Label assertions remain attributable to their issuer and provider source.',
  },
  media: {
    support: 'boundary-owned',
    authority: 'Account PDS blob and media delivery boundary',
    description:
      'Uploads remain on the account PDS; blob previews/CDN delivery are not AppView-composed.',
  },
  communities: {
    support: 'boundary-owned',
    authority: 'Spaces transport and Radlib community control plane',
    description:
      'Membership and community records use the declared Spaces/Radlib transport, not AppView fan-out.',
  },
} as const satisfies Record<ProviderSurface, ProviderSurfaceDetails>

export const RUNTIME_COMPOSED_PROVIDER_SURFACES = PROVIDER_SURFACES.filter(
  surface => PROVIDER_SURFACE_DETAILS[surface].support === 'runtime-composed',
)

export const BOUNDARY_OWNED_PROVIDER_SURFACES = PROVIDER_SURFACES.filter(
  surface => PROVIDER_SURFACE_DETAILS[surface].support === 'boundary-owned',
)

export function isRuntimeComposedProviderSurface(
  surface: ProviderSurface,
): boolean {
  return PROVIDER_SURFACE_DETAILS[surface].support === 'runtime-composed'
}

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
  /** Optional service identity for UI provenance; it is not proof of control. */
  serviceDid?: string
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

export type ProviderQuery<T> = (
  provider: ProviderDescriptor,
  signal?: AbortSignal,
) => Promise<ProviderQueryResult<T>>

export type ProviderObservation<T> = {
  provider: ProviderDescriptor
  retrievedAt?: string
  value?: T
  error?: string
  /** A caller-provided transport classification; never inferred from identity. */
  retryable?: boolean
  status: 'ok' | 'unavailable' | 'invalid' | 'stale'
  verification: 'verified' | 'unverified' | 'invalid'
}

export type ProviderCompositionStatus =
  'agreement' | 'disagreement' | 'partial' | 'unavailable' | 'empty'

export type ProviderIndependence = 'declared-distinct' | 'not-established'

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
  independence: ProviderIndependence
}

/**
 * Raised when an explicit reconciliation policy refuses to promote the
 * available provider observations to a value. Keeping the complete result on
 * the error lets a UI explain which provider failed or disagreed without
 * silently substituting another service.
 */
export class ProviderCompositionError<T> extends Error {
  constructor(public readonly composition: ProviderCompositionResult<T>) {
    const failures = composition.observations
      .filter(observation => observation.error)
      .map(
        observation =>
          `${observation.provider.displayName}: ${observation.error}`,
      )
    const detail = failures.length ? `; ${failures.join('; ')}` : ''
    super(
      `No reconciled ${composition.surface} result; status=${composition.status}; providers=${composition.observations
        .map(observation => observation.provider.id)
        .join(',')}${detail}`,
    )
    this.name = 'ProviderCompositionError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
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
  /** Classify transport failures without making the generic seam HTTP-aware. */
  isRetryableError?: (error: unknown) => boolean
  /** Optional cancellation propagated to each provider query. */
  signal?: AbortSignal
  /** Maximum number of provider queries allowed to run at once. */
  maxConcurrentProviders?: number
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
  query: ProviderQuery<T>,
  options: ComposeProviderOptions<T>,
): Promise<ProviderCompositionResult<T>> {
  const policy = options.policy ?? {mode: 'require-agreement'}
  const observations = await mapWithConcurrency(
    providers,
    normalizeConcurrency(options.maxConcurrentProviders),
    async (provider): Promise<ProviderObservation<T>> => {
      throwIfAborted(options.signal)
      try {
        const result = await query(provider, options.signal)
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
        if (options.signal?.aborted) throw error
        return {
          provider,
          status: 'unavailable' as const,
          verification: 'invalid' as const,
          error: safeErrorMessage(error),
          retryable: options.isRetryableError?.(error),
        }
      }
    },
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

function normalizeConcurrency(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined || value < 1) {
    return DEFAULT_MAX_CONCURRENT_PROVIDERS
  }
  return Math.min(8, Math.floor(value))
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  maxConcurrent: number,
  map: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex++
      if (index >= values.length) return
      results[index] = await map(values[index])
    }
  }
  await Promise.all(
    Array.from({length: Math.min(maxConcurrent, values.length)}, () =>
      worker(),
    ),
  )
  return results
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('Provider read aborted')
  error.name = 'AbortError'
  throw error
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
