import {type DidString, isDidString} from '@atproto/lex'

import {getDefaultAppViewDisplayName} from '#/lib/appview-provider-label'
import {
  DEFAULT_IDENTITY_RESOLUTION_POLICY,
  type IdentityResolutionPolicy,
} from '#/lib/identity-runtime'
import {
  isRuntimeComposedProviderSurface,
  PROVIDER_RECONCILIATION_MODES,
  PROVIDER_SURFACES,
  type ProviderReconciliationMode,
  type ProviderReconciliationPolicy,
  type ProviderSurface,
} from '#/lib/provider-composition'
import * as persisted from '#/state/persisted'
import {
  APPVIEW_PROXY_DID,
  APPVIEW_PROXY_FRAGMENT,
  IS_DEV,
  PUBLIC_APPVIEW_URL,
} from '#/env'
import {emitAppViewProviderPolicyChanged} from '../events'

export {getDefaultAppViewDisplayName} from '#/lib/appview-provider-label'

const configuredAppViewDisplayName = process.env
  .EXPO_PUBLIC_APPVIEW_DISPLAY_NAME as string | undefined
const configuredAppViewOperatorId =
  (process.env.EXPO_PUBLIC_APPVIEW_OPERATOR_ID as string | undefined)?.trim() ||
  undefined

export const APPVIEW_PROVIDER_CAPABILITIES = [
  'public-read',
  ...PROVIDER_SURFACES,
] as const
export type AppViewProviderCapability =
  (typeof APPVIEW_PROVIDER_CAPABILITIES)[number]

export const APPVIEW_POLICY_FORMAT = 'org.radical-liberal.provider-policy'
export const APPVIEW_POLICY_VERSION = 1 as const

export type PortableAppViewPolicy = {
  format: typeof APPVIEW_POLICY_FORMAT
  version: typeof APPVIEW_POLICY_VERSION
  exportedAt: string
  /** Endpoint identity is intentionally omitted; imports cannot add a host. */
  providers: Array<{
    id: string
    enabled: boolean
    capabilities: AppViewProviderCapability[]
    operatorId?: string
  }>
  selections: Record<string, string>
  fallbacks: Record<string, Record<string, string>>
  reconciliationPolicies: Partial<
    Record<ProviderSurface, ProviderReconciliationPolicy>
  >
  identityResolutionPolicy: IdentityResolutionPolicy
}

export type AppViewProvider = {
  id: string
  displayName: string
  serviceDid: DidString
  serviceFragment: string
  endpoint: string
  healthPath?: string
  builtin: boolean
  enabled: boolean
  /** Declared operator identity; the client cannot prove control from this field. */
  operatorId?: string
  /**
   * Capabilities are declarations about the endpoint, not grants to it. The
   * legacy shape is accepted without this field and normalized to public-read
   * only; identity resolution must be an explicit opt-in.
   */
  capabilities?: AppViewProviderCapability[]
}

const ANONYMOUS_PUBLIC_READ_SURFACES = [
  'profiles',
  'threads',
  'feeds',
  'search',
  'labels',
  'media',
] as const satisfies readonly ProviderSurface[]

export const DEFAULT_APPVIEW_PROVIDER: AppViewProvider = {
  id: 'project-appview',
  displayName: getDefaultAppViewDisplayName(
    PUBLIC_APPVIEW_URL,
    configuredAppViewDisplayName,
  ),
  serviceDid: APPVIEW_PROXY_DID,
  serviceFragment: APPVIEW_PROXY_FRAGMENT,
  endpoint: PUBLIC_APPVIEW_URL,
  healthPath: '/xrpc/_health',
  builtin: true,
  // An operator ID is an explicit external assertion. Do not synthesize one
  // for the bundled/default endpoint or imply that the client operates it.
  operatorId: configuredAppViewOperatorId,
  // Keep the named provider visible even when deployment configuration is
  // absent so failure is attributable to this service, never silently routed
  // to a stock AppView.
  enabled: true,
  capabilities: [...APPVIEW_PROVIDER_CAPABILITIES],
}

