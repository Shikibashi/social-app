import {
  type LegacyListblockRecord,
  migrateLegacyListblocks,
} from './listblock-migration'

const record: LegacyListblockRecord = {
  uri: 'at://did:plc:alice/app.bsky.graph.listblock/3jzfcij3wzj2a',
  cid: 'bafybeigdyrzt5xj4h7kq7x2a4a4m6g6x7q2v5p6s4y3z2x1w0v9u8t7s6r',
  subjectListUri: 'at://did:plc:alice/app.bsky.graph.list/3jzfcij3wzj2a',
  createdAt: '2030-01-01T00:00:00.000Z',
}

describe('legacy listblock migration', () => {
  it('mutes before deleting and produces a complete privacy-preserving receipt', async () => {
    const events: string[] = []
    const receipt = await migrateLegacyListblocks(
      [record],
      {
        ensurePrivateListMute() {
          events.push('mute:create')
          return Promise.resolve()
        },
        verifyPrivateListMute() {
          events.push('mute:verify')
          return Promise.resolve(true)
        },
        attestPrivateListMute() {
          events.push('mute:attest')
          return Promise.resolve()
        },
        deleteListblock() {
          events.push('listblock:delete')
          return Promise.resolve()
        },
        verifyListblockDeleted() {
          events.push('listblock:verify-delete')
          return Promise.resolve(true)
        },
      },
      {directBlocksBefore: 23},
    )

    expect(events).toEqual([
      'mute:create',
      'mute:verify',
      'mute:attest',
      'listblock:delete',
      'listblock:verify-delete',
    ])
    expect(receipt).toMatchObject({
      receiptVersion: 'radlib-listblock-migration/1',
      policyVersion: 'radlib-moderation/1',
      listblocksDiscovered: 1,
      convertedToPrivateMute: 1,
      providerMutesAttested: 1,
      deleted: 1,
      failed: 0,
      directBlocksBefore: 23,
      directBlocksAfter: 23,
      directBlockDelta: 0,
      remainingListblocks: 0,
      status: 'complete',
    })
    expect(JSON.stringify(receipt)).not.toContain(record.subjectListUri)
    expect(receipt.failedSourceHashes).toEqual([])
  })

  it('leaves the source record recoverable when mute verification fails', async () => {
    const events: string[] = []
    const receipt = await migrateLegacyListblocks([record], {
      ensurePrivateListMute() {
        events.push('mute:create')
        return Promise.resolve()
      },
      verifyPrivateListMute() {
        events.push('mute:verify')
        return Promise.resolve(false)
      },
      deleteListblock() {
        events.push('listblock:delete')
        return Promise.resolve()
      },
      verifyListblockDeleted() {
        return Promise.resolve(false)
      },
    })

    expect(events).toEqual(['mute:create', 'mute:verify'])
    expect(receipt).toMatchObject({
      convertedToPrivateMute: 0,
      deleted: 0,
      failed: 1,
      remainingListblocks: 1,
      status: 'failed',
    })
    expect(receipt.failedSourceHashes[0]).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('keeps a verified mute when deletion fails and preserves explicit review delta', async () => {
    const receipt = await migrateLegacyListblocks(
      [record],
      {
        ensurePrivateListMute() {
          return Promise.resolve()
        },
        verifyPrivateListMute() {
          return Promise.resolve(true)
        },
        deleteListblock() {
          return Promise.reject(new Error('CAS conflict'))
        },
        verifyListblockDeleted() {
          return Promise.resolve(false)
        },
      },
      {directBlocksBefore: 23, explicitReviewBlocks: 2},
    )

    expect(receipt).toMatchObject({
      convertedToPrivateMute: 1,
      deleted: 0,
      failed: 1,
      directBlocksBefore: 23,
      directBlocksAfter: 25,
      directBlockDelta: 2,
      remainingListblocks: 1,
      status: 'failed',
    })
    expect(receipt.failedSourceHashes[0]).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})
