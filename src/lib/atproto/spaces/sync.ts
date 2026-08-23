import AsyncStorage from '@react-native-async-storage/async-storage'

import {type SpaceRepoOp, type SpacesClient} from './client'

const STORAGE_PREFIX = '@radlib/spaces-alpha/cursor/'
const PAGE_SIZE = 100

export type SpaceSyncCursor = {
  space: string
  repo: string
  rev?: string
  cursor?: string
}

export type SpaceSyncSink = {
  apply: (input: {
    space: string
    repo: string
    ops: SpaceRepoOp[]
  }) => Promise<void> | void
}

/**
 * Durable cursor storage for a derived Space index.
 *
 * Only authorization-neutral positions are persisted. Record bodies and blob
 * bytes remain in the writer PDS and must be fetched through a fresh viewer
 * credential when a UI response needs them.
 */
export class SpaceSyncCursorStore {
  async get(space: string, repo: string): Promise<SpaceSyncCursor | undefined> {
    const raw = await AsyncStorage.getItem(cursorKey(space, repo))
    if (!raw) return undefined
    try {
      const value = JSON.parse(raw) as SpaceSyncCursor
      if (value.space !== space || value.repo !== repo) return undefined
      return value
    } catch {
      return undefined
    }
  }

  async set(cursor: SpaceSyncCursor): Promise<void> {
    await AsyncStorage.setItem(
      cursorKey(cursor.space, cursor.repo),
      JSON.stringify(cursor),
    )
  }

  async delete(space: string, repo: string): Promise<void> {
    await AsyncStorage.removeItem(cursorKey(space, repo))
  }
}

/**
 * Reconcile one writer repo from its durable Space oplog cursor.
 *
 * Notifications can wake this operation, but they are deliberately not the
 * source of truth: a later call with the saved cursor repairs missed delivery.
 */
export async function reconcileSpaceRepo(
  reader: Pick<SpacesClient, 'listRepoOps'>,
  cursorStore: SpaceSyncCursorStore,
  sink: SpaceSyncSink,
  input: {space: string; repo: string},
): Promise<SpaceSyncCursor> {
  const saved = await cursorStore.get(input.space, input.repo)
  let cursor: string | undefined = saved?.cursor
  let rev: string | undefined = saved?.rev

  while (true) {
    const page = await reader.listRepoOps({
      space: input.space,
      repo: input.repo,
      since: rev,
      cursor,
      limit: PAGE_SIZE,
    })
    if (page.ops.length) {
      await sink.apply({
        space: input.space,
        repo: input.repo,
        ops: page.ops,
      })
      rev = page.ops.at(-1)?.rev ?? rev
    }
    if (!page.cursor) {
      cursor = undefined
      break
    }
    if (page.cursor === cursor) {
      throw new Error('PDS returned a repeating Space oplog cursor')
    }
    cursor = page.cursor
  }

  const next = {
    space: input.space,
    repo: input.repo,
    ...(rev ? {rev} : {}),
    ...(cursor ? {cursor} : {}),
  }
  await cursorStore.set(next)
  return next
}

function cursorKey(space: string, repo: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(space)}:${encodeURIComponent(repo)}`
}
