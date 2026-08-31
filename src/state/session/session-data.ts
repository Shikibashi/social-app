import {jwtDecode} from 'jwt-decode'

import {BSKY_SERVICE} from '#/lib/constants'
import {isJwtExpired} from '#/lib/jwt'
import {hasProp} from '#/lib/type-guards'
import {type SessionAccount} from './types'

export type SessionData = {
  authType?: 'oauth' | 'password'
  did: string
  handle: string
  accessJwt?: string
  refreshJwt?: string
  oauthScopes?: string[]
  email?: string
  emailConfirmed?: boolean
  emailAuthFactor?: boolean
  active?: boolean
  status?: string
  service: string
  didDoc?: {
    id?: string
    service?: Array<{
      id?: string
      type?: string
      serviceEndpoint?: unknown
    }>
  }
}

/** Whether an access token was issued for a queued (waitlisted) signup. */
export function isSignupQueued(accessJwt: string | undefined) {
  if (accessJwt) {
    try {
      const sessData = jwtDecode(accessJwt)
      return (
        hasProp(sessData, 'scope') &&
        sessData.scope === 'com.atproto.signupQueued'
      )
    } catch {
      /*
       * OAuth access credentials are not required to use the legacy JWT
       * shape. A non-JWT credential cannot carry the legacy queued-signup
       * scope, but it is still a valid input to the OAuth session boundary.
       */
      return false
    }
  }
  return false
}

/**
 * Convert live OAuth session data into the persisted
 * `SessionAccount` snapshot.
 *
 * The object literal's field order is load-bearing: the reducer's
 * `JSON.stringify` fast path and the session test snapshots depend on
 * byte-stable serialization. `service` and `pdsUrl` are normalized through
 * `new URL().toString()` for a stable trailing slash.
 *
 * `pdsUrl` comes from the DID document or a pre-refresh stored value. It does
 * not fall back to the login service.
 */
export function sessionDataToSessionAccount(
  session: SessionData | null | undefined,
  service: string,
  storedPdsUrl?: string,
): SessionAccount | undefined {
  if (!session) {
    return undefined
  }
  const normalizedService = new URL(service).toString()
  const pdsUrl = extractPdsEndpoint(session.didDoc) ?? storedPdsUrl
  return {
    ...(session.authType === 'oauth' ? {authType: 'oauth' as const} : {}),
    service: normalizedService,
    did: session.did as SessionAccount['did'],
    handle: session.handle,
    email: session.email,
    emailConfirmed: session.emailConfirmed || false,
    emailAuthFactor: session.emailAuthFactor || false,
    refreshJwt: session.refreshJwt,
    accessJwt: session.accessJwt,
    ...(session.oauthScopes?.length
      ? {oauthScopes: [...new Set(session.oauthScopes)]}
      : {}),
    signupQueued: isSignupQueued(session.accessJwt),
    active: session.active,
    status: session.status,
    pdsUrl: pdsUrl ? new URL(pdsUrl).toString() : undefined,
    isSelfHosted: !normalizedService.startsWith(BSKY_SERVICE),
  }
}

/** Convert a persisted OAuth account into data suitable for the session adapter. */
type LegacySessionData = SessionData

export function sessionAccountToSessionData(
  account: SessionAccount,
): LegacySessionData {
  /*
   * Keep the conversion boundary structurally compatible with the legacy
   * test-only legacy-session fixtures while production uses OAuthSession.
   * The persisted account is validated before it reaches this function.
   */
  return {
    ...(account.authType ? {authType: account.authType} : {}),
    accessJwt: account.accessJwt ?? '',
    refreshJwt: account.refreshJwt ?? '',
    ...(account.oauthScopes?.length
      ? {oauthScopes: [...new Set(account.oauthScopes)]}
      : {}),
    did: account.did,
    handle: account.handle,
    email: account.email,
    emailAuthFactor: account.emailAuthFactor,
    emailConfirmed: account.emailConfirmed,
    active: account.active ?? true,
    status: account.status,
    service: account.service,
  }
}

export function isSessionExpired(account: SessionAccount) {
  return (
    account.authType !== 'oauth' &&
    (account.accessJwt ? isJwtExpired(account.accessJwt) : true)
  )
}

function extractPdsEndpoint(sessionDidDoc: SessionData['didDoc']) {
  const service = sessionDidDoc?.service?.find(
    item =>
      item.type === 'AtprotoPersonalDataServer' || item.id === '#atproto_pds',
  )
  return typeof service?.serviceEndpoint === 'string'
    ? service.serviceEndpoint
    : undefined
}
