import {type QueryClient} from '@tanstack/react-query'

import {type app} from '#/lexicons'

/**
 * Direct post queries use the shared `post` key, including the optional public
 * fallback variant. Keep this lookup separate from the shadow emitter so it is
 * easy to verify without importing the rest of the UI cache graph.
 */
export function* findDirectPostsInQueryCache(
  queryClient: QueryClient,
  uri: string,
): Generator<app.bsky.feed.defs.PostView, void> {
  for (const [
    ,
    data,
  ] of queryClient.getQueriesData<app.bsky.feed.defs.PostView>({
    queryKey: ['post', uri],
  })) {
    if (data?.uri === uri) yield data
  }
}
