import {getRuntimePublicWebOrigin} from '#/lib/brand'

/**
 * URL helpers for the Invite Friends share sheet (APP-2142).
 *
 * Every action (QR payload, share sheet, clipboard) and the displayed label
 * all derive from the same canonical Plumbline profile URL, so what the user
 * reads matches exactly what they copy/share. Existing Bluesky profile URLs
 * remain valid inputs elsewhere; new invites identify the current client.
 * The displayed label simply drops the `https://` scheme for readability.
 *
 * Keep this module independent from the URL parser so its unit tests stay fast
 * and isolated from the lexicon graph.
 */

function stripLeadingAt(handle: string): string {
  return handle.startsWith('@') ? handle.slice(1) : handle
}

/** Canonical URL - used for QR payload, Share, and Copy. Empty handle -> empty string. */
export function getInviteShareUrl(handle: string): string {
  const bare = stripLeadingAt(handle)
  if (!bare) return ''
  return `${getRuntimePublicWebOrigin()}/profile/${bare}`
}

/**
 * Human-readable label shown in the "Invite link" field. This is the same
 * canonical URL as getInviteShareUrl with the `https://` scheme stripped, so
 * the displayed text always resolves and matches what Copy/Share use.
 */
export function getInviteDisplayUrl(handle: string): string {
  return getInviteShareUrl(handle).replace(/^https:\/\//, '')
}
