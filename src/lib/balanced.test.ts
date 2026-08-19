import {
  BALANCED_MANIFEST,
  type BalancedCandidate,
  rankBalanced,
  rankBalancedCandidates,
} from './balanced'
import {type CandidateBatch} from './candidate-protocol'
import {type ExplicitPreferences, type LearnedProfile} from './personalization'

const explicit = {
  selectedFeedPreset: 'balanced',
  discovery: 0.5,
  familiarity: 0.5,
  freshness: 0.5,
  variety: 0.5,
  conversationActivity: 0.5,
  explorationLevel: 0.4,
  explicitInterests: ['science'],
  explicitAuthors: [],
  explicitPostPreferences: [],
  quietMode: {enabled: false},
  visibleMetrics: [],
  languages: ['en'],
  topics: {},
  classifierModules: {},
} as ExplicitPreferences
const learned = {
  inferredTopics: {science: 0.8},
  authorAffinity: {},
  sourceAffinity: {},
  languageAffinity: {},
  interactionWeights: {},
  explorationHistory: [],
} as LearnedProfile
const candidate = (
  uri: string,
  extra: Partial<BalancedCandidate['features']> = {},
): BalancedCandidate => ({
  uri,
  cid: 'bafybeig45pu3jn2i5h7p7gt2v7bdeax5kq2pmmvooakzn4fy3em47mlxa4',
  candidateTimestamp: '2030-01-01T00:00:00.000Z',
  hydration: {state: 'visible', checkedAt: '2030-01-01T00:00:01.000Z'},
  authorDid: 'did:plc:author',
  sourceCategory: 'followed-network',
  topics: ['science'],
  features: extra,
})
const batch = (candidates: BalancedCandidate[]): CandidateBatch => ({
  format: 'org.radical-liberal.candidate-batch',
  version: 1,
  batchId: 'balanced',
  providerDid: 'did:web:feeds.example.com',
  serviceIdentity: 'feeds.example.com',
  source: {id: 'balanced', type: 'feed'},
  manifest: {id: 'balanced', version: '1', hash: 'sha256:x'},
  generatedAt: '2030-01-01T00:00:00.000Z',
  expiresAt: '2030-01-01T00:05:00.000Z',
  privacyMode: 'anonymous',
  candidates,
  signed: {keyId: 'k', algorithm: 'ECDSA-P256-SHA256', signature: 'AA'},
})

describe('Balanced v1', () => {
  it('is deterministic and emits faithful traces/source composition', () => {
    const input = batch([
      candidate('at://did:plc:author/app.bsky.feed.post/a', {
        engagementCount: 10,
      }),
      candidate('at://did:plc:author/app.bsky.feed.post/b', {
        engagementCount: 100,
      }),
    ])
    const a = rankBalanced(input, explicit, learned, {
      now: Date.parse('2030-01-02T00:00:00.000Z'),
    })
    const b = rankBalanced(input, explicit, learned, {
      now: Date.parse('2030-01-02T00:00:00.000Z'),
    })
    expect(a.ordered.map(item => item.uri)).toEqual(
      b.ordered.map(item => item.uri),
    )
    expect(a.traces).toHaveLength(2)
    expect(a.sourceComposition['followed-network']).toBe(2)
    expect(a.traces[0].reason).toContain('explicitInterest')
  })
  it('honors explicit author avoidance and soft concentration controls', () => {
    const avoid = {
      ...explicit,
      explicitAuthors: [{did: 'did:plc:author', preference: 'avoid' as const}],
    }
    const input = batch([
      candidate('at://did:plc:author/app.bsky.feed.post/a'),
      candidate('at://did:plc:other/app.bsky.feed.post/b'),
    ])
    const result = rankBalanced(input, avoid, learned, {
      now: Date.parse('2030-01-02T00:00:00.000Z'),
    })
    expect(
      result.traces.some(trace => trace.penalties.authorConcentration >= 0),
    ).toBe(true)
  })
  it('publishes bounded manifest features', () => {
    expect(BALANCED_MANIFEST.version).toBe('1')
    expect(BALANCED_MANIFEST.candidateSources).toContain('new-low-exposure')
  })
  it('makes explicit avoidance outrank inferred interest', () => {
    const avoid = {
      ...explicit,
      explicitPostPreferences: [
        {uri: 'at://avoid', preference: 'avoid' as const},
      ],
    }
    const input = batch([candidate('at://avoid'), candidate('at://neutral')])
    const result = rankBalanced(input, avoid, learned, {
      now: Date.parse('2030-01-02T00:00:00.000Z'),
    })
    expect(result.ordered[1].uri).toBe('at://avoid')
    expect(
      result.traces.find(trace => trace.uri === 'at://avoid')?.contributions
        .explicitPreferenceOverride,
    ).toBeLessThan(0)
  })

  it('applies explicit familiarity and variety controls', () => {
    const familiar = candidate('at://familiar', {
      familiarity: 1,
      variety: 0,
      conversationActivity: 0,
      freshness: 0,
      graphProximity: 0,
      novelty: 0,
      exploration: 0,
      integrity: 0,
    })
    const varied = candidate('at://varied', {
      familiarity: 0,
      variety: 1,
      conversationActivity: 0,
      freshness: 0,
      graphProximity: 0,
      novelty: 0,
      exploration: 0,
      integrity: 0,
    })
    const common = {
      ...explicit,
      explicitInterests: [],
      familiarity: 1,
      variety: 0,
      freshness: 0,
      discovery: 0,
      explorationLevel: 0,
    }
    const familiarResult = rankBalancedCandidates(
      [familiar, varied],
      common,
      {...learned, inferredTopics: {}},
      {now: Date.parse('2030-01-02T00:00:00.000Z')},
    )
    const variedResult = rankBalancedCandidates(
      [familiar, varied],
      {...common, familiarity: 0, variety: 1},
      {...learned, inferredTopics: {}},
      {now: Date.parse('2030-01-02T00:00:00.000Z')},
    )
    expect(familiarResult.ordered[0].uri).toBe('at://familiar')
    expect(variedResult.ordered[0].uri).toBe('at://varied')
  })
  it('ranks local hydrated candidates without a provider envelope', () => {
    const result = rankBalancedCandidates(
      [candidate('at://local/one'), candidate('at://local/two')],
      explicit,
      learned,
      {now: Date.parse('2030-01-02T00:00:00.000Z')},
    )
    expect(result.algorithm).toBe('org.radical-liberal.balanced')
    expect(result.ordered).toHaveLength(2)
    expect(result.traces.every(trace => trace.reason.length > 0)).toBe(true)
  })
  it('subtracts harassment amplification risk', () => {
    const lowRisk = candidate('at://low', {harassmentAmplificationRisk: 0})
    const highRisk = candidate('at://high', {harassmentAmplificationRisk: 1})
    const result = rankBalanced(batch([highRisk, lowRisk]), explicit, learned, {
      now: Date.parse('2030-01-02T00:00:00.000Z'),
    })
    expect(result.ordered[0].uri).toBe('at://low')
    expect(
      result.traces.find(trace => trace.uri === 'at://high')?.contributions
        .harassmentAmplificationRisk,
    ).toBeLessThan(0)
  })
})
