import {describe, expect, it} from '@jest/globals'

import {
  getDevelopmentLoopbackOAuthConfig,
  getDevelopmentLoopbackRedirectUrl,
  getMissingOAuthScopes,
  getOAuthFeatureGrant,
  getOAuthFeatureGrantPresentations,
  getOAuthFeatureGrants,
  getOAuthFeatureUpgradeScopes,
  getRuntimeOAuthClientMetadata,
  hasOAuthFeature,
  mergeOAuthScopes,
  OAUTH_BASE_SCOPES,
  OAUTH_CLIENT_METADATA,
  OAUTH_DEFAULT_FEATURES,
  OAUTH_FEATURE_SCOPES,
  OAUTH_FEATURES,
  OAUTH_IDENTITY_RECOVERY_SCOPES,
  OAUTH_MEDIA_SCOPES,
  OAUTH_METADATA_COMPATIBILITY_SCOPES,
  OAUTH_METADATA_SCOPE,
  OAUTH_NATIVE_REDIRECT_URI,
  OAUTH_NOTIFICATION_SCOPES,
  OAUTH_POSTING_SCOPES,
  OAUTH_SCOPE,
  OAUTH_SIGNUP_PROMPT,
  OAUTH_SPACE_SCOPES,
  OAUTH_TRANSITION_SCOPES,
} from '../oauth-scopes'

type StaticOAuthClientMetadata = {
  client_id: string
  client_uri: string
  redirect_uris: readonly string[]
  scope: string
  [key: string]: unknown
}

