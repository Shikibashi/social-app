import {SpacesClient} from './client'

describe('Spaces client boundary', () => {
  it('writes through the standard Space procedure with the session DID as repo', async () => {
    const call = jest.fn().mockResolvedValue({
      uri: 'at://did:plc:owner/space/org.radlib.account/private/org.radlib.private.post/abc',
      cid: 'bafyspace',
    })
    const client = new SpacesClient({
      did: 'did:plc:writer',
      call,
    } as never)

    await client.putRecord({
      space: 'at://did:plc:owner/space/org.radlib.account/private',
      collection: 'org.radlib.private.post',
      rkey: 'abc',
      record: {$type: 'org.radlib.private.post', text: 'hello'},
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
    expect(input.collection).toBe('org.radlib.private.post')
  })

  it('lists the requested repo through the standard Space query', async () => {
    const call = jest.fn().mockResolvedValue({records: []})
    const client = new SpacesClient({
      did: 'did:plc:writer',
      call,
    } as never)

    await client.listRecords({
      space: 'at://did:plc:owner/space/org.radlib.account/private',
      repo: 'did:plc:writer',
      collection: 'org.radlib.private.post',
      limit: 50,
    })

    const [query, params] = call.mock.calls[0] as [
      {$nsid?: string; nsid?: string},
      {repo: string; collection: string; limit: number},
    ]
    expect(query.nsid ?? query.$nsid).toBe('com.atproto.space.listRecords')
    expect(params.repo).toBe('did:plc:writer')
    expect(params.collection).toBe('org.radlib.private.post')
    expect(params.limit).toBe(50)
  })
})
