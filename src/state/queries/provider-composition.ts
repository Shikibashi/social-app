import {type Client} from '@atproto/lex'

import {
  type ComposeProviderOptions,
  composeProviderResults,
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

export type AppViewProviderQuery<T> = (
  client: Client,
  provider: AppViewProvider,
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
}

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
  const providers = getAppViewProvidersForSurface(surface)
  const clientForProvider =
    options.clientForProvider ??
    ((provider: AppViewProvider) => getPublicAppviewClient(provider.endpoint))
  const {clientForProvider: _clientForProvider, ...compositionOptions} = options

  return composeProviderResults(
    providers,
    async provider => ({
      value: await query(
        await clientForProvider(provider as AppViewProvider),
        provider as AppViewProvider,
      ),
      verification: 'unverified',
      retrievedAt: new Date().toISOString(),
    }),
    {
      ...compositionOptions,
      surface,
      policy: getAppViewReconciliationPolicy(surface),
    },
  )
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
  throw new Error(
    `No reconciled ${result.surface} result; status=${result.status}; providers=${result.observations
      .map(observation => observation.provider.id)
      .join(',')}`,
  )
}

export function providerDescriptor(
  provider: AppViewProvider,
): ProviderDescriptor {
  return {
    id: provider.id,
    displayName: provider.displayName,
    endpoint: provider.endpoint,
    operatorId: provider.operatorId,
  }
}
