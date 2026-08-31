import {type OAuthClientMetadataInput} from '@atproto/oauth-client-expo'
import {isValidDid} from '@atproto/syntax'
import {type MessageDescriptor} from '@lingui/core'
import {msg} from '@lingui/core/macro'

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
  'space:us.edriffles.radlib.account?authority=*&collection=us.edriffles.radlib.private.post&action=read',
  'space:us.edriffles.radlib.account?authority=*&manage=update',
  'space:us.edriffles.radlib.account?authority=self&collection=us.edriffles.radlib.private.post&action=create&action=update&action=delete',
  'space:us.edriffles.radlib.community?authority=*&action=read',
  'space:us.edriffles.radlib.community?authority=self&manage=create',
  'space:us.edriffles.radlib.community?authority=self&manage=delete',
  'space:us.edriffles.radlib.community?authority=*&manage=update',
  'space:us.edriffles.radlib.community?authority=*&collection=us.edriffles.radlib.private.post&action=create&action=update&action=delete',
] as const

/**
 * Older Spaces grants included a collection on a read permission. The PDS
 * matcher deliberately ignores collections for reads, so this is an exact
 * compatibility alias for the current collection-independent declaration.
 */
const OAUTH_LEGACY_SPACE_SCOPE_ALIASES: Readonly<Record<string, string>> = {
  'space:us.edriffles.radlib.community?authority=*&collection=us.edriffles.radlib.private.post&action=read':
    OAUTH_SPACE_SCOPES[4],
  'space:us.edriffles.radlib.community?authority=*&collection=us.edriffles.radlib.private.post&manage=update':
    OAUTH_SPACE_SCOPES[7],
}
const OAUTH_SPACE_COLLECTION = 'us.edriffles.radlib.private.post'

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

/**
 * Scopes issued by an earlier Spaces authorization flow are declared for
 * compatibility only. They remain preservable when a user upgrades another
 * feature, but are not added to the new Spaces request unless the feature
 * ledger requires them.
 */
export const OAUTH_METADATA_COMPATIBILITY_SCOPES = [
  'space:us.edriffles.radlib.account?authority=*&collection=us.edriffles.radlib.private.post&manage=update',
  'space:us.edriffles.radlib.community?authority=*&collection=us.edriffles.radlib.private.post&manage=update',
] as const

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

/** The least-authority scope requested by a new authorization flow. */
export const OAUTH_SCOPE = OAUTH_BASE_SCOPES.join(' ')

/**
 * The maximum scope set declared by the client metadata document. OAuth
 * authorization requests may ask for a subset of this set, so optional
 * feature scopes must be declared here without being added to first login.
 * Transitional scopes are included only so an existing compatibility grant
 * can be preserved during an explicit feature upgrade.
 */
export const OAUTH_METADATA_SCOPE = [
  ...new Set([
    ...OAUTH_BASE_SCOPES,
    ...OAUTH_TRANSITION_SCOPES,
    ...OAUTH_METADATA_COMPATIBILITY_SCOPES,
    ...OAUTH_FEATURES.flatMap(feature => OAUTH_FEATURE_SCOPES[feature]),
  ]),
].join(' ')

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

/**
 * Keep the feature ledger's stable identifiers independent from the language
 * used to present delegated authority in the client. These descriptors are
 * shared by the authorization inspector and Services workbench; the protocol
 * scopes and the persisted grant status remain unchanged.
 */
export function getOAuthFeatureLabelMessage(
  feature: OAuthFeature,
): MessageDescriptor {
  switch (feature) {
    case 'posting':
      return msg`Posting and interactions`
    case 'profile-editing':
      return msg`Profile editing`
    case 'social-graph':
      return msg`Social graph`
    case 'identity-recovery':
      return msg`Identity recovery and rotation`
    case 'appview':
      return msg`Authenticated AppView reads`
    case 'chat':
      return msg`Chat`
    case 'spaces':
      return msg`Spaces`
    case 'media':
      return msg`Media uploads`
    case 'notifications':
      return msg`Notifications`
  }
}

export function getOAuthFeatureResourceLabelMessage(
  feature: OAuthFeature,
): MessageDescriptor {
  switch (feature) {
    case 'posting':
    case 'profile-editing':
    case 'social-graph':
      return msg`account PDS`
    case 'identity-recovery':
      return msg`identity service`
    case 'appview':
      return msg`selected AppView service`
    case 'chat':
      return msg`chat service`
    case 'spaces':
      return msg`Spaces authority`
    case 'media':
      return msg`media service`
    case 'notifications':
      return msg`notification service`
  }
}

