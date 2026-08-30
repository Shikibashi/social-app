import {hasOAuthFeature, type OAuthFeature} from '#/state/session/oauth-scopes'
import {type SessionAccount} from '#/state/session/types'

/**
 * Thrown when an action started a feature-scoped consent flow instead of
 * making a write with an insufficient OAuth grant. The browser flow normally
 * navigates away and returns through the OAuth callback, while native callers
 * can use this error to keep the original action unapplied and retry after
 * consent.
 */
export class OAuthFeatureUpgradeRequiredError extends Error {
  readonly feature: OAuthFeature

  constructor(feature: OAuthFeature) {
    super(
      `Authorize the ${feature} feature before retrying this action. No write was made.`,
    )
    this.name = 'OAuthFeatureUpgradeRequiredError'
    this.feature = feature
  }
}

/** Convert a completed consent handoff into a safe mutation failure. */
export function assertOAuthFeatureGranted(
  granted: boolean,
  feature: OAuthFeature,
): asserts granted {
  if (!granted) {
    throw new OAuthFeatureUpgradeRequiredError(feature)
  }
}

/**
 * Decide whether an account needs a feature upgrade before an explicit write.
 * This deliberately treats password sessions as already governed by their
 * existing client credentials and treats OAuth scope metadata separately from
 * token validity; an expired or revoked token is still handled by the normal
 * session refresh/revocation path at the transport boundary.
 */
export function requiresOAuthFeatureUpgrade(
  account: SessionAccount | undefined,
  feature: OAuthFeature,
): boolean {
  return Boolean(
    account &&
    account.authType === 'oauth' &&
    !hasOAuthFeature(account.oauthScopes, feature),
  )
}
