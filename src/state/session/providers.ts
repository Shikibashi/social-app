import {type DidString, isDidString} from '@atproto/lex'

import {APPVIEW_ENDPOINT} from '#/lib/constants'
import * as persisted from '#/state/persisted'

export type AppViewProvider = {
  id: string
  displayName: string
  serviceDid: DidString
  serviceFragment: string
  endpoint: string
  builtin: boolean
  enabled: boolean
}

export const DEFAULT_APPVIEW_PROVIDER: AppViewProvider = {
  id: 'bluesky-appview',
  displayName: 'Bluesky AppView',
  serviceDid: 'did:web:api.bsky.app',
  serviceFragment: 'bsky_appview',
  endpoint: APPVIEW_ENDPOINT,
  builtin: true,
  enabled: true,
}

export function validateAppViewProvider(
  provider: AppViewProvider,
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
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw new Error('AppView provider endpoint is not a safe HTTPS origin')
  }
  if (!provider.serviceFragment)
    throw new Error('AppView provider service fragment is required')
  return {...provider, endpoint: endpoint.toString().replace(/\/$/, '')}
}

export function getAppViewProviders(): AppViewProvider[] {
  return (persisted.get('appviewProviders') ?? [DEFAULT_APPVIEW_PROVIDER])
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

export function getSelectedAppViewProvider(did: string): AppViewProvider {
  const providers = getAppViewProviders()
  const selected = persisted.get('appviewSelections')?.[did]
  return (
    providers.find(provider => provider.id === selected) ??
    providers[0] ??
    DEFAULT_APPVIEW_PROVIDER
  )
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
    '/xrpc/_health',
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
