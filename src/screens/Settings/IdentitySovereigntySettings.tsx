import {useEffect, useState} from 'react'
import * as Clipboard from 'expo-clipboard'
import {Trans} from '@lingui/react/macro'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {useNavigation} from '@react-navigation/native'
import {jwtDecode} from 'jwt-decode'

import {
  AUTHORITY_MAP,
  capabilityLabel,
  type IdentityOverview,
} from '#/lib/identity-sovereignty-ui'
import {
  createIndexedDbRotationKeyStore,
  createUserHeldRotationKey,
  type UserHeldRotationKey,
} from '#/lib/plc-key-custody'
import {type NavigationProp} from '#/lib/routes/types'
import {useRadlibMigrationStatusQuery} from '#/state/queries/radlib-migration'
import {useSession, useSessionApi} from '#/state/session'
import {resolvePdsEndpointForDid} from '#/state/session/pds-resolution'
import {getSelectedAppViewProvider} from '#/state/session/providers'
import {isSessionExpired} from '#/state/session/session-data'
import {ExportCarDialog} from '#/screens/Settings/components/ExportCarDialog'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {useDialogControl} from '#/components/Dialog'
import * as Layout from '#/components/Layout'
import * as Prompt from '#/components/Prompt'
import {IS_WEB} from '#/env'

type AccessTokenClaims = {exp?: number}

const ROTATION_KEY_METADATA_PREFIX = 'radlib-plc-rotation-handle:'

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

export function IdentitySovereigntySettingsScreen() {
  const {currentAccount} = useSession()
  const {logoutCurrentAccount, logoutEveryAccount} = useSessionApi()
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
        <SettingsList.Container>
          <SettingsList.Item>
            <SettingsList.ItemText>DID</SettingsList.ItemText>
            <SettingsList.BadgeText>{overview.did}</SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>Handle</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.handle ?? 'Unavailable'}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>Identity verification</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.resolutionStatus} · DID document resolver
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>Resolver result</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {resolvedPds ?? 'No fresh PDS endpoint returned'}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>Hosting / PDS</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.pds ?? 'Unavailable'} · separate from identity
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              Read provider (AppView)
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.appview ?? 'No AppView provider selected'}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>Migration</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.migrationState} ·{' '}
              {capabilityLabel(
                migration ? 'live' : 'unavailable-current-environment',
              )}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          {migration && (
            <SettingsList.Item>
              <SettingsList.ItemText>
                Legacy listblocks / private mutes
              </SettingsList.ItemText>
              <SettingsList.BadgeText>
                {migration.remainingListblocks} remaining ·{' '}
                {migration.convertedToPrivateMute} converted ·{' '}
                {migration.deleted} deleted
                {migration.attestationRequired
                  ? ` · ${migration.attestedListCount} attested`
                  : ''}
              </SettingsList.BadgeText>
            </SettingsList.Item>
          )}
          {migrationQuery.isError && (
            <SettingsList.Item>
              <SettingsList.ItemText>Migration status</SettingsList.ItemText>
              <SettingsList.BadgeText>
                PDS status unavailable; no migration claim was made
              </SettingsList.BadgeText>
            </SettingsList.Item>
          )}
          <SettingsList.Divider />
          <SettingsList.Item>
            <SettingsList.ItemText>Exit utilities</SettingsList.ItemText>
            <SettingsList.BadgeText>
              Keep identity; move portable state separately
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.PressableItem
            label="Export repository and chat data"
            onPress={() => exportCarControl.open()}>
            <SettingsList.ItemText>
              Export repository and chat data
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              CAR / JSONL · credentials excluded
            </SettingsList.BadgeText>
          </SettingsList.PressableItem>
          <SettingsList.PressableItem
            label="Open portable policy backup"
            onPress={() => navigation.navigate('PersonalizationSettings')}>
            <SettingsList.ItemText>
              Portable policy backup
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              Export, import, or reset local policy
            </SettingsList.BadgeText>
          </SettingsList.PressableItem>
          <SettingsList.Item>
            <SettingsList.ItemText>Recovery</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.recoveryState}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              User-held PLC rotation custody
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {canUseBrowserRotationKey
                ? activeRotationKey
                  ? activeRotationKey.didKey
                  : 'Available on this web device'
                : currentAccount
                  ? IS_WEB
                    ? 'did:plc required'
                    : 'Platform adapter required'
                  : 'Unavailable while signed out'}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          {canUseBrowserRotationKey && (
            <SettingsList.PressableItem
              label="Prepare a user-held PLC rotation key"
              onPress={() => void prepareRotationKey()}
              disabled={creatingRotationKey}>
              <SettingsList.ItemText>
                {activeRotationKey
                  ? 'Prepare another user-held key'
                  : 'Prepare user-held rotation key'}
              </SettingsList.ItemText>
              <SettingsList.BadgeText>
                {creatingRotationKey
                  ? 'Generating non-exportable key…'
                  : 'Copies public did:key only'}
              </SettingsList.BadgeText>
            </SettingsList.PressableItem>
          )}
          {activeRotationKeyStatus && (
            <SettingsList.Item>
              <SettingsList.ItemText>PLC custody status</SettingsList.ItemText>
              <SettingsList.BadgeText>
                {activeRotationKeyStatus}
              </SettingsList.BadgeText>
            </SettingsList.Item>
          )}
          <SettingsList.Item>
            <SettingsList.ItemText>Lockdown</SettingsList.ItemText>
            <SettingsList.BadgeText>
              Not exposed by this client; no lockdown claim is made
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Divider />
          <SettingsList.Item>
            <SettingsList.ItemText>Current session</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {currentAccount
                ? isSessionExpired(currentAccount)
                  ? 'Access credential expired'
                  : 'Active on this device'
                : 'Unavailable'}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              Access credential expiry
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {accessExpiry(currentAccount?.accessJwt) ??
                'Not available from this session'}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>Session authority</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {currentAccount?.pdsUrl ??
                currentAccount?.service ??
                'Unavailable'}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.PressableItem
            label="End this session"
            destructive
            onPress={() => endSessionControl.open()}>
            <SettingsList.ItemText>End this session</SettingsList.ItemText>
          </SettingsList.PressableItem>
          <SettingsList.PressableItem
            label="Sign out all accounts on this device"
            destructive
            onPress={() => endAllSessionsControl.open()}>
            <SettingsList.ItemText>
              Sign out all accounts on this device
            </SettingsList.ItemText>
          </SettingsList.PressableItem>
          <SettingsList.Item>
            <SettingsList.ItemText>Authority map</SettingsList.ItemText>
          </SettingsList.Item>
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
        title="End this session?"
        description="This removes the current session from this device. The PDS does not expose a server-wide session inventory here."
        onConfirm={() => logoutCurrentAccount('Settings')}
        confirmButtonCta="End session"
        confirmButtonColor="negative"
      />
      <Prompt.Basic
        control={endAllSessionsControl}
        title="Sign out all accounts on this device?"
        description="All locally stored account sessions will be removed from this device. This does not claim to revoke sessions that are active elsewhere."
        onConfirm={() => logoutEveryAccount('Settings')}
        confirmButtonCta="Sign out all"
        confirmButtonColor="negative"
      />
      <ExportCarDialog control={exportCarControl} />
    </Layout.Screen>
  )
}
