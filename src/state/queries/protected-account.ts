import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {usePdsClient} from '#/state/session'
import {org} from '#/lexicons'

const QUERY_KEY = 'radlib-protected-account'

export function useProtectedAccountQuery() {
  const client = usePdsClient()
  return useQuery({
    queryKey: [QUERY_KEY, client.did],
    staleTime: STALE.MINUTES.ONE,
    enabled: !!client.did,
    queryFn: () => client.call(org.radlib.private.getAccountVisibility),
  })
}

export function useProtectedAccountMutation() {
  const client = usePdsClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (visibility: 'public' | 'protected') =>
      client.call(org.radlib.private.setAccountVisibility, {visibility}),
    onSuccess: data => {
      queryClient.setQueryData([QUERY_KEY, client.did], data)
    },
  })
}
