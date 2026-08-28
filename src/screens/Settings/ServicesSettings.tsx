import {useEffect, useState} from 'react'
import {Alert, TextInput, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {type IdentityResolutionPolicy} from '#/lib/identity-runtime'
import {type CommonNavigatorParams} from '#/lib/routes/types'
import {useSession, useSessionApi} from '#/state/session'
import {
  type AppViewProvider,
  type AppViewProviderCapability,
  getAppViewProviders,
  getAppViewProvidersForCapability,
  getIdentityResolutionPolicy,
  getSelectedAppViewProvider,
  probeAppViewProvider,
  registerAppViewProvider,
  setAppViewProviderCapabilities,
  setIdentityResolutionPolicy as persistIdentityResolutionPolicy,
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
  const [identityPolicy, setIdentityPolicy] =
    useState<IdentityResolutionPolicy>(() => getIdentityResolutionPolicy())
  const [providerName, setProviderName] = useState('')
  const [providerEndpoint, setProviderEndpoint] = useState('')
  const [providerDid, setProviderDid] = useState('')
  const [providerFragment, setProviderFragment] = useState('bsky_appview')
  const [isRegistering, setIsRegistering] = useState(false)

  useEffect(() => {
    setProviders(getAppViewProviders())
    setIdentityPolicy(getIdentityResolutionPolicy())
    if (currentAccount)
      setSelected(getSelectedAppViewProvider(currentAccount.did).id)
  }, [currentAccount])

  async function saveIdentityPolicy(policy: IdentityResolutionPolicy) {
    try {
      await persistIdentityResolutionPolicy(policy)
      setIdentityPolicy(policy)
    } catch (error) {
      Alert.alert(
        'Identity policy not saved',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  function chooseIdentityPolicy() {
    const identityProviders = getAppViewProvidersForCapability(
      'identity-resolution',
    )
    Alert.alert(
      'Identity resolution policy',
      'Every identity-capable provider is queried. This policy controls how the client handles disagreement; it does not grant a provider ownership of your identity.',
      [
        {
          text: 'Require agreement',
          onPress: () => void saveIdentityPolicy({mode: 'require-agreement'}),
        },
        {
          text: 'Use first verified result',
          onPress: () => void saveIdentityPolicy({mode: 'first-verified'}),
        },
        {
          text: 'Prefer one provider',
          onPress: () => {
            Alert.alert(
              'Preferred identity provider',
              'Choose the provider whose verified claim may be used when claims are incomplete or disagree.',
              [
                ...identityProviders.map(provider => ({
                  text: provider.displayName,
                  onPress: () =>
                    void saveIdentityPolicy({
                      mode: 'prefer-provider',
                      preferredProviderId: provider.id,
                    }),
                })),
                {text: 'Cancel', style: 'cancel' as const},
              ],
            )
          },
        },
        {text: 'Cancel', style: 'cancel'},
      ],
    )
  }

  async function toggleIdentityProvider(provider: AppViewProvider) {
    const capabilities: AppViewProviderCapability[] = provider.capabilities ?? [
      'public-read',
    ]
    const nextCapabilities: AppViewProviderCapability[] = capabilities.includes(
      'identity-resolution',
    )
      ? capabilities.filter(capability => capability !== 'identity-resolution')
      : [...capabilities, 'identity-resolution']
    try {
      await setAppViewProviderCapabilities(provider.id, nextCapabilities)
      setProviders(getAppViewProviders())
      setIdentityPolicy(getIdentityResolutionPolicy())
    } catch (error) {
      Alert.alert(
        'Identity provider not changed',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const identityPolicyLabel =
    identityPolicy.mode === 'require-agreement'
      ? 'Require agreement from all identity providers'
      : identityPolicy.mode === 'first-verified'
        ? 'Use the first verified provider result'
        : `Prefer ${
            providers.find(
              provider => provider.id === identityPolicy.preferredProviderId,
            )?.displayName ?? identityPolicy.preferredProviderId
          }`

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
      capabilities: ['public-read'],
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
          <SettingsList.Item>
            <View style={[a.flex_1, a.gap_sm]}>
              <SettingsList.ItemText style={[{paddingHorizontal: 0}]}>
                Identity resolver providers
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[
                  {paddingHorizontal: 0},
                  a.text_sm,
                  t.atoms.text_contrast_medium,
                ]}>
                Providers start with public-read only. Allow identity resolution
                separately; this sends only public resolver requests and remains
                revocable on this device.
              </SettingsList.ItemText>
            </View>
          </SettingsList.Item>
          {providers.map(provider => (
            <SettingsList.PressableItem
              key={`identity-${provider.id}`}
              label={`${
                provider.capabilities?.includes('identity-resolution')
                  ? 'Remove identity resolution from'
                  : 'Allow identity resolution for'
              } ${provider.displayName}`}
              onPress={() => void toggleIdentityProvider(provider)}>
              <SettingsList.ItemText>
                {provider.displayName}
              </SettingsList.ItemText>
              <SettingsList.BadgeText>
                {provider.capabilities?.includes('identity-resolution')
                  ? 'Identity resolution allowed'
                  : 'Public reads only'}
              </SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
          <SettingsList.PressableItem
            label="Identity resolution policy"
            onPress={chooseIdentityPolicy}>
            <SettingsList.ItemText>
              Identity resolution policy
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {identityPolicyLabel}
            </SettingsList.BadgeText>
          </SettingsList.PressableItem>
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
                  endpoint is checked first; new providers start with
                  public-read only. Identity resolution is a separate, revocable
                  choice.
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