export function getOAuthFeaturePurposeMessage(
  feature: OAuthFeature,
): MessageDescriptor {
  switch (feature) {
    case 'posting':
      return msg`Create, update, and delete posts, likes, and reposts.`
    case 'profile-editing':
      return msg`Update the account profile record.`
    case 'social-graph':
      return msg`Manage follows, blocks, mutes, lists, and starter packs.`
    case 'identity-recovery':
      return msg`Request and submit PLC identity updates, including rotation-key registration.`
    case 'appview':
      return msg`Read account-scoped views through the selected AppView service.`
    case 'chat':
      return msg`Read and send direct or group messages through the chat service.`
    case 'spaces':
      return msg`Read and manage the account’s permissioned Spaces records.`
    case 'media':
      return msg`Upload blobs to the account’s hosting service for profile or post media.`
    case 'notifications':
      return msg`Read account notifications through the notification service.`
  }
}

export function getOAuthFeatureResourceMessage(
  feature: OAuthFeature,
): MessageDescriptor {
  switch (feature) {
    case 'posting':
    case 'profile-editing':
    case 'social-graph':
      return msg`Account PDS repository`
    case 'identity-recovery':
      return msg`DID document and handle services`
    case 'appview':
      return msg`AppView RPC service`
    case 'chat':
      return msg`Chat RPC service`
    case 'spaces':
      return msg`Permissioned Spaces service and records`
    case 'media':
      return msg`Account PDS blob store`
    case 'notifications':
      return msg`Notification RPC service`
  }
}

export function getOAuthAuthorityLabelMessage(
  authority: OAuthAuthorityKind,
): MessageDescriptor {
  switch (authority) {
    case 'account-pds':
      return msg`Account PDS`
    case 'appview-service':
      return msg`Selected AppView service`
    case 'chat-service':
      return msg`Chat service`
    case 'notification-service':
      return msg`Notification service`
    case 'permissioned-spaces':
      return msg`Permissioned Spaces authority`
    case 'blob-resource':
      return msg`Account PDS blob resource`
    case 'unknown':
      return msg`Unclassified resource`
  }
}

export function getOAuthGrantStatusMessage(
  status: OAuthFeatureGrantStatus,
): MessageDescriptor {
  switch (status) {
    case 'granted':
      return msg`Granted by the authorization server`
    case 'compatibility':
      return msg`Legacy compatibility grant`
    case 'missing':
      return msg`Still missing`
  }
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
  selfDid?: string,
): string[] {
  const normalized = normalizeOAuthScopes(grantedScopes).map(scope =>
    canonicalizeOAuthUpgradeScope(scope, selfDid),
  )
  const grant = getOAuthFeatureGrant(normalized, feature)
  const additionalScopes =
    grant.status === 'compatibility'
      ? getOAuthFeatureScopes(feature)
      : grant.missingScopes
  return mergeOAuthScopes('atproto', normalized, additionalScopes)
}

/**
 * The PDS resolves `authority=self` to the granting DID when it materializes a
 * token scope. OAuth metadata, however, declares the request-time `self` form.
 * Translate only the exact feature-ledger scopes for this account back to that
 * request form during an upgrade; concrete authorities for other actors remain
 * untouched and are never widened to a wildcard.
 */
function canonicalizeOAuthUpgradeScope(
  scope: string,
  selfDid?: string,
): string {
  const legacyAlias = OAUTH_LEGACY_SPACE_SCOPE_ALIASES[scope]
  if (legacyAlias) return legacyAlias
  if (!selfDid || !isValidDid(selfDid)) return scope

  return (
    OAUTH_SPACE_SCOPES.find(candidate => {
      if (!candidate.includes('?authority=self')) return false

      const resolvedCandidate = candidate.replace(
        'authority=self',
        `authority=${selfDid}`,
      )
      if (resolvedCandidate === scope) return true

      // Space lexicons may materialize their declared collection when the
      // request used a bare manage permission. That produces a second,
      // equivalent token-scope spelling that must also be upgraded safely.
      return (
        !candidate.includes('&collection=') &&
        candidate.includes('&manage=') &&
        resolvedCandidate.replace(
          '&manage=',
          `&collection=${OAUTH_SPACE_COLLECTION}&manage=`,
        ) === scope
      )
    }) ?? scope
  )
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
    scope: OAUTH_METADATA_SCOPE,
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
