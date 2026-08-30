import {type Client} from '@atproto/lex'

import {
  type ComposeProviderOptions,
  composeProviderResults,
  DEFAULT_MAX_CONCURRENT_PROVIDERS,
  ProviderCompositionError,
  type ProviderCompositionResult,
  type ProviderDescriptor,
  type ProviderSurface,
} from '#/lib/provider-composition'
import {getPublicAppviewClient} from '#/state/session/clients'
import {
  type AppViewProvider,
  getAppViewProvidersForSurface,
  getAppViewReconciliationPolicy,
} from '#/state/session/providers'

export type AppViewProviderAccess = 'public' | 'account-scoped'

export type AppViewProviderQueryContext = {
  signal?: AbortSignal
  access: AppViewProviderAccess
}

export type AppViewProviderQuery<T> = (
  client: Client,
  provider: AppViewProvider,
  context: AppViewProviderQueryContext,
) => Promise<T>

export type AppViewProviderReadOptions<T> = Omit<
  ComposeProviderOptions<T>,
  'surface' | 'policy'
> & {
  /**
   * Public reads default to an unauthenticated client. Authenticated surfaces
   * such as notifications must pass an explicit factory; no session token is
   * ever fanned out merely because a provider is registered.
   */
  clientForProvider?: (provider: AppViewProvider) => Client | Promise<Client>
  /** Public reads are the default; session-bound fanout must opt in explicitly. */
  access?: AppViewProviderAccess
  /** Overall deadline for the composed provider read. */
  timeoutMs?: number
}

const DEFAULT_APPVIEW_READ_TIMEOUT_MS = 15_000

/**
 * Compose one AppView surface across the providers the user enabled for that
 * capability. The result retains every observation and does not silently
 * substitute a provider when the selected reconciliation policy rejects the
 * available evidence.
 */
export async function composeAppViewProviderRead<T>(
  surface: ProviderSurface,
  query: AppViewProviderQuery<T>,
  options: AppViewProviderReadOptions<T> = {},
): Promise<ProviderCompositionResult<T>> {
  if (options.clientForProvider && !options.access) {
    throw new Error(
      'Provider read access must be explicit when supplying an authenticated client factory',
    )
  }
  if (options.access === 'account-scoped' && !options.clientForProvider) {
    throw new Error(
      'Account-scoped provider reads require an explicit client factory',
    )
  }
  if (options.access === 'public' && options.clientForProvider) {
    throw new Error(
      'Public provider reads must use the anonymous client boundary',
    )
  }
  const access = options.access ?? 'public'
  const providers = getAppViewProvidersForSurface(surface)
  const clientForProvider =
    access === 'account-scoped'
      ? options.clientForProvider!
      : (provider: AppViewProvider) => getPublicAppviewClient(provider.endpoint)
  const {
    clientForProvider: _clientForProvider,
    access: _access,
    timeoutMs,
    ...compositionOptions
  } = options
  const requestSignal = createRequestSignal(
    options.signal,
    timeoutMs ?? DEFAULT_APPVIEW_READ_TIMEOUT_MS,
  )

  try {
    return await composeProviderResults(
      providers,
      async provider => ({
        value: await query(
          await clientForProvider(provider as AppViewProvider),
          provider as AppViewProvider,
          {signal: requestSignal.signal, access},
        ),
        verification: 'unverified',
        retrievedAt: new Date().toISOString(),
      }),
      {
        ...compositionOptions,
        maxConcurrentProviders:
          compositionOptions.maxConcurrentProviders ??
          DEFAULT_MAX_CONCURRENT_PROVIDERS,
        signal: requestSignal.signal,
        surface,
        policy: getAppViewReconciliationPolicy(surface),
      },
    )
  } finally {
    requestSignal.cleanup()
  }
}

/**
 * Convert a composed read into a value only at a boundary that explicitly
 * accepts the local reconciliation policy. Callers that need to show provider
 * disagreement should keep the full result instead.
 */
export function requireComposedProviderValue<T>(
  result: ProviderCompositionResult<T>,
): T {
  if (result.selected !== undefined) return result.selected
  throw new ProviderCompositionError(result)
}

export function providerDescriptor(
  provider: AppViewProvider,
): ProviderDescriptor {
  return {
    id: provider.id,
    displayName: provider.displayName,
    endpoint: provider.endpoint,
    serviceDid: provider.serviceDid,
    operatorId: provider.operatorId,
  }
}

function createRequestSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): {signal: AbortSignal; cleanup: () => void} {
  const controller = new AbortController()
  const onParentAbort = () => controller.abort()
  if (parent?.aborted) {
    controller.abort()
  } else {
    parent?.addEventListener('abort', onParentAbort, {once: true})
  }
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_APPVIEW_READ_TIMEOUT_MS,
  )
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      parent?.removeEventListener('abort', onParentAbort)
    },
  }
}
