import {useState} from 'react'
import {useLingui} from '@lingui/react/macro'

import {DEFAULT_SERVICE} from '#/lib/constants'
import {cleanError, isNetworkError} from '#/lib/strings/errors'
import {useSessionApi} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {LoggedOutLayout} from '#/view/com/util/layouts/LoggedOutLayout'
import {FormContainer} from '#/screens/Login/FormContainer'
import {atoms as a} from '#/alf'
import * as Admonition from '#/components/Admonition'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {HostingProvider} from '#/components/forms/HostingProvider'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'

/** Provider-owned account creation; credentials never pass through the app. */
export function OAuthSignup({onPressBack}: {onPressBack: () => void}) {
  const {t: l} = useLingui()
  const {signUp} = useSessionApi()
  const {setShowLoggedOut} = useLoggedOutViewControls()
  const [service, setService] = useState(DEFAULT_SERVICE)
  const [error, setError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const onContinue = async () => {
    if (isProcessing) return
    setError('')
    setIsProcessing(true)
    try {
      await signUp(
        {service},
        {
          signupDuration: 0,
          fieldErrorsTotal: 0,
          backgroundCount: 0,
        },
      )
      setShowLoggedOut(false)
    } catch (err) {
      setIsProcessing(false)
      setError(
        isNetworkError(err)
          ? l`Unable to contact your service. Please check your Internet connection.`
          : cleanError(err),
      )
    }
  }

  return (
    <LoggedOutLayout
      leadin=""
      title={l`Create account`}
      description={l`Your hosting provider will securely collect your account details.`}
      scrollable>
      <FormContainer testID="createAccount" style={[a.gap_lg, a.pt_2xl]}>
        <HostingProvider
          minimal
          serviceUrl={service}
          onSelectServiceUrl={setService}
        />
        {error ? (
          <Admonition.Admonition type="error">{error}</Admonition.Admonition>
        ) : null}
        <Button
          label={l`Continue with OAuth`}
          color="primary"
          size="large"
          onPress={() => void onContinue()}
          disabled={isProcessing}>
          <ButtonText>{l`Continue with OAuth`}</ButtonText>
          {isProcessing && <ButtonIcon icon={Loader} />}
        </Button>
        <Text style={[a.text_sm, a.text_center]}>
          {l`Credentials stay with your provider.`}
        </Text>
        <Button
          label={l`Back`}
          color="secondary"
          size="large"
          onPress={onPressBack}
          disabled={isProcessing}>
          <ButtonText>{l`Back`}</ButtonText>
        </Button>
      </FormContainer>
    </LoggedOutLayout>
  )
}
