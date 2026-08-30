import {type Client, getBlobCidString} from '@atproto/lex'
import {
  type AtIdentifierString,
  type AtUriString,
  type DidString,
  type HandleString,
  type UriString,
} from '@atproto/syntax'

import {app, com} from '#/lexicons'

const APPVIEW_PROFILE_TIMEOUT_MS = 1_500

/**
 * Evidence for profile media that is delivered directly by the account PDS.
 * The CID is still the value authored in the profile record; this metadata
 * only makes that existing authority legible to the profile workbench.
 */
export type AccountProfileMediaProvenance = {
  authority: 'account-pds'
  did: DidString
  recordUri: AtUriString
  endpoint: UriString
  deliveryMethod: 'com.atproto.sync.getBlob'
  avatarCid?: string
  bannerCid?: string
}

export type AccountProfileView = app.bsky.actor.defs.ProfileViewDetailed & {
  mediaProvenance?: AccountProfileMediaProvenance
}

/**
 * The profile record is authoritative for the signed-in account. The
 * AppView is still useful for counts, relationship state, and resolved image
 * URLs, but it must not be allowed to replace newer PDS-owned fields.
 */
export async function fetchAccountProfile({
  pdsClient,
  appviewClient,
  actor,
  handle,
  pdsEndpoint,
}: {
  pdsClient: Client
  appviewClient?: Client
  actor: string
  handle?: string
  /** The account PDS origin, used for a direct public blob fallback. */
  pdsEndpoint?: string
}): Promise<AccountProfileView> {
  if (pdsClient.assertDid !== actor) {
    throw new Error('Account PDS client does not own this actor')
  }

  const record = await pdsClient.call(com.atproto.repo.getRecord, {
    repo: actor,
    collection: app.bsky.actor.profile.$type,
    rkey: 'self',
  })
  if (!app.bsky.actor.profile.main.matches(record.value)) {
    throw new Error('Account PDS returned an invalid profile record')
  }
  const profileRecord = record.value as app.bsky.actor.profile.Main

  const appviewProfile = appviewClient
    ? await getAppviewProfile(appviewClient, actor)
    : undefined
  const avatarCid = profileRecord.avatar
    ? getBlobCidString(profileRecord.avatar)
    : undefined
  const bannerCid = profileRecord.banner
    ? getBlobCidString(profileRecord.banner)
    : undefined
  const pdsBlobUrls = {
    avatar: buildPdsBlobUrl(pdsEndpoint, actor, avatarCid),
    banner: buildPdsBlobUrl(pdsEndpoint, actor, bannerCid),
  }

  return {
    ...mergeAccountProfileView({
      actor,
      handle,
      profile: appviewProfile,
      record: profileRecord,
      pdsBlobUrls,
    }),
    mediaProvenance: buildAccountProfileMediaProvenance(
      pdsEndpoint,
      actor,
      avatarCid,
      bannerCid,
    ),
  }
}

/**
 * Describe the existing account-PDS blob boundary without introducing a
 * second media authority. A missing blob or unsafe endpoint produces no
 * inspectable delivery claim.
 */
export function buildAccountProfileMediaProvenance(
  pdsEndpoint: string | undefined,
  did: string,
  avatarCid: string | undefined,
  bannerCid: string | undefined,
): AccountProfileMediaProvenance | undefined {
  const endpoint = getHttpOrigin(pdsEndpoint)
  if (!endpoint || (!avatarCid && !bannerCid)) return undefined
  return {
    authority: 'account-pds',
    did: did as DidString,
    recordUri: `at://${did}/app.bsky.actor.profile/self` as AtUriString,
    endpoint,
    deliveryMethod: 'com.atproto.sync.getBlob',
    ...(avatarCid ? {avatarCid} : {}),
    ...(bannerCid ? {bannerCid} : {}),
  }
}

/**
 * Build the protocol-standard public blob URL on the account PDS. This is a
 * derived delivery URL, not a second media authority: the CID still comes
 * from the signed-in account's profile record and the PDS remains the blob
 * host. It is used when an AppView/CDN view is missing or behind.
 */
export function buildPdsBlobUrl(
  pdsEndpoint: string | undefined,
  did: string,
  cid: string | undefined,
): UriString | undefined {
  const endpoint = getHttpOrigin(pdsEndpoint)
  if (!endpoint || !cid) return undefined
  const url = new URL('/xrpc/com.atproto.sync.getBlob', endpoint)
  url.searchParams.set('did', did)
  url.searchParams.set('cid', cid)
  return url.toString() as UriString
}

function getHttpOrigin(value: string | undefined): UriString | undefined {
  if (!value) return undefined
  try {
    const endpoint = new URL(value)
    if (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') {
      return undefined
    }
    return endpoint.origin as UriString
  } catch {
    return undefined
  }
}

/**
 * Merge the PDS-owned profile fields over an optional AppView view. Keeping
 * this pure makes the authority rule easy to test without a React provider or
 * a live service.
 */
export function mergeAccountProfileView({
  actor,
  handle,
  profile,
  record,
  pdsBlobUrls,
}: {
  actor: string
  handle?: string
  profile?: app.bsky.actor.defs.ProfileViewDetailed
  record: app.bsky.actor.profile.Main
  pdsBlobUrls?: {
    avatar?: UriString
    banner?: UriString
  }
}): app.bsky.actor.defs.ProfileViewDetailed {
  return {
    ...profile,
    $type: 'app.bsky.actor.defs#profileViewDetailed',
    did: actor as DidString,
    handle: (profile?.handle ?? handle ?? actor) as HandleString,
    avatar: pdsBlobUrls?.avatar ?? profile?.avatar,
    banner: pdsBlobUrls?.banner ?? profile?.banner,
    labels: profile?.labels,
    status: profile?.status,
    viewer: profile?.viewer,
    website: record.website,
    pronouns: record.pronouns,
    createdAt: record.createdAt,
    pinnedPost: record.pinnedPost,
    displayName: record.displayName,
    description: record.description,
  }
}

async function getAppviewProfile(
  client: Client,
  actor: string,
): Promise<app.bsky.actor.defs.ProfileViewDetailed | undefined> {
  const request = client
    .call(app.bsky.actor.getProfile, {
      actor: actor as AtIdentifierString,
    })
    .catch(() => undefined)

  return await withTimeout(request, APPVIEW_PROFILE_TIMEOUT_MS)
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<undefined>(resolve => {
    timer = setTimeout(() => resolve(undefined), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
