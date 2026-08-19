import {beforeEach, describe, expect, it, jest} from '@jest/globals'

type MockStore = {
  events: string[]
  pendingSetResolvers: Array<() => void>
  get: jest.Mock
  set: jest.Mock
  delete: jest.Mock
  clear: jest.Mock
}

const mockStores = new Map<string, MockStore>()

jest.mock('#/storage/archive/db', () => ({
  create: ({id}: {id: string}) => {
    let store = mockStores.get(id)
    if (!store) {
      store = {
        events: [],
        pendingSetResolvers: [],
        get: jest.fn(() => Promise.resolve(undefined)),
        set: jest.fn(
          () =>
            new Promise<void>(resolve => {
              store!.pendingSetResolvers.push(resolve)
              store!.events.push('set')
            }),
        ),
        delete: jest.fn(() => {
          store!.events.push('delete')
          return Promise.resolve()
        }),
        clear: jest.fn(() => {
          store!.events.push('clear')
          return Promise.resolve()
        }),
      }
      mockStores.set(id, store)
    }
    return store
  },
}))

import {
  clearPersistedQueryStorage,
  createPersistedQueryStorage,
} from './persisted-query-storage'

describe('persisted query storage provider invalidation', () => {
  beforeEach(() => mockStores.clear())

  it('serializes invalidation ahead of old writes and isolates new storage instances', async () => {
    const id = 'provider-switch-race'
    const storage = createPersistedQueryStorage(id)
    const oldWrite = storage.setItem('cache', 'old')
    await new Promise(resolve => setTimeout(resolve, 0))
    const store = [...mockStores.values()][0]
    const clear = clearPersistedQueryStorage(id)
    store.pendingSetResolvers.shift()!()
    await Promise.all([oldWrite, clear])
    expect(store.events).toEqual(['set', 'clear'])

    // A delayed write from the old persister is ignored after invalidation.
    await storage.setItem('cache', 'stale')
    expect(store.events).toEqual(['set', 'clear'])

    // A newly created provider persister gets the new generation and can save.
    const freshStorage = createPersistedQueryStorage(id)
    const freshWrite = freshStorage.setItem('cache', 'fresh')
    await new Promise(resolve => setTimeout(resolve, 0))
    store.pendingSetResolvers.shift()!()
    await freshWrite
    expect(store.events).toEqual(['set', 'clear', 'set'])
  })
})
