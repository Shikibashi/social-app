import {Client} from '@atproto/lex'

import {DEFAULT_LABELER_DIDS} from '#/env'

export const BR_LABELER = 'did:plc:ekitcvx7uwnauoqy5oest3hm' // Brazil
export const DE_LABELER = 'did:plc:r55ow3tocux5kafs5dq445fy' // Germany
export const RU_LABELER = 'did:plc:crm2agcxvvlj6hilnjdc4hox' // Russia
export const GB_LABELER = 'did:plc:gvkp7euswjjrctjmqwhhfzif' // United Kingdom
export const AU_LABELER = 'did:plc:dsynw7isrf2eqlhcjx3ffnmt' // Australia
export const TR_LABELER = 'did:plc:cquoj7aozvmkud2gifeinkda' // Turkey
export const JP_LABELER = 'did:plc:vhgppeyjwgrr37vm4v6ggd5a' // Japan
export const ES_LABELER = 'did:plc:zlbbuj5nov4ixhvgl3bj47em' // Spain
export const PK_LABELER = 'did:plc:zrp6a3tvprrsgawsbswbxu7m' // Pakistan
export const IN_LABELER = 'did:plc:srr4rdvgzkbx6t7fxqtt6j5t' // India

/**
 * For all EU countries
 */
export const EU_LABELER = 'did:plc:z57lz5dhgz2dkjogoysm3vut'

/*
 * The old implementation derived a mandatory global labeler set from
 * geolocation.  That made a third-party judgment look like a platform-wide
 * decision and made the default impossible to audit.  Keep the legacy
 * country constants for compatibility with the settings UI, but make the
 * active set explicit deployment configuration.
 */
const MODERATION_AUTHORITIES_DIDS = DEFAULT_LABELER_DIDS

export function isNonConfigurableModerationAuthority(did: string) {
  return MODERATION_AUTHORITIES_DIDS.some(item => item === did)
}

export function configureAdditionalModerationAuthorities() {
  configureGlobalAppLabelers(Array.from(new Set(MODERATION_AUTHORITIES_DIDS)))
}

/**
 * Set the global app labelers on the lex `Client` static, which every client
 * reads, so a request carries the same `;redact` authorities whether or not
 * there is a session behind it.
 *
 * It is a single global producer by design. The PDS and chat clients opt out
 * with `appLabelers: null` (see `clients.ts`) because those services take no
 * moderation authorities, leaving exactly one producer on an appview request and
 * none elsewhere.
 */
export function configureGlobalAppLabelers(dids: string[]) {
  Client.configure({appLabelers: dids as `did:${string}:${string}`[]})
}
