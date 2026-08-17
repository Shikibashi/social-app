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
}

export const DEFAULT_APPVIEW_PROVIDER: AppViewProvider = {
  id: 'bluesky-appview',
  displayName: 'Bluesky AppView',
  serviceDid: 'did:web:api.bsky.app' as DidString,
  serviceFragment: 'bsky_appview',
  endpoint: APPVIEW_ENDPOINT,
  builtin: true,
}

export function validateAppViewProvider(provider: AppViewProvider): AppViewProvider {
  if (!provider.id || !provider.displayName || !isDidString(provider.serviceDid)) {
    throw new Error('AppView provider identity is invalid')
  }
  if (!provider.serviceFragment || !/^https:\/\//i.test(provider.endpoint)) {
    throw new Error('AppView provider endpoint must use HTTPS')
  }
  return provider
}

export function getAppViewProviders(): AppViewProvider[] {
  return persisted.get('appviewProviders')
}

export function getSelectedAppViewProvider(did: string): AppViewProvider {
  const providers = getAppViewProviders()
  const selected = persisted.get('appviewSelections')[did]
  return providers.find(provider => provider.id === selected) ?? providers[0] ?? DEFAULT_APPVIEW_PROVIDER
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
    ...persisted.get('appviewSelections'),
    [did]: provider.id,
  })
  return provider
}
