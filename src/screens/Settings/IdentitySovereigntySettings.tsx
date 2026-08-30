import {useCallback, useEffect, useState} from 'react'
import {Alert, StyleSheet, TextInput, View} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import {Trans, useLingui} from '@lingui/react/macro'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {useNavigation} from '@react-navigation/native'
import {jwtDecode} from 'jwt-decode'

import {
  AUTHORITY_MAP,
  capabilityLabel,
  type IdentityOverview,
} from '#/lib/identity-sovereignty-ui'
import {parsePlcOperation} from '#/lib/plc-history'
import {
  createIndexedDbRotationKeyStore,
  createUserHeldRotationKey,
  isRotationKeyRegistered,
  rotationKeysWithUserHeldKey,
  submitUserHeldPlcOperation,
  type UserHeldRotationKey,
} from '#/lib/plc-key-custody'
import {type NavigationProp} from '#/lib/routes/types'
import {useRadlibMigrationStatusQuery} from '#/state/queries/radlib-migration'
import {usePdsClient, useSession, useSessionApi} from '#/state/session'
import {useEnsureOAuthFeature} from '#/state/session/oauth-feature-gate'
import {resolvePdsEndpointForDid} from '#/state/session/pds-resolution'
import {resolvePlcIdentity} from '#/state/session/plc-resolvers'
import {getSelectedAppViewProvider} from '#/state/session/providers'
import {isSessionExpired} from '#/state/session/session-data'
import {ExportCarDialog} from '#/screens/Settings/components/ExportCarDialog'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {useDialogControl} from '#/components/Dialog'
import * as Layout from '#/components/Layout'
import {PlumblineAuthoritySummary} from '#/components/PlumblineAuthoritySummary'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'
import {com} from '#/lexicons'

type AccessTokenClaims = {exp?: number}

const ROTATION_KEY_METADATA_PREFIX = 'radlib-plc-rotation-handle:'

type RotationKeyRegistrationState = {
  did: string
  status:
    | 'checking'
    | 'registered'
    | 'registered-with-disagreement'
    | 'not-registered'
    | 'unavailable'
  message: string
}

function rotationKeyMetadataKey(did: string): string {
  return `${ROTATION_KEY_METADATA_PREFIX}${did}`
}

function isRotationKeyHandle(
  value: unknown,
  did: string,
): value is UserHeldRotationKey {
  if (!value || typeof value !== 'object') return false
  const handle = value as Partial<UserHeldRotationKey>
  return (
    handle.version === 1 &&
    handle.did === did &&
    typeof handle.keyId === 'string' &&
    typeof handle.didKey === 'string' &&
    handle.algorithm === 'ES256' &&
    handle.custody === 'non-exportable-webcrypto' &&
    typeof handle.createdAt === 'string' &&
    !!handle.publicJwk &&
    typeof handle.publicJwk === 'object' &&
    handle.publicJwk.d === undefined
  )
}

function accessExpiry(accessJwt?: string) {
  if (!accessJwt) return undefined
  try {
    const exp = jwtDecode<AccessTokenClaims>(accessJwt).exp
    return exp ? new Date(exp * 1000).toLocaleString() : undefined
  } catch {
    return undefined
  }
}

function IdentitySectionHeading({label}: {label: string}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.px_xl,
        a.pt_lg,
        a.pb_xs,
        {
          borderTopColor: t.atoms.border_contrast_low.borderColor,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
      ]}>
      <Text style={[a.text_sm, a.font_semi_bold, t.atoms.text_contrast_medium]}>
        {label}
      </Text>
    </View>
  )
}

