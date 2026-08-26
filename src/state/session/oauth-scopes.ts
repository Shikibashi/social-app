/**
 * OAuth grants required by the permissioned-data client.
 *
 * Read access is deliberately separate from writes because the Spaces
 * permission grammar does not allow a collection-qualified read grant. The
 * write grants name the one record collection this client currently writes.
 * `self` is resolved by the authorization server to the signing user's DID;
 * `*` is required for control-plane targets whose authority is selected at
 * runtime. Manage grants protect membership and moderation mutations in the
 * Radlib control plane in addition to record-level Space writes.
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

/**
 * The transition scopes preserve the account/AppView and chat RPC surface while
 * the client also opts into the explicit Space permission grammar. They are
 * intentionally separate from the Space scopes: the PDS transition permission
 * set does not let `transition:generic` reach a Space.
 */
export const OAUTH_TRANSITION_SCOPES = [
  'transition:generic',
  'transition:chat.bsky',
] as const

/** The complete scope advertised in metadata and sent on every authorization request. */
export const OAUTH_SCOPE = [
  'atproto',
  ...OAUTH_TRANSITION_SCOPES,
  ...OAUTH_SPACE_SCOPES,
].join(' ')

/** ATProto OAuth provider prompt used by the separate OAuth-native signup path. */
export const OAUTH_SIGNUP_PROMPT = 'create' as const

/** The single metadata object shared by runtime OAuth clients and the public document. */
export const OAUTH_CLIENT_METADATA = {
  client_id: `${PUBLIC_WEB_ORIGIN}/oauth-client-metadata.json`,
  client_name: PRODUCT_NAME,
  client_uri: PUBLIC_WEB_ORIGIN,
  redirect_uris: [
    `${PUBLIC_WEB_ORIGIN}/oauth/callback`,
    'us.edriffles.social:/oauth/callback',
  ],
  response_types: ['code'],
  grant_types: ['authorization_code', 'refresh_token'],
  scope: OAUTH_SCOPE,
  application_type: 'native',
  token_endpoint_auth_method: 'none',
  dpop_bound_access_tokens: true,
} as const satisfies OAuthClientMetadataInput
import {type OAuthClientMetadataInput} from '@atproto/oauth-client-expo'

import {PRODUCT_NAME, PUBLIC_WEB_ORIGIN} from '#/lib/brand'
