import {
  encryptPortableProfile,
  explainCandidate,
  exportPortableProfile,
  importPortableProfile,
  rerankLocally,
  type FeedPreferences,
} from './profile'

const preferences: FeedPreferences = {
  freshness: 0.65,
  discovery: 0.4,
  familiarity: 0.55,
  conversationActivity: 0.3,
  languages: ['en-US'],
  topics: { technology: 0.7 },
  classifierModules: { constructiveness: 'prefer' },
}

describe('local feed sovereignty', () => {
  it('enforces local author caps and exploration', () => {
    const result = rerankLocally(
      [
        { uri: 'at://1', authorDid: 'did:a', topic: 'technology', freshness: 1, networkRelevance: 1, conversationActivity: 0, integrityWeight: 1, explorationEligible: false, seen: false },
        { uri: 'at://2', authorDid: 'did:a', topic: 'technology', freshness: 0.9, networkRelevance: 1, conversationActivity: 0, integrityWeight: 1, explorationEligible: false, seen: false },
        { uri: 'at://3', authorDid: 'did:a', topic: 'technology', freshness: 0.8, networkRelevance: 1, conversationActivity: 0, integrityWeight: 1, explorationEligible: false, seen: false },
        { uri: 'at://4', authorDid: 'did:b', topic: 'technology', freshness: 0.2, networkRelevance: 0.2, conversationActivity: 0, integrityWeight: 1, explorationEligible: true, seen: false },
      ],
      preferences,
      { maxAuthorPerWindow: 2, explorationFloor: 0.25 },
    )
    expect(result.filter(candidate => candidate.authorDid === 'did:a')).toHaveLength(2)
    expect(result.some(candidate => candidate.uri === 'at://4')).toBe(true)
  })
  it('explains only deterministic ranking signals', () => {
    const reasons = explainCandidate(
      {uri: 'at://1', authorDid: 'did:a', topic: 'technology', freshness: 0.9, networkRelevance: 0.4, conversationActivity: 0, integrityWeight: 0.8, explorationEligible: true, seen: false},
      preferences,
    )
    expect(reasons).toEqual(['recent', 'topic:technology', 'exploration-slot', 'integrity-adjusted'])
  })

  it('round-trips explicit preferences and encrypts backups', async () => {
    const exported = exportPortableProfile({ explicitPreferences: preferences, feedSubscriptions: ['at://feed'], classifierPreferences: {}, constitutionalPreferences: { maxAuthorPerWindow: 2, explorationFloor: 0.1 } })
    expect(importPortableProfile(exported).explicitPreferences.topics.technology).toBe(0.7)
    const encrypted = await encryptPortableProfile(exported, 'test-password')
    expect(JSON.parse(encrypted).schema).toBe('org.example.feed-profile/encrypted-1')
  })
})
