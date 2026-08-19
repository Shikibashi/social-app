import {type CandidateBatch} from './candidate-protocol'
import {
  EXPERIMENTAL_MANIFESTS,
  rankExperimental,
} from './experimental-attention'
import {
  defaultExplicitPreferences,
  defaultLearnedProfile,
  type ExplicitPreferences,
  type LearnedProfile,
} from './personalization'

const prefs: ExplicitPreferences = {
  ...defaultExplicitPreferences,
  explorationLevel: 0.5,
}
const learned: LearnedProfile = {...defaultLearnedProfile}
const batch = {
  format: 'org.radical-liberal.candidate-batch',
  version: 1,
  batchId: 'experimental-news',
  providerDid: 'did:web:feeds.example.com',
  serviceIdentity: 'feeds.example.com',
  source: {id: 'news', type: 'feed'},
  manifest: {id: 'news', version: '1', hash: 'sha256:news'},
  generatedAt: '2030-01-01T00:00:00.000Z',
  expiresAt: '2030-01-01T00:05:00.000Z',
  privacyMode: 'anonymous',
  candidates: [
    {
      uri: 'at://did:plc:author/app.bsky.feed.post/3jzfcij3wzj2a',
      cid: 'bafybeig45pu3jn2i5h7p7gt2v7bdeax5kq2pmmvooakzn4fy3em47mlxa4',
      candidateTimestamp: '2030-01-01T00:00:00.000Z',
      hydration: {
        state: 'visible',
        checkedAt: '2030-01-01T00:00:01.000Z',
      },
      features: {novelty: 0.1},
    },
  ],
  signed: {keyId: 'news', algorithm: 'ECDSA-P256-SHA256', signature: 'AA'},
} as unknown as CandidateBatch

describe('experimental attention modules', () => {
  it('publishes five explicit opt-in manifests', () => {
    expect(Object.keys(EXPERIMENTAL_MANIFESTS)).toHaveLength(5)
    for (const manifest of Object.values(EXPERIMENTAL_MANIFESTS)) {
      expect(manifest.status).toBe('experimental')
    }
  })

  it('is deterministic and exits through the common ranker', () => {
    const a = rankExperimental(
      'news',
      batch,
      prefs,
      learned,
      Date.parse('2030-01-02T00:00:00Z'),
    )
    const b = rankExperimental(
      'news',
      batch,
      prefs,
      learned,
      Date.parse('2030-01-02T00:00:00Z'),
    )
    expect(a.ordered.map(item => item.uri)).toEqual(
      b.ordered.map(item => item.uri),
    )
    expect(a.traces[0].uri).toBe(
      'at://did:plc:author/app.bsky.feed.post/3jzfcij3wzj2a',
    )
  })
})
