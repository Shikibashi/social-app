import {useState} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useGetTimeAgo} from '#/lib/hooks/useTimeAgo'
import {
  getModerationPolicyTrace,
  type ModerationBehavior,
  type ModerationCause,
} from '#/lib/moderation'
import {useModerationCauseDescription} from '#/lib/moderation/useModerationCauseDescription'
import {makeProfileLink} from '#/lib/routes/links'
import {listUriToHref} from '#/lib/strings/url-helpers'
import {useSession} from '#/state/session'
import {atoms as a, useBreakpoints, useGutters, useTheme, web} from '#/alf'
import {Admonition} from '#/components/Admonition'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {InlineLinkText} from '#/components/Link'
import {AppealForm} from '#/components/moderation/AppealForm'
import {type AppModerationCause} from '#/components/Pills'
import {Text} from '#/components/Typography'
import {IS_NATIVE} from '#/env'

export {useDialogControl as useModerationDetailsDialogControl} from '#/components/Dialog'

export interface ModerationDetailsDialogProps {
  control: Dialog.DialogOuterProps['control']
  modcause?: ModerationCause | AppModerationCause
}

export function ModerationDetailsDialog(props: ModerationDetailsDialogProps) {
  return (
    <Dialog.Outer
      control={props.control}
      nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <ModerationDetailsDialogInner {...props} />
    </Dialog.Outer>
  )
}

