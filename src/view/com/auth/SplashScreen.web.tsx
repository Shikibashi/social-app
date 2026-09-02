import {useEffect, useState} from 'react'
import {Pressable, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {PRODUCT_NAME} from '#/lib/brand'
import {ErrorBoundary} from '#/view/com/util/ErrorBoundary'
import {Logo} from '#/view/icons/Logo'
import {PlumblinePageMasthead} from '#/view/shell/PlumblineShellBrand'
import {
  AppClipOverlay,
  postAppClipMessage,
} from '#/screens/StarterPack/StarterPackLandingScreen'
import {atoms as a, useTheme} from '#/alf'
import {AppLanguageDropdown} from '#/components/AppLanguageDropdown'
import {Button, ButtonText} from '#/components/Button'
import {TimesLarge_Stroke2_Corner0_Rounded as TimesIcon} from '#/components/icons/Times'
import {InlineLinkText} from '#/components/Link'
import {H1, Text} from '#/components/Typography'

export const SplashScreen = ({
  onDismiss,
  onPressSignin,
  onPressCreateAccount,
}: {
  onDismiss?: () => void
  onPressSignin: () => void
  onPressCreateAccount: () => void
}) => {
  const {_} = useLingui()
  const t = useTheme()
  const [showClipOverlay, setShowClipOverlay] = useState(false)
  const authShellWebProps = {
    dataSet: {ecwMode: 'page'},
  } as {dataSet: Record<string, string>}

  useEffect(() => {
    const getParams = new URLSearchParams(window.location.search)
    const clip = getParams.get('clip')
    if (clip === 'true') {
      setShowClipOverlay(true)
      postAppClipMessage({
        action: 'present',
      })
    }
  }, [])

  return (
    <>
      {onDismiss && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={_(msg`Close`)}
          accessibilityHint={_(msg`Closes this welcome screen`)}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            padding: 20,
            zIndex: 100,
          }}
          onPress={onDismiss}>
          <TimesIcon width={24} style={t.atoms.text} />
        </Pressable>
      )}

      <View
        role="main"
        id="plumbline-main-content"
        tabIndex={-1}
        testID="plumbline-auth-shell"
        {...authShellWebProps}
        style={[a.h_full, a.flex_1, t.atoms.bg]}>
        <PlumblinePageMasthead />
        <View testID="noSessionView" style={a.flex_1}>
          <ErrorBoundary>
            <View testID="plumbline-auth-entry" style={[a.flex_1, a.w_full]}>
              <View testID="plumbline-auth-document" style={[a.w_full]}>
                <View
                  testID="plumbline-auth-identity"
                  style={[a.flex_row, a.align_center, a.gap_md]}>
                  <Logo width={52} />
                  <View style={[a.flex_shrink, a.gap_xs]}>
                    <Text testID="plumbline-auth-wordmark">{PRODUCT_NAME}</Text>
                    <Text testID="plumbline-auth-descriptor">
                      <Trans>Social client for the open web</Trans>
                    </Text>
                  </View>
                </View>

                <View testID="plumbline-auth-introduction">
                  <Text testID="plumbline-auth-kicker">
                    <Trans>Account entry / user-held identity</Trans>
                  </Text>
                  <H1 testID="plumbline-auth-heading">
                    <Trans>Choose how you enter the network.</Trans>
                  </H1>
                  <Text testID="plumbline-auth-copy">
                    <Trans>
                      Sign in with an account you already hold, or create one
                      through a hosting provider. Your account host remains the
                      write and identity authority; this client does not become
                      your account provider.
                    </Trans>
                  </Text>
                </View>

                <View
                  testID="signinOrCreateAccount"
                  style={[a.w_full, a.gap_md]}>
                  <Button
                    testID="createAccountButton"
                    onPress={onPressCreateAccount}
                    label={_(msg`Create new account`)}
                    accessibilityHint={_(
                      msg`Opens flow to create a new ATmosphere account`,
                    )}
                    size="large"
                    variant="solid"
                    color="primary">
                    <ButtonText>
                      <Trans>Create account</Trans>
                    </ButtonText>
                  </Button>
                  <Button
                    testID="signInButton"
                    onPress={onPressSignin}
                    label={_(msg`Sign in`)}
                    accessibilityHint={_(
                      msg`Opens flow to sign in to your existing ATmosphere account`,
                    )}
                    size="large"
                    variant="solid"
                    color="secondary">
                    <ButtonText>
                      <Trans>Sign in</Trans>
                    </ButtonText>
                  </Button>
                </View>

                <Text testID="plumbline-auth-note">
                  <Trans>
                    Provider, ranking, moderation, export, and migration choices
                    remain visible after you enter.
                  </Trans>
                </Text>
              </View>
            </View>
          </ErrorBoundary>
        </View>
        <Footer />
      </View>
      <AppClipOverlay
        visible={showClipOverlay}
        setIsVisible={setShowClipOverlay}
      />
    </>
  )
}

function Footer() {
  const t = useTheme()
  const {_} = useLingui()

  return (
    <View
      testID="plumbline-auth-footer"
      style={[
        a.px_xl,
        a.py_lg,
        a.border_t,
        a.flex_row,
        a.align_center,
        a.flex_wrap,
        a.gap_xl,
        t.atoms.border_contrast_medium,
      ]}>
      <InlineLinkText
        label={_(msg`Visit Plumbline at plumblines.uk`)}
        to="https://plumblines.uk/">
        <Trans>plumblines.uk</Trans>
      </InlineLinkText>

      <View style={a.flex_1} />

      <AppLanguageDropdown />
    </View>
  )
}
