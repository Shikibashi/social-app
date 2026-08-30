import {type OAuthClientMetadataInput} from '@atproto/oauth-client-expo'

import {
  getRuntimePublicWebOrigin,
  PRODUCT_NAME,
  PUBLIC_WEB_ORIGIN,
} from '#/lib/brand'
import {CHAT_PROXY_SERVICE, NOTIF_SERVICE} from '#/lib/constants'
import {APPVIEW_PROXY_SERVICE} from '#/env'

/**
 * Direct repo permissions used by the ordinary posting and interaction path.
 * These are intentionally separate so a later feature upgrade does not need
 * to ask for the whole repository again.
 */
export const OAUTH_POSTING_SCOPES = [
  'repo:app.bsky.feed.post?action=create&action=update&action=delete',
  'repo:app.bsky.feed.like?action=create&action=delete',
  'repo:app.bsky.feed.repost?action=create&action=delete',
] as const

export const OAUTH_PROFILE_SCOPES = [
  'repo:app.bsky.actor.profile?action=create&action=update&action=delete',
] as const

/**
 * PLC recovery and rotation are intentionally opt-in. The protocol currently
 * exposes `identity:*` as the smallest scope that can request and submit a
 * PLC operation; do not imply that ordinary repo access includes it.
 */
export const OAUTH_IDENTITY_RECOVERY_SCOPES = ['identity:*'] as const

export const OAUTH_SOCIAL_GRAPH_SCOPES = [
  'repo:app.bsky.graph.follow?action=create&action=delete',
  'repo:app.bsky.graph.block?action=create&action=delete',
  'repo:app.bsky.graph.mute?action=create&action=delete',
  'repo:app.bsky.graph.list?action=create&action=update&action=delete',
  'repo:app.bsky.graph.listitem?action=create&action=delete',
  'repo:app.bsky.graph.starterpack?action=create&action=update&action=delete',
] as const

/**
 * The explicit Space permissions remain a separate feature grant. The space
 * grammar is not interchangeable with repo permissions, so keep every
 * control-plane and record permission visible in the requested feature.
 */
export const OAUTH_SPACE_SCOPES = [
  'space:us.edriffles.radlib.account?authority=*&action=read',
  'space:us.edriffles.radlib.account?authority=*&manage=update',
  'space:us.edriffles.radlib.account?authority=self&collection=us.edriffles.radlib.private.post&action=create&action=update&action=delete',
  'space:us.edriffles.radlib.community?authority=*&action=read',
  'space:us.edriffles.radlib.community?authority=self&manage=create',
  'space:us.edriffles.radlib.community?authority=self&manage=delete',
  'space:us.edriffles.radlib.community?authority=*&manage=update',
  'space:us.edriffles.radlib.community?authority=*&collection=us.edriffles.radlib.private.post&action=create&action=update&action=delete',
] as const

/** Blob permissions cannot be placed in a permission-set and stay explicit. */
export const OAUTH_MEDIA_SCOPES = ['blob:*/*'] as const

/**
 * RPC permissions are restricted to one service audience. The wildcard is
 * therefore not a wildcard over the network: it is bounded by the named
 * service DID and replaces the old all-PDS transition grant for that surface.
 */
export const OAUTH_APPVIEW_SCOPES = [
  `rpc?lxm=*&aud=${encodeURIComponent(APPVIEW_PROXY_SERVICE)}`,
] as const

export const OAUTH_CHAT_SCOPES = [
  `rpc?lxm=*&aud=${encodeURIComponent(CHAT_PROXY_SERVICE)}`,
] as const

export const OAUTH_NOTIFICATION_SCOPES = [
  `rpc?lxm=*&aud=${encodeURIComponent(NOTIF_SERVICE)}`,
] as const

/**
 * Transitional scopes are retained only for already-authorized sessions and
 * explicit compatibility upgrades. New authorization requests do not include
 * them. `transition:generic` is intentionally never an implicit prerequisite
 * for an unrelated feature.
 */
