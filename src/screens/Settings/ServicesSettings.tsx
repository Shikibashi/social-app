import {type ReactNode, useEffect, useState} from 'react'
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
  type ProviderReconciliationPolicy,
  type ProviderSurface,
  RUNTIME_COMPOSED_PROVIDER_SURFACES,
} from '#/lib/provider-composition'
import {
  type CommonNavigatorParams,
  type ServicesSettingsSection,
} from '#/lib/routes/types'
import {useSession, useSessionApi} from '#/state/session'
import {type OAuthFeature} from '#/state/session/oauth-scopes'
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
  removeAppViewProvider,
  resetAppViewPolicy,
  setAppViewProviderCapabilities,
  setAppViewReconciliationPolicy,
  setIdentityResolutionPolicy as persistIdentityResolutionPolicy,
} from '#/state/session/providers'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {AuthorizationProvenance} from '#/components/AuthorizationProvenance'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'ServicesSettings'>

type ConfigurableProviderSurface = Exclude<
  ProviderSurface,
  'identity-resolution'
>

const CONFIGURABLE_PROVIDER_SURFACES = PROVIDER_SURFACES.filter(
  (surface): surface is ConfigurableProviderSurface =>
    surface !== 'identity-resolution' &&
    RUNTIME_COMPOSED_PROVIDER_SURFACES.includes(surface),
)

const OAUTH_FEATURE_LABELS: Record<OAuthFeature, string> = {
  posting: 'Posting and interactions',
  'profile-editing': 'Profile editing',
  'social-graph': 'Social graph',
  'identity-recovery': 'Identity recovery and rotation',
  appview: 'Authenticated AppView reads',
  chat: 'Chat',
  spaces: 'Spaces',
  media: 'Media uploads',
  notifications: 'Notifications',
}

const RECONCILIATION_MODES: Array<{
  id: ProviderReconciliationPolicy['mode']
  label: string
}> = [
  {id: 'require-agreement', label: 'Require agreement'},
  {id: 'first-verified', label: 'Use first verified result'},
  {id: 'merge', label: 'Merge attributable results'},
]

