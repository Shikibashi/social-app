import {type Client} from '@atproto/lex'
import {
  type AtIdentifierString,
  type DidString,
  type HandleString,
} from '@atproto/syntax'

import {app, com} from '#/lexicons'

const APPVIEW_PROFILE_TIMEOUT_MS = 1_500

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
}: {
  pdsClient: Client
  appviewClient?: Client
  actor: string
  handle?: string
}): Promise<app.bsky.actor.defs.ProfileViewDetailed> {
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

  const appviewProfile = appviewClient
    ? await getAppviewProfile(appviewClient, actor)
    : undefined

  return mergeAccountProfileView({
    actor,
    handle,
    profile: appviewProfile,
    record: record.value,
  })
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
}: {
  actor: string
  handle?: string
  profile?: app.bsky.actor.defs.ProfileViewDetailed
  record: app.bsky.actor.profile.Main
}): app.bsky.actor.defs.ProfileViewDetailed {
  return {
    ...profile,
    $type: 'app.bsky.actor.defs#profileViewDetailed',
    did: actor as DidString,
    handle: (profile?.handle ?? handle ?? actor) as HandleString,
    avatar: profile?.avatar,
    banner: profile?.banner,
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
