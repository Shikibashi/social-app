import {useEffect, useState} from 'react'
import {Alert} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import * as Layout from '#/components/Layout'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {useSession} from '#/state/session'
import {
  getAppViewProviders,
  getSelectedAppViewProvider,
  selectAppViewProvider,
  type AppViewProvider,
} from '#/state/session/providers'
import type {CommonNavigatorParams} from '#/lib/routes/types'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'ServicesSettings'>

export function ServicesSettingsScreen({}: Props) {
  const {currentAccount} = useSession()
  const {_} = useLingui()
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
      await selectAppViewProvider(currentAccount.did, provider.id)
      setSelected(provider.id)
      Alert.alert(_(msg`AppView changed`), _(msg`New reads will use ${provider.displayName}. PDS writes remain on your account host.`))
    } catch (error) {
      Alert.alert(_(msg`Provider unavailable`), error instanceof Error ? error.message : String(error))
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
          {providers.map(provider => (
            <SettingsList.PressableItem
              key={provider.id}
              label={provider.displayName}
              onPress={() => void choose(provider)}>
              <SettingsList.ItemText>{provider.displayName}</SettingsList.ItemText>
              <SettingsList.BadgeText>{selected === provider.id ? <Trans>Selected</Trans> : provider.serviceDid}</SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}
