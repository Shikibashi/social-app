import {
  encryptPortableProfile,
  explainCandidate,
  exportPortableProfile,
  type FeedPreferences,
  importPortableProfile,
  rankLocallyWithTrace,
  rerankLocally,
} from './profile'

const preferences: FeedPreferences = {
  freshness: 0.65,
  discovery: 0.4,
  familiarity: 0.55,
  conversationActivity: 0.3,
  explorationLevel: 0.5,
  languages: ['en-US'],
  topics: {technology: 0.7},
  classifierModules: {constructiveness: 'prefer'},
  explicitInterests: [],
  explicitAuthors: [],
  explicitPostPreferences: [],
  inferredTopics: {},
}

describe('local feed sovereignty', () => {
  it('enforces local author caps and exploration', () => {
    const result = rerankLocally(
      [
        {
          uri: 'at://1',
          authorDid: 'did:a',
          topic: 'technology',
          freshness: 1,
          networkRelevance: 1,
          conversationActivity: 0,
          integrityWeight: 1,
          explorationEligible: false,
          seen: false,
        },
        {
          uri: 'at://2',
          authorDid: 'did:a',
          topic: 'technology',
          freshness: 0.9,
          networkRelevance: 1,
          conversationActivity: 0,
          integrityWeight: 1,
          explorationEligible: false,
          seen: false,
        },
        {
          uri: 'at://3',
          authorDid: 'did:a',
          topic: 'technology',
          freshness: 0.8,
          networkRelevance: 1,
          conversationActivity: 0,
          integrityWeight: 1,
          explorationEligible: false,
          seen: false,
        },
        {
          uri: 'at://4',
          authorDid: 'did:b',
          topic: 'technology',
          freshness: 0.2,
          networkRelevance: 0.2,
          conversationActivity: 0,
          integrityWeight: 1,
          explorationEligible: true,
          seen: false,
        },
      ],
      preferences,
      {maxAuthorPerWindow: 2, explorationFloor: 0.25},
    )
    expect(
      result.filter(candidate => candidate.authorDid === 'did:a'),
    ).toHaveLength(2)
    expect(result.some(candidate => candidate.uri === 'at://4')).toBe(true)
  })
  it('explains only deterministic ranking signals', () => {
    const reasons = explainCandidate(
      {
        uri: 'at://1',
        authorDid: 'did:a',
        topic: 'technology',
        freshness: 0.9,
        networkRelevance: 0.4,
        conversationActivity: 0,
        integrityWeight: 0.8,
        explorationEligible: true,
        seen: false,
      },
      preferences,
    )
    expect(reasons).toEqual([
      'explicit preference: more like this',
      'freshness',
      'integrity adjustment',
    ])
  })

  it('gives durable explicit More/Less preferences precedence over inference', () => {
    const lessUri = 'at://1'
    const moreUri = 'at://2'
    const candidates = [
      {
        uri: lessUri,
        authorDid: 'did:a',
        topic: 'technology',
        freshness: 1,
        networkRelevance: 1,
        conversationActivity: 1,
        integrityWeight: 1,
        explorationEligible: true,
        seen: false,
      },
      {
        uri: 'at://neutral',
        authorDid: 'did:b',
        topic: 'technology',
        freshness: 0.5,
        networkRelevance: 0.5,
        conversationActivity: 0,
        integrityWeight: 1,
        explorationEligible: false,
        seen: false,
      },
      {
        uri: moreUri,
        authorDid: 'did:c',
        topic: 'technology',
        freshness: 0,
        networkRelevance: 0,
        conversationActivity: 0,
        integrityWeight: 0,
        explorationEligible: false,
        seen: false,
      },
    ]
    const withLess = rerankLocally(
      candidates,
      {
        ...preferences,
        explicitPostPreferences: [{uri: lessUri, preference: 'avoid'}],
        inferredTopics: {technology: 1},
      },
      {explorationFloor: 0},
    )
    expect(withLess.findIndex(item => item.uri === lessUri)).toBeGreaterThan(
      withLess.findIndex(item => item.uri === 'at://neutral'),
    )

    const withMore = rerankLocally(
      candidates,
      {
        ...preferences,
        topics: {},
        explicitPostPreferences: [{uri: moreUri, preference: 'prefer'}],
        inferredTopics: {},
      },
      {explorationFloor: 0},
    )
    expect(withMore[0].uri).toBe(moreUri)
  })

  it('matches explicit interests against candidate text, not only coarse topics', () => {
    const result = rankLocallyWithTrace(
      [
        {
          uri: 'at://audio',
          authorDid: 'did:example:audio',
          text: 'A new audio gear review of a DAC',
          topic: 'science',
          freshness: 0.1,
          networkRelevance: 0.1,
          conversationActivity: 0,
          integrityWeight: 1,
          explorationEligible: true,
          seen: false,
        },
        {
          uri: 'at://neutral',
          authorDid: 'did:example:neutral',
          text: 'A neutral post',
          topic: 'science',
          freshness: 1,
          networkRelevance: 1,
          conversationActivity: 1,
          integrityWeight: 1,
          explorationEligible: false,
          seen: false,
        },
      ],
      {...preferences, explicitInterests: ['audio gear', 'k-pop']},
      {explorationFloor: 0},
    )

    expect(
      result.traces.find(trace => trace.uri === 'at://audio'),
    ).toMatchObject({explicitPreference: 'prefer', rank: 1})
  })

  it('changes the exploratory composition with the explicit discovery control', () => {
    const candidates = Array.from({length: 10}, (_, index) => ({
      uri: `at://${index}`,
      authorDid: `did:${index}`,
      freshness: 0.5,
      networkRelevance: 1,
      conversationActivity: 0,
      integrityWeight: 1,
      explorationEligible: index >= 5,
      seen: false,
    }))
    const low = rankLocallyWithTrace(candidates, preferences, {
      explorationFloor: 0,
    })
    const high = rankLocallyWithTrace(candidates, preferences, {
      explorationFloor: 0.5,
    })
    const exploratory = (items: typeof low) =>
      items.traces.filter(item => item.selected && item.explorationSelected)
        .length
    expect(exploratory(high)).toBeGreaterThan(exploratory(low))
  })

  it('makes familiarity and variety controls change local ordering', () => {
    const candidates = [
      {
        uri: 'at://familiar',
        authorDid: 'did:familiar',
        freshness: 0.5,
        networkRelevance: 0.5,
        conversationActivity: 0,
        familiarity: 1,
        variety: 0,
        integrityWeight: 1,
        explorationEligible: false,
        seen: false,
      },
      {
        uri: 'at://varied',
        authorDid: 'did:varied',
        freshness: 0.5,
        networkRelevance: 0.5,
        conversationActivity: 0,
        familiarity: 0,
        variety: 1,
        integrityWeight: 1,
        explorationEligible: true,
        seen: false,
      },
    ]
    const familiarFirst = rerankLocally(
      candidates,
      {...preferences, familiarity: 1, variety: 0},
      {explorationFloor: 0},
    )
    const variedFirst = rerankLocally(
      candidates,
      {...preferences, familiarity: 0, variety: 1},
      {explorationFloor: 0},
    )
    expect(familiarFirst[0].uri).toBe('at://familiar')
    expect(variedFirst[0].uri).toBe('at://varied')
  })

  it('allows the user to disable passive inferred interests', () => {
    const candidates = [
      {
        uri: 'at://inferred',
        authorDid: 'did:inferred',
        topic: 'technology',
        freshness: 0.5,
        networkRelevance: 0.5,
        conversationActivity: 0,
        integrityWeight: 1,
        explorationEligible: false,
        seen: false,
      },
      {
        uri: 'at://neutral',
        authorDid: 'did:neutral',
        freshness: 0.5,
        networkRelevance: 0.5,
        conversationActivity: 0,
        integrityWeight: 1,
        explorationEligible: false,
        seen: false,
      },
    ]
    const withoutInference = rerankLocally(
      candidates,
      {
        ...preferences,
        topics: {},
        inferredTopics: {technology: 1},
        inferredInterestsEnabled: false,
      },
      {explorationFloor: 0},
    )
    expect(withoutInference.map(item => item.uri)).toEqual([
      'at://inferred',
      'at://neutral',
    ])
    expect(
      explainCandidate(candidates[0], {
        ...preferences,
        topics: {},
        inferredTopics: {technology: 1},
        inferredInterestsEnabled: false,
      }),
    ).not.toContain('an interest inferred on this device')
  })

  it('uses the same trace for ordering and Why-this-post reasons', () => {
    const candidate = {
      uri: 'at://trace',
      authorDid: 'did:trace',
      freshness: 0.9,
      networkRelevance: 0.5,
      conversationActivity: 0,
      integrityWeight: 1,
      explorationEligible: true,
      seen: false,
    }
    const result = rankLocallyWithTrace([candidate], preferences, {
      explorationFloor: 1,
    })
    expect(result.traces[0].reasons).toEqual(
      explainCandidate(candidate, preferences, result.traces[0]),
    )
    expect(result.traces[0].reasons).toEqual([
      'freshness',
      'exploration setting',
    ])
  })

  it('does not relabel an explicit preference as exploration', () => {
    const candidate = {
      uri: 'at://preferred',
      authorDid: 'did:preferred',
      freshness: 0,
      networkRelevance: 0,
      conversationActivity: 0,
      integrityWeight: 0,
      explorationEligible: true,
      seen: false,
    }
    const result = rankLocallyWithTrace(
      [candidate],
      {
        ...preferences,
        explicitPostPreferences: [{uri: candidate.uri, preference: 'prefer'}],
      },
      {explorationFloor: 1},
    )
    expect(result.traces[0].explorationSelected).toBe(false)
    expect(result.traces[0].reasons).toEqual([
      'explicit preference: more like this',
      'integrity adjustment',
    ])
  })

  it('describes a selected avoided post as a constrained result', () => {
    const candidate = {
      uri: 'at://avoided',
      authorDid: 'did:avoided',
      freshness: 0.5,
      networkRelevance: 0.5,
      conversationActivity: 0,
      integrityWeight: 1,
      explorationEligible: false,
      seen: false,
    }
    const result = rankLocallyWithTrace(
      [candidate],
      {
        ...preferences,
        explicitPostPreferences: [{uri: candidate.uri, preference: 'avoid'}],
      },
      {explorationFloor: 0},
    )
    expect(result.ordered).toHaveLength(1)
    expect(result.traces[0].reasons).toEqual([
      'shown despite your less-like-this preference',
    ])
  })

  it('round-trips explicit preferences and encrypts backups', async () => {
    const exported = exportPortableProfile({
      explicitPreferences: preferences,
      feedSubscriptions: ['at://feed'],
      classifierPreferences: {},
      constitutionalPreferences: {maxAuthorPerWindow: 2, explorationFloor: 0.1},
    })
    expect(
      importPortableProfile(exported).explicitPreferences.topics.technology,
    ).toBe(0.7)
    const encrypted = await encryptPortableProfile(exported, 'test-password')
    expect((JSON.parse(encrypted) as {schema: string}).schema).toBe(
      'org.example.feed-profile/encrypted-1',
    )
  })
})
