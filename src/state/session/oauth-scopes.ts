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
  appview: OAUTH_APPVIEW_SCOPES,
  chat: OAUTH_CHAT_SCOPES,
  spaces: OAUTH_SPACE_SCOPES,
  media: OAUTH_MEDIA_SCOPES,
  notifications: OAUTH_NOTIFICATION_SCOPES,
}

/** New sessions grant only the feature groups required for ordinary use. */
export const OAUTH_BASE_SCOPES = [
  'atproto',
  ...OAUTH_POSTING_SCOPES,
  ...OAUTH_PROFILE_SCOPES,
  ...OAUTH_SOCIAL_GRAPH_SCOPES,
  ...OAUTH_APPVIEW_SCOPES,
] as const

/** The complete scope advertised in metadata and sent on first authorization. */
export const OAUTH_SCOPE = OAUTH_BASE_SCOPES.join(' ')

export function getOAuthFeatureScopes(
  feature: OAuthFeature,
): readonly string[] {
  return OAUTH_FEATURE_SCOPES[feature]
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
      feature !== 'chat'
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
      'us.edriffles.social:/oauth/callback',
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
