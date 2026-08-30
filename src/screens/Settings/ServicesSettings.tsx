import {useEffect, useState} from 'react'
import {Alert, TextInput, View} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {type IdentityResolutionPolicy} from '#/lib/identity-runtime'
import {
  BOUNDARY_OWNED_PROVIDER_SURFACES,
  PROVIDER_SURFACE_DETAILS,
  PROVIDER_SURFACES,
  type ProviderReconciliationMode,
  type ProviderReconciliationPolicy,
  type ProviderSurface,
  RUNTIME_COMPOSED_PROVIDER_SURFACES,
} from '#/lib/provider-composition'
import {type CommonNavigatorParams} from '#/lib/routes/types'
import {useSession, useSessionApi} from '#/state/session'
import {
  hasOAuthFeature,
  OAUTH_FEATURES,
  type OAuthFeature,
} from '#/state/session/oauth-scopes'
import {
  getRegisteredPlcResolvers,
  PRIMARY_PLC_RESOLVER,
  registerPlcResolver,
  setPlcResolverEnabled,
} from '#/state/session/plc-resolvers'
import {
  type AppViewProvider,
  type AppViewProviderCapability,
  exportAppViewPolicy,
  getAppViewProviders,
  getAppViewProvidersForCapability,
  getAppViewProvidersForSurface,
  getAppViewReconciliationPolicy,
  getIdentityResolutionPolicy,
  getSelectedAppViewProvider,
  importAppViewPolicy,
  probeAppViewProvider,
  registerAppViewProvider,
  resetAppViewPolicy,
  setAppViewProviderCapabilities,
  setAppViewReconciliationPolicy,
  setIdentityResolutionPolicy as persistIdentityResolutionPolicy,
} from '#/state/session/providers'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'ServicesSettings'>

const CONFIGURABLE_PROVIDER_SURFACES = PROVIDER_SURFACES.filter(
  (surface): surface is Exclude<ProviderSurface, 'identity-resolution'> =>
    surface !== 'identity-resolution' &&
    RUNTIME_COMPOSED_PROVIDER_SURFACES.includes(surface),
)

const OAUTH_FEATURE_LABELS: Record<OAuthFeature, string> = {
  posting: 'Posting and interactions',
  'profile-editing': 'Profile editing',
  'social-graph': 'Social graph',
  appview: 'Authenticated AppView reads',
  chat: 'Chat',
  spaces: 'Spaces',
  media: 'Media uploads',
  notifications: 'Notifications',
}

function providerSurfaceLabel(surface: ProviderSurface): string {
  return surface
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function readReconciliationPolicies(): Partial<
  Record<ProviderSurface, ProviderReconciliationPolicy>
> {
  return Object.fromEntries(
    PROVIDER_SURFACES.map(surface => [
      surface,
      getAppViewReconciliationPolicy(surface),
    ]),
  )
}

type ServicesSection =
  | 'overview'
  | 'authorization'
  | 'providers'
  | 'policies'
  | 'identity'
  | 'resolvers'

const SERVICES_SECTIONS: Array<{
  id: ServicesSection
  label: string
  description: string
}> = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'See which host and read providers are active.',
  },
  {
    id: 'authorization',
    label: 'Authorization',
    description: 'Upgrade only the OAuth capabilities you choose.',
  },
  {
    id: 'providers',
    label: 'Providers',
    description: 'Register and select replaceable read services.',
  },
  {
    id: 'policies',
    label: 'Policies',
    description: 'Choose how provider claims are reconciled locally.',
  },
  {
    id: 'identity',
    label: 'Identity',
    description: 'Control resolver participation and disagreement handling.',
  },
  {
    id: 'resolvers',
    label: 'PLC resolvers',
    description: 'Inspect and manage independently declared resolver sources.',
  },
]

const SERVICES_INSPECTOR_COPY: Record<
  ServicesSection,
  {source: string; rule: string; control: string}
