import {
  ReplayGuard,
  canonicalize,
  compareCandidates,
  signCandidateBatch,
  validateCandidateBatch,
  verifyCandidateBatch,
  type CandidateBatch,
} from './candidate-protocol'

const base = (): CandidateBatch => ({
  format: 'org.radical-liberal.candidate-batch', version: 1, batchId: 'batch-1', providerDid: 'did:web:feeds.example.com', serviceIdentity: 'feeds.example.com',
  source: {id: 'following', type: 'feed'}, manifest: {id: 'manifest-1', version: '1', hash: 'sha256:manifest'}, generatedAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:05:00.000Z', privacyMode: 'anonymous', candidates: [{uri: 'at://did:plc:t3myuj4fumsmxgtcoxdr5lg5/app.bsky.feed.post/3jzfcij3wzj2a', cid: 'bafybeig45pu3jn2i5h7p7gt2v7bdeax5kq2pmmvooakzn4fy3em47mlxa4', candidateTimestamp: '2030-01-01T00:00:00.000Z', hydration: {state: 'visible', checkedAt: '2030-01-01T00:00:01.000Z'}, rankKey: '1.0', reason: {code: 'provider.reason'} }], signed: {keyId: 'key-1', algorithm: 'ECDSA-P256-SHA256', signature: 'AA'},
})

describe('candidate protocol v1', () => {
  it('canonicalizes field order and validates immutable candidate state', () => {
    const batch = base()
    expect(canonicalize({b: 1, a: 2})).toBe('{"a":2,"b":1}')
    expect(validateCandidateBatch(batch, Date.parse('2029-01-01T00:00:00.000Z')).batchId).toBe('batch-1')
    expect(() => validateCandidateBatch({...batch, expiresAt: '2020-01-01T00:00:00.000Z'}, Date.parse('2029-01-01T00:00:00.000Z'))).toThrow('expired')
    expect(() => validateCandidateBatch({...batch, candidates: [batch.candidates[0], batch.candidates[0]]}, Date.parse('2029-01-01T00:00:00.000Z'))).toThrow('duplicates')
  })

  it('signs and verifies canonical batches, rejecting tampering', async () => {
    const keys = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify'])
    const signed = await signCandidateBatch(base(), keys.privateKey)
    await expect(verifyCandidateBatch(signed, keys.publicKey, Date.parse('2029-01-01T00:00:00.000Z'))).resolves.toBe(true)
    await expect(verifyCandidateBatch({...signed, candidates: []}, keys.publicKey, Date.parse('2029-01-01T00:00:00.000Z'))).resolves.toBe(false)
  })

  it('enforces replay protection and deterministic ties', () => {
    const guard = new ReplayGuard()
    guard.accept(base(), Date.parse('2029-01-01T00:00:00.000Z'))
    expect(() => guard.accept(base(), Date.parse('2029-01-01T00:00:00.000Z'))).toThrow('replay')
    const a = {...base().candidates[0], uri: 'at://did:plc:t3myuj4fumsmxgtcoxdr5lg5/app.bsky.feed.post/a'}
    const b = {...a, uri: 'at://did:plc:t3myuj4fumsmxgtcoxdr5lg5/app.bsky.feed.post/b'}
    expect(compareCandidates(a, b)).toBeLessThan(0)
  })
})
