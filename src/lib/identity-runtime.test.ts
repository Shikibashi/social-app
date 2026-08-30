import {
  getKnownAccountDidForHandle,
  IdentityCache,
  IdentityResolutionDisagreementError,
  IdentityRuntimeCoordinator,
  MigrationMachine,
  resolveIdentity,
  resolveIdentityClaims,
  validateIdentityEndpoint,
} from './identity-runtime'
describe('identity runtime', () => {
  it('uses the authenticated account DID only for its own handle', () => {
    const account = {
      did: 'did:plc:3ijrhre2q5e4tt2f4ph2sneo',
      handle: 'edriffles.us',
    }
    expect(getKnownAccountDidForHandle('edriffles.us', account)).toBe(
      account.did,
    )
    expect(getKnownAccountDidForHandle('@EDRIFFLES.US', account)).toBe(
      account.did,
    )
    expect(getKnownAccountDidForHandle('someone.example', account)).toBe(
      undefined,
    )
  })

  it('verifies handle bidirectionally and records provenance', async () => {
    const r = await resolveIdentity('alice.example', [
      {
        id: 'primary',
        resolveHandle: () => Promise.resolve({did: 'did:plc:alice'}),
        resolveDid: () =>
          Promise.resolve({
            handle: 'alice.example',
            endpoint: 'https://pds.example',
            version: '7',
          }),
      },
    ])
    expect(r.status).toBe('verified')
    expect(r.provenance.resolver).toBe('primary')
  })

  it('collects attributable claims from all resolvers when they agree', async () => {
    const result = await resolveIdentityClaims('alice.example', [
      {
        id: 'resolver-a',
        resolveHandle: () => Promise.resolve({did: 'did:plc:alice'}),
        resolveDid: () =>
          Promise.resolve({
            handle: 'alice.example',
            endpoint: 'https://pds.example',
          }),
      },
      {
        id: 'resolver-b',
        resolveHandle: () => Promise.resolve({did: 'did:plc:alice'}),
        resolveDid: () =>
          Promise.resolve({
            handle: 'alice.example',
            endpoint: 'https://pds.example',
          }),
      },
    ])

    expect(result.status).toBe('verified')
    expect(result.claims.map(claim => claim.providerId)).toEqual([
      'resolver-a',
      'resolver-b',
    ])
    expect(result.policy).toEqual({mode: 'require-agreement'})
    expect(result.selected?.providerId).toBe('resolver-a')
    expect(result.claims[1]?.provenance.resolver).toBe('resolver-b')
  })

  it('retains PLC disagreement evidence while allowing an explicit local choice', async () => {
    const plcEvidence = {
      method: 'plc' as const,
      composition: 'disagreement' as const,
      resolvers: [
        {
          resolverId: 'plc-replica-a',
          operatorId: 'operator-a',
          status: 'verified' as const,
          verifiedOperations: 3,
          headCid: 'bafy-plc-head-a',
        },
        {
          resolverId: 'plc-replica-b',
          operatorId: 'operator-b',
          status: 'verified' as const,
          verifiedOperations: 3,
          headCid: 'bafy-plc-head-b',
        },
      ],
      distinctDocumentCount: 2,
      declaredOperatorIds: ['operator-a', 'operator-b'],
      operatorIndependence: 'declared-distinct' as const,
    }
    const providers = [
      {
        id: 'resolver-a',
        resolveHandle: () => Promise.resolve({did: 'did:plc:alice'}),
        resolveDid: () =>
          Promise.resolve({
            handle: 'alice.example',
            endpoint: 'https://pds.example',
            evidence: plcEvidence,
          }),
      },
      {
        id: 'resolver-b',
        resolveHandle: () => Promise.resolve({did: 'did:plc:alice'}),
        resolveDid: () =>
          Promise.resolve({
            handle: 'alice.example',
            endpoint: 'https://pds.example',
            evidence: plcEvidence,
          }),
      },
    ]

    const agreement = await resolveIdentityClaims('alice.example', providers)
    expect(agreement.status).toBe('disagreement')
    expect(agreement.selected).toBeUndefined()
    expect(agreement.evidence[0]).toMatchObject({
      composition: 'disagreement',
      distinctDocumentCount: 2,
    })
    expect(agreement.claims[0]?.evidence?.resolvers[1]?.headCid).toBe(
      'bafy-plc-head-b',
    )

    const explicit = await resolveIdentityClaims('alice.example', providers, {
      mode: 'first-verified',
    })
    expect(explicit.status).toBe('disagreement')
    expect(explicit.selected?.did).toBe('did:plc:alice')
    expect(explicit.policy).toEqual({mode: 'first-verified'})
  })

  it('fails closed on disagreement and preserves the disputed claims', async () => {
    const result = await resolveIdentityClaims('alice.example', [
      {
        id: 'resolver-a',
        resolveHandle: () => Promise.resolve({did: 'did:plc:alice'}),
        resolveDid: () =>
          Promise.resolve({
            handle: 'alice.example',
            endpoint: 'https://pds-a.example',
          }),
      },
      {
        id: 'resolver-b',
        resolveHandle: () => Promise.resolve({did: 'did:plc:other'}),
        resolveDid: () =>
          Promise.resolve({
            handle: 'alice.example',
            endpoint: 'https://pds-b.example',
          }),
      },
    ])

    expect(result.status).toBe('disagreement')
    expect(result.selected).toBeUndefined()
    expect(result.claims.map(claim => claim.did)).toEqual([
      'did:plc:alice',
      'did:plc:other',
    ])
    expect(() => {
      throw new IdentityResolutionDisagreementError(result)
    }).toThrow('Identity resolvers disagree for alice.example')
  })

  it('allows an explicit preferred-provider policy without hiding disagreement', async () => {
    const result = await resolveIdentityClaims(
      'alice.example',
      [
        {
          id: 'resolver-a',
          resolveHandle: () => Promise.resolve({did: 'did:plc:alice'}),
          resolveDid: () =>
            Promise.resolve({
              handle: 'alice.example',
              endpoint: 'https://pds-a.example',
            }),
        },
        {
          id: 'resolver-b',
          resolveHandle: () => Promise.resolve({did: 'did:plc:other'}),
          resolveDid: () =>
            Promise.resolve({
              handle: 'alice.example',
              endpoint: 'https://pds-b.example',
            }),
        },
      ],
      {mode: 'prefer-provider', preferredProviderId: 'resolver-b'},
    )

    expect(result.status).toBe('disagreement')
    expect(result.selected?.providerId).toBe('resolver-b')
    expect(result.selected?.did).toBe('did:plc:other')
    expect(result.policy).toEqual({
      mode: 'prefer-provider',
      preferredProviderId: 'resolver-b',
    })
  })

  it('records unavailable providers and requires an explicit partial-result policy', async () => {
    const providers = [
      {
        id: 'resolver-a',
        resolveHandle: () => Promise.resolve({did: 'did:plc:alice'}),
        resolveDid: () =>
          Promise.resolve({
            handle: 'alice.example',
            endpoint: 'https://pds.example',
          }),
      },
      {
        id: 'resolver-b',
        resolveHandle: () => Promise.reject(new Error('offline')),
        resolveDid: () => Promise.reject(new Error('offline')),
      },
    ]
    const agreement = await resolveIdentityClaims('alice.example', providers)
    expect(agreement.status).toBe('resolver-unavailable')
    expect(agreement.unavailableResolvers).toEqual(['resolver-b'])
    expect(agreement.selected).toBeUndefined()

    const explicit = await resolveIdentityClaims('alice.example', providers, {
      mode: 'first-verified',
    })
    expect(explicit.status).toBe('resolver-unavailable')
    expect(explicit.selected?.providerId).toBe('resolver-a')
  })
  it('rejects unsafe endpoints and tries no unsafe authority', async () => {
    expect(validateIdentityEndpoint('http://127.0.0.1')).toBe(false)
    expect(validateIdentityEndpoint('file:///tmp/x')).toBe(false)
    const r = await resolveIdentity('alice.example', [
      {
        id: 'p',
        resolveHandle: () => Promise.resolve({did: 'did:plc:x'}),
        resolveDid: () =>
          Promise.resolve({
            handle: 'alice.example',
            endpoint: 'http://127.0.0.1',
          }),
      },
    ])
    expect(r.status).toBe('resolver-unavailable')
  })
  it('requires fresh cache for sensitive resolution', () => {
    const c = new IdentityCache(1, 1, 100)
    c.set(
      'did:plc:x',
      {
        did: 'did:plc:x',
        status: 'verified',
        provenance: {
          resolver: 'p',
          resolvedAt: 0,
          fromCache: false,
          cacheAgeMs: 0,
        },
      },
      0,
    )
    expect(c.get('did:plc:x', 2, false)?.status).toBe('stale-cache')
    expect(c.get('did:plc:x', 2, true)).toBeUndefined()
    const coordinator = new IdentityRuntimeCoordinator(c)
    coordinator.onLockdown()
    expect(c.get('did:plc:x', 2, false)).toBeUndefined()
  })
  it('bounds migration transitions', () => {
    const m = new MigrationMachine({
      migrationId: 'm',
      did: 'did:plc:x',
      fromPds: 'A',
      toPds: 'B',
      state: 'idle',
      simulated: true,
      preferencesRestored: false,
      oldAuthorityRevoked: false,
      updatedAt: new Date().toISOString(),
    })
    for (const s of [
      'validating_destination',
      'preparing',
      'transferring_repository',
      'transferring_blobs',
      'updating_identity',
      'activating_destination',
      'revoking_old_authority',
      'verifying',
      'complete',
    ] as const)
      m.transition(s)
    expect(m.receipt.state).toBe('complete')
    expect(() => m.transition('idle')).toThrow()
  })
})
