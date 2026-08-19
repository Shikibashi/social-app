import {type Client} from '@atproto/lex'
import {AtUri, type HandleString} from '@atproto/syntax'
import {type QueryClient, queryOptions, useQuery} from '@tanstack/react-query'

import {serviceBoundaryError} from '#/lib/service-boundary'
import {STALE} from '#/state/queries'
import {useAppviewClient, useSession} from '#/state/session'
import {getSelectedAppViewProvider} from '#/state/session/providers'
import {com} from '#/lexicons'
import {useUnstableProfileViewCache} from './profile'

const RQKEY_ROOT = 'resolved-did'
export const RQKEY = (didOrHandle: string) => [RQKEY_ROOT, didOrHandle]

const resolvedDidQueryOptions = (
  client: Client,
  getUnstableProfile: (did: string) => {did: string} | undefined,
  didOrHandle: string | undefined,
  provider: ReturnType<typeof getSelectedAppViewProvider>,
) =>
  queryOptions({
    staleTime: STALE.HOURS.ONE,
    queryKey: RQKEY(didOrHandle ?? ''),
    queryFn: async () => {
      if (!didOrHandle) return ''
      // Just return the did if it's already one
      if (didOrHandle.startsWith('did:')) return didOrHandle

      /*
       * Resolution stays on the appview client: the old agent call was proxied
       * to the appview, and the PDS implementation is not equivalent for
       * handles hosted elsewhere.
       */
      try {
        const data = await client.call(com.atproto.identity.resolveHandle, {
          handle: didOrHandle as HandleString,
        })
        return data.did
      } catch (error) {
        throw serviceBoundaryError(
          {
            kind: 'identity resolver',
            displayName: provider.displayName,
            serviceDid: provider.serviceDid,
          },
          error,
        )
      }
    },
    initialData: () => {
      // Return undefined if no did or handle
      if (!didOrHandle) return
      const profile = getUnstableProfile(didOrHandle)
      return profile?.did
    },
    enabled: !!didOrHandle,
  })

export function useResolveUriQuery(uri: string | undefined) {
  const urip = new AtUri(uri || '')
  const host = urip.host

  const client = useAppviewClient()
  const {currentAccount} = useSession()
  const {getUnstableProfile} = useUnstableProfileViewCache()
  const provider = getSelectedAppViewProvider(currentAccount?.did ?? '')

  return useQuery({
    ...resolvedDidQueryOptions(client, getUnstableProfile, host, provider),
    select: did => ({
      did,
      uri: AtUri.make(did, urip.collection, urip.rkey).toString(),
    }),
  })
}

export function useResolveDidQuery(didOrHandle: string | undefined) {
  const client = useAppviewClient()
  const {currentAccount} = useSession()
  const {getUnstableProfile} = useUnstableProfileViewCache()
  const provider = getSelectedAppViewProvider(currentAccount?.did ?? '')

  return useQuery(
    resolvedDidQueryOptions(client, getUnstableProfile, didOrHandle, provider),
  )
}

export function precacheResolvedUri(
  queryClient: QueryClient,
  handle: string,
  did: string,
) {
  queryClient.setQueryData<string>(RQKEY(handle), did)
}
