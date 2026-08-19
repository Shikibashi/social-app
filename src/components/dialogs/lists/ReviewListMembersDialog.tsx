import {useCallback, useMemo, useState} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useListMembersQuery} from '#/state/queries/list-members'
import {useDirectBlockMutation} from '#/state/queries/profile'
import {hasDirectViewerBlock} from '#/state/queries/public-visibility'
import {atoms as a} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as Toggle from '#/components/forms/Toggle'
import {Loader} from '#/components/Loader'
import * as ProfileCard from '#/components/ProfileCard'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {type app} from '#/lexicons'

/**
 * Review is deliberately an explicit hard-boundary workflow. The list itself
 * remains a delegated attention input; only selected DIDs become ordinary
 * app.bsky.graph.block records.
 */
export function ReviewListMembersDialog({
  control,
  list,
}: {
  control: Dialog.DialogControlProps
  list: app.bsky.graph.defs.ListView
}) {
  return (
    <Dialog.Outer
      control={control}
      testID="reviewListMembersDialog"
      nativeOptions={{fullHeight: true}}>
      <Dialog.Handle />
      <ReviewListMembersDialogInner list={list} />
    </Dialog.Outer>
  )
}

function ReviewListMembersDialogInner({
  list,
}: {
  list: app.bsky.graph.defs.ListView
}) {
  const {_} = useLingui()
  const control = Dialog.useDialogContext()
  const moderationOpts = useModerationOpts()
  const [selectedDids, setSelectedDids] = useState<string[]>([])
  const {mutateAsync: blockDirectly, isPending: isBlocking} =
    useDirectBlockMutation()
  const {data, isError, isFetchingNextPage, hasNextPage, fetchNextPage} =
    useListMembersQuery(list.uri, 50)

  const members = useMemo(
    () => data?.pages.flatMap(page => page.items) ?? [],
    [data],
  )

  const onConfirm = useCallback(async () => {
    if (selectedDids.length === 0 || isBlocking) return

    try {
      // Each selected DID is written independently as app.bsky.graph.block.
      // No membership watcher or listblock operation is involved.
      for (const did of selectedDids) {
        await blockDirectly({did})
      }
      Toast.show(
        _(
          msg`${selectedDids.length} account${selectedDids.length === 1 ? '' : 's'} blocked`,
        ),
      )
      control.close()
    } catch {
      Toast.show(
        _(
          msg`Some accounts could not be blocked. Review the selection and try again.`,
        ),
        {type: 'error'},
      )
    }
  }, [_, blockDirectly, control, isBlocking, selectedDids])

  const renderItem = useCallback(
    ({item}: {item: app.bsky.graph.defs.ListItemView}) => {
      const profile = item.subject
      const isDirectlyBlocked = hasDirectViewerBlock(profile)
      const isSelected = selectedDids.includes(profile.did)

      if (!moderationOpts) return null

      return (
        <ToggleItem
          profile={profile}
          moderationOpts={moderationOpts}
          selected={isSelected}
          disabled={isDirectlyBlocked}
          isDirectlyBlocked={isDirectlyBlocked}
        />
      )
    },
    [moderationOpts, selectedDids],
  )

  const listHeader = (
    <View style={[a.gap_xs, a.px_lg, a.pt_lg, a.pb_md]}>
      <Text style={[a.text_xl, a.font_semi_bold]}>
        <Trans>Review accounts</Trans>
      </Text>
      <Text style={[a.text_sm]}>
        <Trans>
          Created by {list.creator.handle}.{' '}
          {list.listItemCount ?? members.length} members.
        </Trans>
      </Text>
      <Text style={[a.text_sm]}>
        <Trans>
          Select individual accounts to create direct blocks. Changes to this
          list will never create additional blocks.
        </Trans>
      </Text>
    </View>
  )

  return (
    <Toggle.Group
      values={selectedDids}
      onChange={setSelectedDids}
      type="checkbox"
      label={_(msg`Select accounts to block`)}
      style={[a.flex_1]}>
      <Dialog.InnerFlatList
        data={members}
        renderItem={renderItem}
        keyExtractor={(item: app.bsky.graph.defs.ListItemView) =>
          item.subject.did
        }
        ListHeaderComponent={listHeader}
        stickyHeaderIndices={[0]}
        ListEmptyComponent={
          <View style={[a.px_lg, a.py_lg]}>
            <Text>
              {isError ? (
                <Trans>We could not load this list. Try again later.</Trans>
              ) : (
                <Trans>This list has no members to review.</Trans>
              )}
            </Text>
          </View>
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={[a.py_lg, a.align_center]}>
              <Loader size="lg" />
            </View>
          ) : null
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
        }}
        onEndReachedThreshold={0.5}
        footer={
          <Dialog.FlatListFooter>
            <Button
              label={_(msg`Block selected accounts`)}
              color="negative"
              size="large"
              disabled={selectedDids.length === 0 || isBlocking}
              onPress={() => void onConfirm()}>
              <ButtonText>
                <Trans>Block selected accounts</Trans>
              </ButtonText>
              {isBlocking && <ButtonIcon icon={Loader} />}
            </Button>
          </Dialog.FlatListFooter>
        }
      />
    </Toggle.Group>
  )
}

function ToggleItem({
  profile,
  moderationOpts,
  selected,
  disabled,
  isDirectlyBlocked,
}: {
  profile: app.bsky.actor.defs.ProfileView
  moderationOpts: NonNullable<ReturnType<typeof useModerationOpts>>
  selected: boolean
  disabled: boolean
  isDirectlyBlocked: boolean
}) {
  const {_} = useLingui()
  const label = profile.displayName || profile.handle

  return (
    <Toggle.Item
      name={profile.did}
      label={label}
      value={selected}
      disabled={disabled}
      style={[a.px_lg, a.py_md, a.gap_md]}>
      <ProfileCard.Avatar
        profile={profile}
        moderationOpts={moderationOpts}
        size={40}
      />
      <View style={[a.flex_1, a.gap_2xs]}>
        <ProfileCard.Name profile={profile} moderationOpts={moderationOpts} />
        <ProfileCard.Handle profile={profile} />
        <ProfileCard.Labels profile={profile} moderationOpts={moderationOpts} />
        <Text style={[a.text_xs]}>
          {isDirectlyBlocked
            ? _(msg`Already directly blocked`)
            : profile.viewer?.following
              ? _(msg`Following`)
              : _(msg`Not following`)}
        </Text>
      </View>
      <Toggle.Checkbox />
    </Toggle.Item>
  )
}
