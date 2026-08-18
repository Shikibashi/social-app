import {Text} from '#/components/Typography'
import * as Layout from '#/components/Layout'
import {healthLabel, type FeedProvenance} from '#/lib/attention-ui'

export function FeedProvenanceCard({provenance}: {provenance: FeedProvenance}) {
  return <Layout.Content>
    <Text accessibilityRole="header">{provenance.feedName}</Text>
    <Text>{provenance.algorithmName} v{provenance.algorithmVersion} · {provenance.provider}</Text>
    {provenance.providerDid ? <Text>Provider DID: {provenance.providerDid}</Text> : null}
    <Text>Manifest: {provenance.manifestStatus}</Text>
    <Text>Objective: {provenance.objective}</Text>
    <Text>Privacy: {provenance.privacy}</Text>
    <Text accessibilityLiveRegion="polite">{healthLabel(provenance.health)}</Text>
  </Layout.Content>
}