export type AppViewProviderValidationOptions = {
  /** Development-only escape hatch for a deliberately configured local node. */
  allowInsecureLocal?: boolean
}

export function validateAppViewProvider(
  provider: AppViewProvider,
  options: AppViewProviderValidationOptions = {},
): AppViewProvider {
  if (
    !provider.id ||
    !provider.displayName ||
    !isDidString(provider.serviceDid)
  ) {
    throw new Error('AppView provider identity is invalid')
  }
  let endpoint: URL
  try {
    endpoint = new URL(provider.endpoint)
  } catch {
    throw new Error('AppView provider endpoint is invalid')
  }
  const hostname = endpoint.hostname.toLowerCase()
  const localHostname = isLocalHostname(hostname)
  const allowInsecureLocal =
    options.allowInsecureLocal ??
    (IS_DEV && process.env.EXPO_PUBLIC_ALLOW_INSECURE_LOCAL_APPVIEW === '1')
  if (
    ((!allowInsecureLocal || !localHostname) &&
      endpoint.protocol !== 'https:') ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    (!allowInsecureLocal && localHostname)
  ) {
    throw new Error('AppView provider endpoint is not a safe HTTPS origin')
  }
  if (!provider.serviceFragment)
    throw new Error('AppView provider service fragment is required')
  const healthPath = provider.healthPath ?? '/xrpc/_health'
  if (!/^\/xrpc\/[A-Za-z0-9._-]+$/.test(healthPath))
    throw new Error('AppView provider health path is invalid')
  const capabilities = provider.capabilities?.length
    ? [...new Set(provider.capabilities)]
    : (['public-read'] satisfies AppViewProviderCapability[])
  return {
    ...provider,
    endpoint: endpoint.toString().replace(/\/$/, ''),
    healthPath,
    capabilities,
  }
}

export function getAppViewProviders(): AppViewProvider[] {
  const configured = configuredProjectProvider()
  const persistedProviders = (
    persisted.get('appviewProviders') ?? [DEFAULT_APPVIEW_PROVIDER]
  ).filter(provider => provider.id !== 'bluesky-appview')
  const candidates = configured
    ? persistedProviders.some(provider => provider.id === configured.id)
      ? persistedProviders.map(provider =>
          provider.id === configured.id
            ? {
                ...configured,
                capabilities: provider.capabilities,
                operatorId: normalizeConfiguredOperatorId(
                  provider.operatorId,
                  configured.operatorId,
                ),
              }
            : provider,
        )
      : [...persistedProviders, configured]
    : persistedProviders

  return candidates
    .map(provider => {
      try {
        return validateAppViewProvider(provider)
      } catch {
        return undefined
      }
    })
    .filter((provider): provider is AppViewProvider =>
      Boolean(provider?.enabled),
    )
}

/**
 * Return providers that explicitly participate in one read capability. A
 * provider may be registered for public reads without being trusted for
 * identity resolution, and future capabilities can be added without changing
 * the account-host client or creating another provider registry.
 */
export function getAppViewProvidersForCapability(
  capability: AppViewProviderCapability,
): AppViewProvider[] {
  return getAppViewProviders().filter(
    provider => provider.capabilities?.includes(capability) ?? false,
  )
}

/**
 * Resolve a public handle for navigation and public record links.
 *
 * Explicit identity-capable providers remain the source for identity claims.
 * When none are enabled, an enabled public-read provider may still perform
 * this narrow anonymous lookup so a public profile link does not fail closed
 * merely because the user has not opted a provider into broader identity
 * reconciliation. No session credential is sent on this path.
 */
export function getAppViewProvidersForHandleResolution(): AppViewProvider[] {
  const identityProviders = getAppViewProvidersForCapability(
    'identity-resolution',
  )
  if (identityProviders.length > 0) return identityProviders
  return getAnonymousPublicReadProviders()
}

/**
 * Return providers for a read surface without widening authenticated or
 * private capabilities. Optional public surfaces inherit the anonymous
 * public-read declaration when no surface-specific provider was enabled.
 */
