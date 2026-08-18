import {useEffect, useState} from 'react'

import {type FeedProvenance, healthLabel} from '#/lib/attention-ui'
import {listenAppViewProviderChanged} from '#/state/events'
import {useSession} from '#/state/session'
import {
  getAppViewProviders,
  getSelectedAppViewProvider,
} from '#/state/session/providers'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

export function FeedProvenanceCard({provenance}: {provenance: FeedProvenance}) {
  return (
    <Layout.Content>
      <Text accessibilityRole="header">{provenance.feedName}</Text>
      <Text>
        {provenance.algorithmName}{' '}
        {provenance.algorithmVersion === 'not declared'
          ? '(version not declared)'
          : `v${provenance.algorithmVersion}`}{' '}
        · {provenance.provider}
      </Text>
      {provenance.providerDid ? (
        <Text>Provider DID: {provenance.providerDid}</Text>
      ) : null}
      {provenance.feedOwnerDid ? (
        <Text>Feed owner DID: {provenance.feedOwnerDid}</Text>
      ) : null}
      <Text>Manifest: {provenance.manifestStatus}</Text>
      <Text>Objective: {provenance.objective}</Text>
      <Text>Privacy: {provenance.privacy}</Text>
      <Text accessibilityLiveRegion="polite">
        {healthLabel(provenance.health)}
      </Text>
    </Layout.Content>
  )
}

export function ActiveFeedProvenance({
  feedName,
  algorithmName,
  objective,
  feedOwnerDid,
}: {
  feedName: string
  algorithmName: string
  objective: string
  feedOwnerDid?: string
}) {
  const {currentAccount} = useSession()
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
        algorithmName,
        algorithmVersion: 'not declared',
        provider: provider.displayName,
        providerDid: provider.serviceDid,
        feedOwnerDid,
        manifestStatus: 'unverified',
        objective,
        privacy: 'Local ranking preferences remain on this device',
      }}
    />
  )
}