function providerSurfaceLabel(
  surface: ProviderSurface | AppViewProviderCapability,
): string {
  return surface
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

type ServiceWorkbenchRow = {
  id: string
  label: string
  provider: string
  state: string
  detail: string
  target: ServiceWorkbenchTarget
}

type ServiceWorkbenchRoute =
  | 'Moderation'
  | 'ContentAndMediaSettings'
  | 'PermissionedSpacesSettings'
  | 'IdentitySovereigntySettings'

type ServiceWorkbenchTarget =
  | {kind: 'services'; section: ServicesSection}
  | {kind: 'route'; route: ServiceWorkbenchRoute}

type WorkbenchPanel =
  | {kind: 'provider'; providerId: string}
  | {kind: 'provider-surfaces'; providerId: string}
  | {kind: 'surface-policy'; surface: ConfigurableProviderSurface}
  | {kind: 'identity-policy'}
  | {kind: 'resolver'; resolverId: string}

function describeProviderSources(providers: readonly AppViewProvider[]): {
  provider: string
  state: string
} {
  if (providers.length === 0) {
    return {provider: 'No provider enabled', state: 'Unavailable'}
  }
  return {
    provider: providers.map(provider => provider.displayName).join(', '),
    state: `${providers.length} enabled`,
  }
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

type ServicesSection = ServicesSettingsSection

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

function ServiceWorkbenchMatrix({
  rows,
  onInspect,
  compact,
}: {
  rows: readonly ServiceWorkbenchRow[]
  onInspect: (target: ServiceWorkbenchTarget) => void
  compact: boolean
}) {
  const t = useTheme()

  return (
    <View
      testID="service-workbench-matrix"
      accessibilityRole="summary"
      style={[
        a.w_full,
        a.border,
        t.atoms.border_contrast_low,
        t.atoms.bg_contrast_25,
        a.p_sm,
        a.gap_xs,
      ]}>
      <View style={[a.gap_2xs, a.pb_xs]}>
        <SettingsList.ItemText
          style={[{paddingHorizontal: 0}, a.font_semi_bold]}>
          Capability map
        </SettingsList.ItemText>
        <SettingsList.ItemText
          style={[
            {paddingHorizontal: 0},
            a.text_sm,
            t.atoms.text_contrast_medium,
          ]}>
          Each service has a named source, a visible state, and an ordinary
          inspection path. A default provider is a convenience choice, not a
          universal authority.
        </SettingsList.ItemText>
      </View>

      {!compact && (
        <View
          aria-hidden
          style={[a.flex_row, a.align_center, a.gap_sm, a.pb_xs]}>
          <SettingsList.ItemText
            style={[
              a.flex_1,
              {paddingHorizontal: 0},
              a.text_xs,
              a.font_semi_bold,
              t.atoms.text_contrast_medium,
            ]}>
            CAPABILITY
          </SettingsList.ItemText>
          <SettingsList.ItemText
            style={[
              a.flex_1,
              {paddingHorizontal: 0},
              a.text_xs,
              a.font_semi_bold,
              t.atoms.text_contrast_medium,
            ]}>
            CURRENT SOURCE
          </SettingsList.ItemText>
          <SettingsList.ItemText
            style={[
              a.flex_1,
              {paddingHorizontal: 0},
              a.text_xs,
              a.font_semi_bold,
              t.atoms.text_contrast_medium,
            ]}>
            STATE
          </SettingsList.ItemText>
          <View style={{width: 66}} />
        </View>
      )}

      {rows.map(row => (
        <View
          key={row.id}
          testID={`service-workbench-row-${row.id}`}
          style={[
            a.flex_row,
            a.align_start,
            a.gap_sm,
            compact && a.flex_wrap,
            a.border_t,
            a.py_sm,
            t.atoms.border_contrast_low,
          ]}>
          <View
            style={[compact ? a.w_full : a.flex_1, {minWidth: 0}, a.gap_2xs]}>
            <SettingsList.ItemText
              style={[{paddingHorizontal: 0}, a.font_semi_bold]}>
              {row.label}
            </SettingsList.ItemText>
            <SettingsList.ItemText
              style={[
                {paddingHorizontal: 0},
                a.text_xs,
                t.atoms.text_contrast_medium,
              ]}>
              {row.detail}
            </SettingsList.ItemText>
          </View>
          <View style={[compact ? a.w_full : a.flex_1, {minWidth: 0}]}>
            <SettingsList.ItemText
              selectable
              style={[
                {paddingHorizontal: 0},
                a.text_xs,
                t.atoms.text_contrast_medium,
              ]}>
              {row.provider}
            </SettingsList.ItemText>
          </View>
          <View style={[a.flex_1, {minWidth: 0}]}>
            <View
              style={[
                a.self_start,
                a.border,
                a.px_xs,
                a.py_2xs,
                t.atoms.border_contrast_low,
              ]}>
              <SettingsList.ItemText
                style={[{paddingHorizontal: 0}, a.text_xs, a.font_semi_bold]}>
                {row.state}
              </SettingsList.ItemText>
            </View>
          </View>
          <View style={{width: 66, alignItems: 'flex-end'}}>
            <Button
              label={`Inspect ${row.label} service`}
              size="small"
              color="secondary"
              variant="outline"
              shape="rectangular"
              onPress={() => onInspect(row.target)}>
              <ButtonText>Inspect</ButtonText>
            </Button>
          </View>
        </View>
      ))}
    </View>
  )
}

function WorkbenchActionPanel({
  title,
  description,
  testID,
  children,
}: {
  title: string
  description: string
  testID: string
  children: ReactNode
}) {
  const t = useTheme()

  return (
    <View
      testID={testID}
      style={[
        a.w_full,
        a.border,
        a.p_sm,
        a.gap_sm,
        t.atoms.bg_contrast_25,
        t.atoms.border_contrast_low,
      ]}>
      <View style={[a.gap_2xs]}>
        <SettingsList.ItemText
          style={[{paddingHorizontal: 0}, a.font_semi_bold]}>
          {title}
        </SettingsList.ItemText>
        <SettingsList.ItemText
          style={[
            {paddingHorizontal: 0},
            a.text_sm,
            t.atoms.text_contrast_medium,
          ]}>
          {description}
        </SettingsList.ItemText>
      </View>
      {children}
    </View>
  )
}

function ProviderSurfaceActionPanel({
  provider,
  onToggle,
  onBack,
  onClose,
}: {
  provider: AppViewProvider
  onToggle: (surface: ConfigurableProviderSurface) => void
  onBack: () => void
  onClose: () => void
}) {
  const t = useTheme()

  return (
    <WorkbenchActionPanel
      testID="service-workbench-provider-surfaces-panel"
      title={`${provider.displayName} read surfaces`}
      description="Each surface is an independent local capability declaration. Removing a surface stops this provider from receiving that class of read request; it does not delete the provider or alter your account host.">
      <View style={[a.gap_xs]}>
        {CONFIGURABLE_PROVIDER_SURFACES.map(surface => {
          const enabled = provider.capabilities?.includes(surface)
          return (
            <View
              key={surface}
              testID={`service-workbench-surface-${surface}`}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_xs,
                a.border,
                a.p_xs,
                t.atoms.border_contrast_low,
              ]}>
              <View style={[a.flex_1, {minWidth: 0}]}>
                <SettingsList.ItemText
                  style={[{paddingHorizontal: 0}, a.font_semi_bold]}>
                  {providerSurfaceLabel(surface)}
                </SettingsList.ItemText>
                <SettingsList.ItemText
                  style={[
                    {paddingHorizontal: 0},
                    a.text_xs,
                    t.atoms.text_contrast_medium,
                  ]}>
                  {enabled
                    ? 'This provider may answer this surface.'
                    : 'This provider is excluded from this surface.'}
                </SettingsList.ItemText>
              </View>
              <Button
                label={`${enabled ? 'Remove' : 'Allow'} ${providerSurfaceLabel(surface)} surface for ${provider.displayName}`}
                onPress={() => onToggle(surface)}
                size="small"
                color={enabled ? 'primary' : 'secondary'}
                variant={enabled ? 'solid' : 'outline'}
                shape="rectangular">
                <ButtonText>{enabled ? 'Allowed' : 'Allow'}</ButtonText>
              </Button>
            </View>
          )
        })}
      </View>
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        <Button
          label={`Inspect ${provider.displayName} provider`}
          onPress={onBack}
          size="small"
          color="secondary"
          variant="outline"
          shape="rectangular">
          <ButtonText>Back to provider</ButtonText>
        </Button>
        <Button
          label="Close provider surfaces inspector"
          onPress={onClose}
          size="small"
          color="secondary"
          variant="outline"
          shape="rectangular">
          <ButtonText>Close</ButtonText>
        </Button>
      </View>
    </WorkbenchActionPanel>
  )
}

