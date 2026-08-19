import {useMemo} from 'react'
import {Client} from '@atproto/lex'
import {type DidString} from '@atproto/syntax'
import {
  type InterpretedLabelValueDefinition,
  type LabelPreference,
  LABELS,
  moderateFeedGenerator as sdkModerateFeedGenerator,
  moderateNotification as sdkModerateNotification,
  moderatePost as sdkModeratePost,
  moderateProfile as sdkModerateProfile,
  moderateStatus as sdkModerateStatus,
  moderateUserList as sdkModerateUserList,
  type ModerationBehavior,
  type ModerationCause,
  type ModerationDecision,
  type ModerationOpts,
  type ModerationUI,
} from '@bsky/sdk/moderation'

import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {type AppModerationCause} from '#/components/Pills'
import {type app, type com} from '#/lexicons'

export {
  DEFAULT_LABEL_SETTINGS,
  hasMutedWord,
  type InterpretedLabelValueDefinition,
  interpretLabelValueDefinition,
  interpretLabelValueDefinitions,
  type LabelPreference,
  LABELS,
  matchMuteWords,
  type ModerationBehavior,
  type ModerationCause,
  ModerationDecision,
  type ModerationOpts,
  type ModerationPrefs,
  type ModerationUI,
} from '@bsky/sdk/moderation'

type ModerationSubjectFeedGenerator = Parameters<
  typeof sdkModerateFeedGenerator
>[0]
type ModerationSubjectNotification = Parameters<
  typeof sdkModerateNotification
>[0]
type ModerationSubjectPost = Parameters<typeof sdkModeratePost>[0]
type ModerationSubjectProfile = Parameters<typeof sdkModerateProfile>[0]
type ModerationSubjectUserList = Parameters<typeof sdkModerateUserList>[0]

/**
 * This is a presentation policy, not a claim that a service must serve bytes.
 * The AppView still owns deletion, suspension, security, and infrastructure
 * availability. When a public subject is available, ordinary labeler
 * judgments remain viewer-configurable and keep their source metadata.
 */
export const VIEWER_SOVEREIGN_MODERATION_POLICY = {
  ordinaryLabelsAreAdvisory: true,
  allowViewerOverrideGlobalHide: true,
  allowViewerOverrideAdultPresentation: false,
} as const

const NOOP_MODERATION_BEHAVIOR: ModerationBehavior = {}

function isOrdinaryLabel(
  definition: InterpretedLabelValueDefinition | undefined,
): boolean {
  return Boolean(
    definition &&
      !definition.identifier.startsWith('!') &&
      !definition.flags.includes('adult'),
  )
}

function getLabelDefinition(
  label: com.atproto.label.defs.Label,
  opts: ModerationOpts,
): InterpretedLabelValueDefinition | undefined {
  return (
    opts.labelDefs?.[label.src]?.find(
      definition => definition.identifier === label.val,
    ) ?? LABELS[label.val as keyof typeof LABELS]
  )
}

function getViewerLabelPreference(
  label: com.atproto.label.defs.Label,
  opts: ModerationOpts,
): LabelPreference | undefined {
  const labelerPreference = opts.prefs.labelers.find(
    labeler => labeler.did === label.src,
  )?.labels[label.val]
  return labelerPreference ?? opts.prefs.labels[label.val]
}

/**
 * The SDK normally drops `ignore` labels before a decision is returned. For
 * the fork, an ordinary label set to Show still needs to remain available as
 * provenance metadata, so include it as a no-op and restore the user's
 * presentation choice after SDK interpretation.
 */
