import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  assertDid,
  assertSpaceRef,
  type SpaceRepoOp,
  type SpacesClient,
} from './client'

const STORAGE_PREFIX = '@radlib/spaces-alpha/cursor/'
const PAGE_SIZE = 100

export type SpaceSyncCursor = {
  space: string
  repo: string
  rev?: string
  cursor?: string
}

export type SpaceSyncStatus =
  | 'synchronized'
  | 'in-progress'
  | 'desynchronized'
  | 'authorization-revoked'
  | 'recoverable-error'

export type SpaceSyncState = SpaceSyncCursor & {
  status: SpaceSyncStatus
  error?: string
  updatedAt: string
}

const SPACE_SYNC_STATUSES: readonly SpaceSyncStatus[] = [
  'synchronized',
  'in-progress',
  'desynchronized',
  'authorization-revoked',
  'recoverable-error',
]

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
      const value: unknown = JSON.parse(raw)
      return isSpaceSyncCursor(value, space, repo) ? value : undefined
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
    await AsyncStorage.removeItem(stateKey(space, repo))
  }

  async getState(
    space: string,
    repo: string,
  ): Promise<SpaceSyncState | undefined> {
    const raw = await AsyncStorage.getItem(stateKey(space, repo))
    if (!raw) return undefined
    try {
      const value: unknown = JSON.parse(raw)
      return isSpaceSyncState(value, space, repo) ? value : undefined
    } catch {
      return undefined
    }
  }

  async setState(state: SpaceSyncState): Promise<void> {
    await AsyncStorage.setItem(
      stateKey(state.space, state.repo),
      JSON.stringify(state),
    )
  }
}

function isSpaceSyncCursor(
  value: unknown,
  space: string,
  repo: string,
): value is SpaceSyncCursor {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  try {
    assertSpaceRef(space)
    assertDid(repo)
  } catch {
    return false
  }
  return (
    candidate.space === space &&
    candidate.repo === repo &&
    (candidate.rev === undefined || typeof candidate.rev === 'string') &&
    (candidate.cursor === undefined || typeof candidate.cursor === 'string')
  )
}

function isSpaceSyncState(
  value: unknown,
  space: string,
  repo: string,
): value is SpaceSyncState {
  if (!isSpaceSyncCursor(value, space, repo)) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.updatedAt === 'string' &&
    SPACE_SYNC_STATUSES.includes(candidate.status as SpaceSyncStatus) &&
    (candidate.error === undefined || typeof candidate.error === 'string')
  )
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
  await cursorStore.setState({
    ...saved,
    space: input.space,
    repo: input.repo,
    status: 'in-progress',
    updatedAt: new Date().toISOString(),
  })
  let cursor: string | undefined = saved?.cursor
  let rev: string | undefined = saved?.rev

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await cursorStore.setState({
      space: input.space,
      repo: input.repo,
      ...(rev ? {rev} : {}),
      ...(cursor ? {cursor} : {}),
      status:
        message.includes('401') || message.includes('403')
          ? 'authorization-revoked'
          : message.includes('gap')
            ? 'desynchronized'
            : 'recoverable-error',
      error: message,
      updatedAt: new Date().toISOString(),
    })
    throw error
  }

  const next = {
    space: input.space,
    repo: input.repo,
    ...(rev ? {rev} : {}),
    ...(cursor ? {cursor} : {}),
  }
  await cursorStore.set(next)
  await cursorStore.setState({
    ...next,
    status: 'synchronized',
    updatedAt: new Date().toISOString(),
  })
  return next
}

function cursorKey(space: string, repo: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(space)}:${encodeURIComponent(repo)}`
}

function stateKey(space: string, repo: string): string {
  return `${STORAGE_PREFIX}state/${encodeURIComponent(space)}:${encodeURIComponent(repo)}`
}
