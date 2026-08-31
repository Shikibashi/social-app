import {useEffect, useState} from 'react'
import {Pressable, View} from 'react-native'
import {type I18n} from '@lingui/core'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {type FeedProvenance, parseFeedProviderContext} from '#/lib/attention-ui'
import {type ProviderCompositionResult} from '#/lib/provider-composition'
import {listenAppViewProviderChanged} from '#/state/events'
import {useSession} from '#/state/session'
import {
  getAppViewProviders,
  getSelectedAppViewProvider,
} from '#/state/session/providers'
import {useTheme} from '#/alf'
import * as Layout from '#/components/Layout'
import {PlumblineAuthoritySummary} from '#/components/PlumblineAuthoritySummary'
import {ProviderCompositionProvenance} from '#/components/ProviderCompositionProvenance'
import {Text} from '#/components/Typography'

export function FeedProvenanceCard({
  provenance,
  onChangeRanking,
  onChangeProvider,
}: {
  provenance: FeedProvenance
  onChangeRanking?: () => void
  onChangeProvider?: () => void
}) {
  const {_, i18n} = useLingui()
  const t = useTheme()
  const [showDetails, setShowDetails] = useState(false)
  const algorithmVersionLabel = feedAlgorithmVersionLabel(
    provenance.algorithmVersion,
    i18n,
  )
  const rule =
    [provenance.algorithmName, provenance.objective]
      .map(value => value.trim())
      .filter(Boolean)
      .join(' · ') || _(msg`Not declared`)
  const state = feedStateLabel(provenance, i18n)

  return (
    <Layout.Content contentContainerStyle={{paddingVertical: 2}}>
      <PlumblineAuthoritySummary
        testID="feed-provenance-summary"
        title={provenance.feedName}
        source={provenance.provider || _(msg`Not declared`)}
        rule={rule}
        state={state}
      />
      <ProviderCompositionProvenance
        surfaceLabel={provenance.feedName}
        composition={provenance.providerComposition}
        showSummary={false}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          showDetails ? _(msg`Hide feed details`) : _(msg`Show feed details`)
        }
        accessibilityHint={_(
          msg`Feed provenance details are hidden until expanded`,
        )}
        accessibilityState={{expanded: showDetails}}
        onPress={() => setShowDetails(value => !value)}
        style={({pressed}) => [
          {
            alignSelf: 'flex-start',
            borderColor: t.palette.contrast_200,
            borderWidth: 1,
            paddingHorizontal: 8,
            paddingVertical: 4,
          },
          pressed && {opacity: 0.65},
        ]}>
        <Text style={{fontWeight: '600'}}>
          {showDetails ? _(msg`Hide feed details`) : _(msg`Show feed details`)}
        </Text>
      </Pressable>

      {showDetails ? (
        <View style={{gap: 3, paddingTop: 4}}>
          <Text accessibilityRole="header">{provenance.feedName}</Text>
          <Text>
            {_(msg`Algorithm`)}: {provenance.algorithmName}{' '}
            {algorithmVersionLabel}
          </Text>
          <Text>
            {_(msg`AppView provider(s)`)}: {provenance.provider}
          </Text>
          {provenance.providerDid ? (
            <Text>
              {_(msg`AppView provider DID`)}: {provenance.providerDid}
            </Text>
          ) : null}
          {provenance.providerProvenance?.map(provider => (
            <Text key={provider.id}>
              {provider.displayName}: {provider.endpoint}
              {provider.operatorId
                ? ` · ${i18n._(msg`operator ${provider.operatorId}`)}`
                : ''}
            </Text>
          ))}
          {provenance.providerCompositionStatus ? (
            <Text>
              {_(msg`Provider composition`)}:{' '}
              {providerCompositionStatusLabel(
                provenance.providerCompositionStatus,
                i18n,
              )}
            </Text>
          ) : null}
          <Text>
            {_(msg`Operator independence`)}:{' '}
            {provenance.providerIndependence === 'declared-distinct'
              ? _(
                  msg`distinct operator IDs declared; independent control not proven`,
                )
              : _(msg`not established`)}
          </Text>
          {provenance.feedProviderDid ? (
            <Text>
              {_(msg`Feed provider DID`)}: {provenance.feedProviderDid}
            </Text>
          ) : null}
          {provenance.feedOwnerDid ? (
            <Text>
              {_(msg`Feed owner DID`)}: {provenance.feedOwnerDid}
            </Text>
          ) : null}
          {provenance.feedUri ? (
            <Text>
              {_(msg`Feed URI`)}: {provenance.feedUri}
            </Text>
          ) : null}
          <Text>
            {_(msg`Manifest`)}: {provenance.manifestStatus}
          </Text>
          <Text>
            {_(msg`Objective`)}: {provenance.objective}
          </Text>
          <Text>
            {_(msg`Privacy`)}: {provenance.privacy}
          </Text>
          <Text accessibilityLiveRegion="polite">
            {_(msg`Health`)}: {localizedHealthLabel(provenance.health, i18n)}
          </Text>
          {(onChangeRanking || onChangeProvider) && (
            <View style={{flexDirection: 'row', gap: 12, paddingTop: 6}}>
              {onChangeRanking ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={_(msg`Change local ranking`)}
                  accessibilityHint={_(
                    msg`Open settings for local ranking choices`,
                  )}
                  onPress={onChangeRanking}
                  style={({pressed}) => pressed && {opacity: 0.65}}>
                  <Text style={{fontWeight: '600'}}>
                    {_(msg`Change ranking`)}
                  </Text>
                </Pressable>
              ) : null}
              {onChangeProvider ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={_(msg`Change read provider`)}
                  accessibilityHint={_(
                    msg`Open settings for explicit read provider choices`,
                  )}
                  onPress={onChangeProvider}
                  style={({pressed}) => pressed && {opacity: 0.65}}>
                  <Text style={{fontWeight: '600'}}>
                    {_(msg`Change provider`)}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </Layout.Content>
  )
}

function feedAlgorithmVersionLabel(version: string, i18n: I18n): string {
  if (version === 'not declared') return i18n._(msg`(version not declared)`)
  if (/^\d+(?:\.\d+)*$/.test(version)) return `v${version}`
  return i18n._(msg`(version ${version})`)
}

function localizedHealthLabel(
  health: FeedProvenance['health'],
  i18n: I18n,
): string {
  switch (health) {
    case 'healthy':
      return i18n._(msg`Service healthy`)
    case 'circuit-open':
      return i18n._(msg`Provider unavailable; showing your selected fallback`)
    case 'stale':
      return i18n._(msg`Showing stale data`)
    case 'degraded':
      return i18n._(msg`Provider degraded`)
    default:
      return i18n._(msg`Service health unknown`)
  }
}

function feedStateLabel(provenance: FeedProvenance, i18n: I18n): string {
  const health = provenance.health
    ? localizedHealthLabel(provenance.health, i18n)
    : undefined
  const composition = provenance.providerCompositionStatus
    ? providerCompositionStatusLabel(provenance.providerCompositionStatus, i18n)
    : undefined
  return (
    [health, composition].filter(Boolean).join(' · ') ||
    i18n._(msg`Not declared`)
  )
}

function providerCompositionStatusLabel(
  status: NonNullable<FeedProvenance['providerCompositionStatus']>,
  i18n: I18n,
): string {
  switch (status) {
    case 'agreement':
      return i18n._(msg`Provider agreement`)
    case 'disagreement':
      return i18n._(msg`Provider disagreement`)
    case 'partial':
      return i18n._(msg`Partial provider response`)
    case 'unavailable':
      return i18n._(msg`Providers unavailable`)
    case 'empty':
      return i18n._(msg`No provider result`)
  }
}

export function ActiveFeedProvenance({
  feedName,
  algorithmName,
  algorithmVersion = 'not declared',
  objective,
  feedOwnerDid,
  feedUri,
  privacy,
  feedContext,
  providerProvenance,
  providerCompositionStatus,
  providerIndependence,
  providerComposition,
  onChangeRanking,
  onChangeProvider,
}: {
  feedName: string
  algorithmName: string
  algorithmVersion?: string
  objective: string
  feedOwnerDid?: string
  feedUri: string
  privacy: string
  feedContext?: string
  providerProvenance?: FeedProvenance['providerProvenance']
  providerCompositionStatus?: FeedProvenance['providerCompositionStatus']
  providerIndependence?: FeedProvenance['providerIndependence']
  providerComposition?: ProviderCompositionResult<unknown>
  onChangeRanking?: () => void
  onChangeProvider?: () => void
}) {
  const {currentAccount} = useSession()
  const {i18n} = useLingui()
  const providerContext = parseFeedProviderContext(feedContext)
  const [provider, setProvider] = useState(() =>
    getSelectedAppViewProvider(currentAccount?.did ?? ''),
  )

  useEffect(() => {
    setProvider(getSelectedAppViewProvider(currentAccount?.did ?? ''))
    if (!currentAccount) return
    return listenAppViewProviderChanged((changedDid, providerId) => {
      if (changedDid !== currentAccount.did) return
      const next = getAppViewProviders().find(item => item.id === providerId)
      if (next) setProvider(next)
    })
  }, [currentAccount])

  const actualProviders = providerProvenance?.length
    ? providerProvenance
    : [
        {
          id: provider.id,
          displayName: provider.displayName,
          endpoint: provider.endpoint,
          serviceDid: provider.serviceDid,
          operatorId: provider.operatorId,
        },
      ]
  const actualPrimaryProvider = actualProviders[0]

  return (
    <FeedProvenanceCard
      provenance={{
        feedName,
        algorithmName: providerContext?.algorithm
          ? i18n._(msg`Provider-supplied ${providerContext.algorithm}`)
          : algorithmName,
        algorithmVersion: providerContext?.version ?? algorithmVersion,
        provider: actualProviders.map(item => item.displayName).join(', '),
        providerDid: actualPrimaryProvider?.serviceDid,
        feedProviderDid: providerContext?.provider,
        feedOwnerDid,
        feedUri,
        manifestStatus: 'unverified',
        objective,
        privacy,
        providerProvenance: actualProviders,
        providerCompositionStatus,
        providerIndependence,
        providerComposition,
      }}
      onChangeRanking={onChangeRanking}
      onChangeProvider={onChangeProvider}
    />
  )
}
