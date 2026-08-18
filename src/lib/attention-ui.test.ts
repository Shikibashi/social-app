import {healthLabel, publicRankingTrace} from './attention-ui'

describe('attention sovereignty UI models', () => {
  it('keeps Why this post truthful and omits confidential signals', () => {
    expect(publicRankingTrace('explicit-interest')).toEqual({category: 'explicit-interest', label: 'Related to an interest you chose', confidentialSignalsOmitted: true})
  })
  it('makes provider degradation visible', () => {
    expect(healthLabel('circuit-open')).toContain('selected fallback')
    expect(healthLabel('stale')).toContain('stale')
  })
})
