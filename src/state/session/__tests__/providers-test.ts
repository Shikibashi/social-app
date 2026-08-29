import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

const DID = 'did:plc:provider-test'
const mockPersistedState: Record<string, unknown> = {
  appviewProviders: undefined,
  appviewSelections: {},
  appviewFallbacks: {},
  appviewReconciliationPolicies: {},
  identityResolutionPolicy: undefined,
}

jest.mock('#/state/persisted', () => ({
  get: (key: string) => mockPersistedState[key],
  write: (key: string, value: unknown) => {
    mockPersistedState[key] = value
    return Promise.resolve()
  },
}))

import {
  DEFAULT_APPVIEW_PROVIDER,
  exportAppViewPolicy,
  getAppViewProviders,
  getAppViewProvidersForCapability,
  getAppViewProvidersForHandleResolution,
  getAppViewProvidersForSurface,
  getAppViewReconciliationPolicy,
  getDefaultAppViewDisplayName,
  getIdentityResolutionPolicy,
  getSelectedAppViewProvider,
  importAppViewPolicy,
  probeAppViewProvider,
  registerAppViewProvider,
  resetAppViewPolicy,
  selectAppViewProvider,
  setAppViewProviderCapabilities,
  setAppViewReconciliationPolicy,
  setIdentityResolutionPolicy,
  validateAppViewProvider,
} from '../providers'

