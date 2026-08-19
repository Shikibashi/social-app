import {Trans} from '@lingui/react/macro'

import {
  AUTHORITY_MAP,
  capabilityLabel,
  type IdentityOverview,
} from '#/lib/identity-sovereignty-ui'
import {useRadlibMigrationStatusQuery} from '#/state/queries/radlib-migration'
import {useSession} from '#/state/session'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import * as Layout from '#/components/Layout'
export function IdentitySovereigntySettingsScreen() {
  const {currentAccount} = useSession()
  const migrationQuery = useRadlibMigrationStatusQuery()
  const migration = migrationQuery.data
  const overview: IdentityOverview = {
    did: currentAccount?.did ?? 'Unavailable',
    handle: currentAccount?.handle,
    pds: currentAccount?.pdsUrl,
    appview: undefined,
    resolutionStatus: 'unresolved',
    migrationState: migration?.status ??
      (migrationQuery.isLoading
        ? 'loading'
        : migrationQuery.isError
          ? 'unavailable'
          : 'not-configured'),
    recoveryState: 'idle',
    lockdown: false,
  }
  return (
    <Layout.Screen ecwMode="workbench">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Identity sovereignty</Trans>
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
              {overview.resolutionStatus} · fresh verification unavailable
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>Hosting / PDS</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.pds ?? 'Unavailable'} · separate from identity
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>Migration</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {overview.migrationState} · {capabilityLabel(
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
    </Layout.Screen>
  )
}
