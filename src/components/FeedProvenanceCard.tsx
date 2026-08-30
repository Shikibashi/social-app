import {useEffect, useState} from 'react'
import {Pressable, View} from 'react-native'

import {
  type FeedProvenance,
  healthLabel,
  parseFeedProviderContext,
} from '#/lib/attention-ui'
import {listenAppViewProviderChanged} from '#/state/events'
import {useSession} from '#/state/session'
import {
  getAppViewProviders,
  getSelectedAppViewProvider,
} from '#/state/session/providers'
import {useTheme} from '#/alf'
import * as Layout from '#/components/Layout'
import {PlumblineAuthoritySummary} from '#/components/PlumblineAuthoritySummary'
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
  const t = useTheme()
  const [showDetails, setShowDetails] = useState(false)
  const algorithmVersionLabel =
    provenance.algorithmVersion === 'not declared'
      ? '(version not declared)'
      : /^\d+(?:\.\d+)*$/.test(provenance.algorithmVersion)
        ? `v${provenance.algorithmVersion}`
        : `(version ${provenance.algorithmVersion})`
  const rule =
    [provenance.algorithmName, provenance.objective]
      .map(value => value.trim())
      .filter(Boolean)
      .join(' · ') || 'Not declared'
  const state = feedStateLabel(provenance)

  return (
    <Layout.Content contentContainerStyle={{paddingVertical: 2}}>
      <PlumblineAuthoritySummary
        testID="feed-provenance-summary"
        title={provenance.feedName}
        source={provenance.provider || 'Not declared'}
        rule={rule}
        state={state}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          showDetails ? 'Hide feed details' : 'Show feed details'
        }
        accessibilityHint="Feed provenance details are hidden until expanded"
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
          {showDetails ? 'Hide feed details' : 'Show feed details'}
        </Text>
      </Pressable>

      {showDetails ? (
        <View style={{gap: 3, paddingTop: 4}}>
          <Text accessibilityRole="header">{provenance.feedName}</Text>
          <Text>
            Algorithm: {provenance.algorithmName} {algorithmVersionLabel}
          </Text>
          <Text>AppView provider(s): {provenance.provider}</Text>
          {provenance.providerDid ? (
            <Text>AppView provider DID: {provenance.providerDid}</Text>
          ) : null}
          {provenance.providerProvenance?.map(provider => (
            <Text key={provider.id}>
              {provider.displayName}: {provider.endpoint}
              {provider.operatorId ? ` · operator ${provider.operatorId}` : ''}
            </Text>
          ))}
          {provenance.providerCompositionStatus ? (
            <Text>
              Provider composition: {provenance.providerCompositionStatus}
            </Text>
          ) : null}
          <Text>
            Operator independence:{' '}
            {provenance.providerIndependence === 'declared-distinct'
              ? 'distinct operator IDs declared; independent control not proven'
              : 'not established'}
          </Text>
          {provenance.feedProviderDid ? (
            <Text>Feed provider DID: {provenance.feedProviderDid}</Text>
          ) : null}
          {provenance.feedOwnerDid ? (
            <Text>Feed owner DID: {provenance.feedOwnerDid}</Text>
          ) : null}
          {provenance.feedUri ? (
            <Text>Feed URI: {provenance.feedUri}</Text>
          ) : null}
          <Text>Manifest: {provenance.manifestStatus}</Text>
          <Text>Objective: {provenance.objective}</Text>
          <Text>Privacy: {provenance.privacy}</Text>
          <Text accessibilityLiveRegion="polite">
            Health: {healthLabel(provenance.health)}
          </Text>
          {(onChangeRanking || onChangeProvider) && (
            <View style={{flexDirection: 'row', gap: 12, paddingTop: 6}}>
              {onChangeRanking ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change local ranking"
                  accessibilityHint="Open settings for local ranking choices"
                  onPress={onChangeRanking}
                  style={({pressed}) => pressed && {opacity: 0.65}}>
                  <Text style={{fontWeight: '600'}}>Change ranking</Text>
                </Pressable>
              ) : null}
              {onChangeProvider ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change read provider"
                  accessibilityHint="Open settings for explicit read provider choices"
                  onPress={onChangeProvider}
                  style={({pressed}) => pressed && {opacity: 0.65}}>
                  <Text style={{fontWeight: '600'}}>Change provider</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </Layout.Content>
  )
}

function feedStateLabel(provenance: FeedProvenance): string {
  const health = provenance.health ? healthLabel(provenance.health) : undefined
  const composition = provenance.providerCompositionStatus
    ? providerCompositionStatusLabel(provenance.providerCompositionStatus)
    : undefined
  return [health, composition].filter(Boolean).join(' · ') || 'Not declared'
}

function providerCompositionStatusLabel(
  status: NonNullable<FeedProvenance['providerCompositionStatus']>,
): string {
  switch (status) {
    case 'agreement':
      return 'Provider agreement'
    case 'disagreement':
      return 'Provider disagreement'
    case 'partial':
      return 'Partial provider response'
    case 'unavailable':
      return 'Providers unavailable'
    case 'empty':
      return 'No provider result'
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
  onChangeRanking?: () => void
  onChangeProvider?: () => void
}) {
  const {currentAccount} = useSession()
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
          ? `Provider-supplied ${providerContext.algorithm}`
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
      }}
      onChangeRanking={onChangeRanking}
      onChangeProvider={onChangeProvider}
    />
  )
}
