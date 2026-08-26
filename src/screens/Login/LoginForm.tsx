import {useRef, useState} from 'react'
import {Keyboard, type TextInput, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {DEFAULT_SERVICE} from '#/lib/constants'
import {useRequestNotificationsPermission} from '#/lib/notifications/notifications'
import {cleanError, isNetworkError} from '#/lib/strings/errors'
import {createFullHandle} from '#/lib/strings/handles'
import {isBlueskyHostedUrl, toNiceHostingUrl} from '#/lib/strings/url-helpers'
import {logger} from '#/logger'
import {useSetHasCheckedForStarterPack} from '#/state/preferences/used-starter-packs'
import {
  type HostingProviderState,
  useHostingProvider,
} from '#/state/queries/pds-detection'
import {useSession, useSessionApi} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {atoms as a, native, useBreakpoints, useTheme} from '#/alf'
import * as Admonition from '#/components/Admonition'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {useDialogControl} from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import {At_Stroke2_Corner0_Rounded as AtIcon} from '#/components/icons/At'
import {TinyChevronBottom_Stroke2_Corner0_Rounded as TinyChevronIcon} from '#/components/icons/Chevron'
import {Envelope_Stroke2_Corner0_Rounded as EmailIcon} from '#/components/icons/Envelope'
import {createStaticClick, InlineLinkText} from '#/components/Link'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {IS_NATIVE} from '#/env'
import {type com} from '#/lexicons'
import {ConfirmHostingProviderDialog} from './components/ConfirmHostingProviderDialog'
import {HostingProviderDialog} from './components/HostingProviderDialog'
import {FormContainer} from './FormContainer'

type ServiceDescription = com.atproto.server.describeServer.$OutputBody

/**
 * The login surface is deliberately OAuth-only. Credential collection happens
 * in the PDS authorization UI opened by the official ATProto OAuth client.
 */
export const LoginForm = ({
  error,
  serviceUrl,
  serviceDescription,
  initialHandle,
  setError,
  setServiceUrl,
  onPressRetryConnect,
  onPressBack,
  onAttemptSuccess,
  onAttemptFailed,
  onPressCreateAccount,
}: {
  error: string
  serviceUrl: string
  serviceDescription: ServiceDescription | undefined
  initialHandle: string
  setError: (v: string) => void
  setServiceUrl: (v: string) => void
  onPressRetryConnect: () => void
  onPressBack: () => void
  onAttemptSuccess: () => void
  onAttemptFailed: () => void
  onPressCreateAccount: () => void
}) => {
  const t = useTheme()
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorField, setErrorField] = useState<'none' | 'identifier'>('none')
  const [showResolveError, setShowResolveError] = useState(false)
  const identifierValueRef = useRef(initialHandle || '')
  const identifierRef = useRef<TextInput>(null)
  const [identifier, setIdentifier] = useState(initialHandle || '')
  const [identifierFocused, setIdentifierFocused] = useState(false)
  const {t: l} = useLingui()
  const {login} = useSessionApi()
  const {accounts} = useSession()
  const requestNotificationsPermission = useRequestNotificationsPermission()
  const {setShowLoggedOut} = useLoggedOutViewControls()
  const setHasCheckedForStarterPack = useSetHasCheckedForStarterPack()
  const serverInputControl = useDialogControl()
  const confirmHostingProviderControl = useDialogControl()
  const [pendingLogin, setPendingLogin] = useState<{
    service: string
    fullIdent: string
  } | null>(null)
  const hostingProvider = useHostingProvider({
    identifier,
    defaultService: serviceUrl,
  })
  const {gtMobile} = useBreakpoints()

  const showUnresolvedError =
    hostingProvider.state.status === 'unresolved' && !identifierFocused

  const attemptLogin = async (service: string, fullIdent: string) => {
    setIsProcessing(true)
    try {
      await login({service, identifier: fullIdent}, 'LoginForm')
      onAttemptSuccess()
      setShowLoggedOut(false)
      setHasCheckedForStarterPack(true)
      void requestNotificationsPermission('Login')
    } catch (err) {
      const errMsg = String(err)
      setIsProcessing(false)
      onAttemptFailed()
      if (isNetworkError(err)) {
        logger.warn('Failed to start OAuth login due to network error', {
          error: errMsg,
        })
        setError(
          l`Unable to contact your service. Please check your Internet connection.`,
        )
      } else {
        logger.warn('Failed to start OAuth login', {error: errMsg})
        setError(cleanError(err))
      }
    }
  }

  const onPressNext = async () => {
    if (isProcessing) return
    Keyboard.dismiss()
    setError('')
    setErrorField('none')
    setShowResolveError(false)

    const enteredIdentifier = identifierValueRef.current.toLowerCase().trim()
    if (!enteredIdentifier) {
      setError(l`Please enter your username`)
      setErrorField('identifier')
      return
    }

    setIsProcessing(true)
    let fullIdent = enteredIdentifier
    if (
      !enteredIdentifier.includes('@') &&
      !enteredIdentifier.includes('.') &&
      !enteredIdentifier.startsWith('did:') &&
      serviceDescription &&
      serviceDescription.availableUserDomains.length > 0
    ) {
      const matched = serviceDescription.availableUserDomains.some(domain =>
        fullIdent.endsWith(domain),
      )
      if (!matched) {
        fullIdent = createFullHandle(
          enteredIdentifier,
          serviceDescription.availableUserDomains[0],
        )
      }
    }

    let service: string
    let did: string | null
    try {
      ;({service, did} =
        await hostingProvider.resolveService(enteredIdentifier))
    } catch (err) {
      logger.debug('Failed to resolve hosting provider', {error: String(err)})
      setIsProcessing(false)
      setShowResolveError(true)
      return
    }

    const isKnownAccount =
      did != null && accounts.some(account => account.did === did)
    const needsConfirmation =
      !isBlueskyHostedUrl(service) &&
      hostingProvider.state.status !== 'overridden' &&
      !isKnownAccount

    if (needsConfirmation) {
      setIsProcessing(false)
      setPendingLogin({service, fullIdent})
      confirmHostingProviderControl.open()
      return
    }

    await attemptLogin(service, fullIdent)
  }

  return (
    <FormContainer testID="loginForm" titleText={<Trans>Sign in</Trans>}>
      <HostingProviderDialog
        control={serverInputControl}
        currentOverride={
          hostingProvider.state.status === 'overridden'
            ? hostingProvider.state.pdsUrl
            : null
        }
        isEmail={hostingProvider.state.status === 'email'}
        onSelectManual={url => {
          hostingProvider.override(url)
          setServiceUrl(url)
        }}
        onSelectAutomatic={() => {
          hostingProvider.clearOverride()
          setServiceUrl(DEFAULT_SERVICE)
        }}
      />
      <ConfirmHostingProviderDialog
        control={confirmHostingProviderControl}
        host={toNiceHostingUrl(pendingLogin?.service ?? '')}
        identifier={pendingLogin?.fullIdent ?? ''}
        onConfirm={() => {
          if (pendingLogin) {
            void attemptLogin(pendingLogin.service, pendingLogin.fullIdent)
          }
        }}
      />
      <View>
        <TextField.LabelText>
          <Trans>Username, email, or DID</Trans>
        </TextField.LabelText>
        <TextField.Root
          isInvalid={errorField === 'identifier' || showUnresolvedError}>
          <TextField.Icon
            icon={hostingProvider.state.status === 'email' ? EmailIcon : AtIcon}
          />
          <TextField.Input
            testID="loginUsernameInput"
            inputRef={identifierRef}
            label={l`Username, email, or DID`}
            placeholder={null}
            autoCapitalize="none"
            autoFocus={!initialHandle}
            autoCorrect={false}
            autoComplete="username"
            returnKeyType="go"
            textContentType="username"
            defaultValue={initialHandle || ''}
            onChangeText={value => {
              identifierValueRef.current = value
              setIdentifier(value)
              if (errorField) setErrorField('none')
              if (showResolveError) setShowResolveError(false)
            }}
            onFocus={() => setIdentifierFocused(true)}
            onBlur={() => setIdentifierFocused(false)}
            onSubmitEditing={() => void onPressNext()}
            blurOnSubmit={false}
            editable={!isProcessing}
            accessibilityHint={l`Enter the identity you use with your hosting provider`}
          />
        </TextField.Root>
        {showUnresolvedError && (
          <Text
            style={[
              a.text_sm,
              a.leading_snug,
              a.mt_sm,
              {color: t.palette.negative_500},
            ]}>
            <Trans>
              We couldn't find that account. Check the identity, or{' '}
              <InlineLinkText
                label={l`set your hosting provider manually`}
                style={[a.text_sm, a.leading_snug]}
                {...createStaticClick(() => serverInputControl.open())}>
                set your hosting provider manually
              </InlineLinkText>
              .
            </Trans>
          </Text>
        )}
      </View>

      <Text style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
        <Trans>
          Your hosting provider will ask you to authorize this app. Your
          password stays with that provider.
        </Trans>
      </Text>

      {!showUnresolvedError &&
        (showResolveError ? (
          <Admonition.Outer type="error">
            <Admonition.Row>
              <Admonition.Icon />
              <Admonition.Content>
                <Admonition.Text>
                  <Trans>
                    We couldn’t verify your hosting provider. Check your
                    internet connection, or{' '}
                    <InlineLinkText
                      label={l`Set your hosting provider manually`}
                      style={[a.text_sm, a.leading_snug]}
                      {...createStaticClick(() => serverInputControl.open())}>
                      set your hosting provider manually
                    </InlineLinkText>
                    .
                  </Trans>
                </Admonition.Text>
              </Admonition.Content>
            </Admonition.Row>
          </Admonition.Outer>
        ) : (
          error && (
            <Admonition.Admonition type="error">{error}</Admonition.Admonition>
          )
        ))}

      <View
        style={[
          a.pt_md,
          gtMobile && [a.justify_between, a.flex_row, a.gap_sm],
        ]}>
        {gtMobile && (
          <>
            <Button
              label={l`Back`}
              color="secondary"
              size="large"
              onPress={onPressBack}>
              <ButtonText>
                <Trans>Back</Trans>
              </ButtonText>
            </Button>
            <View style={[a.flex_shrink, a.justify_center, a.ml_auto]}>
              <HostingProviderIndicator
                state={hostingProvider.state}
                onPress={() => serverInputControl.open()}
              />
            </View>
          </>
        )}
        {!serviceDescription && error ? (
          <Button
            testID="loginRetryButton"
            label={l`Retry`}
            color="primary_subtle"
            size="large"
            onPress={onPressRetryConnect}>
            <ButtonText>
              <Trans>Retry</Trans>
            </ButtonText>
          </Button>
        ) : !serviceDescription ? (
          <Button
            label={l`Connecting to service…`}
            size="large"
            color="secondary"
            disabled>
            <ButtonIcon icon={Loader} />
            <ButtonText>
              <Trans>Connecting…</Trans>
            </ButtonText>
          </Button>
        ) : (
          <Button
            testID="loginNextButton"
            label={l`Continue with OAuth`}
            color="primary"
            size="large"
            onPress={() => void onPressNext()}>
            <ButtonText>
              <Trans>Continue with OAuth</Trans>
            </ButtonText>
            {isProcessing && <ButtonIcon icon={Loader} />}
          </Button>
        )}
      </View>

      {IS_NATIVE && (
        <Text style={[a.text_md, native([a.text_center, a.mx_auto]), a.mt_sm]}>
          <Trans>
            New to Bluesky?{' '}
            <InlineLinkText
              label={l`Sign up`}
              style={[a.text_md, native(a.text_center)]}
              {...createStaticClick(onPressCreateAccount)}>
              Sign up
            </InlineLinkText>
          </Trans>
        </Text>
      )}

      {!gtMobile && (
        <HostingProviderIndicator
          state={hostingProvider.state}
          onPress={() => serverInputControl.open()}
        />
      )}
    </FormContainer>
  )
}

function HostingProviderIndicator({
  state,
  onPress,
}: {
  state: HostingProviderState
  onPress: () => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const {gtMobile} = useBreakpoints()

  return (
    <Button
      testID="selectServiceButton"
      label={l`Change hosting provider`}
      accessibilityHint={l`Opens a dialog to change the hosting provider you sign in to`}
      style={[!gtMobile && [a.mt_auto, a.mb_sm, a.self_center]]}
      size="small"
      color="secondary"
      variant="ghost"
      onPress={onPress}>
      <ButtonText
        style={[t.atoms.text_contrast_medium, a.font_normal]}
        numberOfLines={1}>
        {state.status === 'detected' || state.status === 'overridden' ? (
          <Trans>Hosting provider: {toNiceHostingUrl(state.pdsUrl)}</Trans>
        ) : state.status === 'email' ? (
          <Trans>Hosting provider: Bluesky</Trans>
        ) : (
          <Trans>Hosting provider</Trans>
        )}
      </ButtonText>
      <TinyChevronIcon width={8} style={[t.atoms.text_contrast_medium]} />
    </Button>
  )
}