export function IdentitySovereigntySettingsScreen() {
  const t = useTheme()
  const {t: l} = useLingui()
  const {currentAccount} = useSession()
  const {logoutCurrentAccount, logoutEveryAccount} = useSessionApi()
  const pdsClient = usePdsClient()
  const ensureOAuthFeature = useEnsureOAuthFeature()
  const navigation = useNavigation<NavigationProp>()
  const endSessionControl = Prompt.usePromptControl()
  const endAllSessionsControl = Prompt.usePromptControl()
  const exportCarControl = useDialogControl()
  const migrationQuery = useRadlibMigrationStatusQuery()
  const migration = migrationQuery.data
  const [resolvedPds, setResolvedPds] = useState<string | undefined>()
  const [resolvingPds, setResolvingPds] = useState(false)
  const [rotationKey, setRotationKey] = useState<UserHeldRotationKey>()
  const [rotationKeyStatus, setRotationKeyStatus] = useState<
    {did: string; message: string} | undefined
  >()
  const [creatingRotationKey, setCreatingRotationKey] = useState(false)
  const [rotationKeyRegistration, setRotationKeyRegistration] = useState<
    RotationKeyRegistrationState | undefined
  >()
  const [plcToken, setPlcToken] = useState('')
  const [plcTokenRequested, setPlcTokenRequested] = useState(false)
  const [registeringRotationKey, setRegisteringRotationKey] = useState(false)

  useEffect(() => {
    setPlcToken('')
    setPlcTokenRequested(false)
  }, [currentAccount?.did])

  const canUseBrowserRotationKey =
    IS_WEB && currentAccount?.did.startsWith('did:plc:') === true
  const activeRotationKey =
    rotationKey?.did === currentAccount?.did ? rotationKey : undefined
  const activeRotationKeyStatus =
    rotationKeyStatus && rotationKeyStatus.did === currentAccount?.did
      ? rotationKeyStatus.message
      : undefined

  useEffect(() => {
    const did = currentAccount?.did
    if (!did || !canUseBrowserRotationKey) return
    let cancelled = false
    void AsyncStorage.getItem(rotationKeyMetadataKey(did)).then(value => {
      if (cancelled || !value) return
      try {
        const parsed: unknown = JSON.parse(value)
        if (isRotationKeyHandle(parsed, did)) setRotationKey(parsed)
      } catch {
        // Ignore corrupt public metadata; the private key never leaves the
        // browser key store and a new handle can be prepared explicitly.
      }
    })
    return () => {
      cancelled = true
    }
  }, [canUseBrowserRotationKey, currentAccount?.did])

  const checkRotationKeyRegistration = useCallback(
    async (handle: UserHeldRotationKey) => {
      setRotationKeyRegistration({
        did: handle.did,
        status: 'checking',
        message: 'Checking verified PLC resolver claims…',
      })
      try {
        const result = await resolvePlcIdentity(handle.did)
        const registeredClaims = result.claims.filter(claim =>
          isRotationKeyRegistered(claim.verification?.document, handle.didKey),
        )
        if (registeredClaims.length > 0) {
          const resolverNames = registeredClaims
            .map(claim => claim.resolver.displayName)
            .join(', ')
          const hasDisagreement = result.status === 'disagreement'
          setRotationKeyRegistration({
            did: handle.did,
            status: hasDisagreement
              ? 'registered-with-disagreement'
              : 'registered',
            message: hasDisagreement
              ? `Registered in a verified claim from ${resolverNames}; resolver disagreement remains visible.`
              : `Registered in a verified PLC history from ${resolverNames}.`,
          })
        } else if (
          result.status === 'unavailable' ||
          result.status === 'empty'
        ) {
          setRotationKeyRegistration({
            did: handle.did,
            status: 'unavailable',
            message:
              'No resolver returned a usable verified PLC history. Registration was not inferred.',
          })
        } else {
          setRotationKeyRegistration({
            did: handle.did,
            status: 'not-registered',
            message:
              'No verified PLC history currently contains this key. It may still be waiting for directory propagation.',
          })
        }
      } catch (error) {
        setRotationKeyRegistration({
          did: handle.did,
          status: 'unavailable',
          message:
            error instanceof Error
              ? `PLC registration could not be checked: ${error.message}`
              : 'PLC registration could not be checked.',
        })
      }
    },
    [],
  )

  useEffect(() => {
    if (!activeRotationKey) {
      setRotationKeyRegistration(undefined)
      return
    }
    let cancelled = false
    void (async () => {
      await checkRotationKeyRegistration(activeRotationKey)
      if (cancelled) setRotationKeyRegistration(undefined)
    })()
    return () => {
      cancelled = true
    }
  }, [
    activeRotationKey?.did,
    activeRotationKey?.didKey,
    checkRotationKeyRegistration,
  ])

  useEffect(() => {
    let cancelled = false
    if (!currentAccount?.did) {
      setResolvedPds(undefined)
      setResolvingPds(false)
      return
    }
    setResolvingPds(true)
    void resolvePdsEndpointForDid(currentAccount.did).then(endpoint => {
      if (cancelled) return
      setResolvedPds(endpoint)
      setResolvingPds(false)
    })
    return () => {
      cancelled = true
    }
  }, [currentAccount?.did])

  async function prepareRotationKey() {
    const did = currentAccount?.did
    if (!did) return
    if (!canUseBrowserRotationKey) {
      setRotationKeyStatus({
        did,
        message: IS_WEB
          ? 'User-held PLC custody currently supports did:plc identities only.'
          : 'Native secure-key custody must be supplied by the platform adapter.',
      })
      return
    }
    setCreatingRotationKey(true)
    setRotationKeyStatus(undefined)
    try {
      const store = createIndexedDbRotationKeyStore(did)
      const handle = await createUserHeldRotationKey(did, store)
      setRotationKey(handle)
      await AsyncStorage.setItem(
        rotationKeyMetadataKey(did),
        JSON.stringify(handle),
      )
      const copied = await Clipboard.setStringAsync(handle.didKey).catch(
        () => false,
      )
      setRotationKeyStatus({
        did,
        message: `${copied ? 'Public did:key copied.' : 'Key prepared; clipboard access was unavailable.'} The private key remains non-exportable on this device; an already-authorized PLC rotation key or recovery process must authorize it before it can rotate identity.`,
      })
    } catch (error) {
      setRotationKeyStatus({
        did,
        message:
          error instanceof Error
            ? error.message
            : 'Could not prepare user-held PLC custody.',
      })
    } finally {
      setCreatingRotationKey(false)
    }
  }

  async function requestRotationKeyRegistration() {
    const handle = activeRotationKey
    if (!handle) return
    setRegisteringRotationKey(true)
    setRotationKeyStatus(undefined)
    try {
      if (!(await ensureOAuthFeature('identity-recovery'))) return
      await pdsClient.call(com.atproto.identity.requestPlcOperationSignature)
      setPlcTokenRequested(true)
      setRotationKeyStatus({
        did: handle.did,
        message:
          'The account PDS requested an email authorization code. Enter it below; it is used only for this PLC operation and is not stored.',
      })
    } catch (error) {
      setRotationKeyStatus({
        did: handle.did,
        message:
          error instanceof Error
            ? `Could not request PLC authorization: ${error.message}`
            : 'Could not request PLC authorization.',
      })
    } finally {
      setRegisteringRotationKey(false)
    }
  }

  async function registerRotationKey() {
    const handle = activeRotationKey
    const token = plcToken.trim()
    if (!handle || !token) {
      Alert.alert(
        'Authorization code required',
        'Request the PLC authorization email, then enter its code before registering the key.',
      )
      return
    }
    setRegisteringRotationKey(true)
    setRotationKeyStatus(undefined)
    try {
      if (!(await ensureOAuthFeature('identity-recovery'))) return
      const credentials = await pdsClient.call(
        com.atproto.identity.getRecommendedDidCredentials,
        {},
      )
      const signedResponse = await pdsClient.call(
        com.atproto.identity.signPlcOperation,
        {
          token,
          services: credentials.services,
          alsoKnownAs: credentials.alsoKnownAs,
          rotationKeys: rotationKeysWithUserHeldKey(credentials, handle.didKey),
          verificationMethods: credentials.verificationMethods,
        },
      )
      const operation = parsePlcOperation(signedResponse.operation)
      await submitUserHeldPlcOperation(pdsClient, operation)
      setPlcToken('')
      setPlcTokenRequested(false)
      setRotationKeyStatus({
        did: handle.did,
        message:
          'The signed PLC operation was submitted to the account PDS. Checking resolver evidence; propagation may take a moment.',
      })
      await checkRotationKeyRegistration(handle)
    } catch (error) {
      setRotationKeyStatus({
        did: handle.did,
        message:
          error instanceof Error
            ? `PLC rotation-key registration failed: ${error.message}`
            : 'PLC rotation-key registration failed.',
      })
    } finally {
      setRegisteringRotationKey(false)
    }
  }

  const appview = (() => {
    try {
      const provider = getSelectedAppViewProvider(currentAccount?.did ?? '')
      return `${provider.displayName} · ${provider.serviceDid}`
    } catch {
      return undefined
    }
  })()
  const pds = currentAccount?.pdsUrl
  const resolutionStatus = resolvingPds
    ? 'checking DID document'
    : resolvedPds && pds
      ? resolvedPds.replace(/\/$/, '') === pds.replace(/\/$/, '')
        ? 'verified'
        : 'mismatch'
      : 'resolver unavailable'
  const resolutionStatusLabel = resolvingPds
    ? l`Checking DID document`
    : resolvedPds && pds
      ? resolvedPds.replace(/\/$/, '') === pds.replace(/\/$/, '')
        ? l`Verified`
        : l`Mismatch`
      : l`Resolver unavailable`
  const recoveryStateLabel = currentAccount
    ? canUseBrowserRotationKey
      ? activeRotationKey
        ? l`User-held PLC key prepared; authorization still required`
        : l`User-held PLC custody available on this web device`
      : IS_WEB
        ? l`Secure custody supports did:plc identities only`
        : l`Native secure-key adapter required`
    : l`Unavailable while signed out`
  const overview: IdentityOverview = {
    did: currentAccount?.did ?? 'Unavailable',
    handle: currentAccount?.handle,
    pds,
    appview,
    resolutionStatus,
    migrationState:
      migration?.status ??
      (migrationQuery.isLoading
        ? 'loading'
        : migrationQuery.isError
          ? 'unavailable'
          : 'not-configured'),
    recoveryState: currentAccount
      ? canUseBrowserRotationKey
        ? activeRotationKey
          ? 'user-held PLC key prepared; authorization still required'
          : 'user-held PLC custody available on this web device'
        : IS_WEB
          ? 'secure custody supports did:plc identities only'
          : 'native secure-key adapter required'
      : 'unavailable while signed out',
    lockdown: false,
  }
  return (
    <Layout.Screen ecwMode="workbench">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Identity &amp; recovery</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <PlumblineAuthoritySummary
          testID="identity-authority-summary"
          title={l`Identity authority`}
          source={resolvedPds ?? pds ?? l`DID document resolver`}
          rule={l`Your DID identifies the account; the PDS hosts the repository and sessions`}
          state={
            currentAccount
              ? `${resolutionStatusLabel}; ${overview.migrationState}`
              : l`signed out`
          }
        />
        <SettingsList.Container>
          <IdentitySectionHeading label={l`Identity and hosting`} />
          <SettingsList.Item>
            <SettingsList.ItemText>{l`DID`}</SettingsList.ItemText>
            <SettingsList.BadgeText>{overview.did}</SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>{l`Handle`}</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.handle ?? l`Unavailable`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              {l`Identity verification`}
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {resolutionStatusLabel} · {l`DID document resolver`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>{l`Resolver result`}</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {resolvedPds ?? l`No fresh PDS endpoint returned`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              {l`Repository PDS (from DID document)`}
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.pds ?? l`Unavailable`} · {l`separate from identity`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              {l`Read provider (AppView)`}
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.appview ?? l`No AppView provider selected`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.PressableItem
            label={l`Inspect or change read providers`}
            onPress={() =>
              navigation.navigate('ServicesSettings', {section: 'providers'})
            }>
            <SettingsList.ItemText>
              {l`Inspect or change read providers`}
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {l`Services workbench · reversible local choice`}
            </SettingsList.BadgeText>
          </SettingsList.PressableItem>
          <IdentitySectionHeading label={l`Migration and exit`} />
          <SettingsList.Item>
            <SettingsList.ItemText>{l`Migration`}</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.migrationState} ·{' '}
              {l`${capabilityLabel(
                migration ? 'live' : 'unavailable-current-environment',
              )}`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          {migration && (
            <SettingsList.Item>
              <SettingsList.ItemText>
                {l`Legacy listblocks / private mutes`}
              </SettingsList.ItemText>
              <SettingsList.BadgeText>
                {l`${migration.remainingListblocks} remaining · ${migration.convertedToPrivateMute} converted · ${migration.deleted} deleted${migration.attestationRequired ? ` · ${migration.attestedListCount} attested` : ''}`}
              </SettingsList.BadgeText>
            </SettingsList.Item>
          )}
          {migrationQuery.isError && (
            <SettingsList.Item>
              <SettingsList.ItemText>{l`Migration status`}</SettingsList.ItemText>
              <SettingsList.BadgeText>
                {l`PDS status unavailable; no migration claim was made`}
              </SettingsList.BadgeText>
            </SettingsList.Item>
          )}
          <SettingsList.Item>
            <SettingsList.ItemText>{l`Exit utilities`}</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {l`Keep identity; move portable state separately`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.PressableItem
            label={l`Export repository and chat data`}
            onPress={() => exportCarControl.open()}>
            <SettingsList.ItemText>
              {l`Export repository and chat data`}
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {l`CAR / JSONL · credentials excluded`}
            </SettingsList.BadgeText>
          </SettingsList.PressableItem>
          <SettingsList.PressableItem
            label={l`Open portable policy backup`}
            onPress={() => navigation.navigate('PersonalizationSettings')}>
            <SettingsList.ItemText>
              {l`Portable policy backup`}
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {l`Export, import, or reset local policy`}
            </SettingsList.BadgeText>
          </SettingsList.PressableItem>
          <IdentitySectionHeading label={l`Recovery and rotation`} />
          <SettingsList.Item>
            <SettingsList.ItemText>{l`Recovery`}</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {recoveryStateLabel}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              {l`User-held PLC rotation custody`}
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {canUseBrowserRotationKey
                ? activeRotationKey
                  ? activeRotationKey.didKey
                  : l`Available on this web device`
                : currentAccount
                  ? IS_WEB
                    ? l`did:plc required`
                    : l`Platform adapter required`
                  : l`Unavailable while signed out`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          {canUseBrowserRotationKey && (
            <SettingsList.PressableItem
              label={l`Prepare a user-held PLC rotation key`}
              onPress={() => void prepareRotationKey()}
              disabled={creatingRotationKey}>
              <SettingsList.ItemText>
                {activeRotationKey
                  ? l`Prepare another user-held key`
                  : l`Prepare user-held rotation key`}
              </SettingsList.ItemText>
              <SettingsList.BadgeText>
                {creatingRotationKey
                  ? l`Generating non-exportable key…`
                  : l`Copies public did:key only`}
              </SettingsList.BadgeText>
            </SettingsList.PressableItem>
          )}
          {activeRotationKeyStatus && (
            <SettingsList.Item>
              <SettingsList.ItemText>
                {l`PLC custody status`}
              </SettingsList.ItemText>
              <SettingsList.BadgeText>
                {activeRotationKeyStatus}
              </SettingsList.BadgeText>
            </SettingsList.Item>
          )}
          {activeRotationKey && (
            <>
              <SettingsList.Item>
                <View style={[a.flex_1, a.gap_xs]}>
                  <SettingsList.ItemText>
                    {l`PLC rotation-key registration`}
                  </SettingsList.ItemText>
                  <SettingsList.ItemText
                    style={[a.text_sm, {paddingHorizontal: 0}]}>
                    {l`A prepared key is not a recovery key until it is included in a verified PLC history. Registration uses the standard PDS identity APIs and requires a separate identity grant plus the PDS email authorization code.`}
                  </SettingsList.ItemText>
                </View>
                <SettingsList.BadgeText>
                  {rotationKeyRegistration?.status === 'checking'
                    ? l`Checking`
                    : rotationKeyRegistration?.status === 'registered'
                      ? l`Registered`
                      : rotationKeyRegistration?.status ===
                          'registered-with-disagreement'
                        ? l`Registered; disagreement`
                        : rotationKeyRegistration?.status === 'unavailable'
                          ? l`Evidence unavailable`
                          : l`Not registered`}
                </SettingsList.BadgeText>
              </SettingsList.Item>
              {rotationKeyRegistration && (
                <SettingsList.Item>
                  <View style={[a.flex_1, a.gap_xs]}>
                    <SettingsList.ItemText
                      style={[a.text_sm, {paddingHorizontal: 0}]}>
                      {rotationKeyRegistration.message}
                    </SettingsList.ItemText>
                    <Button
                      label={l`Check PLC rotation-key registration`}
                      size="small"
                      color="secondary"
                      variant="outline"
                      shape="rectangular"
                      disabled={rotationKeyRegistration.status === 'checking'}
                      onPress={() =>
                        void checkRotationKeyRegistration(activeRotationKey)
                      }>
                      <ButtonText>{l`Check again`}</ButtonText>
                    </Button>
                  </View>
                </SettingsList.Item>
              )}
              {rotationKeyRegistration?.status !== 'registered' &&
                rotationKeyRegistration?.status !==
                  'registered-with-disagreement' && (
                  <SettingsList.PressableItem
                    label={l`Request PLC rotation-key authorization`}
                    onPress={() => void requestRotationKeyRegistration()}
                    disabled={registeringRotationKey}>
                    <SettingsList.ItemText>
                      {registeringRotationKey
                        ? l`Requesting PLC authorization…`
                        : l`Request PLC rotation-key authorization`}
                    </SettingsList.ItemText>
                    <SettingsList.BadgeText>
                      {l`Feature-scoped identity grant`}
                    </SettingsList.BadgeText>
                  </SettingsList.PressableItem>
                )}
              {plcTokenRequested && (
                <SettingsList.Item>
                  <View style={[a.flex_1, a.gap_sm]}>
                    <TextInput
                      accessibilityLabel={l`PLC authorization code`}
                      accessibilityHint={l`Enter the one-time code from the account PDS email`}
                      autoCapitalize="none"
                      autoCorrect={false}
                      inputMode="text"
                      secureTextEntry
                      placeholder={l`Enter the one-time code`}
                      value={plcToken}
                      onChangeText={setPlcToken}
                      style={[
                        a.border,
                        a.p_sm,
                        t.atoms.bg_contrast_25,
                        t.atoms.text,
                      ]}
                    />
                    <Button
                      label={l`Register user-held PLC rotation key`}
                      size="small"
                      color="primary"
                      variant="solid"
                      shape="rectangular"
                      disabled={registeringRotationKey || !plcToken.trim()}
                      onPress={() => void registerRotationKey()}>
                      <ButtonText>
                        {registeringRotationKey
                          ? l`Registering key…`
                          : l`Register rotation key`}
                      </ButtonText>
                    </Button>
                  </View>
                </SettingsList.Item>
              )}
            </>
          )}
          <IdentitySectionHeading label={l`Sessions and delegation`} />
          <SettingsList.Item>
            <SettingsList.ItemText>{l`Lockdown`}</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {l`Not exposed by this client; no lockdown claim is made`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>{l`Current session`}</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {currentAccount
                ? isSessionExpired(currentAccount)
                  ? l`Access credential expired`
                  : l`Active on this device`
                : l`Unavailable`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              {l`Access credential expiry`}
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {accessExpiry(currentAccount?.accessJwt) ??
                l`Not available from this session`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              {l`Session login service`}
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {currentAccount?.service ?? l`Unavailable`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.PressableItem
            label={l`End this session`}
            destructive
            onPress={() => endSessionControl.open()}>
            <SettingsList.ItemText>{l`End this session`}</SettingsList.ItemText>
          </SettingsList.PressableItem>
          <SettingsList.PressableItem
            label={l`Sign out all accounts on this device`}
            destructive
            onPress={() => endAllSessionsControl.open()}>
            <SettingsList.ItemText>
              {l`Sign out all accounts on this device`}
            </SettingsList.ItemText>
          </SettingsList.PressableItem>
          <IdentitySectionHeading label={l`Authority map`} />
          {AUTHORITY_MAP.map(row => (
            <SettingsList.Item key={row.actor}>
              <SettingsList.ItemText>
                {row.actor}: {row.powers.join(', ')}
              </SettingsList.ItemText>
              <SettingsList.BadgeText>{row.domain}</SettingsList.BadgeText>
            </SettingsList.Item>
          ))}
        </SettingsList.Container>
      </Layout.Content>
      <Prompt.Basic
        control={endSessionControl}
        title={l`End this session?`}
        description={l`This removes the current session from this device. The PDS does not expose a server-wide session inventory here.`}
        onConfirm={() => logoutCurrentAccount('Settings')}
        confirmButtonCta={l`End session`}
        confirmButtonColor="negative"
      />
      <Prompt.Basic
        control={endAllSessionsControl}
        title={l`Sign out all accounts on this device?`}
        description={l`All locally stored account sessions will be removed from this device. This does not claim to revoke sessions that are active elsewhere.`}
        onConfirm={() => logoutEveryAccount('Settings')}
        confirmButtonCta={l`Sign out all`}
        confirmButtonColor="negative"
      />
      <ExportCarDialog control={exportCarControl} />
    </Layout.Screen>
  )
}
