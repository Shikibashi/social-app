import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals'

const DID = 'did:plc:provider-test'
const mockPersistedState: Record<string, unknown> = {
  appviewProviders: undefined,
  appviewSelections: {},
  appviewFallbacks: {},
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
  probeAppViewProvider,
  validateAppViewProvider,
} from '../providers'

describe('AppView provider validation and health probing', () => {
  beforeEach(() => {
    mockPersistedState.appviewProviders = undefined
    mockPersistedState.appviewSelections = {}
    mockPersistedState.appviewFallbacks = {}
  })

  afterEach(() => {
    jest.restoreAllMocks()
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

  it('names an unavailable provider and does not treat failure as a switch', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', {status: 503}))
    await expect(
      probeAppViewProvider(DEFAULT_APPVIEW_PROVIDER),
    ).rejects.toThrow(
      'AppView provider Bluesky AppView is unavailable (HTTP 503)',
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
    const {
      getAppViewFallback,
      getSelectedAppViewProvider,
      selectAppViewProvider,
      setAppViewFallback,
    } = await import('../providers')

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
})
