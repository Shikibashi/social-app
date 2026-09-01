import {useEffect, useState} from 'react'
import {View} from 'react-native'
import {utils} from '@bsky.app/alf'
import {Trans, useLingui} from '@lingui/react/macro'
import {FocusGuards, FocusScope} from 'radix-ui/internal'

import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {PlumblineShellBrand} from '#/view/shell/PlumblineShellBrand'
import {atoms as a, flatten, useBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {type WelcomeModalControl} from '#/components/hooks/useWelcomeModal.shared'
import {TimesLarge_Stroke2_Corner0_Rounded as XIcon} from '#/components/icons/Times'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

interface WelcomeModalProps {
  control: WelcomeModalControl
}

export function WelcomeModal({control}: WelcomeModalProps) {
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const t = useTheme()
  const {requestSwitchToAccount} = useLoggedOutViewControls()
  const {gtMobile} = useBreakpoints()
  const [isExiting, setIsExiting] = useState(false)

  const fadeOutAndClose = (callback?: () => void) => {
    setIsExiting(true)
    setTimeout(() => {
      control.close()
      if (callback) callback()
    }, 150)
  }

  useEffect(() => {
    if (control.isOpen) {
      ax.metric('welcomeModal:presented', {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [control.isOpen])

  const onPressCreateAccount = () => {
    ax.metric('welcomeModal:signupClicked', {})
    control.close()
    requestSwitchToAccount({requestedAccount: 'new'})
  }

  const onPressExplore = () => {
    ax.metric('welcomeModal:exploreClicked', {})
    fadeOutAndClose()
  }

  const onPressSignIn = () => {
    ax.metric('welcomeModal:signinClicked', {})
    control.close()
    requestSwitchToAccount({requestedAccount: 'existing'})
  }

  FocusGuards.useFocusGuards()

  return (
    <View
      role="dialog"
      aria-modal
      aria-label={l`Welcome to Plumbline`}
      style={[
        a.fixed,
        a.inset_0,
        a.justify_center,
        a.align_center,
        {
          zIndex: 9999,
          backgroundColor: utils.alpha(t.palette.black, 0.72),
        },
        isExiting ? a.fade_out : a.fade_in,
      ]}>
      <FocusScope.FocusScope asChild loop trapped>
        <View
          style={flatten([
            {
              maxWidth: 520,
              width: '90%',
              maxHeight: 'calc(100dvh - 32px)',
            },
            a.overflow_hidden,
            a.border,
            t.atoms.bg,
            t.atoms.border_contrast_medium,
            web({boxShadow: '4px 4px 0 var(--ecw-hard-shadow)'}),
          ])}>
          <View style={[a.gap_2xl, a.p_xl, gtMobile && a.p_2xl]}>
            <PlumblineShellBrand />
            <View
              style={[
                a.gap_sm,
                a.pt_xl,
                a.border_t,
                t.atoms.border_contrast_medium,
              ]}>
              <Text
                style={[
                  gtMobile ? a.text_3xl : a.text_2xl,
                  a.font_semi_bold,
                  {
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    lineHeight: 1.2,
                  },
                ]}>
                <Trans>Real people.</Trans>
                {'\n'}
                <Trans>Real conversations.</Trans>
                {'\n'}
                <Trans>Social media you control.</Trans>
              </Text>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                <Trans>
                  Choose how you read, publish, and participate on the open web.
                </Trans>
              </Text>
            </View>
            <View style={[a.gap_md]}>
              <Button
                onPress={onPressCreateAccount}
                label={l`Create account`}
                size="large"
                color="primary"
                style={a.w_full}>
                <ButtonText>
                  <Trans>Create account</Trans>
                </ButtonText>
              </Button>
              <Button
                onPress={onPressExplore}
                label={l`Explore the app`}
                size="large"
                color="secondary"
                variant="ghost"
                style={a.w_full}>
                {({hovered}) => (
                  <ButtonText style={[hovered && a.underline]}>
                    <Trans>Explore the app</Trans>
                  </ButtonText>
                )}
              </Button>
              <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                  <Trans>Already have an account?</Trans>
                </Text>
                <Button
                  onPress={onPressSignIn}
                  label={l`Sign in`}
                  size="small"
                  color="secondary"
                  variant="ghost">
                  {({hovered}) => (
                    <ButtonText style={[a.font_medium, hovered && a.underline]}>
                      <Trans>Sign in</Trans>
                    </ButtonText>
                  )}
                </Button>
              </View>
            </View>
          </View>
          <Button
            label={l`Close welcome modal`}
            style={[
              a.absolute,
              {
                top: 8,
                right: 8,
              },
              a.bg_transparent,
            ]}
            hoverStyle={[a.bg_transparent]}
            onPress={() => {
              ax.metric('welcomeModal:dismissed', {})
              fadeOutAndClose()
            }}
            color="secondary"
            size="small"
            variant="ghost"
            shape="round">
            {({hovered, pressed, focused}) => (
              <XIcon
                size="md"
                style={[
                  t.atoms.text,
                  {opacity: hovered || pressed || focused ? 1 : 0.7},
                ]}
              />
            )}
          </Button>
        </View>
      </FocusScope.FocusScope>
    </View>
  )
}