export function getAppViewProvidersForSurface(
  surface: ProviderSurface,
): AppViewProvider[] {
  // Media and Communities have different service contracts today. Do not let
  // a broad registry declaration make the default AppView look like their
  // runtime authority before those existing boundaries are wired explicitly.
  if (!isRuntimeComposedProviderSurface(surface)) return []
  const providers = getAppViewProvidersForCapability(surface)
  if (providers.length > 0 || !isAnonymousPublicReadSurface(surface)) {
    return providers
  }
  return getAnonymousPublicReadProviders()
}

function getAnonymousPublicReadProviders(): AppViewProvider[] {
  return getAppViewProviders().filter(
    provider => provider.capabilities?.includes('public-read') ?? false,
  )
}

function isAnonymousPublicReadSurface(
  surface: ProviderSurface,
): surface is (typeof ANONYMOUS_PUBLIC_READ_SURFACES)[number] {
  return (ANONYMOUS_PUBLIC_READ_SURFACES as readonly string[]).includes(surface)
}

export function getAppViewReconciliationPolicy(
  surface: ProviderSurface,
): ProviderReconciliationPolicy {
  if (surface === 'identity-resolution') {
    const identityPolicy = getIdentityResolutionPolicy()
    return identityPolicy.mode === 'prefer-provider'
      ? identityPolicy
      : {mode: identityPolicy.mode}
  }
  const policy = persisted.get('appviewReconciliationPolicies')?.[surface]
  if (!policy || !PROVIDER_RECONCILIATION_MODES.includes(policy.mode)) {
    return {mode: 'require-agreement'}
  }
  if (policy.mode === 'prefer-provider' && !policy.preferredProviderId) {
    return {mode: 'require-agreement'}
  }
  return policy
}

export async function setAppViewReconciliationPolicy(
  surface: ProviderSurface,
  policy: ProviderReconciliationPolicy,
): Promise<void> {
  if (
    policy.mode === 'prefer-provider' &&
    !getAppViewProvidersForSurface(surface).some(
      provider => provider.id === policy.preferredProviderId,
    )
  ) {
    throw new Error('Preferred provider is not registered for this surface')
  }
  if (surface === 'identity-resolution') {
    if (policy.mode === 'merge') {
      throw new Error('Identity resolution does not support merge policy')
    }
    await setIdentityResolutionPolicy(
      policy.mode === 'prefer-provider'
        ? {
            mode: 'prefer-provider',
            preferredProviderId: policy.preferredProviderId!,
          }
        : {mode: policy.mode},
    )
    return
  }
  await persisted.write('appviewReconciliationPolicies', {
    ...(persisted.get('appviewReconciliationPolicies') ?? {}),
    [surface]: policy,
  })
  emitAppViewProviderPolicyChanged()
}

export function getIdentityResolutionPolicy(): IdentityResolutionPolicy {
  const policy = persisted.get('identityResolutionPolicy')
  if (!policy) return DEFAULT_IDENTITY_RESOLUTION_POLICY
  if (policy.mode === 'first-verified') return {mode: 'first-verified'}
  if (
    policy.mode === 'prefer-provider' &&
    policy.preferredProviderId &&
    getAppViewProvidersForCapability('identity-resolution').some(
      provider => provider.id === policy.preferredProviderId,
    )
  ) {
    return {
      mode: 'prefer-provider',
      preferredProviderId: policy.preferredProviderId,
    }
  }
  return DEFAULT_IDENTITY_RESOLUTION_POLICY
}

export async function setIdentityResolutionPolicy(
  policy: IdentityResolutionPolicy,
): Promise<void> {
  if (
    policy.mode === 'prefer-provider' &&
    !getAppViewProvidersForCapability('identity-resolution').some(
      provider => provider.id === policy.preferredProviderId,
    )
  ) {
    throw new Error('Preferred identity resolver is not registered')
  }
  await persisted.write('identityResolutionPolicy', policy)
  emitAppViewProviderPolicyChanged()
}