describe('AppView provider validation and health probing', () => {
  beforeEach(() => {
    mockPersistedState.appviewProviders = undefined
    mockPersistedState.appviewSelections = {}
    mockPersistedState.appviewFallbacks = {}
    mockPersistedState.appviewReconciliationPolicies = {}
    mockPersistedState.identityResolutionPolicy = undefined
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('labels the external public AppView without borrowing its product name', () => {
    expect(getDefaultAppViewDisplayName('https://api.bsky.app')).toBe(
      'Public AT Protocol AppView (external read provider)',
    )
    expect(getDefaultAppViewDisplayName('https://public.api.bsky.app/')).toBe(
      'Public AT Protocol AppView (external read provider)',
    )
    expect(getDefaultAppViewDisplayName('https://appview.social.example')).toBe(
      'Project AppView',
    )
  })

  it('requires a safe HTTPS origin and preserves the provider identity', () => {
    expect(validateAppViewProvider(DEFAULT_APPVIEW_PROVIDER)).toMatchObject({
      id: DEFAULT_APPVIEW_PROVIDER.id,
      endpoint: DEFAULT_APPVIEW_PROVIDER.endpoint,
    })
    expect(() =>
      validateAppViewProvider({
        ...DEFAULT_APPVIEW_PROVIDER,
        endpoint: 'http://localhost:3000',
      }),
    ).toThrow('safe HTTPS origin')
  })

  it('allows a deliberately configured local HTTP provider only through the dev escape hatch', () => {
    const local = {
      ...DEFAULT_APPVIEW_PROVIDER,
      id: 'local-appview',
      displayName: 'Local read provider',
      serviceDid:
        'did:web:local-read-provider.test' as typeof DEFAULT_APPVIEW_PROVIDER.serviceDid,
      endpoint: 'http://127.0.0.1:19180',
      healthPath: '/xrpc/com.atproto.server.describeServer',
      builtin: false,
    }

    expect(() => validateAppViewProvider(local)).toThrow('safe HTTPS origin')
    expect(
      validateAppViewProvider(local, {allowInsecureLocal: true}),
    ).toMatchObject({
      endpoint: 'http://127.0.0.1:19180',
      healthPath: '/xrpc/com.atproto.server.describeServer',
    })
  })

  it('probes the selected provider before a switch', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', {status: 200}))
    await expect(
      probeAppViewProvider(DEFAULT_APPVIEW_PROVIDER),
    ).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(`${DEFAULT_APPVIEW_PROVIDER.endpoint}/xrpc/_health`),
      expect.objectContaining({method: 'GET', redirect: 'error'}),
    )
  })

  it('uses the provider-declared health path', async () => {
    const provider = {
      ...DEFAULT_APPVIEW_PROVIDER,
      healthPath: '/xrpc/com.atproto.server.describeServer',
    }
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', {status: 200}))

    await expect(probeAppViewProvider(provider)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        `${DEFAULT_APPVIEW_PROVIDER.endpoint}/xrpc/com.atproto.server.describeServer`,
      ),
      expect.objectContaining({method: 'GET', redirect: 'error'}),
    )
  })

  it('names an unavailable provider and does not treat failure as a switch', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', {status: 503}))
    await expect(
      probeAppViewProvider(DEFAULT_APPVIEW_PROVIDER),
    ).rejects.toThrow(
      'AppView provider Public AT Protocol AppView (external read provider) is unavailable (HTTP 503)',
    )
  })

  it('makes a remembered fallback visible and clears it on replacement', async () => {
    const alternate = {
      ...DEFAULT_APPVIEW_PROVIDER,
      id: 'alternate-appview',
      displayName: 'Alternate AppView',
      serviceDid:
        'did:web:alternate.example' as typeof DEFAULT_APPVIEW_PROVIDER.serviceDid,
      endpoint: 'https://alternate.example',
      builtin: false,
    }
    mockPersistedState.appviewProviders = [DEFAULT_APPVIEW_PROVIDER, alternate]
    const {getAppViewFallback, getSelectedAppViewProvider, setAppViewFallback} =
      await import('../providers')

    await setAppViewFallback(
      DID,
      'appview-selection',
      DEFAULT_APPVIEW_PROVIDER.id,
    )
    expect(getSelectedAppViewProvider(DID).id).toBe(DEFAULT_APPVIEW_PROVIDER.id)
    expect(getAppViewFallback(DID, 'appview-selection')?.id).toBe(
      DEFAULT_APPVIEW_PROVIDER.id,
    )

    await selectAppViewProvider(DID, alternate.id)
    expect(getSelectedAppViewProvider(DID).id).toBe(alternate.id)
    expect(getAppViewFallback(DID, 'appview-selection')).toBeUndefined()
  })

  it('registers an explicitly checked alternate and persists the selection', async () => {
    const alternate = {
      ...DEFAULT_APPVIEW_PROVIDER,
      id: 'alternate-appview',
      displayName: 'Alternate AppView',
      serviceDid:
        'did:web:alternate.example' as typeof DEFAULT_APPVIEW_PROVIDER.serviceDid,
      endpoint: 'https://alternate.example',
      builtin: false,
    }
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', {status: 200}))

    await probeAppViewProvider(alternate)
    await registerAppViewProvider(alternate)
    expect(getAppViewProviders().map(provider => provider.id)).toEqual([
      DEFAULT_APPVIEW_PROVIDER.id,
      alternate.id,
    ])
    await selectAppViewProvider(DID, alternate.id)
    expect(getSelectedAppViewProvider(DID).id).toBe(alternate.id)
  })

  it('routes capabilities independently and keeps legacy providers read-only', () => {
    const readOnly = {
      ...DEFAULT_APPVIEW_PROVIDER,
      id: 'read-only-appview',
      displayName: 'Read-only AppView',
      capabilities: ['public-read'] as const,
    }
    mockPersistedState.appviewProviders = [
      {
        ...DEFAULT_APPVIEW_PROVIDER,
        id: 'legacy-appview',
        displayName: 'Legacy AppView',
        serviceDid:
          'did:web:legacy.example' as typeof DEFAULT_APPVIEW_PROVIDER.serviceDid,
        endpoint: 'https://legacy.example',
        builtin: false,
        capabilities: undefined,
      },
      readOnly,
    ]

    expect(
      getAppViewProvidersForCapability('identity-resolution').map(
        provider => provider.id,
      ),
    ).toEqual([DEFAULT_APPVIEW_PROVIDER.id])
    const providers = getAppViewProviders()
    expect(
      providers.find(provider => provider.id === 'legacy-appview'),
    )?.toMatchObject({
      capabilities: ['public-read'],
    })
    expect(
      providers.find(provider => provider.id === readOnly.id),
    )?.toMatchObject({
      capabilities: ['public-read'],
    })
  })

  it('uses public-read providers for anonymous handle navigation without granting identity capability', () => {
    mockPersistedState.appviewProviders = [
      {
        ...DEFAULT_APPVIEW_PROVIDER,
        capabilities: ['public-read'],
      },
    ]

    expect(getAppViewProvidersForCapability('identity-resolution')).toEqual([])
    expect(
      getAppViewProvidersForHandleResolution().map(provider => provider.id),
    ).toEqual([DEFAULT_APPVIEW_PROVIDER.id])
  })

  it('inherits public-read providers for anonymous profile surfaces only', () => {
    mockPersistedState.appviewProviders = [
      {
        ...DEFAULT_APPVIEW_PROVIDER,
        capabilities: ['public-read'],
      },
    ]

    expect(
      getAppViewProvidersForSurface('profiles').map(provider => provider.id),
    ).toEqual([DEFAULT_APPVIEW_PROVIDER.id])
    expect(getAppViewProvidersForSurface('notifications')).toEqual([])
    expect(getAppViewProvidersForSurface('communities')).toEqual([])
  })

  it('persists an explicit identity reconciliation policy', async () => {
    const alternate = {
      ...DEFAULT_APPVIEW_PROVIDER,
      id: 'alternate-appview',
      displayName: 'Alternate AppView',
      serviceDid:
        'did:web:alternate.example' as typeof DEFAULT_APPVIEW_PROVIDER.serviceDid,
      endpoint: 'https://alternate.example',
      builtin: false,
    }
    mockPersistedState.appviewProviders = [DEFAULT_APPVIEW_PROVIDER, alternate]

    expect(getIdentityResolutionPolicy()).toEqual({mode: 'require-agreement'})
    await setIdentityResolutionPolicy({
      mode: 'prefer-provider',
      preferredProviderId: alternate.id,
    })
    expect(getIdentityResolutionPolicy()).toEqual({
      mode: 'prefer-provider',
      preferredProviderId: alternate.id,
    })
    await expect(
      setIdentityResolutionPolicy({
        mode: 'prefer-provider',
        preferredProviderId: 'missing',
      }),
    ).rejects.toThrow('Preferred identity resolver is not registered')
  })

  it('keeps identity resolution opt-in and revokes a preferred provider safely', async () => {
    const alternate = {
      ...DEFAULT_APPVIEW_PROVIDER,
      id: 'alternate-appview',
      displayName: 'Alternate AppView',
      serviceDid:
        'did:web:alternate.example' as typeof DEFAULT_APPVIEW_PROVIDER.serviceDid,
      endpoint: 'https://alternate.example',
      builtin: false,
      capabilities: ['public-read'] as const,
    }
    mockPersistedState.appviewProviders = [DEFAULT_APPVIEW_PROVIDER, alternate]

    expect(
      getAppViewProvidersForCapability('identity-resolution').map(
        item => item.id,
      ),
    ).toEqual([DEFAULT_APPVIEW_PROVIDER.id])
    await setAppViewProviderCapabilities(alternate.id, [
      'public-read',
      'identity-resolution',
    ])
    await setIdentityResolutionPolicy({
      mode: 'prefer-provider',
      preferredProviderId: alternate.id,
    })
    await setAppViewProviderCapabilities(alternate.id, ['public-read'])

    expect(
      getAppViewProvidersForCapability('identity-resolution').map(
        item => item.id,
      ),
    ).toEqual([DEFAULT_APPVIEW_PROVIDER.id])
    expect(getIdentityResolutionPolicy()).toEqual({mode: 'require-agreement'})
  })

  it('stores reconciliation choices per surface and imports only known providers', async () => {
    const alternate = {
      ...DEFAULT_APPVIEW_PROVIDER,
      id: 'alternate-appview',
      displayName: 'Alternate AppView',
      serviceDid:
        'did:web:alternate.example' as typeof DEFAULT_APPVIEW_PROVIDER.serviceDid,
      endpoint: 'https://alternate.example',
      builtin: false,
      capabilities: ['public-read', 'profiles', 'threads'] as const,
    }
    mockPersistedState.appviewProviders = [DEFAULT_APPVIEW_PROVIDER, alternate]

    await setAppViewReconciliationPolicy('profiles', {
      mode: 'prefer-provider',
      preferredProviderId: alternate.id,
    })
    await setAppViewReconciliationPolicy('threads', {
      mode: 'merge',
    })
    expect(getAppViewReconciliationPolicy('profiles')).toEqual({
      mode: 'prefer-provider',
      preferredProviderId: alternate.id,
    })
    expect(getAppViewReconciliationPolicy('threads')).toEqual({
      mode: 'merge',
    })
    expect(
      getAppViewProvidersForSurface('profiles').map(provider => provider.id),
    ).toEqual([DEFAULT_APPVIEW_PROVIDER.id, alternate.id])

    const exported = JSON.parse(exportAppViewPolicy()) as {
      providers: Array<Record<string, unknown>>
      [key: string]: unknown
    }
    expect(exported.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: alternate.id,
          capabilities: ['public-read', 'profiles', 'threads'],
        }),
      ]),
    )
    expect(exported.providers[0]).not.toHaveProperty('endpoint')

    await importAppViewPolicy(
      JSON.stringify({
        ...exported,
        providers: [
          ...exported.providers,
          {
            id: 'unregistered-provider',
            enabled: true,
            capabilities: ['profiles'],
            endpoint: 'https://must-not-be-imported.example',
          },
        ],
        selections: {[DID]: alternate.id, other: 'unregistered-provider'},
      }),
    )
    expect(getSelectedAppViewProvider(DID).id).toBe(alternate.id)
    expect(
      getAppViewProviders().some(
        provider => provider.id === 'unregistered-provider',
      ),
    ).toBe(false)
    expect(getAppViewReconciliationPolicy('profiles')).toEqual({
      mode: 'prefer-provider',
      preferredProviderId: alternate.id,
    })
  })

  it('resets optional provider capabilities without deleting registered endpoints', async () => {
    const alternate = {
      ...DEFAULT_APPVIEW_PROVIDER,
      id: 'alternate-appview',
      displayName: 'Alternate AppView',
      serviceDid:
        'did:web:alternate.example' as typeof DEFAULT_APPVIEW_PROVIDER.serviceDid,
      endpoint: 'https://alternate.example',
      builtin: false,
    }
    mockPersistedState.appviewProviders = [DEFAULT_APPVIEW_PROVIDER, alternate]
    await setAppViewReconciliationPolicy('search', {mode: 'merge'})
    await setAppViewProviderCapabilities(alternate.id, [
      'public-read',
      'search',
    ])

    await resetAppViewPolicy()

    expect(getAppViewProviders()).toHaveLength(2)
    expect(
      getAppViewProviders().every(provider => Boolean(provider.capabilities)),
    ).toBe(true)
    expect(
      getAppViewProviders().every(provider =>
        provider.capabilities?.includes('public-read'),
      ),
    ).toBe(true)
    expect(
      getAppViewProvidersForSurface('search').map(provider => provider.id),
    ).toEqual([DEFAULT_APPVIEW_PROVIDER.id, alternate.id])
    expect(getAppViewReconciliationPolicy('search')).toEqual({
      mode: 'require-agreement',
    })
  })
})
