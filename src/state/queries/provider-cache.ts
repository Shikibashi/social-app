import {type QueryClient} from '@tanstack/react-query'

import {isProviderCompositionQueryMeta} from '#/lib/provider-composition'

/**
 * Reset only queries that read through the user-selected provider boundary.
 * Active observers refetch through their current provider configuration;
 * unrelated PDS, chat, draft, and local queries keep their cache state.
 */
export function resetProviderCompositionQueries(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient.resetQueries({
    predicate: query => isProviderCompositionQueryMeta(query.meta),
  })
}
