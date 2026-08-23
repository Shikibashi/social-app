import {useQuery} from '@tanstack/react-query'

import {createSpaceCredentialSession} from '#/lib/atproto/spaces'
import {readAllSpaceRecords} from '#/lib/atproto/spaces/fanout'
import {STALE} from '#/state/queries'
import {usePdsClient} from '#/state/session'
import {LEGACY_RADLIB_PRIVATE_ENABLED, SPACES_ALPHA_ENABLED} from '#/env'
import {org} from '#/lexicons'

export const PRIVATE_FEED_QUERY_ROOT = 'radlib-private-feed'

/**
 * Private feeds are fetched from the account's PDS, not the public AppView.
 * The query root is deliberately denylisted from persisted React Query state.
 */
export function usePrivateFeedQuery(space: string) {
  const client = usePdsClient()
  return useQuery({
    queryKey: [PRIVATE_FEED_QUERY_ROOT, client.did, space],
    enabled: !!client.did && !!space,
    staleTime: STALE.MINUTES.ONE,
    queryFn: async () => {
      if (SPACES_ALPHA_ENABLED) {
        const authorityDid = space.match(/^at:\/\/(did:[^/]+)\//)?.[1] ?? ''
        const session = await createSpaceCredentialSession(client, space)
        const result = await readAllSpaceRecords(
          {
            listRepos: session.client.listRepos.bind(session.client),
            listRecords: session.client.listRecords.bind(session.client),
            readerForRepo: session.forRepo,
          },
          {
            space,
            collection: 'org.radlib.private.post',
          },
        )
        return {
          providerDid: authorityDid ?? '',
          space,
          complete: result.complete,
          errors: result.errors,
          feed: result.records.map(record => ({
            space,
            repo: record.repo,
            collection: record.collection,
            rkey: record.rkey,
            cid: record.cid,
            record: record.value,
            createdAt: recordDate(record.value),
            updatedAt: recordDate(record.value),
          })),
        }
      }
      if (!LEGACY_RADLIB_PRIVATE_ENABLED) {
        throw new Error(
          'Spaces alpha transport is disabled; the legacy Radlib adapter is migration-only',
        )
      }
      const legacy = await client.call(org.radlib.private.getFeed, {
        space,
        limit: 50,
      })
      return {...legacy, complete: true, errors: []}
    },
  })
}

function recordDate(value: unknown): string {
  if (value && typeof value === 'object' && 'createdAt' in value) {
    const createdAt = (value as {createdAt?: unknown}).createdAt
    if (typeof createdAt === 'string') return createdAt
  }
  return new Date(0).toISOString()
}