function configuredProjectProvider(): AppViewProvider | undefined {
  return DEFAULT_APPVIEW_PROVIDER
}

function normalizeConfiguredOperatorId(
  persistedOperatorId: string | undefined,
  configuredOperatorId: string | undefined,
): string | undefined {
  if (configuredOperatorId) return configuredOperatorId
  return persistedOperatorId === 'project-appview-operator'
    ? undefined
    : persistedOperatorId
}

export function getSelectedAppViewProvider(did: string): AppViewProvider {
  const providers = getAppViewProviders()
  const selected = persisted.get('appviewSelections')?.[did]
  const provider =
    providers.find(provider => provider.id === selected) ?? providers[0]
  if (!provider) {
    throw new Error(
      'No AppView provider is configured; set EXPO_PUBLIC_PUBLIC_APPVIEW_URL and EXPO_PUBLIC_APPVIEW_SERVICE_DID',
    )
  }
  return provider
}

export function getAppViewFallback(
  did: string,
  feature: string,
): AppViewProvider | undefined {
  const providerId = persisted.get('appviewFallbacks')?.[did]?.[feature]
  return getAppViewProviders().find(provider => provider.id === providerId)
}

export async function setAppViewFallback(
  did: string,
  feature: string,
  providerId: string,
): Promise<void> {
  const provider = getAppViewProviders().find(item => item.id === providerId)
  if (!provider) throw new Error('Unknown AppView provider')
  await persisted.write('appviewFallbacks', {
    ...(persisted.get('appviewFallbacks') ?? {}),
    [did]: {
      ...(persisted.get('appviewFallbacks')?.[did] ?? {}),
      [feature]: provider.id,
    },
  })
  // A remembered fallback is an explicit provider choice, not a hidden
  // request-time override. Persist the same choice so the settings screen,
  // session bundle, and request client all identify the same provider.
  if (feature === 'appview-selection') {
    await persisted.write('appviewSelections', {
      ...(persisted.get('appviewSelections') ?? {}),
      [did]: provider.id,
    })
  }
}

export async function registerAppViewProvider(
  provider: AppViewProvider,
): Promise<AppViewProvider> {
  const validated = validateAppViewProvider(provider)
  const providers = getAppViewProviders().filter(
    item => item.id !== provider.id,
  )
  await persisted.write('appviewProviders', [...providers, validated])
  emitAppViewProviderPolicyChanged()
  return validated
}

/**
 * Change only the local capability declaration for a registered provider.
 * Endpoint identity remains validated from the provider record, while
 * capability grants stay user-revocable and do not require a new provider
 * registry or a new network authority.
 */
export async function setAppViewProviderCapabilities(
  providerId: string,
  capabilities: AppViewProviderCapability[],
): Promise<AppViewProvider> {
  const provider = getAppViewProviders().find(item => item.id === providerId)
  if (!provider) throw new Error('Unknown AppView provider')
  const updated = validateAppViewProvider({
    ...provider,
    capabilities: [...new Set(capabilities)],
  })
  await persisted.write(
    'appviewProviders',
    getAppViewProviders().map(item =>
      item.id === providerId ? updated : item,
    ),
  )

  const policy = getIdentityResolutionPolicy()
  if (
    policy.mode === 'prefer-provider' &&
    policy.preferredProviderId === providerId &&
    !updated.capabilities?.includes('identity-resolution')
  ) {
    await persisted.write('identityResolutionPolicy', {
      mode: 'require-agreement',
    })
  }
  emitAppViewProviderPolicyChanged()
  return updated
}

/**
 * Export only local provider choices and declarations. Endpoints, tokens,
 * service-auth material, and other authority-bearing connection details never
 * cross this boundary, so importing this file cannot register a new host.
 */