function ModerationDetailsDialogInner({
  modcause,
  control,
}: ModerationDetailsDialogProps & {
  control: Dialog.DialogOuterProps['control']
}) {
  const t = useTheme()
  const xGutters = useGutters([0, 'base'])
  const {_} = useLingui()
  const desc = useModerationCauseDescription(modcause)
  const {currentAccount} = useSession()
  const timeDiff = useGetTimeAgo({future: true})
  const [isAppealing, setIsAppealing] = useState(false)
  const {gtPhone} = useBreakpoints()
  const labelTrace =
    modcause?.type === 'label' ? getModerationPolicyTrace(modcause) : undefined
  const clientActions: string[] = []

  if (labelTrace) {
    const behavior: ModerationBehavior = labelTrace.clientBehavior
    if (behavior.profileList === 'blur') {
      clientActions.push(_(msg`Blur the profile in lists`))
    } else if (behavior.profileList === 'alert') {
      clientActions.push(_(msg`Show a warning for the profile in lists`))
    } else if (behavior.profileList === 'inform') {
      clientActions.push(
        _(msg`Show an information notice for the profile in lists`),
      )
    }
    if (behavior.profileView === 'blur') {
      clientActions.push(_(msg`Blur the profile view`))
    } else if (behavior.profileView === 'alert') {
      clientActions.push(_(msg`Show a warning for the profile view`))
    } else if (behavior.profileView === 'inform') {
      clientActions.push(
        _(msg`Show an information notice for the profile view`),
      )
    }
    if (behavior.avatar === 'blur') {
      clientActions.push(_(msg`Blur the avatar`))
    } else if (behavior.avatar === 'alert') {
      clientActions.push(_(msg`Show a warning for the avatar`))
    }
    if (behavior.banner === 'blur') {
      clientActions.push(_(msg`Blur the banner`))
    }
    if (behavior.displayName === 'blur') {
      clientActions.push(_(msg`Blur the display name`))
    }
    if (behavior.contentList === 'blur') {
      clientActions.push(_(msg`Blur the content in lists`))
    } else if (behavior.contentList === 'alert') {
      clientActions.push(_(msg`Show a warning for the content in lists`))
    } else if (behavior.contentList === 'inform') {
      clientActions.push(
        _(msg`Show an information notice for the content in lists`),
      )
    }
    if (behavior.contentView === 'blur') {
      clientActions.push(_(msg`Blur the content view`))
    } else if (behavior.contentView === 'alert') {
      clientActions.push(_(msg`Show a warning for the content view`))
    } else if (behavior.contentView === 'inform') {
      clientActions.push(
        _(msg`Show an information notice for the content view`),
      )
    }
    if (behavior.contentMedia === 'blur') {
      clientActions.push(_(msg`Blur the content media`))
    }
  }

  /*
   * Appeal eligibility: only for label causes on content belonging to the
   * current user, where the label was not self-applied.
   */
  const canAppeal =
    modcause?.type === 'label' &&
    !!currentAccount &&
    modcause.label.src !== currentAccount.did &&
    (modcause.label.uri === currentAccount.did ||
      modcause.label.uri.startsWith(`at://${currentAccount.did}/`))

  let name
  let description
  if (!modcause) {
    name = _(msg`Content Warning`)
    description = _(
      msg`Moderator has chosen to set a general warning on the content.`,
    )
  } else if (modcause.type === 'blocking') {
    if (modcause.source.type === 'list') {
      const list = modcause.source.list
      name = _(msg`User Blocked by List`)
      description = (
        <Trans>
          This user is included in the{' '}
          <InlineLinkText
            label={list.name}
            to={listUriToHref(list.uri)}
            style={[a.text_sm]}>
            {list.name}
          </InlineLinkText>{' '}
          list which you have blocked.
        </Trans>
      )
    } else {
      name = _(msg`User Blocked`)
      description = _(
        msg`You have blocked this user. You cannot view their content.`,
      )
    }
  } else if (modcause.type === 'blocked-by') {
    name = _(msg`User Blocks You`)
    description = _(
      msg`This user has blocked you. You cannot view their content.`,
    )
  } else if (modcause.type === 'block-other') {
    name = _(msg`Content Not Available`)
    description = _(
      msg`This content is not available because one of the users involved has blocked the other.`,
    )
  } else if (modcause.type === 'muted') {
    if (modcause.source.type === 'list') {
      const list = modcause.source.list
      name = _(msg`Account Muted by List`)
      description = (
        <Trans>
          This user is included in the{' '}
          <InlineLinkText
            label={list.name}
            to={listUriToHref(list.uri)}
            style={[a.text_sm]}>
            {list.name}
          </InlineLinkText>{' '}
          list which you have muted.
        </Trans>
      )
    } else {
      name = _(msg`Account Muted`)
      description = _(msg`You have muted this account.`)
    }
  } else if (modcause.type === 'mute-word') {
    name = _(msg`Post Hidden by Muted Word`)
    description = _(msg`You've chosen to hide a word or tag within this post.`)
  } else if (modcause.type === 'hidden') {
    name = _(msg`Post Hidden by You`)
    description = _(msg`You have hidden this post.`)
  } else if (modcause.type === 'reply-hidden') {
    const isYou = currentAccount?.did === modcause.source.did
    name = isYou
      ? _(msg`Reply Hidden by You`)
      : _(msg`Reply Hidden by Thread Author`)
    description = isYou
      ? _(msg`You hid this reply.`)
      : _(msg`The author of this thread has hidden this reply.`)
  } else if (modcause.type === 'label') {
    name = desc.name
    description = (
      <Text emoji style={[t.atoms.text, a.text_md, a.leading_snug]}>
        {desc.description}
      </Text>
    )
  } else {
    // should never happen
    name = ''
    description = ''
  }

  const sourceName =
    desc.source || desc.sourceDisplayName || _(msg`an unknown labeler`)

  if (isAppealing && modcause?.type === 'label') {
    return (
      <Dialog.ScrollableInner
        label={_(msg`Appeal label`)}
        style={web({
          maxWidth: 460,
        })}>
        <AppealForm
          label={modcause.label}
          control={control}
          onPressBack={() => setIsAppealing(false)}
        />
        <Dialog.Close />
      </Dialog.ScrollableInner>
    )
  }

  return (
    <Dialog.ScrollableInner
      label={_(msg`Moderation details`)}
      contentContainerStyle={{
        paddingLeft: 0,
        paddingRight: 0,
        paddingBottom: 0,
      }}
      style={web({
        maxWidth: 460,
      })}>
      <View style={[xGutters, a.pb_lg]}>
        <Text emoji style={[t.atoms.text, a.text_2xl, a.font_bold, a.mb_sm]}>
          {name}
        </Text>
        <Text style={[t.atoms.text, a.text_sm, a.leading_snug]}>
          {description}
        </Text>

        {canAppeal && (
          <View
            style={[
              a.flex_row,
              a.flex_wrap,
              a.gap_sm,
              a.pt_md,
              a.pb_xs,
              a.mt_md,
              a.border_t,
              t.atoms.border_contrast_low,
            ]}>
            <Text
              style={[
                a.text_sm,
                t.atoms.text_contrast_medium,
                gtPhone ? a.flex_1 : a.w_full,
              ]}>
              <Trans>
                You may appeal these labels if you feel they were placed in
                error.
              </Trans>
            </Text>
            <Button
              variant="solid"
              color="primary_subtle"
              size="small"
              label={_(msg`Appeal this label`)}
              style={[gtPhone ? undefined : a.w_full]}
              onPress={() => setIsAppealing(true)}>
              <ButtonText>
                <Trans>Appeal</Trans>
              </ButtonText>
            </Button>
          </View>
        )}

        {desc.isSubjectAccount && (
          <Admonition type="info" style={[a.mt_md]}>
            <Trans>
              This label was applied to the entire user account and will appear
              on all posts.
            </Trans>
          </Admonition>
        )}
      </View>

      {modcause?.type === 'label' && (
        <View
          style={[
            xGutters,
            a.py_md,
            a.border_t,
            !IS_NATIVE && t.atoms.bg_contrast_25,
            t.atoms.border_contrast_low,
            {
              borderBottomLeftRadius: a.rounded_md.borderRadius,
              borderBottomRightRadius: a.rounded_md.borderRadius,
            },
          ]}>
          <View style={[a.gap_xs]}>
            <Text
              style={[a.text_xs, a.font_semi_bold, t.atoms.text_contrast_low]}>
              <Trans>Source</Trans>
            </Text>
            {modcause.source.type === 'user' ? (
              <Text style={[t.atoms.text, a.text_md, a.leading_snug]}>
                <Trans>The author of this post</Trans>
              </Text>
            ) : (
              <InlineLinkText
                label={sourceName}
                to={makeProfileLink({
                  did: modcause.label.src,
                  handle: '',
                })}
                onPress={() => control.close()}>
                {sourceName}
              </InlineLinkText>
            )}
            <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
              {modcause.label.src}
            </Text>
          </View>

          <View style={[a.gap_xs, a.mt_md]}>
            <Text
              style={[a.text_xs, a.font_semi_bold, t.atoms.text_contrast_low]}>
              <Trans>Assertion</Trans>
            </Text>
            <Text style={[t.atoms.text, a.text_md, a.leading_snug]}>
              {desc.name}
            </Text>
            <Text
              style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
              {desc.description}
            </Text>
            <Text style={[a.text_xs, t.atoms.text_contrast_low]}>
              {modcause.label.val} · {modcause.target}
            </Text>
          </View>

          <View style={[a.gap_xs, a.mt_md]}>
            <Text
              style={[a.text_xs, a.font_semi_bold, t.atoms.text_contrast_low]}>
              <Trans>Your rule</Trans>
            </Text>
            <Text style={[t.atoms.text, a.text_md, a.leading_snug]}>
              {labelTrace?.userOverridable ? (
                labelTrace.userRule === 'ignore' ? (
                  <Trans>
                    Show this content without a moderation treatment
                  </Trans>
                ) : labelTrace.userRule === 'warn' ? (
                  <Trans>Show this content with a warning</Trans>
                ) : (
                  <Trans>Hide this content</Trans>
                )
              ) : (
                <Trans>
                  Required by the label definition; not user-overridable here
                </Trans>
              )}
            </Text>
          </View>

          <View style={[a.gap_xs, a.mt_md]}>
            <Text
              style={[a.text_xs, a.font_semi_bold, t.atoms.text_contrast_low]}>
              <Trans>Plumbline action</Trans>
            </Text>
            <Text style={[t.atoms.text, a.text_md, a.leading_snug]}>
              {clientActions.length > 0 ? (
                clientActions.join(', ')
              ) : (
                <Trans>No presentation change</Trans>
              )}
            </Text>
          </View>

          {modcause.label.exp && (
            <Text
              style={[
                a.text_sm,
                a.italic,
                t.atoms.text_contrast_medium,
                a.mt_md,
              ]}>
              <Trans>
                Expires in {timeDiff(Date.now(), modcause.label.exp)}
              </Trans>
            </Text>
          )}
        </View>
      )}

      {IS_NATIVE && <View style={{height: 40}} />}

      <Dialog.Close />
    </Dialog.ScrollableInner>
  )
}
