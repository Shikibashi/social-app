import {useEffect, useState} from 'react'
import {Alert, TextInput, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {type CommonNavigatorParams} from '#/lib/routes/types'
import {useSession, useSessionApi} from '#/state/session'
import {
  type AppViewProvider,
  getAppViewProviders,
  getSelectedAppViewProvider,
  probeAppViewProvider,
  registerAppViewProvider,
} from '#/state/session/providers'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'ServicesSettings'>

export function ServicesSettingsScreen({}: Props) {
  const {currentAccount} = useSession()
  const {_} = useLingui()
  const t = useTheme()
  const {switchAppViewProvider} = useSessionApi()
  const [providers, setProviders] = useState<AppViewProvider[]>(() =>
    getAppViewProviders(),
  )
  const [selected, setSelected] = useState<string | undefined>(() =>
    currentAccount
      ? getSelectedAppViewProvider(currentAccount.did).id
      : undefined,
  )
  const [providerName, setProviderName] = useState('')
  const [providerEndpoint, setProviderEndpoint] = useState('')
  const [providerDid, setProviderDid] = useState('')
  const [providerFragment, setProviderFragment] = useState('bsky_appview')
  const [isRegistering, setIsRegistering] = useState(false)

  useEffect(() => {
    setProviders(getAppViewProviders())
    if (currentAccount)
      setSelected(getSelectedAppViewProvider(currentAccount.did).id)
  }, [currentAccount])

  async function choose(provider: AppViewProvider) {
    if (!currentAccount) return
    try {
      await switchAppViewProvider(provider.id)
      setSelected(provider.id)
      Alert.alert(
        _(msg`AppView changed`),
        _(
          msg`New reads will use ${provider.displayName}. PDS writes remain on your account host.`,
        ),
      )
    } catch (error) {
      Alert.alert(
        _(msg`Provider unavailable`),
        `${error instanceof Error ? error.message : String(error)}\n\nNo provider was substituted. Choose an explicitly registered provider below.`,
        [
          {text: _(msg`Cancel`), style: 'cancel'},
          ...providers
            .filter(candidate => candidate.id !== provider.id)
            .map(candidate => ({
              text: _(msg`Use ${candidate.displayName}`),
              onPress: () =>
                void switchAppViewProvider(candidate.id).then(() =>
                  setSelected(candidate.id),
                ),
            })),
        ],
      )
    }
  }

  async function addProvider() {
    if (
      !providerName.trim() ||
      !providerEndpoint.trim() ||
      !providerDid.trim()
    ) {
      Alert.alert(
        _(msg`Provider details required`),
        _(
          msg`Enter a name, HTTPS endpoint, and service DID before adding a provider.`,
        ),
      )
      return
    }
    const endpoint = providerEndpoint.trim().replace(/\/$/, '')
    const id = `custom-${endpoint
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()}`
    const provider: AppViewProvider = {
      id: id || `custom-provider-${Date.now()}`,
      displayName: providerName.trim(),
      serviceDid: providerDid.trim() as AppViewProvider['serviceDid'],
      serviceFragment: providerFragment.trim() || 'bsky_appview',
      endpoint,
      healthPath: '/xrpc/_health',
      builtin: false,
      enabled: true,
    }
    setIsRegistering(true)
    try {
      await probeAppViewProvider(provider)
      const registered = await registerAppViewProvider(provider)
      setProviders(getAppViewProviders())
      setProviderName('')
      setProviderEndpoint('')
      setProviderDid('')
      setProviderFragment('bsky_appview')
      Alert.alert(
        _(msg`Provider added`),
        _(
          msg`${registered.displayName} is now an explicit provider choice. It will not replace your PDS or identity.`,
        ),
        [
          {text: _(msg`Use it now`), onPress: () => void choose(registered)},
          {text: _(msg`Not now`)},
        ],
      )
    } catch (error) {
      Alert.alert(
        _(msg`Provider not added`),
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      setIsRegistering(false)
    }
  }

  return (
    <Layout.Screen ecwMode="workbench">
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
              <SettingsList.BadgeText>
                {currentAccount.pdsUrl || currentAccount.service}
              </SettingsList.BadgeText>
            </SettingsList.Item>
          )}
          {providers.map(provider => (
            <SettingsList.PressableItem
              key={provider.id}
              label={provider.displayName}
              onPress={() => void choose(provider)}>
              <SettingsList.ItemText>
                {provider.displayName}
              </SettingsList.ItemText>
              <SettingsList.BadgeText>
                {selected === provider.id
                  ? `${provider.serviceDid} · ${provider.endpoint}`
                  : provider.serviceDid}
              </SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
          <SettingsList.Divider />
          <SettingsList.Item>
            <View style={[a.flex_1, a.gap_sm]}>
              <SettingsList.ItemText style={[{paddingHorizontal: 0}]}>
                <Trans>Add a read provider</Trans>
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[
                  {paddingHorizontal: 0},
                  a.text_sm,
                  t.atoms.text_contrast_medium,
                ]}>
                <Trans>
                  Register an AppView read provider by its own endpoint. The
                  endpoint is checked first; no silent fallback is added.
                </Trans>
              </SettingsList.ItemText>
              <TextInput
                accessibilityLabel={_(msg`Provider name`)}
                accessibilityHint={_(msg`Name shown for this read provider`)}
                placeholder={_(msg`Provider name`)}
                value={providerName}
                onChangeText={setProviderName}
                style={[
                  a.px_md,
                  a.py_sm,
                  a.rounded_sm,
                  t.atoms.bg_contrast_25,
                  t.atoms.text,
                ]}
              />
              <TextInput
                accessibilityLabel={_(msg`Provider HTTPS endpoint`)}
                accessibilityHint={_(
                  msg`HTTPS origin checked before registration`,
                )}
                placeholder="https://example.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={providerEndpoint}
                onChangeText={setProviderEndpoint}
                style={[
                  a.px_md,
                  a.py_sm,
                  a.rounded_sm,
                  t.atoms.bg_contrast_25,
                  t.atoms.text,
                ]}
              />
              <TextInput
                accessibilityLabel={_(msg`AppView service DID`)}
                accessibilityHint={_(msg`DID that identifies this AppView`)}
                placeholder="did:web:appview.example"
                autoCapitalize="none"
                autoCorrect={false}
                value={providerDid}
                onChangeText={setProviderDid}
                style={[
                  a.px_md,
                  a.py_sm,
                  a.rounded_sm,
                  t.atoms.bg_contrast_25,
                  t.atoms.text,
                ]}
              />
              <TextInput
                accessibilityLabel={_(msg`Provider service fragment`)}
                accessibilityHint={_(
                  msg`ATProto service fragment for this AppView`,
                )}
                placeholder={_(msg`Service fragment`)}
                autoCapitalize="none"
                autoCorrect={false}
                value={providerFragment}
                onChangeText={setProviderFragment}
                style={[
                  a.px_md,
                  a.py_sm,
                  a.rounded_sm,
                  t.atoms.bg_contrast_25,
                  t.atoms.text,
                ]}
              />
              <Button
                label={_(msg`Check and add provider`)}
                onPress={() => void addProvider()}
                disabled={isRegistering}>
                {({pressed}) => (
                  <ButtonText
                    style={[
                      {
                        color: pressed
                          ? t.palette.primary_300
                          : t.palette.primary_500,
                      },
                    ]}>
                    {isRegistering ? (
                      <Trans>Checking provider…</Trans>
                    ) : (
                      <Trans>Check and add provider</Trans>
                    )}
                  </ButtonText>
                )}
              </Button>
            </View>
          </SettingsList.Item>
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}