export function exportAppViewPolicy(): string {
  const providers = (
    persisted.get('appviewProviders') ?? [DEFAULT_APPVIEW_PROVIDER]
  ).flatMap(provider => {
    try {
      const validated = validateAppViewProvider(provider)
      return [
        {
          id: validated.id,
          enabled: validated.enabled,
          capabilities: validated.capabilities ?? ['public-read'],
          ...(validated.operatorId ? {operatorId: validated.operatorId} : {}),
        },
      ]
    } catch {
      return []
    }
  })
  const output: PortableAppViewPolicy = {
    format: APPVIEW_POLICY_FORMAT,
    version: APPVIEW_POLICY_VERSION,
    exportedAt: new Date().toISOString(),
    providers,
    selections: persisted.get('appviewSelections') ?? {},
    fallbacks: persisted.get('appviewFallbacks') ?? {},
    reconciliationPolicies:
      persisted.get('appviewReconciliationPolicies') ?? {},
    identityResolutionPolicy: getIdentityResolutionPolicy(),
  }
  return JSON.stringify(output)
}

/**
 * Import a provider policy onto already registered providers. Provider IDs are
 * the portability handle; endpoint registration remains an explicit local
 * action and is never performed from imported JSON.
 */
export async function importAppViewPolicy(serialized: string): Promise<void> {
  const parsed = parsePortableAppViewPolicy(serialized)
  const registered = (
    persisted.get('appviewProviders') ?? [DEFAULT_APPVIEW_PROVIDER]
  ).map(provider => validateAppViewProvider(provider))
  const knownIds = new Set(registered.map(provider => provider.id))
  const importedById = new Map(
    parsed.providers
      .filter(provider => knownIds.has(provider.id))
      .map(provider => [provider.id, provider]),
  )
  const nextProviders = registered.map(provider => {
    const imported = importedById.get(provider.id)
    return imported
      ? validateAppViewProvider({
          ...provider,
          enabled: imported.enabled,
          capabilities: imported.capabilities,
          operatorId: imported.operatorId ?? provider.operatorId,
        })
      : provider
  })
  const enabledIds = new Set(
    nextProviders
      .filter(provider => provider.enabled)
      .map(provider => provider.id),
  )
  const selections = filterProviderSelections(parsed.selections, enabledIds)
  const fallbacks = filterProviderFallbacks(parsed.fallbacks, enabledIds)
  const reconciliationPolicies = filterReconciliationPolicies(
    parsed.reconciliationPolicies,
    enabledIds,
    nextProviders,
  )
  const identityResolutionPolicy = filterIdentityPolicy(
    parsed.identityResolutionPolicy,
    enabledIds,
    nextProviders,
  )

  await persisted.write('appviewProviders', nextProviders)
  await persisted.write('appviewSelections', selections)
  await persisted.write('appviewFallbacks', fallbacks)
  await persisted.write('appviewReconciliationPolicies', reconciliationPolicies)
  await persisted.write('identityResolutionPolicy', identityResolutionPolicy)
  emitAppViewProviderPolicyChanged()
}

/** Revoke all optional provider participation without deleting registrations. */
export async function resetAppViewPolicy(): Promise<void> {
  const registered = (
    persisted.get('appviewProviders') ?? [DEFAULT_APPVIEW_PROVIDER]
  ).map(provider =>
    validateAppViewProvider({...provider, capabilities: ['public-read']}),
  )
  await persisted.write('appviewProviders', registered)
  await persisted.write('appviewSelections', {})
  await persisted.write('appviewFallbacks', {})
  await persisted.write('appviewReconciliationPolicies', {})
  await persisted.write('identityResolutionPolicy', {
    mode: 'require-agreement',
  })
  emitAppViewProviderPolicyChanged()
}

