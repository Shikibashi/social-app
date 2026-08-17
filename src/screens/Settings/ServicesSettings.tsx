import {useEffect, useState} from 'react'
import {Alert} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import * as Layout from '#/components/Layout'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {useSession, useSessionApi} from '#/state/session'
import {
  getAppViewProviders,
  getSelectedAppViewProvider,
  type AppViewProvider,
} from '#/state/session/providers'
import type {CommonNavigatorParams} from '#/lib/routes/types'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'ServicesSettings'>

export function ServicesSettingsScreen({}: Props) {
  const {currentAccount} = useSession()
  const {_} = useLingui()
  const {switchAppViewProvider} = useSessionApi()
  const [providers, setProviders] = useState<AppViewProvider[]>(() => getAppViewProviders())
  const [selected, setSelected] = useState<string | undefined>(() =>
    currentAccount ? getSelectedAppViewProvider(currentAccount.did).id : undefined,
  )

  useEffect(() => {
    setProviders(getAppViewProviders())
    if (currentAccount) setSelected(getSelectedAppViewProvider(currentAccount.did).id)
  }, [currentAccount])

  async function choose(provider: AppViewProvider) {
    if (!currentAccount) return
    try {
      await switchAppViewProvider(provider.id)
      setSelected(provider.id)
      Alert.alert(_(msg`AppView changed`), _(msg`New reads will use ${provider.displayName}. PDS writes remain on your account host.`))
    } catch (error) {
      Alert.alert(
        _(msg`Provider unavailable`),
        error instanceof Error ? error.message : String(error),
        [
          {text: _(msg`Cancel`), style: 'cancel'},
          {
            text: _(msg`Use Bluesky once`),
            onPress: () => void switchAppViewProvider('bluesky-appview', false),
          },
          {
            text: _(msg`Always use Bluesky for this feature`),
            onPress: () => void switchAppViewProvider('bluesky-appview', true),
          },
        ],
      )
    }
  }

  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Services</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <SettingsList.Container>
          {currentAccount && (
            <SettingsList.Item>
              <SettingsList.ItemText>Account host (PDS)</SettingsList.ItemText>
              <SettingsList.BadgeText>{currentAccount.pdsUrl || currentAccount.service}</SettingsList.BadgeText>
            </SettingsList.Item>
          )}
          {providers.map(provider => (
            <SettingsList.PressableItem
              key={provider.id}
              label={provider.displayName}
              onPress={() => void choose(provider)}>
              <SettingsList.ItemText>{provider.displayName}</SettingsList.ItemText>
              <SettingsList.BadgeText>
                {selected === provider.id
                  ? `${provider.serviceDid} · ${provider.endpoint}`
                  : provider.serviceDid}
              </SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}
