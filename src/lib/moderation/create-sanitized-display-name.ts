import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import type * as bsky from '#/types/bsky'
import {type ModerationUI} from '../moderation'

export function createSanitizedDisplayName(
  profile: bsky.profile.AnyProfileView,
  noAt = false,
  moderation?: ModerationUI,
) {
  if (profile.displayName != null && profile.displayName !== '') {
    return sanitizeDisplayName(profile.displayName, moderation)
  } else {
    return sanitizeHandle(profile.handle, noAt ? '' : '@')
  }
}
