import {type ReactNode, useEffect, useState} from 'react'
import {Alert, TextInput, View} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import {type MessageDescriptor} from '@lingui/core'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {type IdentityResolutionPolicy} from '#/lib/identity-runtime'
import {
  BOUNDARY_OWNED_PROVIDER_SURFACES,
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
import {
  getOAuthFeatureLabelMessage,
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
import {H2} from '#/components/Typography'

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

const RECONCILIATION_MODES: Array<{
  id: ProviderReconciliationPolicy['mode']
  label: MessageDescriptor
}> = [
  {id: 'require-agreement', label: msg`Require agreement`},
  {id: 'first-verified', label: msg`Use first verified result`},
  {id: 'merge', label: msg`Merge attributable results`},
]

function reconciliationModeMessage(
  mode: ProviderReconciliationPolicy['mode'],
): MessageDescriptor {
  switch (mode) {
    case 'require-agreement':
      return msg`Require agreement`
    case 'first-verified':
      return msg`Use first verified result`
    case 'prefer-provider':
      return msg`Prefer one provider`
    case 'merge':
      return msg`Merge attributable results`
  }
}

function reconciliationModeActionMessage(
  mode: ProviderReconciliationPolicy['mode'],
  surfaceLabel: string,
): MessageDescriptor {
  switch (mode) {
    case 'require-agreement':
      return msg`Require agreement for ${surfaceLabel}`
    case 'first-verified':
      return msg`Use first verified result for ${surfaceLabel}`
    case 'prefer-provider':
      return msg`Prefer one provider for ${surfaceLabel}`
    case 'merge':
      return msg`Merge attributable results for ${surfaceLabel}`
  }
}

function providerSurfaceMessage(
  surface: ProviderSurface | AppViewProviderCapability,
): MessageDescriptor {
  switch (surface) {
    case 'public-read':
      return msg`Public reads`
    case 'identity-resolution':
      return msg`Identity resolution`
    case 'profiles':
      return msg`Profiles`
    case 'threads':
      return msg`Threads`
    case 'feeds':
      return msg`Feeds`
    case 'search':
      return msg`Search`
    case 'notifications':
      return msg`Notifications`
    case 'labels':
      return msg`Labels`
    case 'media':
      return msg`Media`
    case 'communities':
      return msg`Communities`
  }
}

function providerSurfaceAuthorityMessage(
  surface: ProviderSurface,
): MessageDescriptor {
  switch (surface) {
    case 'identity-resolution':
      return msg`Configured identity-capable resolver providers`
    case 'profiles':
    case 'threads':
    case 'search':
      return msg`Selected AppView providers`
    case 'feeds':
      return msg`Selected feed/AppView providers`
    case 'notifications':
      return msg`Selected authenticated AppView providers`
    case 'labels':
      return msg`Selected labeler/AppView providers`
    case 'media':
      return msg`Account PDS blob and media delivery boundary`
    case 'communities':
      return msg`Spaces transport and Radlib community control plane`
  }
}

function providerSurfaceDescriptionMessage(
  surface: ProviderSurface,
): MessageDescriptor {
  switch (surface) {
    case 'identity-resolution':
      return msg`DID and handle claims are composed from the enabled identity providers.`
    case 'profiles':
      return msg`Profile reads retain provider observations and use the local reconciliation policy.`
    case 'threads':
      return msg`Post and thread reads retain provider observations and use the local reconciliation policy.`
    case 'feeds':
      return msg`Feed metadata and custom-feed reads retain provider provenance and outage state.`
    case 'search':
      return msg`Search reads retain provider observations instead of silently choosing a winner.`
    case 'notifications':
      return msg`Account-scoped notification reads require an explicit authenticated provider boundary.`
    case 'labels':
      return msg`Label assertions remain attributable to their issuer and provider source.`
    case 'media':
      return msg`Uploads remain on the account PDS; blob previews and CDN delivery are not AppView-composed.`
    case 'communities':
      return msg`Membership and community records use the declared Spaces/Radlib transport, not AppView fan-out.`
  }
}

function identityProviderActionMessage(
  provider: AppViewProvider,
  enabled: boolean,
): MessageDescriptor {
  return enabled
    ? msg`Remove identity resolution from ${provider.displayName}`
    : msg`Allow identity resolution for ${provider.displayName}`
}

function identityProviderPreferenceMessage(
  provider: AppViewProvider,
): MessageDescriptor {
  return msg`Prefer ${provider.displayName} for identity resolution`
}

function plcResolverToggleMessage(
  displayName: string,
  enabled: boolean,
): MessageDescriptor {
  return enabled
    ? msg`Disable PLC resolver ${displayName}`
    : msg`Enable PLC resolver ${displayName}`
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

function describeProviderSources(
  providers: readonly AppViewProvider[],
): string[] {
  return providers.map(provider => provider.displayName)
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
  label: MessageDescriptor
  description: MessageDescriptor
}> = [
  {
    id: 'overview',
    label: msg`Overview`,
    description: msg`See which host and read providers are active.`,
  },
  {
    id: 'authorization',
    label: msg`Authorization`,
    description: msg`Upgrade only the OAuth capabilities you choose.`,
  },
  {
    id: 'providers',
    label: msg`Providers`,
    description: msg`Register and select replaceable read services.`,
  },
  {
    id: 'policies',
    label: msg`Policies`,
    description: msg`Choose how provider claims are reconciled locally.`,
  },
  {
    id: 'identity',
    label: msg`Identity`,
    description: msg`Control resolver participation and disagreement handling.`,
  },
  {
    id: 'resolvers',
    label: msg`PLC resolvers`,
    description: msg`Inspect and manage independently declared resolver sources.`,
  },
]

const SERVICES_INSPECTOR_COPY: Record<
  ServicesSection,
  {
    source: MessageDescriptor
    rule: MessageDescriptor
    control: MessageDescriptor
  }
> = {
  overview: {
    source: msg`Current account session and local provider registry`,
    rule: msg`The PDS remains the write and account authority; read providers do not become identity authorities.`,
    control: msg`Choose a read provider or open another section without changing the account host.`,
  },
  authorization: {
    source: msg`The current OAuth session and its granted feature groups`,
    rule: msg`A requested permission is not a grant. Each missing feature opens an explicit reauthorization step.`,
    control: msg`Upgrade one capability at a time, or leave the session unchanged.`,
  },
  providers: {
    source: msg`Registered AppView descriptors and their declared capabilities`,
    rule: msg`Registration identifies a service; it does not prove operator independence or grant private authority.`,
    control: msg`Add, select, or revoke a provider surface locally. No hidden fallback is performed.`,
  },
  policies: {
    source: msg`Per-surface provider observations and local reconciliation policy`,
    rule: msg`Agreement, disagreement, outage, and partial results remain attributable to their sources.`,
    control: msg`Export, import, or reset provider policy without exporting credentials or adding a host.`,
  },
  identity: {
    source: msg`Identity-capable provider declarations and resolver policy`,
    rule: msg`A resolver may make a claim about identity but cannot acquire ownership of the DID.`,
    control: msg`Allow or revoke identity resolution independently from ordinary public reads.`,
  },
  resolvers: {
    source: msg`PLC resolver declarations and cryptographic history verification`,
    rule: msg`An endpoint or operator label is not proof of independent control; verified histories and disagreement stay visible.`,
    control: msg`Enable or disable a declared resolver and add another public HTTPS source for comparison.`,
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
  const {_} = useLingui()
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
          {_(msg`Capability map`)}
        </SettingsList.ItemText>
        <SettingsList.ItemText
          style={[
            {paddingHorizontal: 0},
            a.text_sm,
            t.atoms.text_contrast_medium,
          ]}>
          {_(
            msg`Each service has a named source, a visible state, and an ordinary inspection path. A default provider is a convenience choice, not a universal authority.`,
          )}
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
            {_(msg`CAPABILITY`)}
          </SettingsList.ItemText>
          <SettingsList.ItemText
            style={[
              a.flex_1,
              {paddingHorizontal: 0},
              a.text_xs,
              a.font_semi_bold,
              t.atoms.text_contrast_medium,
            ]}>
            {_(msg`CURRENT SOURCE`)}
          </SettingsList.ItemText>
          <SettingsList.ItemText
            style={[
              a.flex_1,
              {paddingHorizontal: 0},
              a.text_xs,
              a.font_semi_bold,
              t.atoms.text_contrast_medium,
            ]}>
            {_(msg`STATE`)}
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
              label={_(msg`Inspect ${row.label} service`)}
              size="small"
              color="secondary"
              variant="outline"
              shape="rectangular"
              onPress={() => onInspect(row.target)}>
              <ButtonText>{_(msg`Inspect`)}</ButtonText>
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
  const {_, i18n} = useLingui()
  const t = useTheme()

  return (
    <WorkbenchActionPanel
      testID="service-workbench-provider-surfaces-panel"
      title={`${provider.displayName} ${_(msg`read surfaces`)}`}
      description={_(
        msg`Each surface is an independent local capability declaration. Removing a surface stops this provider from receiving that class of read request; it does not delete the provider or alter your account host.`,
      )}>
      <View style={[a.gap_xs]}>
        {CONFIGURABLE_PROVIDER_SURFACES.map(surface => {
          const enabled = provider.capabilities?.includes(surface)
          const surfaceLabel = i18n._(providerSurfaceMessage(surface))
          const actionLabel = enabled ? _(msg`Remove`) : _(msg`Allow`)
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
                  {surfaceLabel}
                </SettingsList.ItemText>
                <SettingsList.ItemText
                  style={[
                    {paddingHorizontal: 0},
                    a.text_xs,
                    t.atoms.text_contrast_medium,
                  ]}>
                  {enabled
                    ? _(msg`This provider may answer this surface.`)
                    : _(msg`This provider is excluded from this surface.`)}
                </SettingsList.ItemText>
              </View>
              <Button
                label={_(
                  msg`${actionLabel} ${surfaceLabel} surface for ${provider.displayName}`,
                )}
                onPress={() => onToggle(surface)}
                size="small"
                color={enabled ? 'primary' : 'secondary'}
                variant={enabled ? 'solid' : 'outline'}
                shape="rectangular">
                <ButtonText>
                  {enabled ? _(msg`Allowed`) : _(msg`Allow`)}
                </ButtonText>
              </Button>
            </View>
          )
        })}
      </View>
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        <Button
          label={_(msg`Inspect ${provider.displayName} provider`)}
          onPress={onBack}
          size="small"
          color="secondary"
          variant="outline"
          shape="rectangular">
          <ButtonText>{_(msg`Back to provider`)}</ButtonText>
        </Button>
        <Button
          label={_(msg`Close provider surfaces inspector`)}
          onPress={onClose}
          size="small"
          color="secondary"
          variant="outline"
          shape="rectangular">
          <ButtonText>{_(msg`Close`)}</ButtonText>
        </Button>
      </View>
    </WorkbenchActionPanel>
  )
}

export function ServicesSettingsScreen({route, navigation}: Props) {
  const {currentAccount} = useSession()
  const {_, i18n} = useLingui()
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
        _(msg`Permission updated`),
        _(
          msg`${i18n._(getOAuthFeatureLabelMessage(feature))} is now available to this client.`,
        ),
      )
    } catch (error) {
      Alert.alert(
        _(msg`Permission not updated`),
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      setPendingOAuthFeature(undefined)
    }
  }

  function revokeOAuthSession() {
    Alert.alert(
      _(msg`Revoke OAuth session?`),
      _(
        msg`This signs out the current account and revokes the complete OAuth session. It does not revoke one feature independently.`,
      ),
      [
        {text: _(msg`Cancel`), style: 'cancel'},
        {
          text: _(msg`Revoke session`),
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
        _(msg`Identity policy not saved`),
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
        _(msg`Identity provider not changed`),
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
        _(msg`Provider capability not changed`),
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
        _(msg`Reconciliation policy not saved`),
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
      _(msg`Provider policy copied`),
      _(
        msg`The export contains provider IDs, capabilities, and local reconciliation choices, but no endpoints, tokens, or service-auth material.`,
      ),
    )
  }

  async function importProviderPolicyFromClipboard() {
    try {
      await importAppViewPolicy(await Clipboard.getStringAsync())
      setProviders(getAppViewProviders())
      setIdentityPolicy(getIdentityResolutionPolicy())
      setReconciliationPolicies(readReconciliationPolicies())
      Alert.alert(
        _(msg`Provider policy imported`),
        _(
          msg`Only already-registered providers were changed. Imports cannot add a host or credential.`,
        ),
      )
    } catch (error) {
      Alert.alert(
        _(msg`Provider policy rejected`),
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  function resetProviderPolicyWithConfirmation() {
    Alert.alert(
      _(msg`Reset provider policy?`),
      _(
        msg`This revokes optional provider surface capabilities and clears selections and reconciliation choices. Registered endpoints remain available for a later explicit re-enable.`,
      ),
      [
        {text: _(msg`Cancel`), style: 'cancel'},
        {
          text: _(msg`Reset`),
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
        _(msg`Resolver details required`),
        _(
          msg`Enter a name, public HTTPS endpoint, and declared operator ID before adding a resolver.`,
        ),
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
        _(msg`PLC resolver added`),
        _(
          msg`${resolver.displayName} will be queried alongside ${PRIMARY_PLC_RESOLVER.displayName}. Its history must verify cryptographically before it can be selected.`,
        ),
      )
    } catch (error) {
      Alert.alert(
        _(msg`PLC resolver not added`),
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
        _(msg`PLC resolver not changed`),
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const identityPolicyLabel =
    identityPolicy.mode === 'require-agreement'
      ? _(msg`Require agreement from all identity providers`)
      : identityPolicy.mode === 'first-verified'
        ? _(msg`Use the first verified provider result`)
        : _(
            msg`Prefer ${
              providers.find(
                provider => provider.id === identityPolicy.preferredProviderId,
              )?.displayName ?? identityPolicy.preferredProviderId
            }`,
          )

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
  function localizeProviderSources(providerNames: readonly string[]) {
    return {
      provider:
        providerNames.length > 0
          ? providerNames.join(', ')
          : _(msg`No provider enabled`),
      state:
        providerNames.length > 0
          ? _(msg`${providerNames.length} enabled`)
          : _(msg`Unavailable`),
    }
  }
  const localizedFeedProviderSources =
    localizeProviderSources(feedProviderSources)
  const localizedNotificationProviderSources = localizeProviderSources(
    notificationProviderSources,
  )
  const localizedLabelProviderSources =
    localizeProviderSources(labelProviderSources)
  const localizedSearchProviderSources = localizeProviderSources(
    searchProviderSources,
  )
  const serviceWorkbenchRows: ServiceWorkbenchRow[] = [
    {
      id: 'identity',
      label: _(msg`Identity`),
      provider: currentAccount?.did ?? _(msg`No active account`),
      state: currentAccount ? _(msg`Active`) : _(msg`Not signed in`),
      detail: _(msg`DID-backed account; ${identityPolicyLabel}`),
      target: {kind: 'services', section: 'identity'},
    },
    {
      id: 'pds',
      label: _(msg`Personal Data Server`),
      provider: currentAccount?.pdsUrl ?? _(msg`No repository PDS`),
      state: currentAccount?.pdsUrl ? _(msg`Write host`) : _(msg`Unavailable`),
      detail: _(
        msg`Account records, writes, and profile media remain on the account host.`,
      ),
      target: {kind: 'route', route: 'IdentitySovereigntySettings'},
    },
    {
      id: 'appview',
      label: _(msg`AppView reads`),
      provider: selectedProvider?.displayName ?? _(msg`No provider selected`),
      state: selectedProvider ? _(msg`Active`) : _(msg`Not selected`),
      detail:
        selectedProvider?.endpoint ?? _(msg`Choose an explicit read provider.`),
      target: {kind: 'services', section: 'providers'},
    },
    {
      id: 'feeds',
      label: _(msg`Feeds`),
      provider: localizedFeedProviderSources.provider,
      state: localizedFeedProviderSources.state,
      detail: _(msg`Feed results retain source and reconciliation state.`),
      target: {kind: 'services', section: 'providers'},
    },
    {
      id: 'moderation-reach',
      label: _(msg`Moderation & Reach`),
      provider: localizedLabelProviderSources.provider,
      state: _(msg`Local policy`),
      detail: _(
        msg`Labels are claims; local rules decide warning, hiding, or ranking.`,
      ),
      target: {kind: 'route', route: 'Moderation'},
    },
    {
      id: 'search',
      label: _(msg`Search`),
      provider: localizedSearchProviderSources.provider,
      state: localizedSearchProviderSources.state,
      detail: _(
        msg`Search results remain attributable to their read provider.`,
      ),
      target: {kind: 'services', section: 'providers'},
    },
    {
      id: 'notifications',
      label: _(msg`Notifications`),
      provider: localizedNotificationProviderSources.provider,
      state: localizedNotificationProviderSources.state,
      detail: _(
        msg`Account-scoped reads use an explicit authenticated provider boundary.`,
      ),
      target: {kind: 'services', section: 'authorization'},
    },
    {
      id: 'authorization',
      label: _(msg`Authorization`),
      provider: currentAccount?.service ?? _(msg`No login service`),
      state: currentAccount ? _(msg`Delegated`) : _(msg`Not signed in`),
      detail: _(
        msg`Feature-scoped session permissions can be inspected and upgraded.`,
      ),
      target: {kind: 'services', section: 'authorization'},
    },
    {
      id: 'media',
      label: _(msg`Media`),
      provider: currentAccount?.pdsUrl ?? _(msg`Account PDS`),
      state: currentAccount?.pdsUrl
        ? _(msg`Boundary-owned`)
        : _(msg`Unavailable`),
      detail: i18n._(providerSurfaceDescriptionMessage('media')),
      target: {kind: 'route', route: 'ContentAndMediaSettings'},
    },
    {
      id: 'communities',
      label: _(msg`Communities`),
      provider: _(msg`Spaces transport and community authority`),
      state: _(msg`Boundary-owned`),
      detail: i18n._(providerSurfaceDescriptionMessage('communities')),
      target: {kind: 'route', route: 'PermissionedSpacesSettings'},
    },
    {
      id: 'exit-backups',
      label: _(msg`Exit & backups`),
      provider: _(msg`Local account controls`),
      state: _(msg`Available`),
      detail: _(
        msg`Export repository data and portable policy without exporting credentials.`,
      ),
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
      ? _(
          msg`${providers.length} registered read provider${providers.length === 1 ? '' : 's'}; ${selectedProvider?.displayName ?? _(msg`no provider selected`)}`,
        )
      : activeSection === 'authorization'
        ? currentAccount?.authType === 'oauth'
          ? _(
              msg`Feature-scoped OAuth upgrades are available for this session.`,
            )
          : _(msg`Sign in with OAuth to request feature-scoped upgrades.`)
        : activeSection === 'providers'
          ? _(
              msg`${providers.filter(provider => provider.enabled).length} enabled provider${providers.filter(provider => provider.enabled).length === 1 ? '' : 's'}`,
            )
          : activeSection === 'policies'
            ? _(
                msg`${CONFIGURABLE_PROVIDER_SURFACES.filter(surface => reconciliationPolicies[surface] !== undefined).length} runtime-composed policies stored locally`,
              )
            : activeSection === 'identity'
              ? _(
                  msg`${getAppViewProvidersForCapability('identity-resolution').length} identity provider${getAppViewProvidersForCapability('identity-resolution').length === 1 ? '' : 's'} enabled`,
                )
              : _(
                  msg`${plcResolvers.filter(resolver => resolver.enabled).length} declared PLC resolver${plcResolvers.filter(resolver => resolver.enabled).length === 1 ? '' : 's'} enabled`,
                )

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
              {_(msg`Navigator`)}
            </SettingsList.ItemText>
            <SettingsList.ItemText
              style={[
                {paddingHorizontal: 0},
                a.text_sm,
                t.atoms.text_contrast_medium,
              ]}>
              {_(
                msg`Choose an authority surface to inspect. The workspace below is the only place where a provider choice is changed.`,
              )}
            </SettingsList.ItemText>
            <View style={[a.flex_row, a.flex_wrap, a.gap_xs, a.pt_xs]}>
              {SERVICES_SECTIONS.map(section => {
                const isActive = section.id === activeSection
                return (
                  <Button
                    key={section.id}
                    label={_(msg`Open ${i18n._(section.label)}`)}
                    accessibilityState={{selected: isActive}}
                    size="small"
                    shape="rectangular"
                    color={isActive ? 'primary' : 'secondary'}
                    variant={isActive ? 'solid' : 'outline'}
                    onPress={() => selectSection(section.id)}>
                    <ButtonText>{i18n._(section.label)}</ButtonText>
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
                  {i18n._(activeSectionSpec.label)}
                </SettingsList.ItemText>
                <SettingsList.ItemText
                  style={[
                    {paddingHorizontal: 0},
                    a.text_sm,
                    t.atoms.text_contrast_medium,
                  ]}>
                  {i18n._(activeSectionSpec.description)}
                </SettingsList.ItemText>
              </View>

              <SettingsList.Container>
                {activeSection === 'overview' && (
                  <>
                    <SettingsList.Item>
                      <SettingsList.ItemText>
                        {_(msg`Account service (login)`)}
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {currentAccount
                          ? currentAccount.service
                          : _(msg`No active account`)}
                      </SettingsList.BadgeText>
                    </SettingsList.Item>
                    <SettingsList.Item>
                      <SettingsList.ItemText>
                        {_(msg`Repository PDS`)}
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {currentAccount?.pdsUrl ??
                          _(
                            msg`Not available from the DID-backed session state`,
                          )}
                      </SettingsList.BadgeText>
                    </SettingsList.Item>
                    <SettingsList.Item>
                      <SettingsList.ItemText>
                        {_(msg`Current read provider`)}
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {selectedProvider?.displayName ?? _(msg`Not selected`)}
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
                          {_(msg`Authority map`)}
                        </SettingsList.ItemText>
                        <SettingsList.ItemText
                          style={[
                            {paddingHorizontal: 0},
                            a.text_sm,
                            t.atoms.text_contrast_medium,
                          ]}>
                          {_(
                            msg`Your PDS handles account writes and session state. AppViews answer selected public-read surfaces. The client records which provider answered instead of silently promoting one service to a universal source.`,
                          )}
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
                              {_(msg`OAuth permission upgrades`)}
                            </SettingsList.ItemText>
                            <SettingsList.ItemText
                              style={[
                                {paddingHorizontal: 0},
                                a.text_sm,
                                t.atoms.text_contrast_medium,
                              ]}>
                              {_(
                                msg`New sessions request only the feature groups needed for ordinary use. Each missing capability opens a separate consent upgrade; existing posting, likes, profile editing, chat, and Spaces grants are retained.`,
                              )}
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
                          {_(
                            msg`Feature-scoped upgrades are available after signing in with OAuth.`,
                          )}
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
                        label={_(msg`Inspect ${provider.displayName} provider`)}
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
                            ? _(
                                msg`Selected read provider · ${provider.serviceDid}`,
                              )
                            : _(
                                msg`${provider.enabled ? _(msg`Enabled`) : _(msg`Disabled`)} · ${provider.serviceDid}`,
                              )}
                        </SettingsList.BadgeText>
                      </SettingsList.PressableItem>
                    ))}
                    {openPanel?.kind === 'provider' && panelProvider && (
                      <SettingsList.Item>
                        <WorkbenchActionPanel
                          testID="service-workbench-provider-panel"
                          title={`${panelProvider.displayName} ${_(msg`provider`)}`}
                          description={_(
                            msg`Inspect the service identity and endpoint before choosing it for new reads. This choice never moves account writes away from the repository PDS.`,
                          )}>
                          <SettingsList.ItemText
                            selectable
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            {_(msg`Service DID: ${panelProvider.serviceDid}`)}
                          </SettingsList.ItemText>
                          <SettingsList.ItemText
                            selectable
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            {_(msg`HTTPS endpoint: ${panelProvider.endpoint}`)}
                          </SettingsList.ItemText>
                          <SettingsList.ItemText
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            {_(
                              msg`Declared surfaces: ${(
                                panelProvider.capabilities ?? ['public-read']
                              )
                                .map(surface =>
                                  i18n._(providerSurfaceMessage(surface)),
                                )
                                .join(', ')}`,
                            )}
                          </SettingsList.ItemText>
                          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                            <Button
                              testID="service-workbench-use-provider"
                              label={_(
                                msg`Use ${panelProvider.displayName} for new reads`,
                              )}
                              onPress={() => void choose(panelProvider)}
                              disabled={
                                !currentAccount || selected === panelProvider.id
                              }
                              size="small"
                              shape="rectangular">
                              <ButtonText>
                                {selected === panelProvider.id
                                  ? _(msg`Selected for new reads`)
                                  : _(msg`Use for new reads`)}
                              </ButtonText>
                            </Button>
                            <Button
                              testID="service-workbench-configure-provider"
                              label={_(
                                msg`Configure read surfaces for ${panelProvider.displayName}`,
                              )}
                              onPress={() =>
                                chooseProviderSurfaces(panelProvider)
                              }
                              size="small"
                              color="secondary"
                              variant="outline"
                              shape="rectangular">
                              <ButtonText>
                                {_(msg`Configure surfaces`)}
                              </ButtonText>
                            </Button>
                            {!panelProvider.builtin && (
                              <Button
                                testID="service-workbench-remove-provider"
                                label={_(
                                  msg`Remove ${panelProvider.displayName} from this device`,
                                )}
                                onPress={() =>
                                  requestProviderRemoval(panelProvider)
                                }
                                color="secondary"
                                variant="outline"
                                shape="rectangular"
                                size="small">
                                <ButtonText>
                                  {_(msg`Remove from device`)}
                                </ButtonText>
                              </Button>
                            )}
                            <Button
                              label={_(msg`Close provider inspector`)}
                              onPress={() => setOpenPanel(undefined)}
                              size="small"
                              color="secondary"
                              variant="outline"
                              shape="rectangular">
                              <ButtonText>{_(msg`Close`)}</ButtonText>
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
                          {_(msg`Identity resolver providers`)}
                        </SettingsList.ItemText>
                        <SettingsList.ItemText
                          style={[
                            {paddingHorizontal: 0},
                            a.text_sm,
                            t.atoms.text_contrast_medium,
                          ]}>
                          {_(
                            msg`Providers start with public-read only. Public profile links can use an anonymous handle lookup from those providers; allowing identity resolution separately opts a provider into broader identity claims and remains revocable on this device.`,
                          )}
                        </SettingsList.ItemText>
                      </View>
                    </SettingsList.Item>
                    {providers.map(provider => (
                      <SettingsList.PressableItem
                        key={`identity-${provider.id}`}
                        label={i18n._(
                          identityProviderActionMessage(
                            provider,
                            provider.capabilities?.includes(
                              'identity-resolution',
                            ) ?? false,
                          ),
                        )}
                        onPress={() => void toggleIdentityProvider(provider)}>
                        <SettingsList.ItemText>
                          {provider.displayName}
                        </SettingsList.ItemText>
                        <SettingsList.BadgeText>
                          {provider.capabilities?.includes(
                            'identity-resolution',
                          )
                            ? _(msg`Identity resolution allowed`)
                            : _(msg`Public reads only`)}
                        </SettingsList.BadgeText>
                      </SettingsList.PressableItem>
                    ))}
                    <SettingsList.Divider />
                    <SettingsList.Item>
                      <View style={[a.flex_1, a.gap_sm]}>
                        <SettingsList.ItemText style={[{paddingHorizontal: 0}]}>
                          {_(msg`Add a read provider`)}
                        </SettingsList.ItemText>
                        <SettingsList.ItemText
                          style={[
                            {paddingHorizontal: 0},
                            a.text_sm,
                            t.atoms.text_contrast_medium,
                          ]}>
                          {_(
                            msg`Register an AppView read provider by its own endpoint. The endpoint is checked first; new providers start with public-read only. Identity resolution is a separate, revocable choice.`,
                          )}
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
                        label={_(
                          msg`Configure read surfaces for ${provider.displayName}`,
                        )}
                        onPress={() => chooseProviderSurfaces(provider)}>
                        <SettingsList.ItemText>
                          {_(msg`${provider.displayName} surface permissions`)}
                        </SettingsList.ItemText>
                        <SettingsList.BadgeText>
                          {_(
                            msg`${CONFIGURABLE_PROVIDER_SURFACES.filter(surface => provider.capabilities?.includes(surface)).length} runtime surfaces enabled`,
                          )}
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
                          {_(msg`Boundary-owned surfaces`)}
                        </SettingsList.ItemText>
                        <SettingsList.ItemText
                          style={[
                            {paddingHorizontal: 0},
                            a.text_sm,
                            t.atoms.text_contrast_medium,
                          ]}>
                          {_(
                            msg`These surfaces are intentionally not presented as AppView provider choices until a compatible read contract is wired at their existing authority boundary.`,
                          )}
                        </SettingsList.ItemText>
                      </View>
                    </SettingsList.Item>
                    {BOUNDARY_OWNED_PROVIDER_SURFACES.map(surface => (
                      <SettingsList.Item key={`boundary-${surface}`}>
                        <View style={[a.flex_1, a.gap_xs]}>
                          <SettingsList.ItemText
                            style={[{paddingHorizontal: 0}]}>
                            {i18n._(providerSurfaceMessage(surface))}
                          </SettingsList.ItemText>
                          <SettingsList.BadgeText>
                            {_(
                              msg`${i18n._(providerSurfaceAuthorityMessage(surface))} · ${_(msg`not AppView-composed`)}`,
                            )}
                          </SettingsList.BadgeText>
                          <SettingsList.ItemText
                            style={[
                              {paddingHorizontal: 0},
                              a.text_sm,
                              t.atoms.text_contrast_medium,
                            ]}>
                            {i18n._(providerSurfaceDescriptionMessage(surface))}
                          </SettingsList.ItemText>
                        </View>
                      </SettingsList.Item>
                    ))}
                    <SettingsList.PressableItem
                      label={_(msg`Choose provider reconciliation policy`)}
                      onPress={chooseAnySurfacePolicy}>
                      <SettingsList.ItemText>
                        {_(msg`Reconciliation policies`)}
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {_(
                          msg`${Object.keys(reconciliationPolicies).length} surfaces configured`,
                        )}
                      </SettingsList.BadgeText>
                    </SettingsList.PressableItem>
                    {panelPolicySurface && panelPolicy && (
                      <SettingsList.Item>
                        <WorkbenchActionPanel
                          testID="service-workbench-reconciliation-panel"
                          title={_(
                            msg`${i18n._(providerSurfaceMessage(panelPolicySurface))} reconciliation`,
                          )}
                          description={_(
                            msg`This is a local reconciliation rule for this read surface. Provider disagreement, outage, and partial results remain attributable; selecting a preference does not make a provider universally authoritative.`,
                          )}>
                          <SettingsList.ItemText
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            {_(
                              msg`Current policy: ${i18n._(reconciliationModeMessage(panelPolicy.mode))}`,
                            )}
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
                              const surfaceLabel = i18n._(
                                providerSurfaceMessage(surface),
                              )
                              return (
                                <Button
                                  key={surface}
                                  label={_(
                                    msg`Inspect ${surfaceLabel} reconciliation policy`,
                                  )}
                                  accessibilityState={{selected: isActive}}
                                  onPress={() => chooseSurfacePolicy(surface)}
                                  size="small"
                                  color={isActive ? 'primary' : 'secondary'}
                                  variant={isActive ? 'solid' : 'outline'}
                                  shape="rectangular">
                                  <ButtonText>{surfaceLabel}</ButtonText>
                                </Button>
                              )
                            })}
                          </View>
                          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                            {RECONCILIATION_MODES.map(mode => {
                              const isActive = panelPolicy.mode === mode.id
                              const surfaceLabel = i18n._(
                                providerSurfaceMessage(panelPolicySurface),
                              )
                              return (
                                <Button
                                  key={mode.id}
                                  label={i18n._(
                                    reconciliationModeActionMessage(
                                      mode.id,
                                      surfaceLabel,
                                    ),
                                  )}
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
                                  <ButtonText>{i18n._(mode.label)}</ButtonText>
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
                              {_(msg`Explicit provider preference`)}
                            </SettingsList.ItemText>
                            <SettingsList.ItemText
                              style={[
                                {paddingHorizontal: 0},
                                a.text_xs,
                                t.atoms.text_contrast_medium,
                              ]}>
                              {_(
                                msg`Choose a provider only when you want a local preference for incomplete or disagreeing results.`,
                              )}
                            </SettingsList.ItemText>
                            {panelPolicyProviders.length === 0 ? (
                              <SettingsList.ItemText
                                style={[
                                  {paddingHorizontal: 0},
                                  a.text_sm,
                                  t.atoms.text_contrast_medium,
                                ]}>
                                {_(
                                  msg`No provider is enabled for this surface.`,
                                )}
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
                                      label={_(
                                        msg`Prefer ${provider.displayName} for ${i18n._(providerSurfaceMessage(panelPolicySurface))}`,
                                      )}
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
                            label={_(msg`Close reconciliation inspector`)}
                            onPress={() => setOpenPanel(undefined)}
                            size="small"
                            color="secondary"
                            variant="outline"
                            shape="rectangular">
                            <ButtonText>{_(msg`Close`)}</ButtonText>
                          </Button>
                        </WorkbenchActionPanel>
                      </SettingsList.Item>
                    )}
                    <SettingsList.PressableItem
                      label={_(msg`Export provider policy`)}
                      onPress={() => void copyProviderPolicy()}>
                      <SettingsList.ItemText>
                        {_(msg`Export provider policy`)}
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {_(msg`Clipboard; no credentials`)}
                      </SettingsList.BadgeText>
                    </SettingsList.PressableItem>
                    <SettingsList.PressableItem
                      label={_(msg`Import provider policy from clipboard`)}
                      onPress={() => void importProviderPolicyFromClipboard()}>
                      <SettingsList.ItemText>
                        {_(msg`Import provider policy`)}
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {_(msg`Existing provider IDs only`)}
                      </SettingsList.BadgeText>
                    </SettingsList.PressableItem>
                    <SettingsList.PressableItem
                      label={_(msg`Reset provider policy`)}
                      onPress={resetProviderPolicyWithConfirmation}
                      destructive>
                      <SettingsList.ItemText>
                        {_(msg`Reset provider policy`)}
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {_(msg`Revoke optional surfaces`)}
                      </SettingsList.BadgeText>
                    </SettingsList.PressableItem>
                  </>
                )}

                {activeSection === 'identity' && (
                  <>
                    <SettingsList.Item>
                      <View style={[a.flex_1, a.gap_sm]}>
                        <SettingsList.ItemText style={[{paddingHorizontal: 0}]}>
                          {_(msg`Identity resolution policy`)}
                        </SettingsList.ItemText>
                        <SettingsList.ItemText
                          style={[
                            {paddingHorizontal: 0},
                            a.text_sm,
                            t.atoms.text_contrast_medium,
                          ]}>
                          {_(
                            msg`Every enabled identity provider is queried according to this local rule. The rule controls how the client handles disagreement; it does not grant a provider ownership of your DID.`,
                          )}
                        </SettingsList.ItemText>
                      </View>
                    </SettingsList.Item>
                    <SettingsList.PressableItem
                      label={_(msg`Identity resolution policy`)}
                      onPress={chooseIdentityPolicy}>
                      <SettingsList.ItemText>
                        {_(msg`Current identity policy`)}
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {identityPolicyLabel}
                      </SettingsList.BadgeText>
                    </SettingsList.PressableItem>
                    {openPanel?.kind === 'identity-policy' && (
                      <SettingsList.Item>
                        <WorkbenchActionPanel
                          testID="service-workbench-identity-policy-panel"
                          title={_(msg`Identity resolution policy`)}
                          description={_(
                            msg`Enabled identity providers may make claims about a handle or DID. This local rule controls disagreement handling; it does not grant a resolver ownership of identity continuity.`,
                          )}>
                          <SettingsList.ItemText
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            {_(msg`Current policy: ${identityPolicyLabel}`)}
                          </SettingsList.ItemText>
                          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                            <Button
                              label={_(
                                msg`Require agreement from all identity providers`,
                              )}
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
                              <ButtonText>
                                {_(msg`Require agreement`)}
                              </ButtonText>
                            </Button>
                            <Button
                              label={_(
                                msg`Use the first verified identity provider result`,
                              )}
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
                              <ButtonText>
                                {_(msg`First verified result`)}
                              </ButtonText>
                            </Button>
                          </View>
                          <View style={[a.gap_xs]}>
                            <SettingsList.ItemText
                              style={[
                                {paddingHorizontal: 0},
                                a.text_sm,
                                a.font_semi_bold,
                              ]}>
                              {_(msg`Prefer one provider`)}
                            </SettingsList.ItemText>
                            {panelIdentityProviders.length === 0 ? (
                              <SettingsList.ItemText
                                style={[
                                  {paddingHorizontal: 0},
                                  a.text_sm,
                                  t.atoms.text_contrast_medium,
                                ]}>
                                {_(msg`No identity provider is enabled.`)}
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
                                      label={i18n._(
                                        identityProviderPreferenceMessage(
                                          provider,
                                        ),
                                      )}
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
                            label={_(msg`Close identity policy inspector`)}
                            onPress={() => setOpenPanel(undefined)}
                            size="small"
                            color="secondary"
                            variant="outline"
                            shape="rectangular">
                            <ButtonText>{_(msg`Close`)}</ButtonText>
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
                          {_(msg`PLC resolver plurality`)}
                        </SettingsList.ItemText>
                        <SettingsList.ItemText
                          style={[
                            {paddingHorizontal: 0},
                            a.text_sm,
                            t.atoms.text_contrast_medium,
                          ]}>
                          {_(
                            msg`Histories are verified against signed PLC operations before selection. ${PRIMARY_PLC_RESOLVER.displayName} remains the compatibility resolver; a resolver URL or operator label alone does not prove independent control.`,
                          )}
                        </SettingsList.ItemText>
                      </View>
                    </SettingsList.Item>
                    <SettingsList.Item>
                      <SettingsList.ItemText>
                        {_(msg`Primary resolver`)}
                      </SettingsList.ItemText>
                      <SettingsList.BadgeText>
                        {PRIMARY_PLC_RESOLVER.endpoint}
                      </SettingsList.BadgeText>
                    </SettingsList.Item>
                    {plcResolvers.map(resolver => (
                      <SettingsList.PressableItem
                        key={`plc-resolver-${resolver.id}`}
                        label={_(
                          msg`Inspect PLC resolver ${resolver.displayName}`,
                        )}
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
                          {_(
                            msg`${resolver.enabled ? _(msg`Enabled`) : _(msg`Disabled`)} · ${resolver.operatorId}`,
                          )}
                        </SettingsList.BadgeText>
                      </SettingsList.PressableItem>
                    ))}
                    {openPanel?.kind === 'resolver' && panelResolver && (
                      <SettingsList.Item>
                        <WorkbenchActionPanel
                          testID="service-workbench-resolver-panel"
                          title={`${panelResolver.displayName} ${_(msg`resolver`)}`}
                          description={_(
                            msg`A resolver is a replaceable source of identity claims. The endpoint and operator declaration are inspectable inputs; cryptographic history verification is still required before a result can be trusted.`,
                          )}>
                          <SettingsList.ItemText
                            selectable
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            {_(msg`HTTPS endpoint: ${panelResolver.endpoint}`)}
                          </SettingsList.ItemText>
                          <SettingsList.ItemText
                            selectable
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            {_(
                              msg`Declared operator: ${panelResolver.operatorId}`,
                            )}
                          </SettingsList.ItemText>
                          <SettingsList.ItemText
                            style={[{paddingHorizontal: 0}, a.text_sm]}>
                            {_(
                              msg`State: ${panelResolver.enabled ? _(msg`Enabled`) : _(msg`Disabled`)}`,
                            )}
                          </SettingsList.ItemText>
                          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                            <Button
                              label={i18n._(
                                plcResolverToggleMessage(
                                  panelResolver.displayName,
                                  panelResolver.enabled,
                                ),
                              )}
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
                                  ? _(msg`Disable resolver`)
                                  : _(msg`Enable resolver`)}
                              </ButtonText>
                            </Button>
                            <Button
                              label={_(msg`Close resolver inspector`)}
                              onPress={() => setOpenPanel(undefined)}
                              size="small"
                              color="secondary"
                              variant="outline"
                              shape="rectangular">
                              <ButtonText>{_(msg`Close`)}</ButtonText>
                            </Button>
                          </View>
                        </WorkbenchActionPanel>
                      </SettingsList.Item>
                    )}
                    <SettingsList.Item>
                      <View style={[a.flex_1, a.gap_sm]}>
                        <SettingsList.ItemText style={[{paddingHorizontal: 0}]}>
                          {_(msg`Add a PLC mirror or resolver declaration`)}
                        </SettingsList.ItemText>
                        <TextInput
                          accessibilityLabel={_(msg`PLC resolver name`)}
                          accessibilityHint={_(
                            msg`Enter a display name for this public PLC resolver.`,
                          )}
                          placeholder={_(msg`Resolver name`)}
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
                          accessibilityLabel={_(
                            msg`PLC resolver HTTPS endpoint`,
                          )}
                          accessibilityHint={_(
                            msg`Enter a public HTTPS origin for the resolver.`,
                          )}
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
                          accessibilityLabel={_(msg`PLC resolver operator ID`)}
                          accessibilityHint={_(
                            msg`Enter the operator identity declared by this resolver.`,
                          )}
                          placeholder={_(msg`Declared operator ID`)}
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
                          label={_(msg`Register PLC resolver`)}
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
                                ? _(msg`Checking resolver…`)
                                : _(msg`Register PLC resolver`)}
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
              testID="service-workbench-inspector"
              role="complementary"
              accessibilityLabel={_(msg`Inspector`)}
              accessibilityHint={_(
                msg`Shows the provider, rule, and control for this surface`,
              )}
              style={[
                a.border,
                a.p_md,
                a.gap_sm,
                t.atoms.bg_contrast_25,
                t.atoms.border_contrast_low,
                gtMobile ? {width: 184} : a.w_full,
              ]}>
              <H2 style={[a.text_md, a.font_semi_bold]}>{_(msg`Inspector`)}</H2>
              <SettingsList.ItemText
                style={[{paddingHorizontal: 0}, a.text_sm, a.font_semi_bold]}>
                {_(msg`Source`)}
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[
                  {paddingHorizontal: 0},
                  a.text_sm,
                  t.atoms.text_contrast_medium,
                ]}>
                {i18n._(activeInspector.source)}
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[{paddingHorizontal: 0}, a.text_sm, a.font_semi_bold]}>
                {_(msg`Rule`)}
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[
                  {paddingHorizontal: 0},
                  a.text_sm,
                  t.atoms.text_contrast_medium,
                ]}>
                {i18n._(activeInspector.rule)}
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[{paddingHorizontal: 0}, a.text_sm, a.font_semi_bold]}>
                {_(msg`User control`)}
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[
                  {paddingHorizontal: 0},
                  a.text_sm,
                  t.atoms.text_contrast_medium,
                ]}>
                {i18n._(activeInspector.control)}
              </SettingsList.ItemText>
              <SettingsList.ItemText
                style={[{paddingHorizontal: 0}, a.text_sm, a.font_semi_bold]}>
                {_(msg`Current state`)}
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
