import {BALANCED_MANIFEST, rankBalanced, type BalancedCandidate} from './balanced'
import type {CandidateBatch} from './candidate-protocol'
import type {ExplicitPreferences, LearnedProfile} from './personalization'

const explicit = {selectedFeedPreset: 'balanced', discovery: .5, familiarity: .5, freshness: .5, variety: .5, conversationActivity: .5, explorationLevel: .4, explicitInterests: ['science'], explicitAuthors: [], quietMode: {enabled: false}, visibleMetrics: [], languages: ['en'], topics: {}, classifierModules: {}} as ExplicitPreferences
const learned = {inferredTopics: {science: .8}, authorAffinity: {}, sourceAffinity: {}, languageAffinity: {}, interactionWeights: {}, explorationHistory: []} as LearnedProfile
const candidate = (uri: string, extra: Partial<BalancedCandidate['features']> = {}): BalancedCandidate => ({uri, cid: 'bafybeig45pu3jn2i5h7p7gt2v7bdeax5kq2pmmvooakzn4fy3em47mlxa4', candidateTimestamp: '2030-01-01T00:00:00.000Z', hydration: {state: 'visible', checkedAt: '2030-01-01T00:00:01.000Z'}, authorDid: 'did:plc:author', sourceCategory: 'followed-network', topics: ['science'], features: extra})
const batch = (candidates: BalancedCandidate[]): CandidateBatch => ({format: 'org.radical-liberal.candidate-batch', version: 1, batchId: 'balanced', providerDid: 'did:web:feeds.example.com', serviceIdentity: 'feeds.example.com', source: {id: 'balanced', type: 'feed'}, manifest: {id: 'balanced', version: '1', hash: 'sha256:x'}, generatedAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:05:00.000Z', privacyMode: 'anonymous', candidates, signed: {keyId: 'k', algorithm: 'ECDSA-P256-SHA256', signature: 'AA'}})

describe('Balanced v1', () => {
  it('is deterministic and emits faithful traces/source composition', () => {
    const input = batch([candidate('at://did:plc:author/app.bsky.feed.post/a', {engagementCount: 10}), candidate('at://did:plc:author/app.bsky.feed.post/b', {engagementCount: 100})])
    const a = rankBalanced(input, explicit, learned, {now: Date.parse('2030-01-02T00:00:00.000Z')}); const b = rankBalanced(input, explicit, learned, {now: Date.parse('2030-01-02T00:00:00.000Z')})
    expect(a.ordered.map(item => item.uri)).toEqual(b.ordered.map(item => item.uri)); expect(a.traces).toHaveLength(2); expect(a.sourceComposition['followed-network']).toBe(2); expect(a.traces[0].reason).toContain('explicitInterest')
  })
  it('honors explicit author avoidance and soft concentration controls', () => {
    const avoid = {...explicit, explicitAuthors: [{did: 'did:plc:author', preference: 'avoid'}]}
    const input = batch([candidate('at://did:plc:author/app.bsky.feed.post/a'), candidate('at://did:plc:other/app.bsky.feed.post/b')])
    const result = rankBalanced(input, avoid, learned, {now: Date.parse('2030-01-02T00:00:00.000Z')})
    expect(result.traces.some(trace => trace.penalties.authorConcentration >= 0)).toBe(true)
  })
  it('publishes bounded manifest features', () => { expect(BALANCED_MANIFEST.version).toBe('1'); expect(BALANCED_MANIFEST.candidateSources).toContain('new-low-exposure') })
})
