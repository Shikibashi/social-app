import {readAllSpaceRecords} from './fanout'

describe('Space record fanout', () => {
  const space = 'at://did:plc:owner/space/org.radlib.community/test'

  it('exhausts repo and record cursors and applies a deterministic total order', async () => {
    const listRepos = jest
      .fn()
      .mockResolvedValueOnce({
        repos: [{did: 'did:plc:b', rev: '2', hash: new Uint8Array()}],
        cursor: 'repos-2',
      })
      .mockResolvedValueOnce({
        repos: [{did: 'did:plc:a', rev: '1', hash: new Uint8Array()}],
      })
    const listRecords = jest
      .fn()
      .mockImplementation(({repo, cursor}: {repo: string; cursor?: string}) => {
        if (repo === 'did:plc:a') {
          return Promise.resolve({
            records: [
              {
                collection: 'org.radlib.private.post',
                rkey: 'z',
                cid: 'bafy-a',
                value: {createdAt: '2026-08-23T00:00:00.000Z'},
              },
            ],
          })
        }
        if (!cursor) {
          return Promise.resolve({
            records: [
              {
                collection: 'org.radlib.private.post',
                rkey: 'b',
                cid: 'bafy-b',
                value: {createdAt: '2026-08-23T00:00:00.000Z'},
              },
            ],
            cursor: 'records-2',
          })
        }
        return Promise.resolve({
          records: [
            {
              collection: 'org.radlib.private.post',
              rkey: 'a',
              cid: 'bafy-c',
              value: {createdAt: '2025-08-23T00:00:00.000Z'},
            },
          ],
        })
      })

    const result = await readAllSpaceRecords(
      {listRepos, listRecords},
      {space, collection: 'org.radlib.private.post', pageSize: 1},
    )

    expect(result.complete).toBe(true)
    expect(result.errors).toEqual([])
    expect(
      result.records.map(record => `${record.repo}/${record.rkey}`),
    ).toEqual(['did:plc:a/z', 'did:plc:b/b', 'did:plc:b/a'])
    expect(listRepos).toHaveBeenNthCalledWith(2, {
      space,
      limit: 1,
      cursor: 'repos-2',
    })
    expect(listRecords).toHaveBeenCalledWith({
      space,
      repo: 'did:plc:b',
      collection: 'org.radlib.private.post',
      limit: 1,
      reverse: true,
      cursor: 'records-2',
    })
  })

  it('keeps readable records and surfaces a revoked writer as partial', async () => {
    const listRepos = jest.fn().mockResolvedValue({
      repos: [
        {did: 'did:plc:good', rev: '1', hash: new Uint8Array()},
        {did: 'did:plc:revoked', rev: '1', hash: new Uint8Array()},
      ],
    })
    const listRecords = jest.fn().mockImplementation(({repo}) => {
      if (repo === 'did:plc:revoked') return Promise.reject(new Error('401'))
      return Promise.resolve({
        records: [
          {
            collection: 'org.radlib.private.post',
            rkey: 'a',
            cid: 'bafy-good',
            value: {createdAt: '2026-08-23T00:00:00.000Z'},
          },
        ],
      })
    })

    const result = await readAllSpaceRecords(
      {listRepos, listRecords},
      {space, collection: 'org.radlib.private.post'},
    )

    expect(result.complete).toBe(false)
    expect(result.records).toHaveLength(1)
    expect(result.errors).toEqual([
      {phase: 'records', repo: 'did:plc:revoked', error: '401'},
    ])
  })
})