export function ServicesSettingsScreen({route, navigation}: Props) {
  const {currentAccount} = useSession()
  const {_} = useLingui()
  const t = useTheme()
  const {gtMobile, gtTablet} = useBreakpoints()
  const {logoutCurrentAccount, switchAppViewProvider, upgradeOAuthFeature} =
    useSessionApi()
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
  const [openPanel, setOpenPanel] = useState<WorkbenchPanel | undefined>()
  const [activeSection, setActiveSection] = useState<ServicesSection>(
    () => route.params?.section ?? 'overview',
  )

  useEffect(() => {
    setProviders(getAppViewProviders())
    setIdentityPolicy(getIdentityResolutionPolicy())
    setReconciliationPolicies(readReconciliationPolicies())
    setPlcResolvers(getRegisteredPlcResolvers())
    if (currentAccount)
      setSelected(getSelectedAppViewProvider(currentAccount.did).id)
  }, [currentAccount])

  useEffect(() => {
    setActiveSection(route.params?.section ?? 'overview')
  }, [route.params?.section])

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

  function revokeOAuthSession() {
    Alert.alert(
      'Revoke OAuth session?',
      'This signs out the current account and revokes the complete OAuth session. It does not revoke one feature independently.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Revoke session',
          style: 'destructive',
          onPress: () => logoutCurrentAccount('Settings'),
        },
      ],
    )
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
    setOpenPanel({kind: 'identity-policy'})
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
    setOpenPanel({kind: 'provider-surfaces', providerId: provider.id})
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

  function chooseSurfacePolicy(surface: ConfigurableProviderSurface) {
    setOpenPanel({kind: 'surface-policy', surface})
  }

  function chooseAnySurfacePolicy() {
    const firstSurface = CONFIGURABLE_PROVIDER_SURFACES[0]
    if (firstSurface) chooseSurfacePolicy(firstSurface)
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
  const feedProviderSources = describeProviderSources(
    getAppViewProvidersForSurface('feeds'),
  )
  const notificationProviderSources = describeProviderSources(
    getAppViewProvidersForSurface('notifications'),
  )
  const labelProviderSources = describeProviderSources(
    getAppViewProvidersForSurface('labels'),
  )
  const searchProviderSources = describeProviderSources(
    getAppViewProvidersForSurface('search'),
  )
  const serviceWorkbenchRows: ServiceWorkbenchRow[] = [
    {
      id: 'identity',
      label: 'Identity',
      provider: currentAccount?.did ?? 'No active account',
      state: currentAccount ? 'Active' : 'Not signed in',
      detail: `DID-backed account; ${identityPolicy.mode} resolver policy`,
      target: {kind: 'services', section: 'identity'},
    },
    {
      id: 'pds',
      label: 'Personal Data Server',
      provider: currentAccount?.pdsUrl ?? 'No repository PDS',
      state: currentAccount?.pdsUrl ? 'Write host' : 'Unavailable',
      detail:
        'Account records, writes, and profile media remain on the account host.',
      target: {kind: 'route', route: 'IdentitySovereigntySettings'},
    },
    {
      id: 'appview',
      label: 'AppView reads',
      provider: selectedProvider?.displayName ?? 'No provider selected',
      state: selectedProvider ? 'Active' : 'Not selected',
      detail: selectedProvider?.endpoint ?? 'Choose an explicit read provider.',
      target: {kind: 'services', section: 'providers'},
    },
    {
      id: 'feeds',
      label: 'Feeds',
      provider: feedProviderSources.provider,
      state: feedProviderSources.state,
      detail: 'Feed results retain source and reconciliation state.',
      target: {kind: 'services', section: 'providers'},
    },
    {
      id: 'moderation-reach',
      label: 'Moderation & Reach',
      provider: labelProviderSources.provider,
      state: 'Local policy',
      detail:
        'Labels are claims; local rules decide warning, hiding, or ranking.',
      target: {kind: 'route', route: 'Moderation'},
    },
    {
      id: 'search',
      label: 'Search',
      provider: searchProviderSources.provider,
      state: searchProviderSources.state,
      detail: 'Search results remain attributable to their read provider.',
      target: {kind: 'services', section: 'providers'},
    },
    {
      id: 'notifications',
      label: 'Notifications',
      provider: notificationProviderSources.provider,
      state: notificationProviderSources.state,
      detail:
        'Account-scoped reads use an explicit authenticated provider boundary.',
      target: {kind: 'services', section: 'authorization'},
    },
    {
      id: 'authorization',
      label: 'Authorization',
      provider: currentAccount?.service ?? 'No login service',
      state: currentAccount ? 'Delegated' : 'Not signed in',
      detail:
        'Feature-scoped session permissions can be inspected and upgraded.',
      target: {kind: 'services', section: 'authorization'},
    },
    {
      id: 'media',
      label: 'Media',
      provider: currentAccount?.pdsUrl ?? 'Account PDS',
      state: currentAccount?.pdsUrl ? 'Boundary-owned' : 'Unavailable',
      detail: PROVIDER_SURFACE_DETAILS.media.description,
      target: {kind: 'route', route: 'ContentAndMediaSettings'},
    },
    {
      id: 'communities',
      label: 'Communities',
      provider: 'Spaces transport and community authority',
      state: 'Boundary-owned',
      detail: PROVIDER_SURFACE_DETAILS.communities.description,
      target: {kind: 'route', route: 'PermissionedSpacesSettings'},
    },
    {
      id: 'exit-backups',
      label: 'Exit & backups',
      provider: 'Local account controls',
      state: 'Available',
      detail:
        'Export repository data and portable policy without exporting credentials.',
      target: {kind: 'route', route: 'IdentitySovereigntySettings'},
    },
  ]

  function selectSection(section: ServicesSection) {
    setActiveSection(section)
    setOpenPanel(undefined)
    navigation.setParams({section})
  }

  function inspectService(target: ServiceWorkbenchTarget) {
    if (target.kind === 'services') {
      selectSection(target.section)
      return
    }
    navigation.navigate(target.route)
  }
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

  const panelProviderId =
    openPanel?.kind === 'provider' || openPanel?.kind === 'provider-surfaces'
      ? openPanel.providerId
      : undefined
  const panelProvider = panelProviderId
    ? providers.find(provider => provider.id === panelProviderId)
    : undefined
  const panelPolicySurface =
    openPanel?.kind === 'surface-policy' ? openPanel.surface : undefined
  const panelPolicy = panelPolicySurface
    ? (reconciliationPolicies[panelPolicySurface] ?? {
        mode: 'require-agreement' as const,
      })
    : undefined
  const panelPolicyProviders = panelPolicySurface
    ? getAppViewProvidersForSurface(panelPolicySurface)
    : []
  const panelIdentityProviders = getAppViewProvidersForCapability(
    'identity-resolution',
  )
  const panelResolver =
    openPanel?.kind === 'resolver'
      ? plcResolvers.find(resolver => resolver.id === openPanel.resolverId)
      : undefined

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

  function requestProviderRemoval(provider: AppViewProvider) {
    if (provider.builtin) {
      Alert.alert(
        _(msg`Bundled provider retained`),
        _(
          msg`The bundled provider cannot be removed from the client. Revoke its optional surfaces or reset provider policy instead.`,
        ),
      )
      return
    }
    Alert.alert(
      _(msg`Remove provider from this device?`),
      _(
        msg`This removes ${provider.displayName} and clears local selections, fallbacks, and reconciliation preferences that point to it. It does not delete the provider's service or change your account PDS.`,
      ),
      [
        {text: _(msg`Cancel`), style: 'cancel'},
        {
          text: _(msg`Remove provider`),
          style: 'destructive',
          onPress: () =>
            void removeAppViewProvider(provider.id)
              .then(() => {
                setProviders(getAppViewProviders())
                setIdentityPolicy(getIdentityResolutionPolicy())
                setReconciliationPolicies(readReconciliationPolicies())
                setOpenPanel(undefined)
                Alert.alert(
                  _(msg`Provider removed`),
                  _(
                    msg`${provider.displayName} is no longer registered on this device.`,
                  ),
                )
              })
              .catch(error => {
                Alert.alert(
                  _(msg`Provider not removed`),
                  error instanceof Error ? error.message : String(error),
                )
              }),
        },
      ],
    )
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
                    onPress={() => selectSection(section.id)}>
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
                        Account service (login)
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {currentAccount
                          ? currentAccount.service
                          : 'No active account'}
                      </SettingsList.BadgeText>
                    </SettingsList.Item>
                    <SettingsList.Item>
                      <SettingsList.ItemText>
                        Repository PDS
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {currentAccount?.pdsUrl ??
                          'Not available from the DID-backed session state'}
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
                      <ServiceWorkbenchMatrix
                        rows={serviceWorkbenchRows}
                        onInspect={inspectService}
                        compact={!gtTablet}
                      />
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
                        <SettingsList.Item>
                          <AuthorizationProvenance
                            account={currentAccount}
                            onUpgrade={feature => void upgradeFeature(feature)}
                            pendingFeature={pendingOAuthFeature}
                            onRevokeSession={revokeOAuthSession}
                          />
                        </SettingsList.Item>
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
                        label={`Inspect ${provider.displayName} provider`}
                        onPress={() =>
                          setOpenPanel({
                            kind: 'provider',
                            providerId: provider.id,
                          })
                        }>
                        <SettingsList.ItemText>
                          {provider.displayName}
                        </SettingsList.ItemText>
                        <SettingsList.BadgeText>
                          {selected === provider.id
                            ? `Selected read provider · ${provider.serviceDid}`
                            : `${provider.enabled ? 'Enabled' : 'Disabled'} · ${provider.serviceDid}`}
                        </SettingsList.BadgeText>
                      </SettingsList.PressableItem>
                    ))}
                    {openPanel?.kind === 'provider' && panelProvider && (
                      <SettingsList.Item>
                        <WorkbenchActionPanel
                          testID="service-workbench-provider-panel"
                          title={`${panelProvider.displayName} provider`}
                          description="Inspect the service identity and endpoint before choosing it for new reads. This choice never moves account writes away from the repository PDS.">
                          <SettingsList.ItemText
                            selectable
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            Service DID: {panelProvider.serviceDid}
                          </SettingsList.ItemText>
                          <SettingsList.ItemText
                            selectable
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            HTTPS endpoint: {panelProvider.endpoint}
                          </SettingsList.ItemText>
                          <SettingsList.ItemText
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            Declared surfaces:{' '}
                            {(panelProvider.capabilities ?? ['public-read'])
                              .map(providerSurfaceLabel)
                              .join(', ')}
                          </SettingsList.ItemText>
                          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                            <Button
                              testID="service-workbench-use-provider"
                              label={`Use ${panelProvider.displayName} for new reads`}
                              onPress={() => void choose(panelProvider)}
                              disabled={
                                !currentAccount || selected === panelProvider.id
                              }
                              size="small"
                              shape="rectangular">
                              <ButtonText>
                                {selected === panelProvider.id
                                  ? 'Selected for new reads'
                                  : 'Use for new reads'}
                              </ButtonText>
                            </Button>
                            <Button
                              testID="service-workbench-configure-provider"
                              label={`Configure read surfaces for ${panelProvider.displayName}`}
                              onPress={() =>
                                chooseProviderSurfaces(panelProvider)
                              }
                              size="small"
                              color="secondary"
                              variant="outline"
                              shape="rectangular">
                              <ButtonText>Configure surfaces</ButtonText>
                            </Button>
                            {!panelProvider.builtin && (
                              <Button
                                testID="service-workbench-remove-provider"
                                label={`Remove ${panelProvider.displayName} from this device`}
                                onPress={() =>
                                  requestProviderRemoval(panelProvider)
                                }
                                color="secondary"
                                variant="outline"
                                shape="rectangular"
                                size="small">
                                <ButtonText>Remove from device</ButtonText>
                              </Button>
                            )}
                            <Button
                              label="Close provider inspector"
                              onPress={() => setOpenPanel(undefined)}
                              size="small"
                              color="secondary"
                              variant="outline"
                              shape="rectangular">
                              <ButtonText>Close</ButtonText>
                            </Button>
                          </View>
                        </WorkbenchActionPanel>
                      </SettingsList.Item>
                    )}
                    {openPanel?.kind === 'provider-surfaces' &&
                      panelProvider && (
                        <SettingsList.Item>
                          <ProviderSurfaceActionPanel
                            provider={panelProvider}
                            onToggle={surface =>
                              void toggleProviderSurface(panelProvider, surface)
                            }
                            onBack={() =>
                              setOpenPanel({
                                kind: 'provider',
                                providerId: panelProvider.id,
                              })
                            }
                            onClose={() => setOpenPanel(undefined)}
                          />
                        </SettingsList.Item>
                      )}
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
                    {openPanel?.kind === 'provider-surfaces' &&
                      panelProvider && (
                        <SettingsList.Item>
                          <ProviderSurfaceActionPanel
                            provider={panelProvider}
                            onToggle={surface =>
                              void toggleProviderSurface(panelProvider, surface)
                            }
                            onBack={() =>
                              setOpenPanel({
                                kind: 'provider',
                                providerId: panelProvider.id,
                              })
                            }
                            onClose={() => setOpenPanel(undefined)}
                          />
                        </SettingsList.Item>
                      )}
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
                    {panelPolicySurface && panelPolicy && (
                      <SettingsList.Item>
                        <WorkbenchActionPanel
                          testID="service-workbench-reconciliation-panel"
                          title={`${providerSurfaceLabel(panelPolicySurface)} reconciliation`}
                          description="This is a local reconciliation rule for this read surface. Provider disagreement, outage, and partial results remain attributable; selecting a preference does not make a provider universally authoritative.">
                          <SettingsList.ItemText
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            Current policy: {panelPolicy.mode}
                            {panelPolicy.preferredProviderId
                              ? ` · ${
                                  panelPolicyProviders.find(
                                    provider =>
                                      provider.id ===
                                      panelPolicy.preferredProviderId,
                                  )?.displayName ??
                                  panelPolicy.preferredProviderId
                                }`
                              : ''}
                          </SettingsList.ItemText>
                          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                            {CONFIGURABLE_PROVIDER_SURFACES.map(surface => {
                              const isActive = surface === panelPolicySurface
                              return (
                                <Button
                                  key={surface}
                                  label={`Inspect ${providerSurfaceLabel(surface)} reconciliation policy`}
                                  accessibilityState={{selected: isActive}}
                                  onPress={() => chooseSurfacePolicy(surface)}
                                  size="small"
                                  color={isActive ? 'primary' : 'secondary'}
                                  variant={isActive ? 'solid' : 'outline'}
                                  shape="rectangular">
                                  <ButtonText>
                                    {providerSurfaceLabel(surface)}
                                  </ButtonText>
                                </Button>
                              )
                            })}
                          </View>
                          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                            {RECONCILIATION_MODES.map(mode => {
                              const isActive = panelPolicy.mode === mode.id
                              return (
                                <Button
                                  key={mode.id}
                                  label={`Set ${mode.label.toLowerCase()} for ${providerSurfaceLabel(panelPolicySurface)}`}
                                  accessibilityState={{selected: isActive}}
                                  onPress={() =>
                                    void saveSurfacePolicy(panelPolicySurface, {
                                      mode: mode.id,
                                    })
                                  }
                                  size="small"
                                  color={isActive ? 'primary' : 'secondary'}
                                  variant={isActive ? 'solid' : 'outline'}
                                  shape="rectangular">
                                  <ButtonText>{mode.label}</ButtonText>
                                </Button>
                              )
                            })}
                          </View>
                          <View style={[a.gap_xs]}>
                            <SettingsList.ItemText
                              style={[
                                {paddingHorizontal: 0},
                                a.text_sm,
                                a.font_semi_bold,
                              ]}>
                              Explicit provider preference
                            </SettingsList.ItemText>
                            <SettingsList.ItemText
                              style={[
                                {paddingHorizontal: 0},
                                a.text_xs,
                                t.atoms.text_contrast_medium,
                              ]}>
                              Choose a provider only when you want a local
                              preference for incomplete or disagreeing results.
                            </SettingsList.ItemText>
                            {panelPolicyProviders.length === 0 ? (
                              <SettingsList.ItemText
                                style={[
                                  {paddingHorizontal: 0},
                                  a.text_sm,
                                  t.atoms.text_contrast_medium,
                                ]}>
                                No provider is enabled for this surface.
                              </SettingsList.ItemText>
                            ) : (
                              <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                                {panelPolicyProviders.map(provider => {
                                  const isActive =
                                    panelPolicy.mode === 'prefer-provider' &&
                                    panelPolicy.preferredProviderId ===
                                      provider.id
                                  return (
                                    <Button
                                      key={provider.id}
                                      label={`Prefer ${provider.displayName} for ${providerSurfaceLabel(panelPolicySurface)}`}
                                      accessibilityState={{selected: isActive}}
                                      onPress={() =>
                                        void saveSurfacePolicy(
                                          panelPolicySurface,
                                          {
                                            mode: 'prefer-provider',
                                            preferredProviderId: provider.id,
                                          },
                                        )
                                      }
                                      size="small"
                                      color={isActive ? 'primary' : 'secondary'}
                                      variant={isActive ? 'solid' : 'outline'}
                                      shape="rectangular">
                                      <ButtonText>
                                        {provider.displayName}
                                      </ButtonText>
                                    </Button>
                                  )
                                })}
                              </View>
                            )}
                          </View>
                          <Button
                            label="Close reconciliation inspector"
                            onPress={() => setOpenPanel(undefined)}
                            size="small"
                            color="secondary"
                            variant="outline"
                            shape="rectangular">
                            <ButtonText>Close</ButtonText>
                          </Button>
                        </WorkbenchActionPanel>
                      </SettingsList.Item>
                    )}
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
                    {openPanel?.kind === 'identity-policy' && (
                      <SettingsList.Item>
                        <WorkbenchActionPanel
                          testID="service-workbench-identity-policy-panel"
                          title="Identity resolution policy"
                          description="Enabled identity providers may make claims about a handle or DID. This local rule controls disagreement handling; it does not grant a resolver ownership of identity continuity.">
                          <SettingsList.ItemText
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            Current policy: {identityPolicyLabel}
                          </SettingsList.ItemText>
                          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                            <Button
                              label="Require agreement from all identity providers"
                              accessibilityState={{
                                selected:
                                  identityPolicy.mode === 'require-agreement',
                              }}
                              onPress={() =>
                                void saveIdentityPolicy({
                                  mode: 'require-agreement',
                                })
                              }
                              size="small"
                              color={
                                identityPolicy.mode === 'require-agreement'
                                  ? 'primary'
                                  : 'secondary'
                              }
                              variant={
                                identityPolicy.mode === 'require-agreement'
                                  ? 'solid'
                                  : 'outline'
                              }
                              shape="rectangular">
                              <ButtonText>Require agreement</ButtonText>
                            </Button>
                            <Button
                              label="Use the first verified identity provider result"
                              accessibilityState={{
                                selected:
                                  identityPolicy.mode === 'first-verified',
                              }}
                              onPress={() =>
                                void saveIdentityPolicy({
                                  mode: 'first-verified',
                                })
                              }
                              size="small"
                              color={
                                identityPolicy.mode === 'first-verified'
                                  ? 'primary'
                                  : 'secondary'
                              }
                              variant={
                                identityPolicy.mode === 'first-verified'
                                  ? 'solid'
                                  : 'outline'
                              }
                              shape="rectangular">
                              <ButtonText>First verified result</ButtonText>
                            </Button>
                          </View>
                          <View style={[a.gap_xs]}>
                            <SettingsList.ItemText
                              style={[
                                {paddingHorizontal: 0},
                                a.text_sm,
                                a.font_semi_bold,
                              ]}>
                              Prefer one provider
                            </SettingsList.ItemText>
                            {panelIdentityProviders.length === 0 ? (
                              <SettingsList.ItemText
                                style={[
                                  {paddingHorizontal: 0},
                                  a.text_sm,
                                  t.atoms.text_contrast_medium,
                                ]}>
                                No identity provider is enabled.
                              </SettingsList.ItemText>
                            ) : (
                              <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                                {panelIdentityProviders.map(provider => {
                                  const isActive =
                                    identityPolicy.mode === 'prefer-provider' &&
                                    identityPolicy.preferredProviderId ===
                                      provider.id
                                  return (
                                    <Button
                                      key={provider.id}
                                      label={`Prefer ${provider.displayName} for identity resolution`}
                                      accessibilityState={{selected: isActive}}
                                      onPress={() =>
                                        void saveIdentityPolicy({
                                          mode: 'prefer-provider',
                                          preferredProviderId: provider.id,
                                        })
                                      }
                                      size="small"
                                      color={isActive ? 'primary' : 'secondary'}
                                      variant={isActive ? 'solid' : 'outline'}
                                      shape="rectangular">
                                      <ButtonText>
                                        {provider.displayName}
                                      </ButtonText>
                                    </Button>
                                  )
                                })}
                              </View>
                            )}
                          </View>
                          <Button
                            label="Close identity policy inspector"
                            onPress={() => setOpenPanel(undefined)}
                            size="small"
                            color="secondary"
                            variant="outline"
                            shape="rectangular">
                            <ButtonText>Close</ButtonText>
                          </Button>
                        </WorkbenchActionPanel>
                      </SettingsList.Item>
                    )}
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
                        label={`Inspect PLC resolver ${resolver.displayName}`}
                        onPress={() =>
                          setOpenPanel({
                            kind: 'resolver',
                            resolverId: resolver.id,
                          })
                        }>
                        <SettingsList.ItemText>
                          {resolver.displayName}
                        </SettingsList.ItemText>
                        <SettingsList.BadgeText>
                          {`${resolver.enabled ? 'Enabled' : 'Disabled'} · ${resolver.operatorId}`}
                        </SettingsList.BadgeText>
                      </SettingsList.PressableItem>
                    ))}
                    {openPanel?.kind === 'resolver' && panelResolver && (
                      <SettingsList.Item>
                        <WorkbenchActionPanel
                          testID="service-workbench-resolver-panel"
                          title={`${panelResolver.displayName} resolver`}
                          description="A resolver is a replaceable source of identity claims. The endpoint and operator declaration are inspectable inputs; cryptographic history verification is still required before a result can be trusted.">
                          <SettingsList.ItemText
                            selectable
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            HTTPS endpoint: {panelResolver.endpoint}
                          </SettingsList.ItemText>
                          <SettingsList.ItemText
                            selectable
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            Declared operator: {panelResolver.operatorId}
                          </SettingsList.ItemText>
                          <SettingsList.ItemText
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            State:{' '}
                            {panelResolver.enabled ? 'Enabled' : 'Disabled'}
                          </SettingsList.ItemText>
                          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                            <Button
                              label={`${panelResolver.enabled ? 'Disable' : 'Enable'} PLC resolver ${panelResolver.displayName}`}
                              onPress={() =>
                                void togglePlcResolver(
                                  panelResolver.id,
                                  !panelResolver.enabled,
                                )
                              }
                              size="small"
                              shape="rectangular">
                              <ButtonText>
                                {panelResolver.enabled
                                  ? 'Disable resolver'
                                  : 'Enable resolver'}
                              </ButtonText>
                            </Button>
                            <Button
                              label="Close resolver inspector"
                              onPress={() => setOpenPanel(undefined)}
                              size="small"
                              color="secondary"
                              variant="outline"
                              shape="rectangular">
                              <ButtonText>Close</ButtonText>
                            </Button>
                          </View>
                        </WorkbenchActionPanel>
                      </SettingsList.Item>
                    )}
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
