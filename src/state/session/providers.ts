import {isDidString, type DidString} from '@atproto/lex'

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
  serviceDid: 'did:web:api.bsky.app' as DidString,
  serviceFragment: 'bsky_appview',
  endpoint: APPVIEW_ENDPOINT,
  builtin: true,
  enabled: true,
}

export function validateAppViewProvider(provider: AppViewProvider): AppViewProvider {
  if (!provider.id || !provider.displayName || !isDidString(provider.serviceDid)) {
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
  if (!provider.serviceFragment) throw new Error('AppView provider service fragment is required')
  return {...provider, endpoint: endpoint.toString().replace(/\/$/, '')}
}

export function getAppViewProviders(): AppViewProvider[] {
  return (persisted.get('appviewProviders') ?? [DEFAULT_APPVIEW_PROVIDER]).filter(
    provider => provider.enabled,
  )
}

export function getSelectedAppViewProvider(did: string): AppViewProvider {
  const providers = getAppViewProviders()
  const selected = persisted.get('appviewSelections')?.[did]
  return providers.find(provider => provider.id === selected) ?? providers[0] ?? DEFAULT_APPVIEW_PROVIDER
}

export function getAppViewFallback(did: string, feature: string): AppViewProvider | undefined {
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
}

export async function registerAppViewProvider(provider: AppViewProvider): Promise<AppViewProvider> {
  const validated = validateAppViewProvider(provider)
  const providers = getAppViewProviders().filter(item => item.id !== provider.id)
  await persisted.write('appviewProviders', [...providers, validated])
  return validated
}
export async function selectAppViewProvider(did: string, providerId: string): Promise<AppViewProvider> {
  const provider = getAppViewProviders().find(item => item.id === providerId)
  if (!provider) throw new Error('Unknown AppView provider')
  validateAppViewProvider(provider)
  await persisted.write('appviewSelections', {
    ...(persisted.get('appviewSelections') ?? {}),
    [did]: provider.id,
  })
  return provider
}