describe('OAuth permission contract', () => {
  it('keeps transitional permissions out of new authorization requests', () => {
    expect(OAUTH_TRANSITION_SCOPES).toEqual([
      'transition:generic',
      'transition:chat.bsky',
    ])
    expect(OAUTH_SCOPE).toBe(OAUTH_BASE_SCOPES.join(' '))
    expect(OAUTH_SCOPE).not.toContain('transition:generic')
    expect(OAUTH_SCOPE).not.toContain(OAUTH_SPACE_SCOPES[0])
  })

  it('builds the initial grant from an explicit default feature allowlist', () => {
    expect(OAUTH_DEFAULT_FEATURES).toEqual([
      'posting',
      'profile-editing',
      'social-graph',
      'appview',
    ])
    expect(OAUTH_BASE_SCOPES).toEqual([
      'atproto',
      ...OAUTH_DEFAULT_FEATURES.flatMap(
        feature => OAUTH_FEATURE_SCOPES[feature],
      ),
    ])
    expect(OAUTH_SCOPE).not.toContain(OAUTH_FEATURE_SCOPES.chat[0])
    expect(OAUTH_SCOPE).not.toContain(OAUTH_FEATURE_SCOPES.spaces[0])
    expect(OAUTH_SCOPE).not.toContain(OAUTH_FEATURE_SCOPES.media[0])
    expect(OAUTH_SCOPE).not.toContain(OAUTH_FEATURE_SCOPES.notifications[0])
    expect(OAUTH_SCOPE).not.toContain(OAUTH_IDENTITY_RECOVERY_SCOPES[0])
  })

  it('declares optional and compatibility scopes without requesting them at login', () => {
    expect(OAUTH_METADATA_SCOPE).toContain(OAUTH_SPACE_SCOPES[0])
    expect(OAUTH_METADATA_SCOPE).toContain(OAUTH_FEATURE_SCOPES.chat[0])
    expect(OAUTH_METADATA_SCOPE).toContain(OAUTH_MEDIA_SCOPES[0])
    expect(OAUTH_METADATA_SCOPE).toContain(OAUTH_TRANSITION_SCOPES[0])
    expect(OAUTH_METADATA_SCOPE).toContain(
      OAUTH_METADATA_COMPATIBILITY_SCOPES[0],
    )
    expect(OAUTH_METADATA_SCOPE).toContain(
      OAUTH_METADATA_COMPATIBILITY_SCOPES[1],
    )
    expect(new Set(OAUTH_METADATA_SCOPE.split(' ')).size).toBe(
      OAUTH_METADATA_SCOPE.split(' ').length,
    )
    expect(OAUTH_SCOPE).not.toContain(OAUTH_SPACE_SCOPES[0])
  })

  it('keeps Spaces, media, chat, and notification grants feature-scoped', () => {
    expect(OAUTH_SPACE_SCOPES).toEqual([
      'space:us.edriffles.radlib.account?authority=*&action=read',
      'space:us.edriffles.radlib.account?authority=*&collection=us.edriffles.radlib.private.post&action=read',
      'space:us.edriffles.radlib.account?authority=*&manage=update',
      'space:us.edriffles.radlib.account?authority=self&collection=us.edriffles.radlib.private.post&action=create&action=update&action=delete',
      'space:us.edriffles.radlib.community?authority=*&action=read',
      'space:us.edriffles.radlib.community?authority=self&manage=create',
      'space:us.edriffles.radlib.community?authority=self&manage=delete',
      'space:us.edriffles.radlib.community?authority=*&manage=update',
      'space:us.edriffles.radlib.community?authority=*&collection=us.edriffles.radlib.private.post&action=create&action=update&action=delete',
    ])
    expect(OAUTH_FEATURES).toEqual([
      'posting',
      'profile-editing',
      'social-graph',
      'identity-recovery',
      'appview',
      'chat',
      'spaces',
      'media',
      'notifications',
    ])
    expect(OAUTH_MEDIA_SCOPES).toEqual(['blob:*/*'])
    expect(OAUTH_NOTIFICATION_SCOPES[0]).toContain('aud=')
    expect(OAUTH_FEATURE_SCOPES.chat[0]).toContain('aud=')
    expect(OAUTH_IDENTITY_RECOVERY_SCOPES).toEqual(['identity:*'])
    expect(OAUTH_SCOPE).not.toContain(OAUTH_SPACE_SCOPES[0])
  })

  it('computes upgrades without dropping an existing grant', () => {
    const granted = ['atproto', ...OAUTH_POSTING_SCOPES]
    expect(hasOAuthFeature(granted, 'posting')).toBe(true)
    expect(getMissingOAuthScopes(granted, 'spaces')).toEqual(OAUTH_SPACE_SCOPES)
    expect(
      mergeOAuthScopes(granted, OAUTH_SPACE_SCOPES).filter(
        scope => scope === OAUTH_POSTING_SCOPES[0],
      ),
    ).toEqual([OAUTH_POSTING_SCOPES[0]])
    expect(
      getMissingOAuthScopes(['transition:generic'], 'profile-editing'),
    ).toEqual([])
    expect(hasOAuthFeature(['transition:chat.bsky'], 'chat')).toBe(true)
    expect(hasOAuthFeature(['transition:generic'], 'chat')).toBe(false)
    expect(
      getMissingOAuthScopes(['transition:generic'], 'identity-recovery'),
    ).toEqual(OAUTH_IDENTITY_RECOVERY_SCOPES)
    expect(hasOAuthFeature(['transition:generic'], 'identity-recovery')).toBe(
      false,
    )
  })

  it('labels legacy compatibility grants and offers a native replacement', () => {
    const legacy = getOAuthFeatureGrant(
      ['atproto', 'transition:generic'],
      'posting',
    )
    expect(legacy.status).toBe('compatibility')
    expect(legacy.missingScopes).toEqual([])
    expect(legacy.grantedScopes).toEqual([])

    const upgrade = getOAuthFeatureUpgradeScopes(
      ['atproto', 'transition:generic'],
      'posting',
    )
    expect(upgrade).toEqual([
      'atproto',
      'transition:generic',
      ...OAUTH_POSTING_SCOPES,
    ])
  })

  it('canonicalizes PDS-materialized self scopes during upgrades', () => {
    const selfDid = 'did:plc:3ijrhre2q5e4tt2f4ph2sneo'
    const materializedSelfScope =
      'space:us.edriffles.radlib.account?authority=did:plc:3ijrhre2q5e4tt2f4ph2sneo&collection=us.edriffles.radlib.private.post&action=create&action=update&action=delete'
    const legacyCollectionReadScope =
      'space:us.edriffles.radlib.community?authority=*&collection=us.edriffles.radlib.private.post&action=read'
    const materializedSelfManagementScope =
      'space:us.edriffles.radlib.community?authority=did:plc:3ijrhre2q5e4tt2f4ph2sneo&collection=us.edriffles.radlib.private.post&manage=create'
    const legacyCollectionManagementScope =
      'space:us.edriffles.radlib.community?authority=*&collection=us.edriffles.radlib.private.post&manage=update'

    expect(
      getOAuthFeatureUpgradeScopes(
        ['atproto', materializedSelfScope],
        'chat',
        selfDid,
      ),
    ).toEqual(['atproto', OAUTH_SPACE_SCOPES[3], OAUTH_FEATURE_SCOPES.chat[0]])
    expect(
      getOAuthFeatureUpgradeScopes(
        ['atproto', materializedSelfScope],
        'chat',
        selfDid,
      ),
    ).not.toContain(materializedSelfScope)
    expect(
      getOAuthFeatureUpgradeScopes(
        ['atproto', materializedSelfScope],
        'chat',
        'did:plc:other-account',
      ),
    ).toContain(materializedSelfScope)
    expect(
      getOAuthFeatureUpgradeScopes(
        ['atproto', legacyCollectionReadScope],
        'chat',
      ),
    ).toEqual(['atproto', OAUTH_SPACE_SCOPES[4], OAUTH_FEATURE_SCOPES.chat[0]])
    expect(
      getOAuthFeatureUpgradeScopes(
        ['atproto', materializedSelfManagementScope],
        'chat',
        selfDid,
      ),
    ).toEqual(['atproto', OAUTH_SPACE_SCOPES[5], OAUTH_FEATURE_SCOPES.chat[0]])
    expect(
      getOAuthFeatureUpgradeScopes(
        ['atproto', legacyCollectionManagementScope],
        'chat',
      ),
    ).toEqual(['atproto', OAUTH_SPACE_SCOPES[7], OAUTH_FEATURE_SCOPES.chat[0]])
  })

  it('keeps the complete feature ledger attributable to each feature', () => {
    const grants = getOAuthFeatureGrants([
      'atproto',
      ...OAUTH_POSTING_SCOPES,
      'transition:generic',
    ])
    expect(grants).toHaveLength(9)
    expect(grants.find(grant => grant.feature === 'posting')).toMatchObject({
      status: 'granted',
      missingScopes: [],
    })
    expect(
      grants.find(grant => grant.feature === 'profile-editing'),
    ).toMatchObject({status: 'compatibility'})
    expect(grants.find(grant => grant.feature === 'spaces')).toMatchObject({
      status: 'missing',
      missingScopes: OAUTH_SPACE_SCOPES,
    })
  })

  it('presents feature authority without exposing credentials', () => {
    const presentations = getOAuthFeatureGrantPresentations([
      'atproto',
      ...OAUTH_POSTING_SCOPES,
      ...OAUTH_FEATURE_SCOPES.appview,
      'accessJwt:should-not-be-presented',
    ])
    const posting = presentations.find(
      presentation => presentation.feature === 'posting',
    )
    const appview = presentations.find(
      presentation => presentation.feature === 'appview',
    )
    const spaces = presentations.find(
      presentation => presentation.feature === 'spaces',
    )

    expect(posting).toMatchObject({
      status: 'granted',
      purpose: 'Create, update, and delete posts, likes, and reposts.',
      authority: 'account-pds',
      resource: 'Account PDS repository',
    })
    expect(appview).toMatchObject({
      status: 'granted',
      authority: 'appview-service',
      audiences: ['did:web:api.bsky.app#bsky_appview'],
    })
    expect(spaces).toMatchObject({status: 'missing'})
    expect(JSON.stringify(presentations)).not.toContain('accessJwt')
    expect(JSON.stringify(presentations)).not.toContain('refreshJwt')
  })

  it('keeps OAuth-native account creation explicit', () => {
    expect(OAUTH_SIGNUP_PROMPT).toBe('create')
  })

  it('uses the client-id hostname reverse-DNS scheme for native callbacks', () => {
    const clientIdUrl = new URL(OAUTH_CLIENT_METADATA.client_id)
    const reverseDnsScheme = clientIdUrl.hostname.split('.').reverse().join('.')

    expect(OAUTH_NATIVE_REDIRECT_URI).toBe(
      `${reverseDnsScheme}:/oauth/callback`,
    )
    expect(OAUTH_CLIENT_METADATA.redirect_uris).toContain(
      OAUTH_NATIVE_REDIRECT_URI,
    )
    expect(OAUTH_NATIVE_REDIRECT_URI).not.toContain('us.edriffles.social')
  })

  it('keeps origin-bound metadata fields self-consistent', () => {
    const staticMetadata =
      require('../../../../public/oauth-client-metadata.json') as StaticOAuthClientMetadata

    expect(OAUTH_CLIENT_METADATA.client_id).toBe(
      `${OAUTH_CLIENT_METADATA.client_uri}/oauth-client-metadata.json`,
    )
    expect(OAUTH_CLIENT_METADATA.redirect_uris[0]).toBe(
      `${OAUTH_CLIENT_METADATA.client_uri}/oauth/callback`,
    )
    expect(staticMetadata.client_id).toBe(
      `${staticMetadata.client_uri}/oauth-client-metadata.json`,
    )
    expect(staticMetadata.redirect_uris[0]).toBe(
      `${staticMetadata.client_uri}/oauth/callback`,
    )
    expect(staticMetadata.client_uri).toBe('https://plumblines.uk')
    expect(staticMetadata.scope).toBe(OAUTH_METADATA_SCOPE)

    const normalizeOriginBoundFields = (metadata: typeof staticMetadata) => ({
      ...metadata,
      client_id: '<origin>/oauth-client-metadata.json',
      client_uri: '<origin>',
      redirect_uris: [
        '<origin>/oauth/callback',
        ...metadata.redirect_uris.slice(1),
      ],
    })

    // Local Jest uses a loopback runtime origin, so normalize only the three
    // fields that are required to change with the configured origin. Every
    // other metadata field, including the native callback, is compared
    // exactly; no runtime values are overwritten with static-document data.
    expect(normalizeOriginBoundFields(OAUTH_CLIENT_METADATA)).toEqual(
      normalizeOriginBoundFields(staticMetadata),
    )
  })

  it('repairs a stale local origin when the bundle runs on the hosted origin', () => {
    const runtimeMetadata = getRuntimeOAuthClientMetadata()

    expect(runtimeMetadata.client_id).toBe(
      `${runtimeMetadata.client_uri}/oauth-client-metadata.json`,
    )
    expect(runtimeMetadata.redirect_uris[0]).toBe(
      `${runtimeMetadata.client_uri}/oauth/callback`,
    )
    expect(runtimeMetadata.client_uri).toBe('https://plumblines.uk')
    expect(runtimeMetadata.client_id).not.toContain('127.0.0.1')
    expect(runtimeMetadata.client_id).not.toContain('localhost')
  })

  it('uses the AT Protocol loopback client exception for local browser OAuth', () => {
    const config = getDevelopmentLoopbackOAuthConfig(
      'development',
      'http://localhost:19006',
    )
    expect(config).toBeDefined()

    const clientId = new URL(config!.metadata.client_id as string)
    expect(clientId.protocol).toBe('http:')
    expect(clientId.hostname).toBe('localhost')
    expect(clientId.port).toBe('')
    expect(clientId.pathname).toBe('/')
    expect(clientId.searchParams.getAll('redirect_uri')).toEqual([
      'http://127.0.0.1:19006/',
      'http://127.0.0.1:19006/oauth/callback',
    ])
    expect(clientId.searchParams.get('scope')).toBe(OAUTH_METADATA_SCOPE)
    expect(config!.metadata.redirect_uris).toEqual([
      'http://127.0.0.1:19006/',
      'http://127.0.0.1:19006/oauth/callback',
    ])
    expect(config!.redirectUri).toBe('http://127.0.0.1:19006/oauth/callback')
  })

  it('normalizes every localhost route before browser OAuth state is created', () => {
    expect(
      getDevelopmentLoopbackRedirectUrl(
        'development',
        'http://localhost:19006/profile/cato.org/post/example?view=thread#reply',
      ),
    ).toBe(
      'http://127.0.0.1:19006/profile/cato.org/post/example?view=thread#reply',
    )
    expect(
      getDevelopmentLoopbackRedirectUrl(
        'development',
        'http://127.0.0.1:19006/',
      ),
    ).toBeUndefined()
    expect(
      getDevelopmentLoopbackRedirectUrl(
        'production',
        'http://localhost:19006/',
      ),
    ).toBeUndefined()
  })

  it('does not expose the loopback OAuth exception outside local development', () => {
    expect(
      getDevelopmentLoopbackOAuthConfig('production', 'http://127.0.0.1:19006'),
    ).toBeUndefined()
    expect(
      getDevelopmentLoopbackOAuthConfig('development', 'https://plumblines.uk'),
    ).toBeUndefined()
  })
})
