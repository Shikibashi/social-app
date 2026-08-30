import {describe, expect, it} from '@jest/globals'

import {
  assertOAuthFeatureGranted,
  OAuthFeatureUpgradeRequiredError,
  requiresOAuthFeatureUpgrade,
} from '../oauth-authority'
import {type SessionAccount} from '../types'

const baseAccount = {
  service: 'https://pds.example.test/',
  did: 'did:plc:example123',
  handle: 'alice.example.test',
  pdsUrl: 'https://pds.example.test/',
  isSelfHosted: true,
} satisfies SessionAccount

describe('OAuth action authority boundary', () => {
  it('does not prompt for logged-out or password sessions', () => {
    expect(requiresOAuthFeatureUpgrade(undefined, 'chat')).toBe(false)
    expect(
      requiresOAuthFeatureUpgrade(
        {...baseAccount, authType: 'password'},
        'chat',
      ),
    ).toBe(false)
  })

  it('requests a missing OAuth feature without widening the grant', () => {
    expect(
      requiresOAuthFeatureUpgrade(
        {...baseAccount, authType: 'oauth', oauthScopes: ['atproto']},
        'chat',
      ),
    ).toBe(true)
  })

  it('accepts native and legacy-compatible grants already held by OAuth', () => {
    expect(
      requiresOAuthFeatureUpgrade(
        {
          ...baseAccount,
          authType: 'oauth',
          oauthScopes: ['atproto', 'transition:generic'],
        },
        'posting',
      ),
    ).toBe(false)
    expect(
      requiresOAuthFeatureUpgrade(
        {
          ...baseAccount,
          authType: 'oauth',
          oauthScopes: ['atproto', 'blob:*/*'],
        },
        'media',
      ),
    ).toBe(false)
  })

  it('fails closed when the action continues after consent returns', () => {
    expect(() => assertOAuthFeatureGranted(false, 'spaces')).toThrow(
      OAuthFeatureUpgradeRequiredError,
    )

    try {
      assertOAuthFeatureGranted(false, 'spaces')
    } catch (error) {
      expect(error).toMatchObject({
        name: 'OAuthFeatureUpgradeRequiredError',
        feature: 'spaces',
      })
    }
  })
})