function prepareViewerSovereignOpts(opts: ModerationOpts): ModerationOpts {
  const labelDefs = opts.labelDefs
    ? Object.fromEntries(
        Object.entries(opts.labelDefs).map(([did, definitions]) => [
          did,
          definitions.map(definition => {
            if (
              !isOrdinaryLabel(definition) ||
              !definition.flags.includes('no-override')
            ) {
              return definition
            }
            return {
              ...definition,
              configurable: true,
              flags: definition.flags.filter(flag => flag !== 'no-override'),
            }
          }),
        ]),
      )
    : undefined

  const ordinaryCustomLabels = new Set(
    Object.values(labelDefs ?? {})
      .flat()
      .filter(isOrdinaryLabel)
      .map(definition => definition.identifier),
  )
  const labels = {...opts.prefs.labels}
  for (const identifier of ordinaryCustomLabels) {
    if (labels[identifier] === 'ignore') labels[identifier] = 'warn'
  }

  return {
    ...opts,
    labelDefs,
    prefs: {
      ...opts.prefs,
      labels,
      labelers: opts.prefs.labelers.map(labeler => ({
        ...labeler,
        labels: Object.fromEntries(
          Object.entries(labeler.labels).map(([identifier, preference]) => [
            identifier,
            ordinaryCustomLabels.has(identifier) && preference === 'ignore'
              ? 'warn'
              : preference,
          ]),
        ),
      })),
    },
  }
}

export function applyViewerSovereignModeration<T extends ModerationDecision>(
  decision: T,
  opts?: ModerationOpts,
): T {
  for (const cause of decision.causes) {
    if (
      cause.type === 'label' &&
      VIEWER_SOVEREIGN_MODERATION_POLICY.ordinaryLabelsAreAdvisory &&
      isOrdinaryLabel(cause.labelDef)
    ) {
      cause.noOverride = false
      const preference = opts && getViewerLabelPreference(cause.label, opts)
      if (preference === 'ignore') {
        cause.setting = 'ignore'
        cause.behavior = NOOP_MODERATION_BEHAVIOR
      } else if (preference) {
        cause.setting = preference
      }

      // Retain the source definition as provenance even if the SDK received a
      // policy-normalized copy to make a custom no-override label configurable.
      const sourceDefinition = opts && getLabelDefinition(cause.label, opts)
      if (sourceDefinition) cause.labelDef = sourceDefinition
    }
  }
  return decision
}

export function moderatePost(
  subject: ModerationSubjectPost,
  opts: ModerationOpts,
) {
  return applyViewerSovereignModeration(
    sdkModeratePost(subject, prepareViewerSovereignOpts(opts)),
    opts,
  )
}

export function moderateProfile(
  subject: ModerationSubjectProfile,
  opts: ModerationOpts,
) {
  return applyViewerSovereignModeration(
    sdkModerateProfile(subject, prepareViewerSovereignOpts(opts)),
    opts,
  )
}

export function moderateNotification(
  subject: ModerationSubjectNotification,
  opts: ModerationOpts,
) {
  return applyViewerSovereignModeration(
    sdkModerateNotification(subject, prepareViewerSovereignOpts(opts)),
    opts,
  )
}

export function moderateFeedGenerator(
  subject: ModerationSubjectFeedGenerator,
  opts: ModerationOpts,
) {
  return applyViewerSovereignModeration(
    sdkModerateFeedGenerator(subject, prepareViewerSovereignOpts(opts)),
    opts,
  )
}

export function moderateUserList(
  subject: ModerationSubjectUserList,
  opts: ModerationOpts,
) {
  return applyViewerSovereignModeration(
    sdkModerateUserList(subject, prepareViewerSovereignOpts(opts)),
    opts,
  )
}

export function moderateStatus(
  subject: ModerationSubjectProfile,
  opts: ModerationOpts,
) {
  return applyViewerSovereignModeration(
    sdkModerateStatus(subject, prepareViewerSovereignOpts(opts)),
    opts,
  )
}

export const ADULT_CONTENT_LABELS = ['sexual', 'nudity', 'porn'] as const
export const OTHER_SELF_LABELS = ['graphic-media'] as const
export const SELF_LABELS = [
  ...ADULT_CONTENT_LABELS,
  ...OTHER_SELF_LABELS,
] as const

