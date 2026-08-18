import {
  FEED_PROVIDER_LIMITS,
  ProviderCircuitBreaker,
  classifyProviderFailure,
  validateAtUri,
  validateCid,
  validateCursor,
  validateFeedBatch,
  validateProviderManifest,
  validateReasonMetadata,
} from './feed-provider-security'

const uri = 'at://did:plc:t3myuj4fumsmxgtcoxdr5lg5/app.bsky.feed.post/3jzfcij3wzj2a'
const cid = 'bafybeig45pu3jn2i5h7p7gt2v7bdeax5kq2pmmvooakzn4fy3em47mlxa4'
const post = {post: {uri, cid}}

describe('untrusted feed provider security', () => {
  it('validates canonical provider identity and rejects SSRF/lookalike endpoints', () => {
    expect(validateProviderManifest({id: 'example', providerDid: 'did:web:feeds.example.com', endpoint: 'https://feeds.example.com', algorithm: 'balanced', version: '1', manifestHash: 'sha256:abc'}).providerDid).toBe('did:web:feeds.example.com')
    expect(() => validateProviderManifest({id: 'x', providerDid: 'did:web:feeds.example.com', endpoint: 'http://127.0.0.1', algorithm: 'x', version: '1', manifestHash: 'x'})).toThrow()
    expect(() => validateProviderManifest({id: 'x', providerDid: 'did:web:feeds.example.com', endpoint: 'https://user:pass@feeds.example.com', algorithm: 'x', version: '1', manifestHash: 'x'})).toThrow()
  })

  it('bounds cursors, candidates, URI/CID, duplicates, and reasons', () => {
    expect(validateCursor('cursor-1')).toBe('cursor-1')
    expect(() => validateCursor('x'.repeat(FEED_PROVIDER_LIMITS.maxCursorLength + 1))).toThrow()
    expect(validateAtUri(uri)).toBe(uri)
    expect(validateCid(cid)).toBe(cid)
    expect(() => validateCid('not-a-cid')).toThrow()
    expect(validateFeedBatch({feed: [post], cursor: 'next'}, 1).feed).toHaveLength(1)
    expect(() => validateFeedBatch({feed: [post, post]}, 2)).toThrow('duplicate')
    expect(() => validateReasonMetadata({source: 'feed', score: '0.5'})).not.toThrow()
    expect(() => validateReasonMetadata({script: () => 1})).toThrow()
  })

  it('classifies failures and opens a bounded circuit', () => {
    expect(classifyProviderFailure(new Error('request timeout'))).toBe('timeout')
    expect(classifyProviderFailure(new Error('hydration disagreement'))).toBe('hydration-disagreement')
    const circuit = new ProviderCircuitBreaker(2, 100)
    circuit.recordFailure(0); expect(circuit.canRequest(1)).toBe(true)
    circuit.recordFailure(1); expect(circuit.isOpen(2)).toBe(true)
    expect(circuit.canRequest(102)).toBe(true)
    circuit.recordSuccess(); expect(circuit.isOpen(103)).toBe(false)
  })
})
