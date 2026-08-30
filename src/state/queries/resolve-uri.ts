import {AtUri, type HandleString} from '@atproto/syntax'
import {type QueryClient, queryOptions, useQuery} from '@tanstack/react-query'

import {
  getKnownAccountDidForHandle,
  IdentityResolutionDisagreementError,
  type IdentityResolutionPolicy,
  IdentityResolutionUnavailableError,
  resolveIdentityClaims,
  type ResolverProvider,
} from '#/lib/identity-runtime'
import {PROVIDER_COMPOSITION_QUERY_META} from '#/lib/provider-composition'
import {STALE} from '#/state/queries'
import {useSession} from '#/state/session'
import {getPublicAppviewClient} from '#/state/session/clients'
import {resolvePdsEndpointForDid} from '#/state/session/pds-resolution'
import {
  type AppViewProvider,
  getAppViewProvidersForHandleResolution,
  getIdentityResolutionPolicy,
} from '#/state/session/providers'
import {com} from '#/lexicons'

const RQKEY_ROOT = 'resolved-did'
type ResolutionQueryContext = {
  providerIds: string[]
  policy: IdentityResolutionPolicy
}
export const RQKEY = (didOrHandle: string, context?: ResolutionQueryContext) =>
  context
    ? [RQKEY_ROOT, didOrHandle, context.providerIds, context.policy]
    : [RQKEY_ROOT, didOrHandle]

const resolvedDidQueryOptions = (
  didOrHandle: string | undefined,
  providers: AppViewProvider[],
  policy: IdentityResolutionPolicy,
) =>
  queryOptions({
    staleTime: STALE.HOURS.ONE,
    meta: PROVIDER_COMPOSITION_QUERY_META,
    queryKey: RQKEY(didOrHandle ?? '', {
      providerIds: providers.map(provider => provider.id),
      policy,
    }),
    queryFn: async () => {
      if (!didOrHandle) return ''
      // Just return the did if it's already one
      if (didOrHandle.startsWith('did:')) return didOrHandle

      /*
       * Handle resolution is a read capability, not a property of the one
       * AppView selected for feeds and profiles. Query each explicitly
       * identity-capable provider without a session token, then let the local
       * identity policy reconcile the attributable claims.
       */
      const result = await resolveIdentityClaims(
        didOrHandle,
        makeIdentityResolverProviders(providers),
        policy,
      )
      if (result.selected) return result.selected.did
      if (result.status === 'disagreement') {
        throw new IdentityResolutionDisagreementError(result)
      }
      throw new IdentityResolutionUnavailableError(result)
    },
    enabled: !!didOrHandle,
  })

export function useResolveUriQuery(uri: string | undefined) {
  const {currentAccount} = useSession()
  const urip = new AtUri(uri || '')
  const host = urip.host

  const providers = getAppViewProvidersForHandleResolution()
  const policy = getIdentityResolutionPolicy()
  const knownAccountDid = getKnownAccountDidForHandle(host, currentAccount)

  return useQuery({
    ...resolvedDidQueryOptions(knownAccountDid ?? host, providers, policy),
    select: did => ({
      did,
      uri: AtUri.make(did!, urip.collection, urip.rkey).toString(),
    }),
  })
}

export function useResolveDidQuery(didOrHandle: string | undefined) {
  const {currentAccount} = useSession()
  const providers = getAppViewProvidersForHandleResolution()
  const policy = getIdentityResolutionPolicy()
  const knownAccountDid = getKnownAccountDidForHandle(
    didOrHandle,
    currentAccount,
  )

  return useQuery(
    resolvedDidQueryOptions(knownAccountDid ?? didOrHandle, providers, policy),
  )
}

/**
 * Adapt registered public AppViews to the identity-runtime contract. These
 * requests intentionally use unauthenticated clients: resolving a public
 * handle must not mint or disclose an account-PDS service-auth token to every
 * resolver the user has registered.
 *
 * DID documents are fetched through the protocol's DID method resolution after
 * each provider supplies a handle claim. The shared promise map avoids
 * duplicate DID-document requests while keeping the resolver claims
 * attributable to the AppView that supplied the handle mapping.
 */
function makeIdentityResolverProviders(
  providers: AppViewProvider[],
): ResolverProvider[] {
  const didEndpointPromises = new Map<string, Promise<string | undefined>>()

  return providers.map(provider => {
    const client = getPublicAppviewClient(provider.endpoint)
    return {
      id: provider.id,
      resolveHandle: async (handle: string) => {
        const data = await client.call(com.atproto.identity.resolveHandle, {
          handle: handle as HandleString,
        })
        return {did: data.did}
      },
      resolveDid: async (did: string) => {
        let endpointPromise = didEndpointPromises.get(did)
        if (!endpointPromise) {
          endpointPromise = resolvePdsEndpointForDid(did)
          didEndpointPromises.set(did, endpointPromise)
        }
        const endpoint = await endpointPromise
        if (!endpoint) throw new Error('DID document did not declare a PDS')
        return {endpoint}
      },
    }
  })
}

export function precacheResolvedUri(
  queryClient: QueryClient,
  handle: string,
  did: string,
) {
  queryClient.setQueriesData<string>({queryKey: RQKEY(handle)}, did)
}