function parsePortableAppViewPolicy(serialized: string): PortableAppViewPolicy {
  if (
    typeof serialized !== 'string' ||
    new TextEncoder().encode(serialized).byteLength > 250_000
  ) {
    throw new Error('Provider policy import exceeds the maximum size')
  }
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('Provider policy import is not valid JSON')
  }
  if (!isRecord(value)) throw new Error('Provider policy import is invalid')
  if (
    value.format !== APPVIEW_POLICY_FORMAT ||
    value.version !== APPVIEW_POLICY_VERSION ||
    !Array.isArray(value.providers) ||
    !isStringRecord(value.selections) ||
    !isNestedStringRecord(value.fallbacks) ||
    !isRecord(value.reconciliationPolicies)
  ) {
    throw new Error('Provider policy import shape is invalid')
  }

  const providers = value.providers.map(parsePortableProvider)
  const reconciliationPolicies: Partial<
    Record<ProviderSurface, ProviderReconciliationPolicy>
  > = {}
  for (const [surface, policy] of Object.entries(
    value.reconciliationPolicies,
  )) {
    if (!isProviderSurface(surface)) continue
    reconciliationPolicies[surface] = parseReconciliationPolicy(policy)
  }
  const identityResolutionPolicy = parseIdentityPolicy(
    value.identityResolutionPolicy,
  )
  return {
    format: APPVIEW_POLICY_FORMAT,
    version: APPVIEW_POLICY_VERSION,
    exportedAt:
      typeof value.exportedAt === 'string'
        ? value.exportedAt
        : new Date().toISOString(),
    providers,
    selections: value.selections,
    fallbacks: value.fallbacks,
    reconciliationPolicies,
    identityResolutionPolicy,
  }
}

function parsePortableProvider(
  value: unknown,
): PortableAppViewPolicy['providers'][number] {
  if (!isRecord(value)) throw new Error('Provider policy entry is invalid')
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    value.id.length > 256 ||
    typeof value.enabled !== 'boolean' ||
    !Array.isArray(value.capabilities) ||
    value.capabilities.length > APPVIEW_PROVIDER_CAPABILITIES.length ||
    value.capabilities.some(
      capability => !isAppViewProviderCapability(capability),
    )
  ) {
    throw new Error('Provider policy capability entry is invalid')
  }
  if (
    value.operatorId !== undefined &&
    (typeof value.operatorId !== 'string' ||
      !value.operatorId ||
      value.operatorId.length > 256)
  ) {
    throw new Error('Provider policy operator declaration is invalid')
  }
  return {
    id: value.id,
    enabled: value.enabled,
    capabilities: [
      ...new Set(value.capabilities),
    ] as AppViewProviderCapability[],
    operatorId: value.operatorId,
  }
}

function parseReconciliationPolicy(
  value: unknown,
): ProviderReconciliationPolicy {
  if (!isRecord(value) || !isProviderReconciliationMode(value.mode)) {
    throw new Error('Provider reconciliation policy is invalid')
  }
  if (
    value.preferredProviderId !== undefined &&
    (typeof value.preferredProviderId !== 'string' ||
      !value.preferredProviderId ||
      value.preferredProviderId.length > 256)
  ) {
    throw new Error('Provider reconciliation preference is invalid')
  }
  if (value.mode === 'prefer-provider' && !value.preferredProviderId) {
    throw new Error('Provider reconciliation preference is missing')
  }
  return {
    mode: value.mode,
    ...(value.preferredProviderId
      ? {preferredProviderId: value.preferredProviderId}
      : {}),
  }
}

function parseIdentityPolicy(value: unknown): IdentityResolutionPolicy {
  if (!isRecord(value)) throw new Error('Identity resolution policy is invalid')
  if (value.mode === 'require-agreement' || value.mode === 'first-verified') {
    return {mode: value.mode}
  }
  if (
    value.mode === 'prefer-provider' &&
    typeof value.preferredProviderId === 'string' &&
    value.preferredProviderId.length > 0 &&
    value.preferredProviderId.length <= 256
  ) {
    return {
      mode: 'prefer-provider',
      preferredProviderId: value.preferredProviderId,
    }
  }
  throw new Error('Identity resolution policy is invalid')
}

function filterProviderSelections(
  selections: Record<string, string>,
  enabledIds: Set<string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(selections).filter(
      ([did, providerId]) => did.length <= 256 && enabledIds.has(providerId),
    ),
  )
}

