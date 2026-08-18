import {create as createArchiveDB} from '#/storage/archive/db'

/**
 * Interface for async storage compatible with @tanstack/query-async-storage-persister
 */
export interface PersistedQueryStorage {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

function createId(id: string) {
  return `react-query-cache-${id}`
}

/*
 * The TanStack async persister throttles writes and does not expose a cancel
 * operation. A provider switch therefore needs a storage-level generation and
 * queue: writes started before invalidation must finish before the clear, and
 * must not be allowed to repopulate the old cache afterward.
 */
const generations = new Map<string, number>()
const queues = new Map<string, Promise<void>>()

function currentGeneration(id: string): number {
  return generations.get(id) ?? 0
}

function enqueue(id: string, operation: () => Promise<void>): Promise<void> {
  const previous = queues.get(id) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(operation)
  queues.set(id, next)
  return next
}

/**
 * Creates an MMKV-based storage adapter for persisting react-query cache on native platforms.
 * Each storage instance uses a separate MMKV store identified by the provided id.
 * MMKV provides synchronous access but we wrap it in Promises for API compatibility.
 *
 * @param id - Unique identifier for this storage instance (used as MMKV store id)
 */
export function createPersistedQueryStorage(id: string): PersistedQueryStorage {
  const store = createArchiveDB({id: createId(id)})
  const generation = currentGeneration(id)
  return {
    getItem: async (key: string): Promise<string | null> => {
      return (await store.get(key)) ?? null
    },
    setItem: async (key: string, value: string): Promise<void> => {
      await enqueue(id, async () => {
        if (generation !== currentGeneration(id)) return
        await store.set(key, value)
      })
    },
    removeItem: async (key: string): Promise<void> => {
      await enqueue(id, async () => {
        if (generation !== currentGeneration(id)) return
        await store.delete(key)
      })
    },
  }
}

export async function clearPersistedQueryStorage(id: string) {
  generations.set(id, currentGeneration(id) + 1)
  const store = createArchiveDB({id: createId(id)})
  await enqueue(id, () => Promise.resolve(store.clear()))
}
