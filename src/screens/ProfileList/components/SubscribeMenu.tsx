import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useListMuteMutation} from '#/state/queries/list'
import {atoms as a} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {useDialogControl} from '#/components/Dialog'
import {ReviewListMembersDialog} from '#/components/dialogs/lists/ReviewListMembersDialog'
import {Mute_Stroke2_Corner0_Rounded as MuteIcon} from '#/components/icons/Mute'
import {Loader} from '#/components/Loader'
import * as Menu from '#/components/Menu'
import * as Prompt from '#/components/Prompt'
import * as Toast from '#/components/Toast'
import {useAnalytics} from '#/analytics'
import {type app} from '#/lexicons'

export function SubscribeMenu({list}: {list: app.bsky.graph.defs.ListView}) {
  const {_} = useLingui()
  const ax = useAnalytics()
  const subscribeMutePromptControl = Prompt.usePromptControl()
  const reviewDialogControl = useDialogControl()

  const {mutateAsync: muteList, isPending: isMutePending} =
    useListMuteMutation()

  const isPending = isMutePending

  const onSubscribeMute = async () => {
    try {
      await muteList({uri: list.uri, mute: true})
      Toast.show(_(msg({message: 'List muted', context: 'toast'})))
      ax.metric('moderation:subscribedToList', {listType: 'mute'})
    } catch {
      Toast.show(
        _(
          msg`There was an issue. Please check your internet connection and try again.`,
        ),
        {type: 'error'},
      )
    }
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger label={_(msg`Subscribe to this list`)}>
          {({props}) => (
            <Button
              label={props.accessibilityLabel}
              testID="subscribeBtn"
              size="small"
              color="primary_subtle"
              style={[a.rounded_full]}
              disabled={isPending}
              {...props}>
              {isPending && <ButtonIcon icon={Loader} />}
              <ButtonText>
                <Trans>Subscribe</Trans>
              </ButtonText>
            </Button>
          )}
        </Menu.Trigger>
        <Menu.Outer showCancel>
          <Menu.Group>
            <Menu.Item
              label={_(msg`Mute list`)}
              onPress={subscribeMutePromptControl.open}>
              <Menu.ItemText>
                <Trans>Mute list</Trans>
              </Menu.ItemText>
              <Menu.ItemIcon position="right" icon={MuteIcon} />
            </Menu.Item>
            <Menu.Item
              label={_(msg`Review accounts`)}
              onPress={reviewDialogControl.open}>
              <Menu.ItemText>
                <Trans>Review accounts</Trans>
              </Menu.ItemText>
            </Menu.Item>
          </Menu.Group>
        </Menu.Outer>
      </Menu.Root>

      <Prompt.Basic
        control={subscribeMutePromptControl}
        title={_(msg`Mute this list?`)}
        description={_(
          msg`Muting a list is private attention state. It filters the list's members for you without creating public blocks, and later membership changes will not create blocks.`,
        )}
        onConfirm={onSubscribeMute}
        confirmButtonCta={_(msg`Mute list`)}
      />

      <ReviewListMembersDialog control={reviewDialogControl} list={list} />
    </>
  )
}