export const OAUTH_TRANSITION_SCOPES = [
  'transition:generic',
  'transition:chat.bsky',
] as const
export const OAUTH_COMPATIBILITY_SCOPES = OAUTH_TRANSITION_SCOPES

export const OAUTH_FEATURES = [
  'posting',
  'profile-editing',
  'social-graph',
  'identity-recovery',
  'appview',
  'chat',
  'spaces',
  'media',
  'notifications',
] as const
export type OAuthFeature = (typeof OAUTH_FEATURES)[number]

export const OAUTH_FEATURE_SCOPES: Record<OAuthFeature, readonly string[]> = {
  posting: OAUTH_POSTING_SCOPES,
  'profile-editing': OAUTH_PROFILE_SCOPES,
  'social-graph': OAUTH_SOCIAL_GRAPH_SCOPES,
  'identity-recovery': OAUTH_IDENTITY_RECOVERY_SCOPES,
  appview: OAUTH_APPVIEW_SCOPES,
  chat: OAUTH_CHAT_SCOPES,
  spaces: OAUTH_SPACE_SCOPES,
  media: OAUTH_MEDIA_SCOPES,
  notifications: OAUTH_NOTIFICATION_SCOPES,
}

/**
 * The compatibility baseline is an explicit allowlist of feature groups, not
 * a wildcard or transitional grant. Optional service boundaries such as chat,
 * Spaces, media, and notifications are added only after the user activates
 * them and accepts their separate consent request.
 */
export const OAUTH_DEFAULT_FEATURES = [
  'posting',
  'profile-editing',
  'social-graph',
  'appview',
] as const satisfies readonly OAuthFeature[]

/** New sessions grant only the explicitly listed feature groups. */
export const OAUTH_BASE_SCOPES = [
  'atproto',
  ...OAUTH_DEFAULT_FEATURES.flatMap(feature => OAUTH_FEATURE_SCOPES[feature]),
] as const

/** The complete scope advertised in metadata and sent on first authorization. */
export const OAUTH_SCOPE = OAUTH_BASE_SCOPES.join(' ')

/**
 * Native OAuth callbacks must use a private-use scheme derived from the
 * client_id hostname in reverse-DNS order. Keep this next to the metadata so
 * the advertised callback and the native client cannot drift apart during a
 * domain migration.
 */
export const OAUTH_NATIVE_REDIRECT_URI = 'uk.plumblines:/oauth/callback'

export function getOAuthFeatureScopes(
  feature: OAuthFeature,
): readonly string[] {
  return OAUTH_FEATURE_SCOPES[feature]
}

export type OAuthFeatureGrantStatus = 'granted' | 'compatibility' | 'missing'

export type OAuthFeatureGrant = {
  feature: OAuthFeature
  requiredScopes: readonly string[]
  grantedScopes: readonly string[]
  missingScopes: readonly string[]
  status: OAuthFeatureGrantStatus
}

export type OAuthAuthorityKind =
  | 'account-pds'
  | 'appview-service'
  | 'chat-service'
  | 'notification-service'
  | 'permissioned-spaces'
  | 'blob-resource'
  | 'unknown'

export type OAuthFeatureGrantPresentation = OAuthFeatureGrant & {
  purpose: string
  authority: OAuthAuthorityKind
  resource: string
  audiences: string[]
}

const OAUTH_FEATURE_PURPOSES: Record<OAuthFeature, string> = {
  posting: 'Create, update, and delete posts, likes, and reposts.',
  'profile-editing': 'Update the account profile record.',
  'social-graph': 'Manage follows, blocks, mutes, lists, and starter packs.',
  'identity-recovery':
    'Request and submit PLC identity updates, including rotation-key registration.',
  appview: 'Read account-scoped views through the selected AppView service.',
  chat: 'Read and send direct or group messages through the chat service.',
  spaces: 'Read and manage the account’s permissioned Spaces records.',
  media:
    'Upload blobs to the account’s hosting service for profile or post media.',
  notifications: 'Read account notifications through the notification service.',
}

