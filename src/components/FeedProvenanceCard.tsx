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
import * as Layout from '#/components/Layout'
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
  const [showDetails, setShowDetails] = useState(false)
  const algorithmVersionLabel =
    provenance.algorithmVersion === 'not declared'
      ? '(version not declared)'
      : /^\d+(?:\.\d+)*$/.test(provenance.algorithmVersion)
        ? `v${provenance.algorithmVersion}`
        : `(version ${provenance.algorithmVersion})`

  return (
    <Layout.Content contentContainerStyle={{paddingVertical: 2}}>
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
            borderRadius: 6,
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
          <Text>AppView: {provenance.provider}</Text>
          {provenance.providerDid ? (
            <Text>AppView provider DID: {provenance.providerDid}</Text>
          ) : null}
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

export function ActiveFeedProvenance({
  feedName,
  algorithmName,
  algorithmVersion = 'not declared',
  objective,
  feedOwnerDid,
  feedUri,
  privacy,
  feedContext,
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

  return (
    <FeedProvenanceCard
      provenance={{
        feedName,
        algorithmName: providerContext?.algorithm
          ? `Provider-supplied ${providerContext.algorithm}`
          : algorithmName,
        algorithmVersion: providerContext?.version ?? algorithmVersion,
        provider: provider.displayName,
        providerDid: provider.serviceDid,
        feedProviderDid: providerContext?.provider,
        feedOwnerDid,
        feedUri,
        manifestStatus: 'unverified',
        objective,
        privacy,
      }}
      onChangeRanking={onChangeRanking}
      onChangeProvider={onChangeProvider}
    />
  )
}
