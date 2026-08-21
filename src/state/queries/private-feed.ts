import {useQuery} from '@tanstack/react-query'

import {createSpaceCredentialClient, spacesClient} from '#/lib/atproto/spaces'
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
        const authorityDid = space.match(/^at:\/\/(did:[^/]+)\//)?.[1]
        const reader =
          authorityDid && authorityDid !== client.did
            ? await createSpaceCredentialClient(client, space)
            : spacesClient(client)
        return reader
          .listRecords({
            space,
            repo: authorityDid,
            collection: 'org.radlib.private.post',
            limit: 50,
            reverse: true,
          })
          .then(page => ({
            providerDid: authorityDid ?? '',
            space,
            feed: page.records.map(record => ({
              space,
              repo: authorityDid ?? client.did,
              collection: record.collection,
              rkey: record.rkey,
              cid: record.cid,
              record: record.value,
              createdAt: recordDate(record.value),
              updatedAt: recordDate(record.value),
            })),
            ...(page.cursor ? {cursor: page.cursor} : {}),
          }))
      }
      if (!LEGACY_RADLIB_PRIVATE_ENABLED) {
        throw new Error(
          'Permissioned-data transport is disabled: enable Spaces alpha or the legacy Radlib adapter',
        )
      }
      return client.call(org.radlib.private.getFeed, {space, limit: 50})
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