> = {
  overview: {
    source: 'Current account session and local provider registry',
    rule: 'The PDS remains the write and account authority; read providers do not become identity authorities.',
    control:
      'Choose a read provider or open another section without changing the account host.',
  },
  authorization: {
    source: 'The current OAuth session and its granted feature groups',
    rule: 'A requested permission is not a grant. Each missing feature opens an explicit reauthorization step.',
    control:
      'Upgrade one capability at a time, or leave the session unchanged.',
  },
  providers: {
    source: 'Registered AppView descriptors and their declared capabilities',
    rule: 'Registration identifies a service; it does not prove operator independence or grant private authority.',
    control:
      'Add, select, or revoke a provider surface locally. No hidden fallback is performed.',
  },
  policies: {
    source: 'Per-surface provider observations and local reconciliation policy',
    rule: 'Agreement, disagreement, outage, and partial results remain attributable to their sources.',
    control:
      'Export, import, or reset provider policy without exporting credentials or adding a host.',
  },
  identity: {
    source: 'Identity-capable provider declarations and resolver policy',
    rule: 'A resolver may make a claim about identity but cannot acquire ownership of the DID.',
    control:
      'Allow or revoke identity resolution independently from ordinary public reads.',
  },
  resolvers: {
    source: 'PLC resolver declarations and cryptographic history verification',
    rule: 'An endpoint or operator label is not proof of independent control; verified histories and disagreement stay visible.',
    control:
      'Enable or disable a declared resolver and add another public HTTPS source for comparison.',
  },
}