const OAUTH_FEATURE_AUTHORITIES: Record<
  OAuthFeature,
  {authority: OAuthAuthorityKind; resource: string}
> = {
  posting: {authority: 'account-pds', resource: 'Account PDS repository'},
  'profile-editing': {
    authority: 'account-pds',
    resource: 'Account PDS repository',
  },
  'social-graph': {
    authority: 'account-pds',
    resource: 'Account PDS repository',
  },
  'identity-recovery': {
    authority: 'account-pds',
    resource: 'DID document and handle services',
  },
  appview: {authority: 'appview-service', resource: 'AppView RPC service'},
  chat: {authority: 'chat-service', resource: 'Chat RPC service'},
  spaces: {
    authority: 'permissioned-spaces',
    resource: 'Permissioned Spaces service and records',
  },
  media: {authority: 'blob-resource', resource: 'Account PDS blob store'},
  notifications: {
    authority: 'notification-service',
    resource: 'Notification RPC service',
  },
}

/**
 * Describe one feature grant without treating a legacy transition permission
 * as if it were a native, least-authority grant. This is intentionally pure so
 * the settings workbench and tests share the same decision as the request
 * boundary.
 */
export function getOAuthFeatureGrant(
  grantedScopes: string | readonly string[] | undefined,
  feature: OAuthFeature,
): OAuthFeatureGrant {
  const normalized = normalizeOAuthScopes(grantedScopes)
  const requiredScopes = getOAuthFeatureScopes(feature)
  const missingScopes = getMissingOAuthScopes(normalized, feature)
  const explicitlyGranted = requiredScopes.filter(scope =>
    normalized.includes(scope),
  )
  const status: OAuthFeatureGrantStatus =
    missingScopes.length > 0
      ? 'missing'
      : explicitlyGranted.length === requiredScopes.length
        ? 'granted'
        : 'compatibility'

  return {
    feature,
    requiredScopes: [...requiredScopes],
    grantedScopes: explicitlyGranted,
    missingScopes,
    status,
  }
}

export function getOAuthFeatureGrants(
  grantedScopes: string | readonly string[] | undefined,
): OAuthFeatureGrant[] {
  return OAUTH_FEATURES.map(feature =>
    getOAuthFeatureGrant(grantedScopes, feature),
  )
}

/**
 * Add human-readable authority metadata to the existing grant ledger. The
 * scope strings remain the source of truth; this is presentation data only and
 * deliberately contains no token, key, cookie, or other credential material.
 */
export function getOAuthFeatureGrantPresentations(
  grantedScopes: string | readonly string[] | undefined,
): OAuthFeatureGrantPresentation[] {
  return getOAuthFeatureGrants(grantedScopes).map(grant => {
    const {authority, resource} = OAUTH_FEATURE_AUTHORITIES[grant.feature]
    return {
      ...grant,
      purpose: OAUTH_FEATURE_PURPOSES[grant.feature],
      authority,
      resource,
      audiences: extractOAuthAudiences(grant.requiredScopes),
    }
  })
}

function extractOAuthAudiences(scopes: readonly string[]): string[] {
  const audiences = new Set<string>()
  for (const scope of scopes) {
    const queryStart = scope.indexOf('?')
    if (queryStart < 0) continue

    for (const parameter of scope.slice(queryStart + 1).split('&')) {
      const separator = parameter.indexOf('=')
      if (separator < 0 || parameter.slice(0, separator) !== 'aud') continue

      const encodedAudience = parameter.slice(separator + 1)
      if (!encodedAudience) continue
      audiences.add(decodeURIComponent(encodedAudience))
    }
  }
  return [...audiences]
}

