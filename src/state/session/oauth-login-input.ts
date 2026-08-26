export type OAuthLoginInput = {
  service: string
  identifier: string
}

export type OAuthLoginInputWithLegacyFields = OAuthLoginInput & {
  password?: unknown
  authFactorToken?: unknown
}

/**
 * Compatibility callers must not be allowed to pass password-shaped fields
 * into the OAuth path. Rejecting the fields is safer than accepting and
 * discarding them, because a caller can then migrate deliberately.
 */
export class LegacyLoginRequiresOAuthError extends Error {
  constructor() {
    super(
      'Password-based login is no longer supported; use the provider-owned OAuth login flow',
    )
    this.name = 'LegacyLoginRequiresOAuthError'
  }
}

export function assertOAuthLoginInput(
  input: OAuthLoginInputWithLegacyFields,
): asserts input is OAuthLoginInput {
  if (
    Object.prototype.hasOwnProperty.call(input, 'password') ||
    Object.prototype.hasOwnProperty.call(input, 'authFactorToken')
  ) {
    throw new LegacyLoginRequiresOAuthError()
  }
}