export type AdultSelfLabel = (typeof ADULT_CONTENT_LABELS)[number]
export type OtherSelfLabel = (typeof OTHER_SELF_LABELS)[number]
export type SelfLabel = (typeof SELF_LABELS)[number]

export function getModerationCauseKey(
  cause: ModerationCause | AppModerationCause,
): string {
  const source =
    cause.source.type === 'labeler'
      ? cause.source.did
      : cause.source.type === 'list'
        ? cause.source.list.uri
        : 'user'
  if (cause.type === 'label') {
    return `label:${cause.label.val}:${source}`
  }
  return `${cause.type}:${source}`
}

export function isJustAMute(modui: ModerationUI): boolean {
  return modui.filters.length === 1 && modui.filters[0].type === 'muted'
}

export function moduiContainsHideableOffense(modui: ModerationUI): boolean {
  const label = modui.filters.at(0)
  if (label && label.type === 'label') {
    return labelIsHideableOffense(label.label)
  }
  return false
}

export function labelIsHideableOffense(
  label: com.atproto.label.defs.Label,
): boolean {
  return ['!hide', '!takedown'].includes(label.val)
}

/**
 * Filters out labels that are not user-facing: system labels (val prefixed
 * with `!`) and the user's own "bot" self-label.
 */
export function filterUserFacingLabels(
  labels: com.atproto.label.defs.Label[],
  currentAccountDid: string | undefined,
): com.atproto.label.defs.Label[] {
  return labels.filter(
    label =>
      !label.val.startsWith('!') &&
      !(label.val === 'bot' && label.src === currentAccountDid),
  )
}

export function getLabelingServiceTitle({
  displayName,
  handle,
}: {
  displayName?: string
  handle: string
}) {
  return displayName
    ? sanitizeDisplayName(displayName)
    : sanitizeHandle(handle, '@')
}

export function lookupLabelValueDefinition(
  labelValue: string,
  customDefs: InterpretedLabelValueDefinition[] | undefined,
): InterpretedLabelValueDefinition | undefined {
  let def
  if (!labelValue.startsWith('!') && customDefs) {
    def = customDefs.find(d => d.identifier === labelValue)
  }
  if (!def) {
    def = LABELS[labelValue as keyof typeof LABELS]
  }
  return def
}

export function isAppLabeler(
  labeler:
    | string
    | app.bsky.labeler.defs.LabelerView
    | app.bsky.labeler.defs.LabelerViewDetailed,
): boolean {
  if (typeof labeler === 'string') {
    return Client.appLabelers.includes(labeler as DidString)
  }
  return Client.appLabelers.includes(labeler.creator.did)
}

export function isLabelerSubscribed(
  labeler:
    | string
    | app.bsky.labeler.defs.LabelerView
    | app.bsky.labeler.defs.LabelerViewDetailed,
  modOpts: ModerationOpts,
) {
  labeler = typeof labeler === 'string' ? labeler : labeler.creator.did
  if (isAppLabeler(labeler)) {
    return true
  }
  return modOpts.prefs.labelers.find(l => l.did === labeler)
}

export type Subject =
  | {
      uri: string
      cid: string
    }
  | {
      did: string
    }

export function useLabelSubject({
  label,
}: {
  label: com.atproto.label.defs.Label
}): {
  subject: Subject
} {
  return useMemo(() => {
    const {cid, uri} = label
    if (cid) {
      return {
        subject: {
          uri,
          cid,
        },
      }
    } else {
      return {
        subject: {
          did: uri,
        },
      }
    }
  }, [label])
}

export function unique(
  value: ModerationCause,
  index: number,
  array: ModerationCause[],
) {
  return (
    array.findIndex(
      item => getModerationCauseKey(item) === getModerationCauseKey(value),
    ) === index
  )
}
