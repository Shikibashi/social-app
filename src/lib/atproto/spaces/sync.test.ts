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
            collection: 'org.radlib.private.post',
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
            collection: 'org.radlib.private.post',
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
        space: 'at://did:plc:owner/space/org.radlib.community/test',
        repo: 'did:plc:writer',
      },
    )

    expect(applied).toEqual(['a', 'b'])
    expect(next).toEqual({
      space: 'at://did:plc:owner/space/org.radlib.community/test',
      repo: 'did:plc:writer',
      rev: '3jz-b',
    })
    await expect(
      store.get(
        'at://did:plc:owner/space/org.radlib.community/test',
        'did:plc:writer',
      ),
    ).resolves.toEqual(next)
    expect(listRepoOps).toHaveBeenNthCalledWith(2, {
      space: 'at://did:plc:owner/space/org.radlib.community/test',
      repo: 'did:plc:writer',
      since: '3jz-a',
      cursor: 'page-2',
      limit: 100,
    })
  })
})