function filterProviderFallbacks(
  fallbacks: Record<string, Record<string, string>>,
  enabledIds: Set<string>,
): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(fallbacks)
      .filter(([did]) => did.length <= 256)
      .map(([did, entries]) => [
        did,
        Object.fromEntries(
          Object.entries(entries).filter(([, providerId]) =>
            enabledIds.has(providerId),
          ),
        ),
      ])
      .filter(([, entries]) => Object.keys(entries).length > 0),
  )
}

function filterReconciliationPolicies(
  policies: Partial<Record<ProviderSurface, ProviderReconciliationPolicy>>,
  enabledIds: Set<string>,
  providers: AppViewProvider[],
): Partial<Record<ProviderSurface, ProviderReconciliationPolicy>> {
  return Object.fromEntries(
    Object.entries(policies)
      .filter(([surface]) => isProviderSurface(surface))
      .map(([surface, policy]) => {
        if (
          policy.mode === 'prefer-provider' &&
          (!policy.preferredProviderId ||
            !enabledIds.has(policy.preferredProviderId) ||
            !providers.some(
              provider =>
                provider.id === policy.preferredProviderId &&
                provider.capabilities?.includes(surface as ProviderSurface),
            ))
        ) {
          return [surface, {mode: 'require-agreement' as const}]
        }
        return [surface, policy]
      }),
  )
}

function filterIdentityPolicy(
  policy: IdentityResolutionPolicy,
  enabledIds: Set<string>,
  providers: AppViewProvider[],
): IdentityResolutionPolicy {
  if (
    policy.mode === 'prefer-provider' &&
    policy.preferredProviderId &&
    enabledIds.has(policy.preferredProviderId) &&
    providers.some(
      provider =>
        provider.id === policy.preferredProviderId &&
        provider.capabilities?.includes('identity-resolution'),
    )
  ) {
    return policy
  }
  return policy.mode === 'prefer-provider'
    ? {mode: 'require-agreement'}
    : policy
}

function isAppViewProviderCapability(
  value: unknown,
): value is AppViewProviderCapability {
  return (
    typeof value === 'string' &&
    (APPVIEW_PROVIDER_CAPABILITIES as readonly string[]).includes(value)
  )
}

function isProviderReconciliationMode(
  value: unknown,
): value is ProviderReconciliationMode {
  return (
    typeof value === 'string' &&
    (PROVIDER_RECONCILIATION_MODES as readonly string[]).includes(value)
  )
}

function isProviderSurface(value: string): value is ProviderSurface {
  return (PROVIDER_SURFACES as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every(item => typeof item === 'string')
  )
}

function isNestedStringRecord(
  value: unknown,
): value is Record<string, Record<string, string>> {
  return (
    isRecord(value) && Object.values(value).every(item => isStringRecord(item))
  )
}

export async function selectAppViewProvider(
  did: string,
  providerId: string,
): Promise<AppViewProvider> {
  const provider = getAppViewProviders().find(item => item.id === providerId)
  if (!provider) throw new Error('Unknown AppView provider')
  validateAppViewProvider(provider)
  await persisted.write('appviewSelections', {
    ...(persisted.get('appviewSelections') ?? {}),
    [did]: provider.id,
  })
  const fallbacks = persisted.get('appviewFallbacks')
  if (fallbacks?.[did]?.['appview-selection']) {
    const nextDidFallbacks = {...fallbacks[did]}
    delete nextDidFallbacks['appview-selection']
    await persisted.write('appviewFallbacks', {
      ...fallbacks,
      [did]: nextDidFallbacks,
    })
  }
  return provider
}

export async function probeAppViewProvider(
  provider: AppViewProvider,
): Promise<void> {
  const healthUrl = new URL(
    validateAppViewProvider(provider).healthPath ?? '/xrpc/_health',
    validateAppViewProvider(provider).endpoint,
  )
  let response: Response
  try {
    response = await fetch(healthUrl, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw new Error(`AppView provider ${provider.displayName} is unavailable`)
  }
  if (!response.ok) {
    throw new Error(
      `AppView provider ${provider.displayName} is unavailable (HTTP ${response.status})`,
    )
  }
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  )
}
