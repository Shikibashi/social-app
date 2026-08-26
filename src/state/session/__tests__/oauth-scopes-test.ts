import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from '@jest/globals'

import {
  OAUTH_CLIENT_METADATA,
  OAUTH_SCOPE,
  OAUTH_SPACE_SCOPES,
  OAUTH_SIGNUP_PROMPT,
  OAUTH_TRANSITION_SCOPES,
} from '../oauth-scopes'

describe('OAuth permission contract', () => {
  it('includes the transition permissions needed for account, AppView, and chat RPCs', () => {
    expect(OAUTH_TRANSITION_SCOPES).toEqual([
      'transition:generic',
      'transition:chat.bsky',
    ])
    expect(OAUTH_SCOPE).toBe(
      `atproto ${OAUTH_TRANSITION_SCOPES.join(' ')} ${OAUTH_SPACE_SCOPES.join(' ')}`,
    )
  })

  it('advertises the exact Spaces permissions needed by the client', () => {
    expect(OAUTH_SPACE_SCOPES).toEqual([
      'space:us.edriffles.radlib.account?authority=*&action=read',
      'space:us.edriffles.radlib.account?authority=*&manage=update',
      'space:us.edriffles.radlib.account?authority=self&collection=us.edriffles.radlib.private.post&action=create&action=update&action=delete',
      'space:us.edriffles.radlib.community?authority=*&action=read',
      'space:us.edriffles.radlib.community?authority=self&manage=create',
      'space:us.edriffles.radlib.community?authority=*&manage=update',
      'space:us.edriffles.radlib.community?authority=*&collection=us.edriffles.radlib.private.post&action=create&action=update&action=delete',
    ])
    expect(OAUTH_SCOPE).toBe(
      `atproto ${OAUTH_TRANSITION_SCOPES.join(' ')} ${OAUTH_SPACE_SCOPES.join(' ')}`,
    )
  })

  it('keeps OAuth-native account creation explicit', () => {
    expect(OAUTH_SIGNUP_PROMPT).toBe('create')
  })

  it('keeps origin-bound metadata fields self-consistent', () => {
    const staticMetadata = JSON.parse(
      readFileSync(
        join(__dirname, '../../../..', 'public/oauth-client-metadata.json'),
        'utf8',
      ),
    )

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
    expect(staticMetadata.client_uri).toBe('https://social.edriffles.us')
    expect(staticMetadata.scope).toBe(OAUTH_SCOPE)

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
})
