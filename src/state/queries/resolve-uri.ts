import {AtUri, type HandleString} from '@atproto/syntax'
import {type QueryClient, queryOptions, useQuery} from '@tanstack/react-query'

import {
  getKnownAccountDidForHandle,
  type IdentityClaim,
  type IdentityClaimsResult,
  type IdentityDocumentEvidence,
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
  resolvePlcIdentity,
  toIdentityDocumentEvidence,
} from '#/state/session/plc-resolvers'
import {
  type AppViewProvider,
  getAppViewProvidersForHandleResolution,
  getIdentityResolutionPolicy,
} from '#/state/session/providers'
import {com} from '#/lexicons'

// The query now stores attributable claims/evidence rather than a bare DID.
// Changing the root also keeps persisted pre-evidence string values from being
// mistaken for a current IdentityClaimsResult after an app upgrade.
const RQKEY_ROOT = 'resolved-identity'
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
      if (!didOrHandle) return makeDirectIdentityClaimsResult('', '', policy)
      // A caller-supplied DID is already an addressable subject. Preserve the
      // old fast path, but make the absence of resolver evidence inspectable.
      if (didOrHandle.startsWith('did:'))
        return makeDirectIdentityClaimsResult(didOrHandle, didOrHandle, policy)

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
      return result
    },
    enabled: !!didOrHandle,
  })

function selectResolvedDid(result: IdentityClaimsResult): string {
  if (result.selected?.did) return result.selected.did
  if (result.status === 'disagreement')
    throw new IdentityResolutionDisagreementError(result)
  throw new IdentityResolutionUnavailableError(result)
}

export function useResolveUriQuery(uri: string | undefined) {
  const {currentAccount} = useSession()
  const urip = new AtUri(uri || '')
  const host = urip.host

  const providers = getAppViewProvidersForHandleResolution()
  const policy = getIdentityResolutionPolicy()
  const knownAccountDid = getKnownAccountDidForHandle(host, currentAccount)

  return useQuery({
    ...resolvedDidQueryOptions(knownAccountDid ?? host, providers, policy),
    select: result => {
      const did = selectResolvedDid(result)
      return {
        did,
        uri: AtUri.make(did, urip.collection, urip.rkey).toString(),
      }
    },
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

  return useQuery({
    ...resolvedDidQueryOptions(
      knownAccountDid ?? didOrHandle,
      providers,
      policy,
    ),
    select: selectResolvedDid,
  })
}

/**
 * Read the same raw claims query used by useResolveDidQuery. This observer is
 * intentionally separate from the compatibility selector above so screens
 * can explain resolver disagreement even when the default policy refuses to
 * select a DID for the profile request.
 */
export function useResolveDidEvidenceQuery(didOrHandle: string | undefined) {
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
  type DidResolution = {
    endpoint?: string
    evidence?: IdentityDocumentEvidence
  }
  const didResolutionPromises = new Map<string, Promise<DidResolution>>()

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
        let resolutionPromise = didResolutionPromises.get(did)
        if (!resolutionPromise) {
          resolutionPromise = resolveIdentityDocument(did)
          didResolutionPromises.set(did, resolutionPromise)
        }
        return resolutionPromise
      },
    }
  })
}

async function resolveIdentityDocument(did: string): Promise<{
  endpoint?: string
  evidence?: IdentityDocumentEvidence
}> {
  if (!did.startsWith('did:plc:')) {
    return {endpoint: await resolvePdsEndpointForDid(did)}
  }

  const result = await resolvePlcIdentity(did)
  const services = result.selected?.services
  const endpoint = services
    ? Object.values(services).find(
        service => service.type === 'AtprotoPersonalDataServer',
      )?.endpoint
    : undefined

  // Even when no document can be selected, return the evidence summary. The
  // identity runtime will keep the claim disputed/unavailable instead of
  // turning a resolver failure into an opaque provider exception.
  return {
    endpoint,
    evidence: toIdentityDocumentEvidence(result),
  }
}

function makeDirectIdentityClaimsResult(
  input: string,
  did: string,
  policy: IdentityResolutionPolicy,
): IdentityClaimsResult {
  const now = Date.now()
  const claim: IdentityClaim = {
    providerId: 'direct-did-input',
    did,
    status: 'verified',
    provenance: {
      resolver: 'direct-did-input',
      resolvedAt: now,
      fromCache: false,
      cacheAgeMs: 0,
    },
  }
  return {
    input,
    claims: [claim],
    evidence: [],
    unavailableResolvers: [],
    status: 'verified',
    policy,
    selected: claim,
  }
}

export function precacheResolvedUri(
  queryClient: QueryClient,
  handle: string,
  did: string,
) {
  const now = Date.now()
  const cached: IdentityClaimsResult = {
    input: handle,
    claims: [
      {
        providerId: 'record-cache',
        did,
        status: 'verified',
        provenance: {
          resolver: 'record-cache',
          resolvedAt: now,
          fromCache: true,
          cacheAgeMs: 0,
        },
      },
    ],
    evidence: [],
    unavailableResolvers: [],
    status: 'verified',
    policy: getIdentityResolutionPolicy(),
    selected: {
      providerId: 'record-cache',
      did,
      status: 'verified',
      provenance: {
        resolver: 'record-cache',
        resolvedAt: now,
        fromCache: true,
        cacheAgeMs: 0,
      },
    },
  }
  queryClient.setQueriesData<IdentityClaimsResult>(
    {queryKey: RQKEY(handle)},
    current => current ?? cached,
  )
}
