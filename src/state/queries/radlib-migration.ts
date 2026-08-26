import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {usePdsClient} from '#/state/session'
import {us} from '#/lexicons'

export const radlibMigrationStatusQueryKey = (did?: string) => [
  'us.edriffles.radlib.moderation.getMigrationStatus',
  did ?? 'logged-out',
]

export function useRadlibMigrationStatusQuery() {
  const client = usePdsClient()

  return useQuery({
    queryKey: radlibMigrationStatusQueryKey(client.did),
    staleTime: STALE.MINUTES.ONE,
    refetchOnWindowFocus: true,
    enabled: !!client.did,
    queryFn: async () =>
      client.call(us.edriffles.radlib.moderation.getMigrationStatus),
  })
}
