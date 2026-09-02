import {StyleSheet, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {isReasonFeedSource, type ReasonFeedSource} from '#/lib/api/feed/types'
import {PLUMBLINE_BRASS} from '#/lib/brand'
import {publicProviderReason} from '#/lib/feed-provider-security'
import {type ModerationDecision} from '#/lib/moderation'
import {createSanitizedDisplayName} from '#/lib/moderation/create-sanitized-display-name'
import {makeProfileLink} from '#/lib/routes/links'
import {useSession} from '#/state/session'
import {useTheme} from '#/alf'
import {Pin_Stroke2_Corner0_Rounded as PinIcon} from '#/components/icons/Pin'
import {Repost_Stroke2_Corner3_Rounded as RepostIcon} from '#/components/icons/Repost'
import {Link} from '#/components/Link'
import {ProfileHoverCard} from '#/components/ProfileHoverCard'
import {Text} from '#/components/Typography'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {FeedNameText} from '../util/FeedInfoText'

export function PostFeedReason({
  reason,
  moderation,
  onOpenReposter,
}: {
  reason:
    | ReasonFeedSource
    | app.bsky.feed.defs.ReasonRepost
    | app.bsky.feed.defs.ReasonPin
    | {[k: string]: unknown; $type: string}
  moderation?: ModerationDecision
  onOpenReposter?: () => void
}) {
  const t = useTheme()
  const {_} = useLingui()

  const {currentAccount} = useSession()

  const providerReason = publicProviderReason(reason)
  if (providerReason) {
    return (
      <View style={styles.includeReason}>
        <Text
          style={[styles.reasonLabel, t.atoms.text_contrast_medium]}
          numberOfLines={2}>
          From feed provider · {providerReason}
        </Text>
      </View>
    )
  }

  if (isReasonFeedSource(reason)) {
    return (
      <Link label={_(msg`Go to feed`)} to={reason.href}>
        <Text
          style={[styles.reasonLabel, t.atoms.text_contrast_medium]}
          numberOfLines={1}>
          <Trans context="from-feed">
            From{' '}
            <FeedNameText
              uri={reason.uri}
              href={reason.href}
              style={[styles.reasonLabel, t.atoms.text_contrast_medium]}
              numberOfLines={1}
            />
          </Trans>
        </Text>
      </Link>
    )
  }

  if (bsky.isType(app.bsky.feed.defs.reasonRepost, reason)) {
    const isOwner = reason.by.did === currentAccount?.did
    const reposter = createSanitizedDisplayName(
      reason.by,
      false,
      moderation?.ui('displayName'),
    )
    return (
      <Link
        style={styles.includeReason}
        to={makeProfileLink(reason.by)}
        label={
          isOwner ? _(msg`Reposted by you`) : _(msg`Reposted by ${reposter}`)
        }
        onPress={onOpenReposter}>
        <RepostIcon
          style={[{color: PLUMBLINE_BRASS, marginRight: 3}]}
          width={13}
          height={13}
        />
        <ProfileHoverCard did={reason.by.did}>
          <Text
            style={[styles.reasonLabel, t.atoms.text_contrast_medium]}
            numberOfLines={1}>
            {isOwner ? (
              <Trans>Reposted by you</Trans>
            ) : (
              <Trans>Reposted by {reposter}</Trans>
            )}
          </Text>
        </ProfileHoverCard>
      </Link>
    )
  }

  if (bsky.isType(app.bsky.feed.defs.reasonPin, reason)) {
    return (
      <View style={styles.includeReason}>
        <PinIcon
          style={[{color: PLUMBLINE_BRASS, marginRight: 3}]}
          width={13}
          height={13}
        />
        <Text
          style={[styles.reasonLabel, t.atoms.text_contrast_medium]}
          numberOfLines={1}>
          <Trans>Pinned</Trans>
        </Text>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  includeReason: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    marginLeft: -16,
  },
  reasonLabel: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 19,
    letterSpacing: 0.05,
  },
})