export function ServicesSettingsScreen({}: Props) {
  const {currentAccount} = useSession()
  const {_} = useLingui()
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const {switchAppViewProvider, upgradeOAuthFeature} = useSessionApi()
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
  const [reconciliationPolicies, setReconciliationPolicies] = useState(
    readReconciliationPolicies,
  )
  const [plcResolvers, setPlcResolvers] = useState(getRegisteredPlcResolvers)
  const [resolverName, setResolverName] = useState('')
  const [resolverEndpoint, setResolverEndpoint] = useState('')
  const [resolverOperatorId, setResolverOperatorId] = useState('')
  const [isRegisteringResolver, setIsRegisteringResolver] = useState(false)
  const [pendingOAuthFeature, setPendingOAuthFeature] = useState<
    OAuthFeature | undefined
  >()
  const [activeSection, setActiveSection] =
    useState<ServicesSection>('overview')

  useEffect(() => {
    setProviders(getAppViewProviders())
    setIdentityPolicy(getIdentityResolutionPolicy())
    setReconciliationPolicies(readReconciliationPolicies())
    setPlcResolvers(getRegisteredPlcResolvers())
    if (currentAccount)
      setSelected(getSelectedAppViewProvider(currentAccount.did).id)
  }, [currentAccount])

  async function upgradeFeature(feature: OAuthFeature) {
    setPendingOAuthFeature(feature)
    try {
      await upgradeOAuthFeature(feature)
      Alert.alert(
        'Permission updated',
        `${OAUTH_FEATURE_LABELS[feature]} is now available to this client.`,
      )
    } catch (error) {
      Alert.alert(
        'Permission not updated',
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      setPendingOAuthFeature(undefined)
    }
  }

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

  async function toggleProviderSurface(
    provider: AppViewProvider,
    surface: Exclude<ProviderSurface, 'identity-resolution'>,
  ) {
    const capabilities: AppViewProviderCapability[] = provider.capabilities ?? [
      'public-read',
    ]
    const nextCapabilities = capabilities.includes(surface)
      ? capabilities.filter(capability => capability !== surface)
      : [...capabilities, surface]
    try {
      await setAppViewProviderCapabilities(provider.id, nextCapabilities)
      setProviders(getAppViewProviders())
    } catch (error) {
      Alert.alert(
        'Provider capability not changed',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  function chooseProviderSurfaces(provider: AppViewProvider) {
    Alert.alert(
      `${provider.displayName} read surfaces`,
      'Each surface is an independent local capability declaration. Removing a surface stops this provider from receiving that class of read request.',
      CONFIGURABLE_PROVIDER_SURFACES.map(surface => ({
        text: `${provider.capabilities?.includes(surface) ? 'Remove' : 'Allow'} ${providerSurfaceLabel(surface)}`,
        onPress: () => void toggleProviderSurface(provider, surface),
      })),
    )
  }

  async function saveSurfacePolicy(
    surface: ProviderSurface,
    policy: ProviderReconciliationPolicy,
  ) {
    try {
      await setAppViewReconciliationPolicy(surface, policy)
      setReconciliationPolicies(previous => ({...previous, [surface]: policy}))
    } catch (error) {
      Alert.alert(
        'Reconciliation policy not saved',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  function chooseSurfacePolicy(surface: ProviderSurface) {
    const current = reconciliationPolicies[surface] ?? {
      mode: 'require-agreement' as const,
    }
    const providers = getAppViewProvidersForSurface(surface)
    const chooseMode = (mode: ProviderReconciliationMode) =>
      void saveSurfacePolicy(surface, {mode})
    Alert.alert(
      `${providerSurfaceLabel(surface)} reconciliation`,
      `Current policy: ${current.mode}. Provider disagreement remains visible to the client and is not silently replaced.`,
      [
        {
          text: 'Require agreement',
          onPress: () => chooseMode('require-agreement'),
        },
        {
          text: 'Use first verified result',
          onPress: () => chooseMode('first-verified'),
        },
        {
          text: 'Merge attributable results',
          onPress: () => chooseMode('merge'),
        },
        {
          text: 'Prefer one provider',
          onPress: () =>
            Alert.alert(
              'Preferred provider',
              'This is an explicit local preference, not a claim that the provider is independently authoritative.',
              [
                ...providers.map(provider => ({
                  text: provider.displayName,
                  onPress: () =>
                    void saveSurfacePolicy(surface, {
                      mode: 'prefer-provider',
                      preferredProviderId: provider.id,
                    }),
                })),
                {text: 'Cancel', style: 'cancel' as const},
              ],
            ),
        },
        {text: 'Cancel', style: 'cancel'},
      ],
    )
  }

  function chooseAnySurfacePolicy() {
    Alert.alert(
      'Provider reconciliation policies',
      'Choose the read surface whose disagreements should be reconciled.',
      CONFIGURABLE_PROVIDER_SURFACES.map(surface => ({
        text: `${providerSurfaceLabel(surface)} · ${reconciliationPolicies[surface]?.mode ?? 'require-agreement'}`,
        onPress: () => chooseSurfacePolicy(surface),
      })),
    )
  }

  async function copyProviderPolicy() {
    await Clipboard.setStringAsync(exportAppViewPolicy())
    Alert.alert(
      'Provider policy copied',
      'The export contains provider IDs, capabilities, and local reconciliation choices, but no endpoints, tokens, or service-auth material.',
    )
  }

  async function importProviderPolicyFromClipboard() {
    try {
      await importAppViewPolicy(await Clipboard.getStringAsync())
      setProviders(getAppViewProviders())
      setIdentityPolicy(getIdentityResolutionPolicy())
      setReconciliationPolicies(readReconciliationPolicies())
      Alert.alert(
        'Provider policy imported',
        'Only already-registered providers were changed. Imports cannot add a host or credential.',
      )
    } catch (error) {
      Alert.alert(
        'Provider policy rejected',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  function resetProviderPolicyWithConfirmation() {
    Alert.alert(
      'Reset provider policy?',
      'This revokes optional provider surface capabilities and clears selections and reconciliation choices. Registered endpoints remain available for a later explicit re-enable.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () =>
            void resetAppViewPolicy().then(() => {
              setProviders(getAppViewProviders())
              setIdentityPolicy(getIdentityResolutionPolicy())
              setReconciliationPolicies(readReconciliationPolicies())
            }),
        },
      ],
    )
  }

  async function addPlcResolver() {
    if (
      !resolverName.trim() ||
      !resolverEndpoint.trim() ||
      !resolverOperatorId.trim()
    ) {
      Alert.alert(
        'Resolver details required',
        'Enter a name, public HTTPS endpoint, and declared operator ID before adding a resolver.',
      )
      return
    }
    const endpoint = resolverEndpoint.trim().replace(/\/$/, '')
    const id = `custom-${endpoint
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()}`
    setIsRegisteringResolver(true)
    try {
      const resolver = await registerPlcResolver({
        id: id || `custom-resolver-${Date.now()}`,
        displayName: resolverName.trim(),
        endpoint,
        operatorId: resolverOperatorId.trim(),
        builtin: false,
        enabled: true,
      })
      setPlcResolvers(getRegisteredPlcResolvers())
      setResolverName('')
      setResolverEndpoint('')
      setResolverOperatorId('')
      Alert.alert(
        'PLC resolver added',
        `${resolver.displayName} will be queried alongside ${PRIMARY_PLC_RESOLVER.displayName}. Its history must verify cryptographically before it can be selected.`,
      )
    } catch (error) {
      Alert.alert(
        'PLC resolver not added',
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      setIsRegisteringResolver(false)
    }
  }

  async function togglePlcResolver(resolverId: string, enabled: boolean) {
    try {
      await setPlcResolverEnabled(resolverId, enabled)
      setPlcResolvers(getRegisteredPlcResolvers())
    } catch (error) {
      Alert.alert(
        'PLC resolver not changed',
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

  const selectedProvider = providers.find(provider => provider.id === selected)
  const activeSectionSpec = SERVICES_SECTIONS.find(
    section => section.id === activeSection,
  )!
  const activeInspector = SERVICES_INSPECTOR_COPY[activeSection]
  const activeState =
    activeSection === 'overview'
      ? `${providers.length} registered read provider${providers.length === 1 ? '' : 's'}; ${selectedProvider?.displayName ?? 'no provider selected'}`
      : activeSection === 'authorization'
        ? currentAccount?.authType === 'oauth'
          ? 'Feature-scoped OAuth upgrades are available for this session.'
          : 'Sign in with OAuth to request feature-scoped upgrades.'
        : activeSection === 'providers'
          ? `${providers.filter(provider => provider.enabled).length} enabled provider${providers.length === 1 ? '' : 's'}`
          : activeSection === 'policies'
            ? `${CONFIGURABLE_PROVIDER_SURFACES.filter(surface => reconciliationPolicies[surface] !== undefined).length} runtime-composed policies stored locally`
            : activeSection === 'identity'
              ? `${getAppViewProvidersForCapability('identity-resolution').length} identity provider${getAppViewProvidersForCapability('identity-resolution').length === 1 ? '' : 's'} enabled`
              : `${plcResolvers.filter(resolver => resolver.enabled).length} declared PLC resolver${plcResolvers.filter(resolver => resolver.enabled).length === 1 ? '' : 's'} enabled`

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
        <View style={[a.w_full, a.gap_sm, a.px_sm, a.pt_sm, a.pb_xl]}>
          <View
            style={[
              a.border,
              a.p_md,
              a.gap_xs,
              t.atoms.bg_contrast_25,
              t.atoms.border_contrast_low,
            ]}>
            <SettingsList.ItemText
              style={[{paddingHorizontal: 0}, a.font_semi_bold]}>
              Navigator
            </SettingsList.ItemText>
            <SettingsList.ItemText
              style={[
                {paddingHorizontal: 0},
                a.text_sm,
                t.atoms.text_contrast_medium,
              ]}>
              Choose an authority surface to inspect. The workspace below is the
              only place where a provider choice is changed.
            </SettingsList.ItemText>
            <View style={[a.flex_row, a.flex_wrap, a.gap_xs, a.pt_xs]}>
              {SERVICES_SECTIONS.map(section => {
                const isActive = section.id === activeSection
                return (
                  <Button
                    key={section.id}
                    label={`Open ${section.label}`}
                    accessibilityState={{selected: isActive}}
                    size="small"
                    shape="rectangular"
                    color={isActive ? 'primary' : 'secondary'}
                    variant={isActive ? 'solid' : 'outline'}
                    onPress={() => setActiveSection(section.id)}>
                    <ButtonText>{section.label}</ButtonText>
                  </Button>
                )
              })}
            </View>
          </View>

          <View style={[a.gap_sm, gtMobile ? a.flex_row : a.flex_col]}>
            <View
              style={[
                a.flex_1,
                a.border,
                t.atoms.bg,
                t.atoms.border_contrast_low,
              ]}>
              <View
                style={[
                  a.p_md,
                  a.gap_xs,
                  a.border_b,
                  t.atoms.border_contrast_low,
                ]}>
                <SettingsList.ItemText
                  style={[{paddingHorizontal: 0}, a.font_semi_bold]}>
                  {activeSectionSpec.label}
                </SettingsList.ItemText>
                <SettingsList.ItemText
                  style={[
                    {paddingHorizontal: 0},
                    a.text_sm,
                    t.atoms.text_contrast_medium,
                  ]}>
                  {activeSectionSpec.description}
                </SettingsList.ItemText>
              </View>

              <SettingsList.Container>
                {activeSection === 'overview' && (
                  <>
                    <SettingsList.Item>
                      <SettingsList.ItemText>
                        Account host (PDS)
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {currentAccount
                          ? currentAccount.pdsUrl || currentAccount.service
                          : 'No active account'}
                      </SettingsList.BadgeText>
                    </SettingsList.Item>
                    <SettingsList.Item>
                      <SettingsList.ItemText>
                        Current read provider
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {selectedProvider?.displayName ?? 'Not selected'}
                      </SettingsList.BadgeText>
                    </SettingsList.Item>
                    <SettingsList.Item>
                      <View style={[a.flex_1, a.gap_sm]}>
                        <SettingsList.ItemText style={[{paddingHorizontal: 0}]}>
                          Authority map
                        </SettingsList.ItemText>
                        <SettingsList.ItemText
                          style={[
                            {paddingHorizontal: 0},
                            a.text_sm,
                            t.atoms.text_contrast_medium,
                          ]}>
                          Your PDS handles account writes and session state.
                          AppViews answer selected public-read surfaces. The
                          client records which provider answered instead of
                          silently promoting one service to a universal source.
                        </SettingsList.ItemText>
                      </View>
                    </SettingsList.Item>
                  </>
                )}

                {activeSection === 'authorization' && (
                  <>
                    {currentAccount?.authType === 'oauth' ? (
                      <>
                        <SettingsList.Item>
                          <View style={[a.flex_1, a.gap_sm]}>
                            <SettingsList.ItemText
                              style={[{paddingHorizontal: 0}]}>
                              OAuth permission upgrades
                            </SettingsList.ItemText>
                            <SettingsList.ItemText
                              style={[
                                {paddingHorizontal: 0},
                                a.text_sm,
                                t.atoms.text_contrast_medium,
                              ]}>
                              New sessions request only the feature groups
                              needed for ordinary use. Each missing capability
                              opens a separate consent upgrade; existing
                              posting, likes, profile editing, chat, and Spaces
                              grants are retained.
                            </SettingsList.ItemText>
                          </View>
                        </SettingsList.Item>
                        {OAUTH_FEATURES.map(feature =>
                          hasOAuthFeature(
                            currentAccount.oauthScopes,
                            feature,
                          ) ? null : (
                            <SettingsList.PressableItem
                              key={`oauth-upgrade-${feature}`}
                              label={`Authorize ${OAUTH_FEATURE_LABELS[feature]}`}
                              onPress={() => void upgradeFeature(feature)}
                              disabled={pendingOAuthFeature !== undefined}>
                              <SettingsList.ItemText>
                                {OAUTH_FEATURE_LABELS[feature]}
                              </SettingsList.ItemText>
                              <SettingsList.BadgeText>
                                {pendingOAuthFeature === feature
                                  ? 'Opening consent…'
                                  : 'Additional permission required'}
                              </SettingsList.BadgeText>
                            </SettingsList.PressableItem>
                          ),
                        )}
                      </>
                    ) : (
                      <SettingsList.Item>
                        <SettingsList.ItemText>
                          Feature-scoped upgrades are available after signing in
                          with OAuth.
                        </SettingsList.ItemText>
                      </SettingsList.Item>
                    )}
                  </>
                )}

                {activeSection === 'providers' && (
                  <>
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
                          Providers start with public-read only. Public profile
                          links can use an anonymous handle lookup from those
                          providers; allowing identity resolution separately
                          opts a provider into broader identity claims and
                          remains revocable on this device.
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
                          {provider.capabilities?.includes(
                            'identity-resolution',
                          )
                            ? 'Identity resolution allowed'
                            : 'Public reads only'}
                        </SettingsList.BadgeText>
                      </SettingsList.PressableItem>
                    ))}
                    <SettingsList.Divider />
                    <SettingsList.Item>
                      <View style={[a.flex_1, a.gap_sm]}>
                        <SettingsList.ItemText style={[{paddingHorizontal: 0}]}>
                          Add a read provider
                        </SettingsList.ItemText>
                        <SettingsList.ItemText
                          style={[
                            {paddingHorizontal: 0},
                            a.text_sm,
                            t.atoms.text_contrast_medium,
                          ]}>
                          Register an AppView read provider by its own endpoint.
                          The endpoint is checked first; new providers start
                          with public-read only. Identity resolution is a
                          separate, revocable choice.
                        </SettingsList.ItemText>
                        <TextInput
                          accessibilityLabel={_(msg`Provider name`)}
                          accessibilityHint={_(
                            msg`Name shown for this read provider`,
                          )}
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
                          accessibilityHint={_(
                            msg`DID that identifies this AppView`,
                          )}
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
                  </>
                )}

                {activeSection === 'policies' && (
                  <>
                    <SettingsList.Item>
                      <View style={[a.flex_1, a.gap_sm]}>
                        <SettingsList.ItemText style={[{paddingHorizontal: 0}]}>
                          Polycentric provider composition
                        </SettingsList.ItemText>
                        <SettingsList.ItemText
                          style={[
                            {paddingHorizontal: 0},
                            a.text_sm,
                            t.atoms.text_contrast_medium,
                          ]}>
                          Profiles, threads, feeds, search, notifications, and
                          labels are runtime-composed across explicitly enabled
                          providers. The client retains provider provenance and
                          applies the local reconciliation policy instead of
                          treating the bundled AppView as sovereign.
                        </SettingsList.ItemText>
                      </View>
                    </SettingsList.Item>
                    {providers.map(provider => (
                      <SettingsList.PressableItem
                        key={`surfaces-${provider.id}`}
                        label={`Configure read surfaces for ${provider.displayName}`}
                        onPress={() => chooseProviderSurfaces(provider)}>
                        <SettingsList.ItemText>
                          {provider.displayName} surface permissions
                        </SettingsList.ItemText>
                        <SettingsList.BadgeText>
                          {`${CONFIGURABLE_PROVIDER_SURFACES.filter(surface => provider.capabilities?.includes(surface)).length} runtime surfaces enabled`}
                        </SettingsList.BadgeText>
                      </SettingsList.PressableItem>
                    ))}
                    <SettingsList.Item>
                      <View style={[a.flex_1, a.gap_sm]}>
                        <SettingsList.ItemText style={[{paddingHorizontal: 0}]}>
                          Boundary-owned surfaces
                        </SettingsList.ItemText>
                        <SettingsList.ItemText
                          style={[
                            {paddingHorizontal: 0},
                            a.text_sm,
                            t.atoms.text_contrast_medium,
                          ]}>
                          These surfaces are intentionally not presented as
                          AppView provider choices until a compatible read
                          contract is wired at their existing authority
                          boundary.
                        </SettingsList.ItemText>
                      </View>
                    </SettingsList.Item>
                    {BOUNDARY_OWNED_PROVIDER_SURFACES.map(surface => (
                      <SettingsList.Item key={`boundary-${surface}`}>
                        <View style={[a.flex_1, a.gap_xs]}>
                          <SettingsList.ItemText
                            style={[{paddingHorizontal: 0}]}>
                            {providerSurfaceLabel(surface)}
                          </SettingsList.ItemText>
                          <SettingsList.BadgeText>
                            {`${PROVIDER_SURFACE_DETAILS[surface].authority} · not AppView-composed`}
                          </SettingsList.BadgeText>
                          <SettingsList.ItemText
                            style={[
                              {paddingHorizontal: 0},
                              a.text_sm,
                              t.atoms.text_contrast_medium,
                            ]}>
                            {PROVIDER_SURFACE_DETAILS[surface].description}
                          </SettingsList.ItemText>
                        </View>
                      </SettingsList.Item>
                    ))}
                    <SettingsList.PressableItem
                      label="Choose provider reconciliation policy"
                      onPress={chooseAnySurfacePolicy}>
                      <SettingsList.ItemText>
                        Reconciliation policies
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {`${Object.keys(reconciliationPolicies).length} surfaces configured`}
                      </SettingsList.BadgeText>
                    </SettingsList.PressableItem>
                    <SettingsList.PressableItem
                      label="Export provider policy"
                      onPress={() => void copyProviderPolicy()}>
                      <SettingsList.ItemText>
                        Export provider policy
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        Clipboard; no credentials
                      </SettingsList.BadgeText>
                    </SettingsList.PressableItem>
                    <SettingsList.PressableItem
                      label="Import provider policy from clipboard"
                      onPress={() => void importProviderPolicyFromClipboard()}>
                      <SettingsList.ItemText>
                        Import provider policy
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        Existing provider IDs only
                      </SettingsList.BadgeText>
                    </SettingsList.PressableItem>
                    <SettingsList.PressableItem
                      label="Reset provider policy"
                      onPress={resetProviderPolicyWithConfirmation}
                      destructive>
                      <SettingsList.ItemText>
                        Reset provider policy
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        Revoke optional surfaces
                      </SettingsList.BadgeText>
                    </SettingsList.PressableItem>
                  </>
                )}

                {activeSection === 'identity' && (
                  <>
                    <SettingsList.Item>
                      <View style={[a.flex_1, a.gap_sm]}>
                        <SettingsList.ItemText style={[{paddingHorizontal: 0}]}>
                          Identity resolution policy
                        </SettingsList.ItemText>
                        <SettingsList.ItemText
                          style={[
                            {paddingHorizontal: 0},
                            a.text_sm,
                            t.atoms.text_contrast_medium,
                          ]}>
                          Every enabled identity provider is queried according
                          to this local rule. The rule controls how the client
                          handles disagreement; it does not grant a provider
                          ownership of your DID.
                        </SettingsList.ItemText>
                      </View>
                    </SettingsList.Item>
                    <SettingsList.PressableItem
                      label="Identity resolution policy"
                      onPress={chooseIdentityPolicy}>
                      <SettingsList.ItemText>
                        Current identity policy
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {identityPolicyLabel}
                      </SettingsList.BadgeText>
                    </SettingsList.PressableItem>
                  </>
                )}

                {activeSection === 'resolvers' && (
                  <>
                    <SettingsList.Item>
                      <View style={[a.flex_1, a.gap_sm]}>
                        <SettingsList.ItemText style={[{paddingHorizontal: 0}]}>
                          PLC resolver plurality
                        </SettingsList.ItemText>
                        <SettingsList.ItemText
                          style={[
                            {paddingHorizontal: 0},
                            a.text_sm,
                            t.atoms.text_contrast_medium,
                          ]}>
                          {`Histories are verified against signed PLC operations before selection. ${PRIMARY_PLC_RESOLVER.displayName} remains the compatibility resolver; a resolver URL or operator label alone does not prove independent control.`}
                        </SettingsList.ItemText>
                      </View>
                    </SettingsList.Item>
                    <SettingsList.Item>
                      <SettingsList.ItemText>
                        Primary resolver
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {PRIMARY_PLC_RESOLVER.endpoint}
                      </SettingsList.BadgeText>
                    </SettingsList.Item>
                    {plcResolvers.map(resolver => (
                      <SettingsList.PressableItem
                        key={`plc-resolver-${resolver.id}`}
                        label={`${resolver.enabled ? 'Disable' : 'Enable'} PLC resolver ${resolver.displayName}`}
                        onPress={() =>
                          void togglePlcResolver(resolver.id, !resolver.enabled)
                        }>
                        <SettingsList.ItemText>
                          {resolver.displayName}
                        </SettingsList.ItemText>
                        <SettingsList.BadgeText>
                          {`${resolver.enabled ? 'Enabled' : 'Disabled'} · ${resolver.operatorId}`}
                        </SettingsList.BadgeText>
                      </SettingsList.PressableItem>
                    ))}
                    <SettingsList.Item>
                      <View style={[a.flex_1, a.gap_sm]}>
                        <SettingsList.ItemText style={[{paddingHorizontal: 0}]}>
                          Add a PLC mirror or resolver declaration
                        </SettingsList.ItemText>
                        <TextInput
                          accessibilityLabel="PLC resolver name"
                          accessibilityHint="Enter a display name for this public PLC resolver."
                          placeholder="Resolver name"
                          value={resolverName}
                          onChangeText={setResolverName}
                          style={[
                            a.px_md,
                            a.py_sm,
                            a.rounded_sm,
                            t.atoms.bg_contrast_25,
                            t.atoms.text,
                          ]}
                        />
                        <TextInput
                          accessibilityLabel="PLC resolver HTTPS endpoint"
                          accessibilityHint="Enter a public HTTPS origin for the resolver."
                          placeholder="https://resolver.example"
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="url"
                          value={resolverEndpoint}
                          onChangeText={setResolverEndpoint}
                          style={[
                            a.px_md,
                            a.py_sm,
                            a.rounded_sm,
                            t.atoms.bg_contrast_25,
                            t.atoms.text,
                          ]}
                        />
                        <TextInput
                          accessibilityLabel="PLC resolver operator ID"
                          accessibilityHint="Enter the operator identity declared by this resolver."
                          placeholder="Declared operator ID"
                          autoCapitalize="none"
                          autoCorrect={false}
                          value={resolverOperatorId}
                          onChangeText={setResolverOperatorId}
                          style={[
                            a.px_md,
                            a.py_sm,
                            a.rounded_sm,
                            t.atoms.bg_contrast_25,
                            t.atoms.text,
                          ]}
                        />
                        <Button
                          label="Register PLC resolver"
                          onPress={() => void addPlcResolver()}
                          disabled={isRegisteringResolver}>
                          {({pressed}) => (
                            <ButtonText
                              style={[
                                {
                                  color: pressed
                                    ? t.palette.primary_300
                                    : t.palette.primary_500,
                                },
                              ]}>
                              {isRegisteringResolver
                                ? 'Checking resolver…'
                                : 'Register PLC resolver'}
                            </ButtonText>
                          )}
                        </Button>
                      </View>
                    </SettingsList.Item>
                  </>
                )}
              </SettingsList.Container>
            </View>

            <View
              style={[
                a.border,
                a.p_md,
                a.gap_sm,
                t.atoms.bg_contrast_25,
                t.atoms.border_contrast_low,
                gtMobile ? {width: 184} : a.w_full,
              ]}>
              <SettingsList.ItemText
                style={[{paddingHorizontal: 0}, a.font_semi_bold]}>
                Inspector
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[{paddingHorizontal: 0}, a.text_sm, a.font_semi_bold]}>
                Source
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[
                  {paddingHorizontal: 0},
                  a.text_sm,
                  t.atoms.text_contrast_medium,
                ]}>
                {activeInspector.source}
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[{paddingHorizontal: 0}, a.text_sm, a.font_semi_bold]}>
                Rule
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[
                  {paddingHorizontal: 0},
                  a.text_sm,
                  t.atoms.text_contrast_medium,
                ]}>
                {activeInspector.rule}
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[{paddingHorizontal: 0}, a.text_sm, a.font_semi_bold]}>
                User control
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[
                  {paddingHorizontal: 0},
                  a.text_sm,
                  t.atoms.text_contrast_medium,
                ]}>
                {activeInspector.control}
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[{paddingHorizontal: 0}, a.text_sm, a.font_semi_bold]}>
                Current state
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[
                  {paddingHorizontal: 0},
                  a.text_sm,
                  t.atoms.text_contrast_medium,
                ]}>
                {activeState}
              </SettingsList.ItemText>
            </View>
          </View>
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}
