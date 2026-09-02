import {memo, useEffect, useState} from 'react'
import {type StyleProp, View, type ViewStyle} from 'react-native'
import {useLingui} from '@lingui/react/macro'

import {
  clearExplicitPostPreference,
  loadPersonalization,
  setExplicitPostPreference,
} from '#/lib/personalization'
import {type Shadow} from '#/state/cache/types'
import {useRequireAuth, useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {
  ArrowBottom_Stroke2_Corner0_Rounded,
  ArrowTop_Stroke2_Corner0_Rounded,
} from '#/components/icons/Arrow'
import * as Toast from '#/components/Toast'
import {type app} from '#/lexicons'
import {PostControlButton, PostControlButtonIcon} from './PostControlButton'

type VotePreference = 'prefer' | 'avoid' | null

export const PostVoteButtons = memo(function PostVoteButtons({
  post,
  big,
  feedContext,
  onShowLess,
  style,
}: {
  post: Shadow<app.bsky.feed.defs.PostView>
  big?: boolean
  feedContext?: string
  onShowLess?: (interaction: app.bsky.feed.defs.Interaction) => void
  style?: StyleProp<ViewStyle>
}): React.ReactNode {
  const {t: l} = useLingui()
  const t = useTheme()
  const {currentAccount} = useSession()
  const requireAuth = useRequireAuth()
  const [preference, setPreference] = useState<VotePreference>(null)
  const [loadedKey, setLoadedKey] = useState<string>()
  const [isSaving, setIsSaving] = useState(false)
  const accountDid = currentAccount?.did
  const preferenceKey = `${accountDid ?? ''}:${post.uri}`
  const visiblePreference: VotePreference =
    loadedKey === preferenceKey ? preference : null

  useEffect(() => {
    let cancelled = false
    if (!accountDid) {
      return () => {
        cancelled = true
      }
    }

    void loadPersonalization(accountDid).then(state => {
      if (cancelled) return
      setPreference(
        state.explicit.explicitPostPreferences.find(
          item => item.uri === post.uri,
        )?.preference ?? null,
      )
      setLoadedKey(preferenceKey)
    })

    return () => {
      cancelled = true
    }
  }, [accountDid, post.uri, preferenceKey])

  const onPress = (nextPreference: Exclude<VotePreference, null>) => {
    requireAuth(() => {
      const accountDid = currentAccount?.did
      if (!accountDid || isSaving) return

      const previousPreference = visiblePreference
      const next = visiblePreference === nextPreference ? null : nextPreference
      setPreference(next)
      setLoadedKey(preferenceKey)
      setIsSaving(true)
      void (
        next
          ? setExplicitPostPreference(accountDid, post.uri, next)
          : clearExplicitPostPreference(accountDid, post.uri)
      )
        .then(() => {
          if (next === 'avoid') {
            onShowLess?.({item: post.uri, feedContext})
          }
        })
        .catch(() => {
          setPreference(previousPreference)
          setLoadedKey(preferenceKey)
          Toast.show(l`Could not save this feed preference`, {type: 'error'})
        })
        .finally(() => setIsSaving(false))
    })
  }

  return (
    <View
      testID="plumbline-post-vote-control"
      style={[
        a.flex_row,
        a.align_center,
        {
          borderColor: t.atoms.border_contrast_low.borderColor,
          borderRadius: 9,
          borderWidth: 1,
          overflow: 'hidden',
        },
        style,
      ]}>
      <PostControlButton
        testID="postUpvoteBtn"
        big={big}
        active={visiblePreference === 'prefer'}
        selected={visiblePreference === 'prefer'}
        activeColor={t.palette.positive_500}
        activeStyle={t.atoms.bg_contrast_25}
        disabled={isSaving}
        onPress={() => onPress('prefer')}
        label={l`Show more like this`}>
        <PostControlButtonIcon icon={ArrowTop_Stroke2_Corner0_Rounded} />
      </PostControlButton>
      <View
        style={{
          backgroundColor: t.atoms.border_contrast_low.borderColor,
          height: 18,
          width: 1,
        }}
      />
      <PostControlButton
        testID="postDownvoteBtn"
        big={big}
        active={visiblePreference === 'avoid'}
        selected={visiblePreference === 'avoid'}
        activeColor={t.palette.negative_500}
        activeStyle={t.atoms.bg_contrast_25}
        disabled={isSaving}
        onPress={() => onPress('avoid')}
        label={l`Show less like this`}>
        <PostControlButtonIcon icon={ArrowBottom_Stroke2_Corner0_Rounded} />
      </PostControlButton>
    </View>
  )
})
