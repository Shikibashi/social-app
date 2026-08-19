import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {usePdsClient} from '#/state/session'
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
    queryFn: () =>
      client.call(org.radlib.private.getFeed, {
        space,
        limit: 50,
      }),
  })
}
