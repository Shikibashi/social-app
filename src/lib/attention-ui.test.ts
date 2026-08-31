import {
  buildWhyThisPostModel,
  hasWhyThisPostDetails,
  hasWhyThisPostPlacementDetails,
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
  it('builds a bounded public placement explanation', () => {
    const model = buildWhyThisPostModel({
      postUri: 'at://did:plc:author/app.bsky.feed.post/1',
      localExplanation: ['fresh', '', 'followed', 'third', 'fourth', 'hidden'],
      feedContext: JSON.stringify({
        provider: 'did:plc:feed',
        reason: 'provider-declared reason',
        privateSignal: 'do not expose',
      }),
      feedDescriptor: 'feedgen|at://did:plc:feed/app.bsky.feed.generator/main',
      feedSource: {
        displayName: 'A public feed',
        creatorHandle: 'creator.example',
        uri: 'at://did:plc:feed/app.bsky.feed.generator/main',
      },
      providerProvenance: [
        {
          id: 'appview-a',
          displayName: 'AppView A',
          endpoint: 'https://appview-a.example',
          serviceDid: 'did:web:appview-a.example',
          operatorId: 'operator-a',
        },
      ],
      providerCompositionStatus: 'agreement',
      providerIndependence: 'not-established',
    })

    expect(model.localReasons).toEqual([
      'fresh',
      'followed',
      'third',
      'fourth',
      'hidden',
    ])
    expect(model.providerExplanation).toBe(
      'provider supplied: provider-declared reason',
    )
    expect(model.feed?.name).toBe('A public feed')
    expect(model.providerProvenance?.[0]).toEqual({
      id: 'appview-a',
      displayName: 'AppView A',
      endpoint: 'https://appview-a.example',
      serviceDid: 'did:web:appview-a.example',
      operatorId: 'operator-a',
    })
    expect(model.providerCompositionStatus).toBe('agreement')
    expect(model.providerIndependence).toBe('not-established')
    expect(hasWhyThisPostDetails(model)).toBe(true)
    expect(hasWhyThisPostPlacementDetails(model)).toBe(true)
    expect(JSON.stringify(model)).not.toContain('privateSignal')
  })

  it('keeps generic feed and reader provenance at the feed boundary', () => {
    const model = buildWhyThisPostModel({
      postUri: 'at://did:plc:author/app.bsky.feed.post/1',
      feedDescriptor: 'following',
      feedSource: {
        displayName: 'Following',
        creatorHandle: 'system',
        uri: 'at://did:plc:system/app.bsky.feed.generator/following',
      },
      providerProvenance: [
        {
          id: 'appview-a',
          displayName: 'AppView A',
          endpoint: 'https://appview-a.example',
        },
      ],
      providerCompositionStatus: 'agreement',
      providerIndependence: 'not-established',
    })

    expect(hasWhyThisPostDetails(model)).toBe(true)
    expect(hasWhyThisPostPlacementDetails(model)).toBe(false)
  })

  it('does not create a placement disclosure for empty evidence', () => {
    const model = buildWhyThisPostModel({
      postUri: 'at://did:plc:author/app.bsky.feed.post/1',
      localExplanation: ['', '   '],
      feedContext: undefined,
      feedDescriptor: '   ',
    })

    expect(model.localReasons).toEqual([])
    expect(hasWhyThisPostDetails(model)).toBe(false)
    expect(hasWhyThisPostPlacementDetails(model)).toBe(false)
  })
})
