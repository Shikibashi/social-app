import {type DidString, isDidString} from '@atproto/lex'

import * as persisted from '#/state/persisted'
import {
  APPVIEW_PROXY_DID,
  APPVIEW_PROXY_FRAGMENT,
  IS_DEV,
  PUBLIC_APPVIEW_URL,
} from '#/env'

const configuredAppViewDisplayName = process.env
  .EXPO_PUBLIC_APPVIEW_DISPLAY_NAME as string | undefined

export type AppViewProvider = {
  id: string
  displayName: string
  serviceDid: DidString
  serviceFragment: string
  endpoint: string
  healthPath?: string
  builtin: boolean
  enabled: boolean
}

export function getDefaultAppViewDisplayName(
  endpoint: string,
  configuredName = configuredAppViewDisplayName,
): string {
  if (configuredName?.trim()) return configuredName.trim()

  try {
    const hostname = new URL(endpoint).hostname.toLowerCase()
    if (hostname === 'api.bsky.app' || hostname === 'public.api.bsky.app') {
      return 'Public AT Protocol AppView (external read provider)'
    }
  } catch {
    // Endpoint validation reports the malformed endpoint separately.
  }

  return 'Project AppView'
}

export const DEFAULT_APPVIEW_PROVIDER: AppViewProvider = {
  id: 'project-appview',
  displayName: getDefaultAppViewDisplayName(PUBLIC_APPVIEW_URL),
  serviceDid: APPVIEW_PROXY_DID,
  serviceFragment: APPVIEW_PROXY_FRAGMENT,
  endpoint: PUBLIC_APPVIEW_URL,
  healthPath: '/xrpc/_health',
  builtin: true,
  // Keep the named provider visible even when deployment configuration is
  // absent so failure is attributable to this service, never silently routed
  // to a stock AppView.
  enabled: true,
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
  return {
    ...provider,
    endpoint: endpoint.toString().replace(/\/$/, ''),
    healthPath,
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
          provider.id === configured.id ? configured : provider,
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

function configuredProjectProvider(): AppViewProvider | undefined {
  return DEFAULT_APPVIEW_PROVIDER
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
  return validated
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
