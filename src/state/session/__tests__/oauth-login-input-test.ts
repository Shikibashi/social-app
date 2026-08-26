import {
  assertOAuthLoginInput,
  LegacyLoginRequiresOAuthError,
} from '../oauth-login-input'

describe('OAuth login input boundary', () => {
  it('accepts only the service and identifier required by OAuth', () => {
    expect(() =>
      assertOAuthLoginInput({
        service: 'https://pds.example.test',
        identifier: 'did:plc:example',
      }),
    ).not.toThrow()
  })

  it.each(['password', 'authFactorToken'] as const)(
    'rejects legacy %s fields instead of discarding them',
    field => {
      expect(() =>
        assertOAuthLoginInput({
          service: 'https://pds.example.test',
          identifier: 'did:plc:example',
          [field]: 'legacy-secret',
        }),
      ).toThrow(LegacyLoginRequiresOAuthError)
    },
  )
})
