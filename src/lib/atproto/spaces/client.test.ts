jest.unmock('multiformats/cid')

import {assertDid, assertSpaceRef, SpacesClient} from './client'
import {toSpaceRpc} from './rpc'

describe('Spaces client boundary', () => {
  it('rejects malformed Space and repository identifiers before network calls', () => {
    expect(() => assertSpaceRef('at://not-a-space')).toThrow(
      'Invalid Space reference',
    )
    expect(() => assertDid('alice.example')).toThrow('Invalid DID')
  })

  it('writes through the standard Space procedure with the session DID as repo', async () => {
    const call = jest.fn().mockResolvedValue({
      uri: 'at://did:plc:owner/space/us.edriffles.radlib.account/private/us.edriffles.radlib.private.post/abc',
      cid: 'bafyspace',
    })
    const client = new SpacesClient({
      did: 'did:plc:writer',
      call,
    } as never)

    await client.putRecord({
      space: 'at://did:plc:owner/space/us.edriffles.radlib.account/private',
      collection: 'us.edriffles.radlib.private.post',
      rkey: 'abc',
      record: {$type: 'us.edriffles.radlib.private.post', text: 'hello'},
    })

    expect(call).toHaveBeenCalledTimes(1)
    const [procedure, input] = call.mock.calls[0] as [
      {$nsid?: string; nsid?: string},
      {repo: string; space: string; collection: string},
    ]
    expect(procedure.nsid ?? procedure.$nsid).toBe(
      'com.atproto.space.putRecord',
    )
    expect(input.repo).toBe('did:plc:writer')
    expect(input.space).toContain('/space/')
    expect(input.collection).toBe('us.edriffles.radlib.private.post')
  })

  it('accepts the permissioned URI returned by the Spaces alpha PDS', async () => {
    const result = await toSpaceRpc.putRecord.$output.schema[
      '~standard'
    ].validate({
      uri: 'at://did:plc:owner/space/us.edriffles.radlib.account/private/did:plc:writer/us.edriffles.radlib.private.post/abc',
      cid: 'bafyreieawtmh7hwfrqpamqkodza5r62bbfhsepe2iyustgxhgbhi6b2lfi',
    })

    expect('success' in result && result.success).toBe(true)
  })

  it('lists the requested repo through the standard Space query', async () => {
    const call = jest.fn().mockResolvedValue({records: []})
    const client = new SpacesClient({
      did: 'did:plc:writer',
      call,
    } as never)

    await client.listRecords({
      space: 'at://did:plc:owner/space/us.edriffles.radlib.account/private',
      repo: 'did:plc:writer',
      collection: 'us.edriffles.radlib.private.post',
      limit: 50,
    })

    const [query, params] = call.mock.calls[0] as [
      {$nsid?: string; nsid?: string},
      {repo: string; collection: string; limit: number},
    ]
    expect(query.nsid ?? query.$nsid).toBe('com.atproto.space.listRecords')
    expect(params.repo).toBe('did:plc:writer')
    expect(params.collection).toBe('us.edriffles.radlib.private.post')
    expect(params.limit).toBe(50)
  })

  it('passes the repo when fetching a Space blob', async () => {
    const call = jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
    const client = new SpacesClient({
      did: 'did:plc:writer',
      call,
    } as never)

    await client.getBlob({
      space: 'at://did:plc:owner/space/us.edriffles.radlib.account/private',
      repo: 'did:plc:member',
      cid: 'bafkreieq5jui4j25lacwomsqgjeswwl3y5zcdrresptwgmfylxo2depppq',
    })

    const [query, params] = call.mock.calls[0] as [
      {$nsid?: string; nsid?: string},
      {repo: string; space: string; cid: string},
    ]
    expect(query.nsid ?? query.$nsid).toBe('com.atproto.space.getBlob')
    expect(params.repo).toBe('did:plc:member')
    expect(params.cid).toBe(
      'bafkreieq5jui4j25lacwomsqgjeswwl3y5zcdrresptwgmfylxo2depppq',
    )
  })

  it('validates runtime Space query and blob inputs before network calls', () => {
    const call = jest.fn()
    const client = new SpacesClient({did: 'did:plc:writer', call} as never)

    expect(() => client.listSpaces({type: 'not-an-nsid' as never})).toThrow(
      'Invalid NSID',
    )
    expect(() => client.listSpaces({did: 'not-a-did' as never})).toThrow(
      'Invalid DID',
    )
    expect(() =>
      client.getBlob({
        space: 'at://did:plc:owner/space/us.edriffles.radlib.account/private',
        cid: 'not-a-cid',
      }),
    ).toThrow('Invalid blob CID')
    expect(call).not.toHaveBeenCalled()
  })

  it('exposes the standard repo recovery and incremental-op queries', async () => {
    const call = jest.fn().mockResolvedValue({ops: []})
    const client = new SpacesClient({
      did: 'did:plc:writer',
      call,
    } as never)

    await client.listRepoOps({
      space: 'at://did:plc:owner/space/us.edriffles.radlib.account/private',
      repo: 'did:plc:member',
      since: '3jzfcijwz2s2a',
      excludeValues: true,
    })

    const [query, params] = call.mock.calls[0] as [
      {$nsid?: string; nsid?: string},
      {repo: string; since: string; excludeValues: boolean},
    ]
    expect(query.nsid ?? query.$nsid).toBe('com.atproto.space.listRepoOps')
    expect(params.repo).toBe('did:plc:member')
    expect(params.since).toBe('3jzfcijwz2s2a')
    expect(params.excludeValues).toBe(true)
  })

  it('rejects malformed repo operations returned by the PDS', async () => {
    const client = new SpacesClient({
      did: 'did:plc:writer',
      call: jest.fn().mockResolvedValue({
        ops: [
          {rev: '3jz', collection: 'bad', rkey: 'ok', cid: null, prev: null},
        ],
      }),
    } as never)

    await expect(
      client.listRepoOps({
        space: 'at://did:plc:owner/space/us.edriffles.radlib.account/private',
        repo: 'did:plc:member',
      }),
    ).rejects.toThrow('Invalid NSID')
  })
})
