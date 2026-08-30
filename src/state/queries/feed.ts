import {useCallback, useEffect, useMemo, useRef} from 'react'
import {type Client} from '@atproto/lex'
import {AtUri, type AtUriString} from '@atproto/syntax'
import {RichText} from '@bsky/sdk/richtext'
import {t} from '@lingui/core/macro'
import {
  type InfiniteData,
  keepPreviousData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {DISCOVER_FEED_URI, DISCOVER_SAVED_FEED} from '#/lib/constants'
import {moderateFeedGenerator} from '#/lib/moderation'
import {
  PROVIDER_COMPOSITION_QUERY_META,
  type ProviderCompositionResult,
} from '#/lib/provider-composition'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {GCTIME, STALE} from '#/state/queries'
import {RQKEY as listQueryKey} from '#/state/queries/list'
import {usePreferencesQuery} from '#/state/queries/preferences'
import {
  composeAppViewProviderRead,
  requireComposedProviderValue,
} from '#/state/queries/provider-composition'
import {createQueryKey} from '#/state/queries/util'
import {
  useAppviewClient,
  useAppviewProviderClientFactory,
  usePublicAppviewClient,
  useSession,
} from '#/state/session'
import {getSelectedAppViewProvider} from '#/state/session/providers'
import {app} from '#/lexicons'
import {router} from '#/routes'
import {useModerationOpts} from '../preferences/moderation-opts'
import {callSameProviderPublicFallback} from './feed-provider-fallback'
import {type FeedDescriptor} from './post-feed'
import {precacheResolvedUri} from './resolve-uri'

export {callSameProviderPublicFallback} from './feed-provider-fallback'

export type FeedSourceFeedInfo = {
  type: 'feed'
  view?: app.bsky.feed.defs.GeneratorView
  uri: string
  feedDescriptor: FeedDescriptor
  route: {
    href: string
    name: string
    params: Record<string, string>
  }
  cid: string
  avatar: string | undefined
  displayName: string
  description: RichText
  creatorDid: string
  creatorHandle: string
  likeCount: number | undefined
  acceptsInteractions?: boolean
  likeUri: string | undefined
  contentMode: app.bsky.feed.defs.GeneratorView['contentMode']
  providerComposition?: ProviderCompositionResult<unknown>
}

export type FeedSourceListInfo = {
  type: 'list'
  view?: app.bsky.graph.defs.ListView
  uri: string
  feedDescriptor: FeedDescriptor
  route: {
    href: string
    name: string
    params: Record<string, string>
  }
  cid: string
  avatar: string | undefined
  displayName: string
  description: RichText
  creatorDid: string
  creatorHandle: string
  contentMode: undefined
  providerComposition?: ProviderCompositionResult<unknown>
}

export type FeedSourceInfo = FeedSourceFeedInfo | FeedSourceListInfo

export function isFeedSourceFeedInfo(
  feed: FeedSourceInfo,
): feed is FeedSourceFeedInfo {
  return feed.type === 'feed'
}

const feedSourceInfoQueryKeyRoot = 'getFeedSourceInfo'
export const feedSourceInfoQueryKey = ({uri}: {uri: string}) => [
  feedSourceInfoQueryKeyRoot,
  uri,
]

const feedSourceNSIDs = {
  feed: 'app.bsky.feed.generator',
  list: 'app.bsky.graph.list',
}

export function hydrateFeedGenerator(
  view: app.bsky.feed.defs.GeneratorView,
  providerComposition?: ProviderCompositionResult<unknown>,
): FeedSourceInfo {
  const urip = new AtUri(view.uri)
  const collection =
    urip.collection === 'app.bsky.feed.generator' ? 'feed' : 'lists'
  const href = `/profile/${urip.hostname}/${collection}/${urip.rkey}`
  const route = router.matchPath(href)

  const description = new RichText({
    text: view.description || '',
    facets: (view.descriptionFacets || [])?.slice(),
  })

  if (!view.descriptionFacets) {
    description.detectFacetsWithoutResolution()
  }

  return {
    type: 'feed',
    view,
    uri: view.uri,
    feedDescriptor: `feedgen|${view.uri}`,
    cid: view.cid,
    route: {
      href,
      name: route[0],
      params: route[1],
    },
    avatar: view.avatar,
    displayName: view.displayName
      ? sanitizeDisplayName(view.displayName)
      : t`Feed by ${sanitizeHandle(view.creator.handle, '@')}`,
    description,
    creatorDid: view.creator.did,
    creatorHandle: view.creator.handle,
    likeCount: view.likeCount,
    acceptsInteractions: view.acceptsInteractions,
    likeUri: view.viewer?.like,
    contentMode: view.contentMode,
    providerComposition,
  }
}

export function hydrateList(
  view: app.bsky.graph.defs.ListView,
  providerComposition?: ProviderCompositionResult<unknown>,
): FeedSourceInfo {
  const urip = new AtUri(view.uri)
  const collection =
    urip.collection === 'app.bsky.feed.generator' ? 'feed' : 'lists'
  const href = `/profile/${urip.hostname}/${collection}/${urip.rkey}`
  const route = router.matchPath(href)

  const description = new RichText({
    text: view.description || '',
    facets: (view.descriptionFacets || [])?.slice(),
  })

  if (!view.descriptionFacets) {
    description.detectFacetsWithoutResolution()
  }

  return {
    type: 'list',
    view,
    uri: view.uri,
    feedDescriptor: `list|${view.uri}`,
    route: {
      href,
      name: route[0],
      params: route[1],
    },
    cid: view.cid,
    avatar: view.avatar,
    description,
    creatorDid: view.creator.did,
    creatorHandle: view.creator.handle,
    displayName: view.name
      ? sanitizeDisplayName(view.name)
      : t`User List by ${sanitizeHandle(view.creator.handle, '@')}`,
    contentMode: undefined,
    providerComposition,
  }
}

export function getFeedTypeFromUri(uri: string) {
  const {pathname} = new AtUri(uri)
  return pathname.includes(feedSourceNSIDs.feed) ? 'feed' : 'list'
}

export function getAvatarTypeFromUri(uri: string) {
  return getFeedTypeFromUri(uri) === 'feed' ? 'algo' : 'list'
}

export function useFeedSourceInfoQuery({uri}: {uri: string}) {
  const type = getFeedTypeFromUri(uri)
  const providerClientFactory = useAppviewProviderClientFactory()

  return useQuery({
    staleTime: STALE.INFINITY,
    meta: PROVIDER_COMPOSITION_QUERY_META,
    queryKey: feedSourceInfoQueryKey({uri}),
    queryFn: async ({signal}) => {
      let view: FeedSourceInfo

      if (type === 'feed') {
        const composed = await composeAppViewProviderRead(
          'feeds',
          (providerClient, _provider, context) =>
            providerClient.call(
              app.bsky.feed.getFeedGenerator,
              {
                feed: uri as AtUriString,
              },
              {signal: context.signal},
            ),
          {
            access: 'account-scoped',
            clientForProvider: providerClientFactory,
            signal,
          },
        )
        const data = requireComposedProviderValue(composed)
        view = hydrateFeedGenerator(data.view, composed)
      } else {
        const composed = await composeAppViewProviderRead(
          'feeds',
          (providerClient, _provider, context) =>
            providerClient.call(
              app.bsky.graph.getList,
              {
                list: uri as AtUriString,
                limit: 1,
              },
              {signal: context.signal},
            ),
          {
            access: 'account-scoped',
            clientForProvider: providerClientFactory,
            signal,
          },
        )
        const data = requireComposedProviderValue(composed)
        view = hydrateList(data.list, composed)
      }

      return view
    },
  })
}

// HACK
// the protocol doesn't yet tell us which feeds are personalized
// this list is used to filter out feed recommendations from logged out users
// for the ones we know need it
// -prf
export const KNOWN_AUTHED_ONLY_FEEDS = [
  'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/with-friends', // popular with friends, by bsky.app
  'at://did:plc:tenurhgjptubkk5zf5qhi3og/app.bsky.feed.generator/mutuals', // mutuals, by skyfeed
  'at://did:plc:tenurhgjptubkk5zf5qhi3og/app.bsky.feed.generator/only-posts', // only posts, by skyfeed
  'at://did:plc:wzsilnxf24ehtmmc3gssy5bu/app.bsky.feed.generator/mentions', // mentions, by flicknow
  'at://did:plc:q6gjnaw2blty4crticxkmujt/app.bsky.feed.generator/bangers', // my bangers, by jaz
  'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/mutuals', // mutuals, by bluesky
  'at://did:plc:q6gjnaw2blty4crticxkmujt/app.bsky.feed.generator/my-followers', // followers, by jaz
  'at://did:plc:vpkhqolt662uhesyj6nxm7ys/app.bsky.feed.generator/followpics', // the gram, by why
]

type GetPopularFeedsOptions = {limit?: number; enabled?: boolean}

function useFeedReadClients() {
  const session = useSession()
  const client = useAppviewClient()
  const provider = getSelectedAppViewProvider(session.currentAccount?.did ?? '')
  const publicClient = usePublicAppviewClient(provider.endpoint)
  return {
    hasSession: session.hasSession,
    client,
    publicClient,
  }
}

async function addDeploymentFeedFallback(
  data: app.bsky.unspecced.getPopularFeedGenerators.$OutputBody,
  publicClient: Client,
  pageParam: string | undefined,
) {
  if (pageParam || data.feeds.some(feed => feed.uri === DISCOVER_FEED_URI)) {
    return data
  }

  try {
    const {view} = await publicClient.call(app.bsky.feed.getFeedGenerator, {
      feed: DISCOVER_FEED_URI as AtUriString,
    })
    return {
      ...data,
      feeds: [view, ...data.feeds],
    }
  } catch {
    // An unconfigured or unavailable deployment feed should not turn an
    // otherwise valid provider response into a query failure.
    return data
  }
}

export function createGetPopularFeedsQueryKey(
  options?: GetPopularFeedsOptions,
) {
  return ['getPopularFeeds', options?.limit]
}

export function useGetPopularFeedsQuery(options?: GetPopularFeedsOptions) {
  const {hasSession, publicClient} = useFeedReadClients()
  const providerClientFactory = useAppviewProviderClientFactory()
  const limit = options?.limit || 10
  const {data: preferences} = usePreferencesQuery()
  const queryClient = useQueryClient()
  const moderationOpts = useModerationOpts()

  // Make sure this doesn't invalidate unless really needed.
  const selectArgs = useMemo(
    () => ({
      hasSession,
      savedFeeds: preferences?.savedFeeds || [],
      moderationOpts,
    }),
    [hasSession, preferences?.savedFeeds, moderationOpts],
  )
  const lastPageCountRef = useRef(0)

  const query = useInfiniteQuery({
    enabled: Boolean(moderationOpts) && options?.enabled !== false,
    meta: PROVIDER_COMPOSITION_QUERY_META,
    queryKey: createGetPopularFeedsQueryKey(options),
    queryFn: async ({pageParam, signal}) => {
      let data = requireComposedProviderValue(
        await composeAppViewProviderRead(
          'feeds',
          (providerClient, _provider, context) =>
            providerClient.call(
              app.bsky.unspecced.getPopularFeedGenerators,
              {
                limit,
                cursor: pageParam,
              },
              {signal: context.signal},
            ),
          {
            access: 'account-scoped',
            clientForProvider: providerClientFactory,
            signal,
          },
        ),
      )
      data = await addDeploymentFeedFallback(data, publicClient, pageParam)

      // precache feeds
      for (const feed of data.feeds) {
        const hydratedFeed = hydrateFeedGenerator(feed)
        precacheFeed(queryClient, hydratedFeed)
      }

      return data
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.cursor,
    select: useCallback(
      (
        data: InfiniteData<app.bsky.unspecced.getPopularFeedGenerators.$OutputBody>,
      ) => {
        const {
          savedFeeds,
          hasSession: hasSessionInner,
          moderationOpts,
        } = selectArgs
        return {
          ...data,
          pages: data.pages.map(page => {
            return {
              ...page,
              feeds: page.feeds.filter(feed => {
                if (
                  !hasSessionInner &&
                  KNOWN_AUTHED_ONLY_FEEDS.includes(feed.uri)
                ) {
                  return false
                }
                const alreadySaved = Boolean(
                  savedFeeds?.find(f => {
                    return f.value === feed.uri
                  }),
                )
                const decision = moderateFeedGenerator(feed, moderationOpts!)
                return !alreadySaved && !decision.ui('contentList').filter
              }),
            }
          }),
        }
      },
      [selectArgs /* Don't change. Everything needs to go into selectArgs. */],
    ),
  })

  useEffect(() => {
    const {isFetching, hasNextPage, data} = query
    if (isFetching || !hasNextPage) {
      return
    }

    // avoid double-fires of fetchNextPage()
    if (
      lastPageCountRef.current !== 0 &&
      lastPageCountRef.current === data?.pages?.length
    ) {
      return
    }

    // fetch next page if we haven't gotten a full page of content
    let count = 0
    for (const page of data?.pages || []) {
      count += page.feeds.length
    }
    if (count < limit && (data?.pages.length || 0) < 6) {
      void query.fetchNextPage()
      lastPageCountRef.current = data?.pages?.length || 0
    }
  }, [query, limit])

  return query
}

export function useSearchPopularFeedsMutation() {
  const providerClientFactory = useAppviewProviderClientFactory()
  const moderationOpts = useModerationOpts()

  return useMutation({
    mutationFn: async (query: string) => {
      const data = requireComposedProviderValue(
        await composeAppViewProviderRead(
          'feeds',
          (providerClient, _provider, context) =>
            providerClient.call(
              app.bsky.unspecced.getPopularFeedGenerators,
              {
                limit: 10,
                query: query,
              },
              {signal: context.signal},
            ),
          {
            access: 'account-scoped',
            clientForProvider: providerClientFactory,
          },
        ),
      )

      if (moderationOpts) {
        return data.feeds.filter(feed => {
          const decision = moderateFeedGenerator(feed, moderationOpts)
          return !decision.ui('contentMedia').blur
        })
      }

      return data.feeds
    },
  })
}

const popularFeedsSearchQueryKeyRoot = 'popularFeedsSearch'
export const createPopularFeedsSearchQueryKey = (query: string) => [
  popularFeedsSearchQueryKeyRoot,
  query,
]

export type PopularFeedsSearchPage =
  app.bsky.unspecced.getPopularFeedGenerators.$OutputBody & {
    providerComposition?: ProviderCompositionResult<app.bsky.unspecced.getPopularFeedGenerators.$OutputBody>
  }

export function usePopularFeedsSearch({
  query,
  enabled,
}: {
  query: string
  enabled?: boolean
}) {
  const providerClientFactory = useAppviewProviderClientFactory()
  const moderationOpts = useModerationOpts()
  const enabledInner = enabled ?? Boolean(moderationOpts)

  return useInfiniteQuery({
    enabled: enabledInner,
    meta: PROVIDER_COMPOSITION_QUERY_META,
    queryKey: createPopularFeedsSearchQueryKey(query),
    queryFn: async ({pageParam, signal}) => {
      const composed = await composeAppViewProviderRead(
        'feeds',
        (providerClient, _provider, context) =>
          providerClient.call(
            app.bsky.unspecced.getPopularFeedGenerators,
            {
              limit: 15,
              query: query,
              cursor: pageParam,
            },
            {signal: context.signal},
          ),
        {
          access: 'account-scoped',
          clientForProvider: providerClientFactory,
          signal,
        },
      )
      return {
        ...requireComposedProviderValue(composed),
        providerComposition: composed,
      }
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.cursor,
    placeholderData: keepPreviousData,
    select(data) {
      return {
        ...data,
        pages: data.pages.map(page => ({
          ...page,
          feeds: page.feeds.filter(feed => {
            const decision = moderateFeedGenerator(feed, moderationOpts!)
            return !decision.ui('contentMedia').blur
          }),
        })),
      }
    },
  })
}

export type SavedFeedSourceInfo = FeedSourceInfo & {
  savedFeed: app.bsky.actor.defs.SavedFeed
}

const PWI_DISCOVER_FEED_STUB: SavedFeedSourceInfo = {
  type: 'feed',
  // This placeholder is used before the provider can hydrate the generator.
  // Keep the deployment-owned feed distinct from Bluesky's operator feed even
  // while logged out or while the selected provider is unavailable.
  displayName: 'Discover',
  uri: DISCOVER_FEED_URI,
  feedDescriptor: `feedgen|${DISCOVER_FEED_URI}`,
  route: {
    href: '/',
    name: 'Home',
    params: {},
  },
  cid: '',
  avatar: '',
  description: new RichText({text: ''}),
  creatorDid: '',
  creatorHandle: '',
  likeCount: 0,
  likeUri: '',
  // ---
  savedFeed: {
    id: 'pwi-discover',
    ...DISCOVER_SAVED_FEED,
  },
  contentMode: undefined,
}

export const FEED_INFO_RQKEY_ROOT = 'feed-info'

const createPinnedFeedInfosQueryKey = (
  kind: 'pinned' | 'saved',
  feedUris: string[],
) =>
  createQueryKey(
    FEED_INFO_RQKEY_ROOT,
    {
      kind,
      feedUris,
    },
    {
      persistedVersion: 1,
    },
  )

export function usePinnedFeedsInfos() {
  const {hasSession, client, publicClient} = useFeedReadClients()
  const {data: preferences, isLoading: isLoadingPrefs} = usePreferencesQuery()
  const pinnedItems = preferences?.savedFeeds.filter(feed => feed.pinned) ?? []

  return useQuery({
    queryKey: createPinnedFeedInfosQueryKey(
      'pinned',
      pinnedItems.map(f => f.value),
    ),
    gcTime: GCTIME.INFINITY,
    staleTime: STALE.MINUTES.FIFTEEN,
    enabled: !isLoadingPrefs,
    queryFn: async () => {
      if (!hasSession) {
        return [PWI_DISCOVER_FEED_STUB]
      }

      let resolved = new Map<string, FeedSourceInfo>()

      // Get all feeds. We can do this in a batch.
      const pinnedFeeds = pinnedItems.filter(feed => feed.type === 'feed')
      let feedsPromise = Promise.resolve()
      if (pinnedFeeds.length > 0) {
        feedsPromise = callSameProviderPublicFallback(
          () =>
            client.call(app.bsky.feed.getFeedGenerators, {
              feeds: pinnedFeeds.map(f => f.value as AtUriString),
            }),
          () =>
            publicClient.call(app.bsky.feed.getFeedGenerators, {
              feeds: pinnedFeeds.map(f => f.value as AtUriString),
            }),
        ).then(data => {
          for (let i = 0; i < data.feeds.length; i++) {
            const feedView = data.feeds[i]
            resolved.set(feedView.uri, hydrateFeedGenerator(feedView))
          }
        })
      }

      // Get all lists. This currently has to be done individually.
      const pinnedLists = pinnedItems.filter(feed => feed.type === 'list')
      const listsPromises = pinnedLists.map(list =>
        client
          .call(app.bsky.graph.getList, {
            list: list.value as AtUriString,
            limit: 1,
          })
          .then(data => {
            const listView = data.list
            resolved.set(listView.uri, hydrateList(listView))
          }),
      )

      await feedsPromise // Fail the whole query if it fails.
      await Promise.allSettled(listsPromises) // Ignore individual failing ones.

      // order the feeds/lists in the order they were pinned
      const result: SavedFeedSourceInfo[] = []
      for (let pinnedItem of pinnedItems) {
        const feedInfo = resolved.get(pinnedItem.value)
        if (feedInfo) {
          result.push({
            ...feedInfo,
            savedFeed: pinnedItem,
          })
        } else if (pinnedItem.type === 'timeline') {
          result.push({
            type: 'feed',
            displayName: 'Following',
            uri: pinnedItem.value,
            feedDescriptor: 'following',
            route: {
              href: '/',
              name: 'Home',
              params: {},
            },
            cid: '',
            avatar: '',
            description: new RichText({text: ''}),
            creatorDid: '',
            creatorHandle: '',
            likeCount: 0,
            likeUri: '',
            savedFeed: pinnedItem,
            contentMode: undefined,
          })
        }
      }
      return result
    },
  })
}

export type SavedFeedItem =
  | {
      type: 'feed'
      config: app.bsky.actor.defs.SavedFeed
      view: app.bsky.feed.defs.GeneratorView
    }
  | {
      type: 'list'
      config: app.bsky.actor.defs.SavedFeed
      view: app.bsky.graph.defs.ListView
    }
  | {
      type: 'timeline'
      config: app.bsky.actor.defs.SavedFeed
      view: undefined
    }

export function useSavedFeeds() {
  const {client, publicClient} = useFeedReadClients()
  const {data: preferences, isLoading: isLoadingPrefs} = usePreferencesQuery()
  const savedItems = preferences?.savedFeeds ?? []
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: createPinnedFeedInfosQueryKey(
      'saved',
      savedItems.map(f => f.value),
    ),
    gcTime: GCTIME.INFINITY,
    staleTime: STALE.INFINITY,
    enabled: !isLoadingPrefs,
    placeholderData: previousData => {
      return (
        previousData || {
          // The likely count before we try to resolve them.
          count: savedItems.length,
          feeds: [],
        }
      )
    },
    queryFn: async () => {
      const resolvedFeeds = new Map<string, app.bsky.feed.defs.GeneratorView>()
      const resolvedLists = new Map<string, app.bsky.graph.defs.ListView>()

      const savedFeeds = savedItems.filter(feed => feed.type === 'feed')
      const savedLists = savedItems.filter(feed => feed.type === 'list')

      let feedsPromise = Promise.resolve()
      if (savedFeeds.length > 0) {
        feedsPromise = callSameProviderPublicFallback(
          () =>
            client.call(app.bsky.feed.getFeedGenerators, {
              feeds: savedFeeds.map(f => f.value as AtUriString),
            }),
          () =>
            publicClient.call(app.bsky.feed.getFeedGenerators, {
              feeds: savedFeeds.map(f => f.value as AtUriString),
            }),
        ).then(data => {
          data.feeds.forEach(f => {
            resolvedFeeds.set(f.uri, f)
          })
        })
      }

      const listsPromises = savedLists.map(list =>
        client
          .call(app.bsky.graph.getList, {
            list: list.value as AtUriString,
            limit: 1,
          })
          .then(data => {
            const listView = data.list
            resolvedLists.set(listView.uri, listView)
          }),
      )

      await Promise.allSettled([feedsPromise, ...listsPromises])

      resolvedFeeds.forEach(feed => {
        const hydratedFeed = hydrateFeedGenerator(feed)
        precacheFeed(queryClient, hydratedFeed)
      })
      resolvedLists.forEach(list => {
        precacheList(queryClient, list)
      })

      const result: SavedFeedItem[] = []
      for (let savedItem of savedItems) {
        if (savedItem.type === 'timeline') {
          result.push({
            type: 'timeline',
            config: savedItem,
            view: undefined,
          })
        } else if (savedItem.type === 'feed') {
          const resolvedFeed = resolvedFeeds.get(savedItem.value)
          if (resolvedFeed) {
            result.push({
              type: 'feed',
              config: savedItem,
              view: resolvedFeed,
            })
          }
        } else if (savedItem.type === 'list') {
          const resolvedList = resolvedLists.get(savedItem.value)
          if (resolvedList) {
            result.push({
              type: 'list',
              config: savedItem,
              view: resolvedList,
            })
          }
        }
      }

      return {
        // By this point we know the real count.
        count: result.length,
        feeds: result,
      }
    },
  })
}

const feedInfoQueryKeyRoot = 'feedInfo'

export function useFeedInfo(feedUri: string | undefined) {
  const providerClientFactory = useAppviewProviderClientFactory()

  return useQuery({
    staleTime: STALE.INFINITY,
    meta: PROVIDER_COMPOSITION_QUERY_META,
    queryKey: [feedInfoQueryKeyRoot, feedUri],
    queryFn: async ({signal}) => {
      if (!feedUri) {
        return null
      }

      const data = requireComposedProviderValue(
        await composeAppViewProviderRead(
          'feeds',
          (providerClient, _provider, context) =>
            providerClient.call(
              app.bsky.feed.getFeedGenerator,
              {
                feed: feedUri as AtUriString,
              },
              {signal: context.signal},
            ),
          {
            access: 'account-scoped',
            clientForProvider: providerClientFactory,
            signal,
          },
        ),
      )

      const feedSourceInfo = hydrateFeedGenerator(data.view)
      return feedSourceInfo
    },
  })
}

function precacheFeed(queryClient: QueryClient, hydratedFeed: FeedSourceInfo) {
  precacheResolvedUri(
    queryClient,
    hydratedFeed.creatorHandle,
    hydratedFeed.creatorDid,
  )
  queryClient.setQueryData<FeedSourceInfo>(
    feedSourceInfoQueryKey({uri: hydratedFeed.uri}),
    hydratedFeed,
  )
}

export function precacheList(
  queryClient: QueryClient,
  list: app.bsky.graph.defs.ListView,
) {
  precacheResolvedUri(queryClient, list.creator.handle, list.creator.did)
  queryClient.setQueryData<app.bsky.graph.defs.ListView>(
    listQueryKey(list.uri),
    list,
  )
}

export function precacheFeedFromGeneratorView(
  queryClient: QueryClient,
  view: app.bsky.feed.defs.GeneratorView,
) {
  const hydratedFeed = hydrateFeedGenerator(view)
  precacheFeed(queryClient, hydratedFeed)
}
