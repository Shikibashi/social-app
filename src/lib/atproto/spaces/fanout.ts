import {type DidString} from '@atproto/syntax'

import {type SpaceRecord, type SpacesClient} from './client'

export type SpaceFanoutRecord = SpaceRecord & {
  repo: DidString
}

export type SpaceFanoutError = {
  phase: 'repos' | 'records'
  repo?: DidString
  error: string
}

export type SpaceFanoutResult = {
  records: SpaceFanoutRecord[]
  errors: SpaceFanoutError[]
  complete: boolean
}

type SpaceFanoutReader = Pick<SpacesClient, 'listRepos' | 'listRecords'> & {
  readerForRepo?: (
    repo: DidString,
  ) => Promise<Pick<SpacesClient, 'listRecords'>>
}

const PAGE_SIZE = 100

/**
 * Read a complete Space collection across every authorized writer.
 *
 * listRepos and listRecords are independently paginated in the alpha API. A
 * missing or revoked writer is returned as an explicit partial-read error so
 * callers never turn an authorization failure into an apparently empty board.
 */
export async function readAllSpaceRecords(
  reader: SpaceFanoutReader,
  input: {
    space: string
    collection: string
    pageSize?: number
  },
): Promise<SpaceFanoutResult> {
  const pageSize = Math.max(1, Math.min(PAGE_SIZE, input.pageSize ?? PAGE_SIZE))
  const repos: DidString[] = []
  const errors: SpaceFanoutError[] = []
  let repoCursor: string | undefined

  while (true) {
    try {
      const page = await reader.listRepos({
        space: input.space,
        limit: pageSize,
        ...(repoCursor ? {cursor: repoCursor} : {}),
      })
      repos.push(...page.repos.map(repo => repo.did))
      if (!page.cursor) break
      if (page.cursor === repoCursor) {
        errors.push({
          phase: 'repos',
          error: 'PDS returned a repeating repo cursor',
        })
        break
      }
      repoCursor = page.cursor
    } catch (error) {
      errors.push({phase: 'repos', error: errorMessage(error)})
      break
    }
  }

  const records = (
    await Promise.all(
      [...new Set(repos)].map(async repo => {
        const repoRecords: SpaceFanoutRecord[] = []
        let cursor: string | undefined
        try {
          const repoReader = reader.readerForRepo
            ? await reader.readerForRepo(repo)
            : reader
          while (true) {
            const page = await repoReader.listRecords({
              space: input.space,
              repo,
              collection: input.collection,
              limit: pageSize,
              reverse: true,
              ...(cursor ? {cursor} : {}),
            })
            repoRecords.push(...page.records.map(record => ({...record, repo})))
            if (!page.cursor) break
            if (page.cursor === cursor) {
              errors.push({
                phase: 'records',
                repo,
                error: 'PDS returned a repeating record cursor',
              })
              break
            }
            cursor = page.cursor
          }
        } catch (error) {
          errors.push({phase: 'records', repo, error: errorMessage(error)})
        }
        return repoRecords
      }),
    )
  ).flat()

  records.sort(compareRecords)
  return {records, errors, complete: errors.length === 0}
}

function compareRecords(left: SpaceFanoutRecord, right: SpaceFanoutRecord) {
  const dateOrder = recordDate(right.value).localeCompare(
    recordDate(left.value),
  )
  if (dateOrder !== 0) return dateOrder
  const repoOrder = left.repo.localeCompare(right.repo)
  if (repoOrder !== 0) return repoOrder
  const rkeyOrder = left.rkey.localeCompare(right.rkey)
  if (rkeyOrder !== 0) return rkeyOrder
  return left.cid.localeCompare(right.cid)
}

function recordDate(value: unknown): string {
  if (value && typeof value === 'object' && 'createdAt' in value) {
    const createdAt = (value as {createdAt?: unknown}).createdAt
    if (typeof createdAt === 'string') return createdAt
  }
  return new Date(0).toISOString()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
