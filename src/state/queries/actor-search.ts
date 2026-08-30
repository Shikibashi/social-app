import {
  type InfiniteData,
  keepPreviousData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
} from '@tanstack/react-query'

import {
  PROVIDER_COMPOSITION_QUERY_META,
  type ProviderCompositionResult,
} from '#/lib/provider-composition'
import {STALE} from '#/state/queries'
import {
  composeAppViewProviderRead,
  requireComposedProviderValue,
} from '#/state/queries/provider-composition'
import {app} from '#/lexicons'

export const RQKEY_ROOT = 'actor-search'
export const RQKEY = (query: string, limit?: number) => [
  RQKEY_ROOT,
  query,
  limit,
]

export type ActorSearchPage = app.bsky.actor.searchActors.$OutputBody & {
  providerComposition?: ProviderCompositionResult<app.bsky.actor.searchActors.$OutputBody>
}

export function useActorSearch({
  query,
  enabled,
  maintainData,
  limit = 25,
}: {
  query: string
  enabled?: boolean
  maintainData?: boolean
  limit?: number
}) {
  return useInfiniteQuery<
    ActorSearchPage,
    Error,
    InfiniteData<ActorSearchPage>,
    QueryKey,
    string | undefined
  >({
    meta: PROVIDER_COMPOSITION_QUERY_META,
    staleTime: STALE.MINUTES.FIVE,
    queryKey: RQKEY(query, limit),
    queryFn: async ({pageParam, signal}) => {
      const composed = await composeAppViewProviderRead(
        'profiles',
        (providerClient, _provider, context) =>
          providerClient.call(
            app.bsky.actor.searchActors,
            {
              q: query,
              limit,
              cursor: pageParam,
            },
            {signal: context.signal},
          ),
        {
          access: 'public',
          signal,
        },
      )
      return {
        ...requireComposedProviderValue(composed),
        providerComposition: composed,
      }
    },
    enabled: enabled && !!query,
    initialPageParam: undefined,
    getNextPageParam: lastPage => lastPage.cursor,
    placeholderData: maintainData ? keepPreviousData : undefined,
    select,
  })
}

function select(data: InfiniteData<ActorSearchPage>) {
  return dedupeActorSearchPages(data)
}

export function dedupeActorSearchPages(
  data: InfiniteData<ActorSearchPage>,
): InfiniteData<ActorSearchPage> {
  // enforce uniqueness
  const dids = new Set()

  return {
    ...data,
    pages: data.pages.map(page => ({
      ...page,
      actors: page.actors.filter(actor => {
        if (dids.has(actor.did)) {
          return false
        }
        dids.add(actor.did)
        return true
      }),
    })),
  }
}

export function* findAllProfilesInQueryData(
  queryClient: QueryClient,
  did: string,
) {
  const queryDatas = queryClient.getQueriesData<InfiniteData<ActorSearchPage>>({
    queryKey: [RQKEY_ROOT],
  })
  for (const [_queryKey, queryData] of queryDatas) {
    if (!queryData) {
      continue
    }
    for (const actor of queryData.pages.flatMap(page => page.actors)) {
      if (actor.did === did) {
        yield actor
      }
    }
  }
}
