import {
  contextualContentFilterPolicy,
  defaultContentFilterPolicy,
  matchContentFilter,
  validateContentFilterPolicy,
} from './content-filter'
import {
  defaultLocalCurationConfig,
  legacyRadlibCurationConfig,
  repartitionCurationSlices,
  retainReplyForExplicitPreference,
  scoreRadlibCuration,
  validateRadlibCurationConfig,
} from './radlib-curation'

const now = Date.parse('2026-08-18T12:00:00.000Z')

describe('opt-in radical-liberal curation', () => {
  it('leaves candidates unchanged while the profile is disabled', () => {
    const trace = scoreRadlibCuration(
      {
        uri: 'at://disabled',
        authorDid: 'did:example:disabled',
        text: 'an ordinary release discussion',
        isReply: true,
      },
      legacyRadlibCurationConfig,
      now,
    )
    expect(trace).toEqual({
      uri: 'at://disabled',
      included: true,
      score: 0,
      branchMatches: {},
      matchedTerms: [],
      reasons: [],
    })
  })

  it('uses only an explicitly entered term and normalized engagement', () => {
    const trace = scoreRadlibCuration(
      {
        uri: 'at://post/explicit',
        authorDid: 'did:example:explicit',
        text: 'field recording microphones are worth discussing',
        indexedAt: '2026-08-18T11:00:00.000Z',
        likeCount: 120,
        repostCount: 20,
      },
      {
        ...legacyRadlibCurationConfig,
        enabled: true,
        curationTerms: ['Field Recording'],
      },
      now,
    )

    expect(trace.included).toBe(true)
    expect(trace.branchMatches).toEqual({})
    expect(trace.matchedTerms).toEqual(['field recording'])
    expect(trace.topic).toBe('field recording')
    expect(trace.score).toBeGreaterThan(4)
    expect(trace.reasons).toContain('local curation: explicit term match')
  })

  it('does not infer or expand vocabulary beyond explicit terms', () => {
    const config = {
      ...legacyRadlibCurationConfig,
      enabled: true,
      curationTerms: ['field recording'],
    }
    const explicit = scoreRadlibCuration(
      {
        uri: 'at://post/field-recording',
        authorDid: 'did:example:explicit',
        text: 'Field recording microphones',
      },
      config,
      now,
    )
    const related = scoreRadlibCuration(
      {
        uri: 'at://post/related',
        authorDid: 'did:example:related',
        text: 'A room treatment and microphone setup',
      },
      config,
      now,
    )

    expect(explicit.matchedTerms).toEqual(['field recording'])
    expect(related.matchedTerms).toEqual([])
    expect(related.branchMatches).toEqual({})
  })

  it('removes configured replies, authors, and contextual exclusion phrases', () => {
    const config = {
      ...legacyRadlibCurationConfig,
      enabled: true,
      excludedAuthorDids: ['did:example:blocked'],
    }
    expect(
      scoreRadlibCuration(
        {
          uri: 'at://reply',
          authorDid: 'did:example:reply',
          text: 'a fresh field recording reply',
          isReply: true,
        },
        config,
        now,
      ).excludedReason,
    ).toBe('reply')
    expect(
      scoreRadlibCuration(
        {
          uri: 'at://author',
          authorDid: 'did:example:blocked',
          text: 'a fresh field recording post',
        },
        config,
        now,
      ).excludedReason,
    ).toBe('author')
    expect(
      scoreRadlibCuration(
        {
          uri: 'at://term',
          authorDid: 'did:example:term',
          text: 'A post about an excluded phrase',
        },
        {...config, excludedTerms: ['excluded phrase']},
        now,
      ).excludedReason,
    ).toBe('term')
  })

  it('does not activate hidden vocabulary without explicit curation terms', () => {
    const neutral = {
      ...defaultLocalCurationConfig,
      enabled: true,
    }
    const trace = scoreRadlibCuration(
      {
        uri: 'at://post/neutral',
        authorDid: 'did:example:neutral',
        text: 'field recording and microphones',
      },
      neutral,
      now,
    )

    expect(trace.branchMatches).toEqual({})
    expect(trace.matchedTerms).toEqual([])
  })

  it('scores a custom explicit term without expanding the built-in taxonomy', () => {
    const trace = scoreRadlibCuration(
      {
        uri: 'at://post/custom',
        authorDid: 'did:example:custom',
        text: 'field recording microphones and room treatment',
      },
      {
        ...defaultLocalCurationConfig,
        enabled: true,
        curationTerms: ['field recording'],
      },
      now,
    )

    expect(trace.branchMatches).toEqual({})
    expect(trace.matchedTerms).toEqual(['field recording'])
    expect(trace.reasons).toContain('local curation: explicit term match')
  })

  it('keeps hard curation exclusions above an explicit More preference', () => {
    const trace = scoreRadlibCuration(
      {
        uri: 'at://explicit',
        authorDid: 'did:example:explicit',
        text: 'a post about an excluded phrase',
        isReply: true,
      },
      {
        ...legacyRadlibCurationConfig,
        enabled: true,
        excludedTerms: ['excluded phrase'],
      },
      now,
      {explicitOverride: true},
    )
    expect(trace.included).toBe(false)
    expect(trace.excludedReason).toBe('term')
  })

  it('removes reply children unless the user explicitly prefers that reply', () => {
    const reply = {
      uri: 'at://reply',
      authorDid: 'did:example:reply',
      isReply: true,
    }
    expect(retainReplyForExplicitPreference(reply, [], [])).toBe(false)
    expect(
      retainReplyForExplicitPreference(
        reply,
        [{uri: reply.uri, preference: 'prefer'}],
        [],
      ),
    ).toBe(true)
    expect(
      retainReplyForExplicitPreference(
        reply,
        [{uri: reply.uri, preference: 'avoid'}],
        [{did: reply.authorDid, preference: 'prefer'}],
      ),
    ).toBe(false)
  })

  it('keeps global curation order while preserving original page capacities', () => {
    expect(
      repartitionCurationSlices(['rank-1', 'rank-2', 'rank-3'], [2, 2]),
    ).toEqual([['rank-1', 'rank-2'], ['rank-3']])
  })

  it('does not treat unconfigured vocabulary as an exclusion', () => {
    const trace = scoreRadlibCuration(
      {
        uri: 'at://web',
        authorDid: 'did:example:web',
        text: 'Unconfigured words remain visible to this account',
      },
      {...legacyRadlibCurationConfig, enabled: true},
      now,
    )
    expect(trace.included).toBe(true)
    expect(trace.excludedReason).toBeUndefined()
  })

  it('does not ship an exclusion vocabulary and rejects malformed profiles', () => {
    expect(legacyRadlibCurationConfig.excludedTerms).toEqual([])
    expect(() =>
      validateRadlibCurationConfig({
        ...legacyRadlibCurationConfig,
        maxPostsPerAuthor: 0,
      }),
    ).toThrow()
    expect(() =>
      validateRadlibCurationConfig({
        ...legacyRadlibCurationConfig,
        branchWeights: {legacyWeight: 11},
      }),
    ).toThrow()
  })

  it('starts new accounts with neutral local curation and filters', () => {
    expect(defaultLocalCurationConfig).toMatchObject({
      enabled: false,
      removeReplies: false,
      curationTerms: [],
      excludedTerms: [],
      excludedAuthorDids: [],
    })
    expect(defaultContentFilterPolicy).toMatchObject({
      enabled: false,
      termPacks: [],
      customTerms: [],
      excludedAuthorDids: [],
    })
  })

  it('matches only custom content-filter terms', () => {
    const policy = {
      ...contextualContentFilterPolicy,
      enabled: true,
      termPacks: [],
      customTerms: ['field recording', 'room treatment'],
    }
    for (const text of [
      'field recording microphones',
      'room treatment notes',
    ]) {
      const trace = matchContentFilter(
        {text, authorDid: 'did:example:author'},
        policy,
      )
      expect(trace.included).toBe(false)
      expect(trace.excludedReason).toBe('term')
    }
    expect(
      matchContentFilter(
        {
          text: 'A microphone stand and a camera',
          authorDid: 'did:example:author',
        },
        policy,
      ).included,
    ).toBe(true)
  })

  it('does not infer exclusions from legacy pack or strict-mode fields', () => {
    const trace = matchContentFilter(
      {
        text: 'Legacy pack labels are not a content policy',
        authorDid: 'did:example:web',
      },
      {
        ...contextualContentFilterPolicy,
        enabled: true,
        strictProgressive: true,
      },
    )
    expect(trace.included).toBe(true)
    expect(trace.matchedTerms).toEqual([])
  })

  it('keeps More from resurrecting a hard content exclusion', () => {
    const trace = matchContentFilter(
      {
        text: 'A post about an explicitly excluded phrase',
        authorDid: 'did:example:author',
      },
      {
        ...contextualContentFilterPolicy,
        enabled: true,
        termPacks: [],
        customTerms: ['explicitly excluded phrase'],
      },
    )
    expect(trace.included).toBe(false)
    expect(trace.reasons).toEqual(['local content filter: hard exclusion'])
  })

  it('validates the portable content policy shape', () => {
    expect(() =>
      validateContentFilterPolicy({
        ...contextualContentFilterPolicy,
        actorTarget: 'exclude-following',
      }),
    ).toThrow()
    expect(() =>
      validateContentFilterPolicy({
        ...defaultContentFilterPolicy,
        semanticMode: 'semantic-model',
      }),
    ).toThrow()
  })
})