/**
 * Return the exact feature permissions absent from an existing token. A legacy
 * generic transition token is treated as satisfying ordinary PDS and AppView
 * features. The legacy chat transition is also accepted so an existing chat
 * session keeps working while new sessions use the audience-scoped RPC grant.
 * Neither legacy transition is used in a new authorization request.
 */
export function getMissingOAuthScopes(
  grantedScopes: string | readonly string[] | undefined,
  feature: OAuthFeature,
): string[] {
  const granted = normalizeOAuthScopes(grantedScopes)
  const required = getOAuthFeatureScopes(feature)
  return required.filter(scope => {
    if (granted.includes(scope)) return false
    if (
      granted.includes('transition:generic') &&
      feature !== 'spaces' &&
      feature !== 'chat' &&
      feature !== 'identity-recovery'
    ) {
      return false
    }
    if (feature === 'chat' && granted.includes('transition:chat.bsky')) {
      return false
    }
    return true
  })
}

export function hasOAuthFeature(
  grantedScopes: string | readonly string[] | undefined,
  feature: OAuthFeature,
): boolean {
  return getMissingOAuthScopes(grantedScopes, feature).length === 0
}

/**
 * Build a reauthorization request that retains the current grant and adds
 * only the missing scopes for one feature. Existing and transitional scopes
 * are preserved for compatibility; transitional scopes are never introduced
 * by this helper.
 */
export function getOAuthFeatureUpgradeScopes(
  grantedScopes: string | readonly string[] | undefined,
  feature: OAuthFeature,
): string[] {
  const normalized = normalizeOAuthScopes(grantedScopes)
  const grant = getOAuthFeatureGrant(normalized, feature)
  const additionalScopes =
    grant.status === 'compatibility'
      ? getOAuthFeatureScopes(feature)
      : grant.missingScopes
  return mergeOAuthScopes('atproto', normalized, additionalScopes)
}

/** Merge scopes without dropping permissions already held by the session. */
export function mergeOAuthScopes(
  ...scopeInputs: Array<string | readonly string[] | undefined>
): string[] {
  return [...new Set(scopeInputs.flatMap(normalizeOAuthScopes))]
}

export function normalizeOAuthScopes(
  scopes: string | readonly string[] | undefined,
): string[] {
  if (!scopes) return []
  const values = typeof scopes === 'string' ? scopes.split(/\s+/) : scopes
  return values
    .map(scope => scope.trim())
    .filter((scope): scope is string => Boolean(scope))
}

/** ATProto OAuth provider prompt used by the separate OAuth-native signup path. */
export const OAUTH_SIGNUP_PROMPT = 'create' as const

function buildOAuthClientMetadata(publicWebOrigin: string) {
  return {
    client_id: `${publicWebOrigin}/oauth-client-metadata.json`,
    client_name: PRODUCT_NAME,
    client_uri: publicWebOrigin,
    redirect_uris: [
      `${publicWebOrigin}/oauth/callback`,
      OAUTH_NATIVE_REDIRECT_URI,
    ],
    response_types: ['code'],
    grant_types: ['authorization_code', 'refresh_token'],
    scope: OAUTH_SCOPE,
    application_type: 'native',
    token_endpoint_auth_method: 'none',
    dpop_bound_access_tokens: true,
  } as const satisfies OAuthClientMetadataInput
}

/**
 * The build-time object is also the checked-in public metadata contract. The
 * runtime variant protects the hosted web client from a stale local origin in
 * an otherwise valid bundle.
 */
export const OAUTH_CLIENT_METADATA = buildOAuthClientMetadata(PUBLIC_WEB_ORIGIN)

export function getRuntimeOAuthClientMetadata() {
  const publicWebOrigin = getRuntimePublicWebOrigin()
  return publicWebOrigin === PUBLIC_WEB_ORIGIN
    ? OAUTH_CLIENT_METADATA
    : buildOAuthClientMetadata(publicWebOrigin)
}
