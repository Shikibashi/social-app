import {type DidString, toDatetimeString} from '@atproto/syntax'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {createRadlibAuthorityClientForDid} from '#/lib/atproto/spaces'
import {STALE} from '#/state/queries'
import {usePdsClient} from '#/state/session'
import {app, org} from '#/lexicons'

export type ProtectedAccessState =
  'none' | 'requested' | 'approved' | 'denied' | 'revoked' | 'blocked'

const QUERY_KEY = 'radlib-protected-access'

function isDid(value: string) {
  return /^did:[a-z0-9]+:[a-z0-9:.-]+$/i.test(value.trim())
}

export function useProtectedAccessStateQuery(
  requester: string,
  target: string,
) {
  const client = usePdsClient()
  const normalizedRequester = requester.trim()
  const normalizedTarget = target.trim()
  return useQuery({
    queryKey: [QUERY_KEY, client.did, normalizedRequester, normalizedTarget],
    enabled:
      !!client.did && isDid(normalizedRequester) && isDid(normalizedTarget),
    staleTime: STALE.MINUTES.ONE,
    queryFn: async () => {
      const authorityClient =
        normalizedTarget !== client.did
          ? await createRadlibAuthorityClientForDid(
              client,
              normalizedTarget as DidString,
              org.radlib.private.getFollowState.$lxm,
            )
          : client
      return authorityClient.call(org.radlib.private.getFollowState, {
        requester: normalizedRequester as DidString,
        target: normalizedTarget as DidString,
      })
    },
  })
}

export type ProtectedAccessMutation =
  | {action: 'request' | 'cancel'; target: string}
  | {
      action: 'approve' | 'deny' | 'revoke' | 'block'
      requester: string
    }

export function useProtectedAccessMutation() {
  const client = usePdsClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProtectedAccessMutation) => {
      let result: {state: string} | undefined
      switch (input.action) {
        case 'request':
          result = await (
            input.target !== client.did
              ? await createRadlibAuthorityClientForDid(
                  client,
                  input.target as DidString,
                  org.radlib.private.requestFollow.$lxm,
                )
              : client
          ).call(org.radlib.private.requestFollow, {
            target: input.target as DidString,
          })
          break
        case 'cancel':
          result = await (
            input.target !== client.did
              ? await createRadlibAuthorityClientForDid(
                  client,
                  input.target as DidString,
                  org.radlib.private.cancelFollow.$lxm,
                )
              : client
          ).call(org.radlib.private.cancelFollow, {
            target: input.target as DidString,
          })
          break
        case 'approve':
          result = await client.call(org.radlib.private.respondFollow, {
            requester: input.requester as DidString,
            approve: true,
          })
          break
        case 'deny':
          result = await client.call(org.radlib.private.respondFollow, {
            requester: input.requester as DidString,
            approve: false,
          })
          break
        case 'revoke':
          result = await client.call(org.radlib.private.revokeFollow, {
            requester: input.requester as DidString,
          })
          break
        case 'block':
          await client.create(app.bsky.graph.block, {
            subject: input.requester as DidString,
            createdAt: toDatetimeString(new Date()),
          })
          result = await client.call(org.radlib.private.revokeFollow, {
            requester: input.requester as DidString,
          })
          break
      }
      if (!result) throw new Error('Unknown protected access action')
      return {state: result.state}
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: [QUERY_KEY]})
      void queryClient.invalidateQueries({queryKey: ['radlib-private-feed']})
      void queryClient.invalidateQueries({
        queryKey: ['radlib-community-board'],
      })
    },
  })
}
