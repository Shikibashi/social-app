import AsyncStorage from '@react-native-async-storage/async-storage'

import {reconcileSpaceRepo, SpaceSyncCursorStore} from './sync'

describe('Space sync cursor boundary', () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
  })

  it('persists only a cursor and resumes from it after replay', async () => {
    const store = new SpaceSyncCursorStore()
    const listRepoOps = jest
      .fn()
      .mockResolvedValueOnce({
        ops: [
          {
            rev: '3jz-a',
            collection: 'us.edriffles.radlib.private.post',
            rkey: 'a',
            cid: 'bafy-a',
            prev: null,
          },
        ],
        cursor: 'page-2',
      })
      .mockResolvedValueOnce({
        ops: [
          {
            rev: '3jz-b',
            collection: 'us.edriffles.radlib.private.post',
            rkey: 'b',
            cid: 'bafy-b',
            prev: null,
          },
        ],
      })
    const applied: string[] = []

    const next = await reconcileSpaceRepo(
      {listRepoOps},
      store,
      {
        apply: ({ops}) => {
          applied.push(...ops.map(op => op.rkey))
        },
      },
      {
        space: 'at://did:plc:owner/space/us.edriffles.radlib.community/test',
        repo: 'did:plc:writer',
      },
    )

    expect(applied).toEqual(['a', 'b'])
    expect(next).toEqual({
      space: 'at://did:plc:owner/space/us.edriffles.radlib.community/test',
      repo: 'did:plc:writer',
      rev: '3jz-b',
    })
    await expect(
      store.get(
        'at://did:plc:owner/space/us.edriffles.radlib.community/test',
        'did:plc:writer',
      ),
    ).resolves.toEqual(next)
    await expect(
      store.getState(
        'at://did:plc:owner/space/us.edriffles.radlib.community/test',
        'did:plc:writer',
      ),
    ).resolves.toEqual(
      expect.objectContaining({status: 'synchronized', rev: '3jz-b'}),
    )
    expect(listRepoOps).toHaveBeenNthCalledWith(2, {
      space: 'at://did:plc:owner/space/us.edriffles.radlib.community/test',
      repo: 'did:plc:writer',
      since: '3jz-a',
      cursor: 'page-2',
      limit: 100,
    })
  })

  it('records a recoverable state when the PDS repeats a cursor', async () => {
    const store = new SpaceSyncCursorStore()
    const reader = {
      listRepoOps: jest.fn().mockResolvedValue({
        ops: [],
        cursor: 'same',
      }),
    }

    await expect(
      reconcileSpaceRepo(
        reader,
        store,
        {apply: jest.fn()},
        {
          space: 'at://did:plc:owner/space/us.edriffles.radlib.community/test',
          repo: 'did:plc:writer',
        },
      ),
    ).rejects.toThrow('repeating Space oplog cursor')
    await expect(
      store.getState(
        'at://did:plc:owner/space/us.edriffles.radlib.community/test',
        'did:plc:writer',
      ),
    ).resolves.toEqual(expect.objectContaining({status: 'recoverable-error'}))
  })
})
