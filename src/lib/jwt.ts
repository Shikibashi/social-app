import {jwtDecode} from 'jwt-decode'

import {logger} from '#/logger'

/**
 * Simple check if a JWT token has expired. Does *not* validate the token or check for revocation status,
 * just checks the expiration time.
 *
 * @param token The JWT token to check.
 * @returns `true` if the token has expired, `false` otherwise.
 */
export function isJwtExpired(token: string) {
  try {
    const payload = jwtDecode(token)

    if (!payload.exp) return true
    const now = Math.floor(Date.now() / 1000)
    return now >= payload.exp
  } catch {
    logger.error(`session: could not decode jwt`)
    return true // invalid token or parse error
  }
}

export function isAppPassword(token: string) {
  try {
    const payload = jwtDecode(token)
    // @ts-expect-error
    return payload.scope === 'com.atproto.appPass'
  } catch {
    /*
     * OAuth access credentials may be opaque rather than JWTs. They cannot
     * carry the legacy App Password scope, but must not crash callers that
     * render account settings alongside OAuth sessions.
     */
    return false
  }
}
