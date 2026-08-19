import {
  hasViewerInteractionBoundary,
  viewerHidesActor,
} from '#/state/queries/public-visibility'
import type * as bsky from '#/types/bsky'

/**
 * Historical name retained for interaction-only callers such as chat and
 * follow controls. Do not use this for public-content presentation.
 */
export function isBlockedOrBlocking(profile: bsky.profile.AnyProfileView) {
  return hasViewerInteractionBoundary(profile)
}

export function isViewerHidingActor(profile: bsky.profile.AnyProfileView) {
  return viewerHidesActor(profile)
}

export function isMuted(profile: bsky.profile.AnyProfileView) {
  return profile.viewer?.muted || profile.viewer?.mutedByList
}
