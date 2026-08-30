import {useQuery} from '@tanstack/react-query'

import {useChatClient, useSession} from '#/state/session'
import {requiresOAuthFeatureUpgrade} from '#/state/session/oauth-authority'
import {chat} from '#/lexicons'
import {STALE} from '..'
import {createQueryKey} from '../util'

const chatActorStatusQueryKey = () =>
  createQueryKey('chat-actor-status', {}, {persistedVersion: 1})

export function useChatActorStatusQuery() {
  const client = useChatClient()
  const {hasSession, currentAccount} = useSession()
  const chatAuthorizationRequired = requiresOAuthFeatureUpgrade(
    currentAccount,
    'chat',
  )

  return useQuery({
    gcTime: STALE.INFINITY,
    staleTime: STALE.SECONDS.FIFTEEN,
    queryKey: chatActorStatusQueryKey(),
    queryFn: async () => {
      return await client.call(chat.bsky.actor.getStatus)
    },
    enabled: hasSession && !chatAuthorizationRequired,
  })
}
