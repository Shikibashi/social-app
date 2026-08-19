import {useEffect, useState} from 'react'
import {Trans} from '@lingui/react/macro'
import {jwtDecode} from 'jwt-decode'

import {
  AUTHORITY_MAP,
  capabilityLabel,
  type IdentityOverview,
} from '#/lib/identity-sovereignty-ui'
import {useRadlibMigrationStatusQuery} from '#/state/queries/radlib-migration'
import {useSession, useSessionApi} from '#/state/session'
import {resolvePdsEndpointForDid} from '#/state/session/pds-resolution'
import {getSelectedAppViewProvider} from '#/state/session/providers'
import {isSessionExpired} from '#/state/session/session-data'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import * as Layout from '#/components/Layout'
import * as Prompt from '#/components/Prompt'

type AccessTokenClaims = {exp?: number}

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
  const endSessionControl = Prompt.usePromptControl()
  const endAllSessionsControl = Prompt.usePromptControl()
  const migrationQuery = useRadlibMigrationStatusQuery()
  const migration = migrationQuery.data
  const [resolvedPds, setResolvedPds] = useState<string | undefined>()
  const [resolvingPds, setResolvingPds] = useState(false)

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
      ? 'PDS recovery capability not exposed by this client'
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
          <SettingsList.Item>
            <SettingsList.ItemText>Recovery</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.recoveryState}
            </SettingsList.BadgeText>
          </SettingsList.Item>
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
    </Layout.Screen>
  )
}
