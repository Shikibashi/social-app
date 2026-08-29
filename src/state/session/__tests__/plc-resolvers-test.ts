import {beforeEach, describe, expect, it, jest} from '@jest/globals'

const mockPersistedState: Record<string, unknown> = {
  plcResolvers: [],
}

jest.mock('#/state/persisted', () => ({
  get: (key: string) => mockPersistedState[key],
  write: (key: string, value: unknown) => {
    mockPersistedState[key] = value
    return Promise.resolve()
  },
}))

import {
  getEffectivePlcResolvers,
  getPlcResolvers,
  getRegisteredPlcResolvers,
  PRIMARY_PLC_RESOLVER,
  registerPlcResolver,
  setPlcResolverEnabled,
  validatePlcResolver,
} from '../plc-resolvers'

const customResolver = {
  id: 'replica-a',
  displayName: 'Independent PLC replica A',
  endpoint: 'https://replica-a.example',
  operatorId: 'operator-a',
  builtin: false,
  enabled: true,
} as const

describe('PLC resolver declarations', () => {
  beforeEach(() => {
    mockPersistedState.plcResolvers = []
  })

  it('requires a public HTTPS endpoint and an explicit operator declaration', () => {
    expect(validatePlcResolver(customResolver)).toMatchObject({
      id: customResolver.id,
      endpoint: customResolver.endpoint,
      operatorId: customResolver.operatorId,
    })
    expect(() =>
      validatePlcResolver({
        ...customResolver,
        endpoint: 'http://resolver.example',
      }),
    ).toThrow('public HTTPS origin')
    expect(() =>
      validatePlcResolver({
        ...customResolver,
        endpoint: 'https://resolver.example/path?token=1',
      }),
    ).toThrow('public HTTPS origin')
    expect(() =>
      validatePlcResolver({...customResolver, operatorId: ''}),
    ).toThrow('identity is invalid')
  })

  it('keeps the primary resolver explicit and enables or disables custom replicas', async () => {
    await registerPlcResolver(customResolver)
    expect(getRegisteredPlcResolvers()).toEqual([customResolver])
    expect(getPlcResolvers()).toEqual([customResolver])
    expect(getEffectivePlcResolvers().map(resolver => resolver.id)).toEqual([
      PRIMARY_PLC_RESOLVER.id,
      customResolver.id,
    ])

    await setPlcResolverEnabled(customResolver.id, false)
    expect(getRegisteredPlcResolvers()[0]).toMatchObject({enabled: false})
    expect(getPlcResolvers()).toEqual([])
    expect(getEffectivePlcResolvers().map(resolver => resolver.id)).toEqual([
      PRIMARY_PLC_RESOLVER.id,
    ])
  })

  it('does not allow a custom declaration to replace the primary resolver id', () => {
    expect(() =>
      validatePlcResolver({...customResolver, id: PRIMARY_PLC_RESOLVER.id}),
    ).toThrow('identity is invalid')
  })
})
