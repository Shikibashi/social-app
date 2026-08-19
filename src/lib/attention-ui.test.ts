import {
  healthLabel,
  parseFeedProviderContext,
  providerRankingExplanation,
  publicRankingTrace,
} from './attention-ui'

describe('attention sovereignty UI models', () => {
  it('keeps Why this post truthful and omits confidential signals', () => {
    expect(publicRankingTrace('explicit-interest')).toEqual({
      category: 'explicit-interest',
      label: 'Related to an interest you chose',
      confidentialSignalsOmitted: true,
    })
  })
  it('makes provider degradation visible', () => {
    expect(healthLabel('circuit-open')).toContain('selected fallback')
    expect(healthLabel('stale')).toContain('stale')
  })
  it('parses provider context without treating it as a verified manifest', () => {
    expect(
      parseFeedProviderContext(
        JSON.stringify({
          provider: 'did:plc:provider',
          algorithm: 'contextual',
          version: 'radlib-filtered-feed/0.1.0',
          secretSignal: 'must-not-be surfaced',
        }),
      ),
    ).toEqual({
      provider: 'did:plc:provider',
      algorithm: 'contextual',
      version: 'radlib-filtered-feed/0.1.0',
    })
    expect(parseFeedProviderContext('not-json')).toBeUndefined()
  })
  it('discloses missing provider explanations instead of inventing local reasons', () => {
    expect(
      providerRankingExplanation(
        JSON.stringify({provider: 'did:plc:provider'}),
      ),
    ).toBe('provider did not supply a ranking explanation')
    expect(
      providerRankingExplanation(
        JSON.stringify({reason: 'provider-selected freshness branch'}),
      ),
    ).toBe('provider supplied: provider-selected freshness branch')
    expect(providerRankingExplanation()).toBeUndefined()
  })
})
