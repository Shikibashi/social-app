import {memo, useCallback} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {useCloseAllActiveElements} from '#/state/util'
import {atoms as a} from '#/alf'
import {AppLanguageDropdown} from '#/components/AppLanguageDropdown'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'

let NavSignupCard = ({}: {}): React.ReactNode => {
  const {_} = useLingui()
  const {requestSwitchToAccount} = useLoggedOutViewControls()
  const closeAllActiveElements = useCloseAllActiveElements()

  const showSignIn = useCallback(() => {
    closeAllActiveElements()
    requestSwitchToAccount({requestedAccount: 'none'})
  }, [requestSwitchToAccount, closeAllActiveElements])

  const showCreateAccount = useCallback(() => {
    closeAllActiveElements()
    requestSwitchToAccount({requestedAccount: 'new'})
    // setShowLoggedOut(true)
  }, [requestSwitchToAccount, closeAllActiveElements])

  return (
    <View testID="plumbline-nav-signup-card" style={[{maxWidth: 245}]}>
      <View>
        <Text
          testID="plumbline-nav-signup-heading"
          style={[
            a.text_3xl,
            a.font_bold,
            {
              fontFamily: 'Georgia, "Times New Roman", serif',
              lineHeight: a.text_3xl.fontSize,
            },
          ]}>
          <Trans>Join the conversation</Trans>
        </Text>
      </View>

      <View style={[a.flex_row, a.flex_wrap, a.gap_sm, a.pt_md]}>
        <Button
          onPress={showCreateAccount}
          label={_(msg`Create account`)}
          size="small"
          variant="solid"
          color="primary"
          shape="rectangular">
          <ButtonText>
            <Trans>Create account</Trans>
          </ButtonText>
        </Button>
        <Button
          onPress={showSignIn}
          label={_(msg`Sign in`)}
          size="small"
          variant="outline"
          color="secondary"
          shape="rectangular">
          <ButtonText>
            <Trans>Sign in</Trans>
          </ButtonText>
        </Button>
      </View>

      <View style={[a.mt_md, a.w_full, {height: 32}]}>
        <AppLanguageDropdown />
      </View>
    </View>
  )
}
NavSignupCard = memo(NavSignupCard)
export {NavSignupCard}
