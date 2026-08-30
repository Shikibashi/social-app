import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  LayoutAnimation,
  type ListRenderItemInfo,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'
import {type RichText as RichTextType} from '@bsky/sdk/richtext'
import {useLingui} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'

import {type FeedProviderProvenance} from '#/lib/api/feed/types'
import {type BalancedCandidate, rankBalancedCandidates} from '#/lib/balanced'
import {DISCOVER_FEED_URI, KNOWN_SHUTDOWN_FEEDS} from '#/lib/constants'
import {getFeedCandidateText} from '#/lib/feed-sovereignty/candidate-text'
import {
  type ContentFilterPolicy,
  matchContentFilter,
} from '#/lib/feed-sovereignty/content-filter'
import {
  explorationFloorForLevel,
  type FeedPreferences,
  rankLocallyWithTrace,
} from '#/lib/feed-sovereignty/profile'
import {
  type RadlibCurationConfig,
  repartitionCurationSlices,
  retainReplyForExplicitPreference,
  scoreRadlibCuration,
} from '#/lib/feed-sovereignty/radlib-curation'
import {useBottomBarOffset} from '#/lib/hooks/useBottomBarOffset'
import {useInitialNumToRender} from '#/lib/hooks/useInitialNumToRender'
import {useNonReactiveCallback} from '#/lib/hooks/useNonReactiveCallback'
import {
  defaultExplicitPreferences,
  defaultLearnedProfile,
} from '#/lib/personalization'
import {
  type ProviderCompositionResult,
  type ProviderCompositionStatus,
  type ProviderIndependence,
} from '#/lib/provider-composition'
import {isNetworkError} from '#/lib/strings/errors'
import {logger} from '#/logger'
import {usePostAuthorShadowFilter} from '#/state/cache/profile-shadow'
import {listenPostCreated} from '#/state/events'
import {useFeedFeedbackContext} from '#/state/feed-feedback'
import {useTrendingSettings} from '#/state/preferences/trending'
import {STALE} from '#/state/queries'
import {
  type AuthorFilter,
  type FeedDescriptor,
  type FeedParams,
  type FeedPostSlice,
  type FeedPostSliceItem,
  pollLatest,
  RQKEY,
  usePostFeedQuery,
} from '#/state/queries/post-feed'
import {truncateAndInvalidate} from '#/state/queries/util'
import {useSession} from '#/state/session'
import {useProgressGuide} from '#/state/shell/progress-guide'
import {List, type ListRef} from '#/view/com/util/List'
import {PostFeedLoadingPlaceholder} from '#/view/com/util/LoadingPlaceholder'
import {LoadMoreRetryBtn} from '#/view/com/util/LoadMoreRetryBtn'
import {type VideoFeedSourceContext} from '#/screens/VideoFeed/types'
import {atoms as a, useBreakpoints, useLayoutBreakpoints, useTheme} from '#/alf'
import {ProgressGuide, SuggestedFollows} from '#/components/FeedInterstitials'
import {
  PostFeedVideoGridRow,
  PostFeedVideoGridRowPlaceholder,
} from '#/components/feeds/PostFeedVideoGridRow'
import {FeedTrendingTopicsInterstitial} from '#/components/interstitials/FeedTrendingTopics'
import {TrendingInterstitial} from '#/components/interstitials/Trending'
import {TrendingVideos as TrendingVideosInterstitial} from '#/components/interstitials/TrendingVideos'
import {isStandardSiteEmbed} from '#/components/Post/Embed/StandardSiteEmbed/utils'
import {RichText} from '#/components/RichText'
import {useAnalytics} from '#/analytics'
import {IS_IOS, IS_NATIVE, IS_WEB} from '#/env'
import {DiscoverFeedLiveEventFeedsAndTrendingBanner} from '#/features/liveEvents/components/DiscoverFeedLiveEventFeedsAndTrendingBanner'
import {
  isStatusStillActive,
  isStatusValidForViewers,
  useLiveNowConfig,
} from '#/features/liveNow'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {ComposerPrompt} from '../feeds/ComposerPrompt'
import {DiscoverFallbackHeader} from './DiscoverFallbackHeader'
import {FeedShutdownMsg} from './FeedShutdownMsg'
import {PostFeedErrorMessage} from './PostFeedErrorMessage'
import {PostFeedItem} from './PostFeedItem'
import {ShowLessFollowup} from './ShowLessFollowup'
import {ViewFullThread} from './ViewFullThread'

type FeedRow =
  | {
      type: 'loading'
      key: string
    }
  | {
      type: 'empty'
      key: string
    }
  | {
      type: 'error'
      key: string
    }
  | {
      type: 'loadMoreError'
      key: string
    }
  | {
      type: 'feedShutdownMsg'
      key: string
    }
  | {
      type: 'fallbackMarker'
      key: string
    }
  | {
      type: 'description'
      key: string
      value: RichTextType
    }
  | {
      type: 'sliceItem'
      key: string
      slice: FeedPostSlice
      indexInSlice: number
      showReplyTo: boolean
    }
  | {
      type: 'videoGridRowPlaceholder'
      key: string
    }
  | {
      type: 'videoGridRow'
      key: string
      items: FeedPostSliceItem[]
      sourceFeedUri: string
      feedContexts: (string | undefined)[]
      reqIds: (string | undefined)[]
    }
  | {
      type: 'sliceViewFullThread'
      key: string
      uri: string
    }
  | {
      type: 'interstitialFollows'
      key: string
    }
  | {
      type: 'interstitialProgressGuide'
      key: string
    }
  | {
      type: 'interstitialTrending'
      key: string
    }
  | {
      type: 'interstitialFeedTrendingTopics'
      key: string
      feedSliceIndex: number
    }
  | {
      type: 'interstitialTrendingVideos'
      key: string
    }
  | {
      type: 'showLessFollowup'
      key: string
    }
  | {
      type: 'composerPrompt'
      key: string
    }
  | {
      type: 'liveEventFeedsAndTrendingBanner'
      key: string
    }

export function getItemsForFeedback(feedRow: FeedRow): {
  item: FeedPostSliceItem
  feedContext: string | undefined
  reqId: string | undefined
}[] {
  if (feedRow.type === 'sliceItem') {
    return feedRow.slice.items.map(item => ({
      item,
      feedContext: feedRow.slice.feedContext,
      reqId: feedRow.slice.reqId,
    }))
  } else if (feedRow.type === 'videoGridRow') {
    return feedRow.items.map((item, i) => ({
      item,
      feedContext: feedRow.feedContexts[i],
      reqId: feedRow.reqIds[i],
    }))
  } else {
    return []
  }
}

export type PostFeedRef = {
  refreshFeed: () => Promise<void>
}

// DISABLED need to check if this is causing random feed refreshes -prf
// const REFRESH_AFTER = STALE.HOURS.ONE
const CHECK_LATEST_AFTER = STALE.SECONDS.THIRTY

let PostFeed = ({
  feed,
  description,
  feedParams,
  ignoreFilterFor,
  style,
  enabled,
  pollInterval,
  disablePoll,
  scrollElRef,
  onScrolledDownChange,
  onHasNew,
  renderEmptyState,
  renderEndOfFeed,
  testID,
  headerOffset = 0,
  progressViewOffset,
  desktopFixedHeightOffset,
  ListHeaderComponent,
  extraData,
  savedFeedConfig,
  initialNumToRender: initialNumToRenderOverride,
  localRerank,
  balancedMode,
  localFeedPreferences,
  radlibCuration,
  contentFilterPolicy,
  isVideoFeed = false,
  showComposerPrompt = false,
  onFeedContext,
  ref,
}: {
  feed: FeedDescriptor
  description?: RichTextType
  feedParams?: FeedParams
  ignoreFilterFor?: string
  style?: StyleProp<ViewStyle>
  enabled?: boolean
  pollInterval?: number
  disablePoll?: boolean
  scrollElRef?: ListRef
  onHasNew?: (v: boolean) => void
  onScrolledDownChange?: (isScrolledDown: boolean) => void
  renderEmptyState: () => React.ReactElement
  renderEndOfFeed?: () => React.ReactElement
  testID?: string
  headerOffset?: number
  progressViewOffset?: number
  desktopFixedHeightOffset?: number
  ListHeaderComponent?: () => React.ReactElement
  extraData?: Record<string, unknown>
  savedFeedConfig?: app.bsky.actor.defs.SavedFeed
  initialNumToRender?: number
  isVideoFeed?: boolean
  lastFetchDate?: () => number
  localRerank?: boolean
  balancedMode?: boolean
  localFeedPreferences?: FeedPreferences
  radlibCuration?: RadlibCurationConfig
  contentFilterPolicy?: ContentFilterPolicy
  /** Show the inline post composer prompt when this feed is rendered in Home. */
  showComposerPrompt?: boolean
  onFeedContext?: (
    feedContext: string | undefined,
    providerProvenance?: FeedProviderProvenance[],
    providerCompositionStatus?: ProviderCompositionStatus,
    providerIndependence?: ProviderIndependence,
    providerComposition?: ProviderCompositionResult<unknown>,
  ) => void
  ref?: React.Ref<PostFeedRef>
}): React.ReactNode => {
  const ax = useAnalytics()
  const t = useTheme()
  const {t: l} = useLingui()
  const queryClient = useQueryClient()
  const {currentAccount, hasSession} = useSession()
  const initialNumToRender = useInitialNumToRender()
  const feedFeedback = useFeedFeedbackContext()
  const [isPTRing, setIsPTRing] = useState(false)
  // eslint-disable-next-line react-hooks/purity
  const lastFetchRef = useRef<number>(Date.now())
  const [feedType, feedUriOrActorDid, feedTab] = feed.split('|')
  const {gtMobile} = useBreakpoints()
  const {rightNavVisible} = useLayoutBreakpoints()
  const areVideoFeedsEnabled = IS_NATIVE

  const trendingIndices = ax.features.getValue(
    ax.features.TrendingDiscoverValues,
    {
      topics: 5,
      accounts: 15,
      videos: 30,
    },
  )

  const [hasPressedShowLessUris, setHasPressedShowLessUris] = useState(
    () => new Set<string>(),
  )
  const onPressShowLess = useCallback(
    (interaction: app.bsky.feed.defs.Interaction) => {
      if (interaction.item) {
        const uri = interaction.item
        setHasPressedShowLessUris(prev => new Set([...prev, uri]))
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      }
    },
    [],
  )

  const feedCacheKey = feedParams?.feedCacheKey
  const opts = useMemo(
    () => ({enabled, ignoreFilterFor}),
    [enabled, ignoreFilterFor],
  )
  const {
    data,
    isFetching,
    isFetched,
    isError,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = usePostFeedQuery(feed, feedParams, opts)
  const lastFetchedAt = data?.pages[0].fetchedAt
  const isEmpty = useMemo(
    () => !isFetching && !data?.pages?.some(page => page.slices.length),
    [isFetching, data],
  )
  const activeFeedContext = useMemo(
    () =>
      data?.pages
        .flatMap(page => page.slices)
        .map(slice => slice.feedContext)
        .find((context): context is string => Boolean(context)),
    [data],
  )
  const activeProviderProvenance = data?.pages.find(
    page => page.providerProvenance?.length,
  )?.providerProvenance
  const activeProviderCompositionStatus =
    data?.pages[0]?.providerCompositionStatus
  const activeProviderIndependence = data?.pages[0]?.providerIndependence
  const activeProviderComposition = data?.pages.find(
    page => page.providerComposition,
  )?.providerComposition

  useEffect(() => {
    onFeedContext?.(
      activeFeedContext,
      activeProviderProvenance,
      activeProviderCompositionStatus,
      activeProviderIndependence,
      activeProviderComposition,
    )
  }, [
    activeFeedContext,
    activeProviderCompositionStatus,
    activeProviderIndependence,
    activeProviderComposition,
    activeProviderProvenance,
    onFeedContext,
  ])

  useEffect(() => {
    if (lastFetchedAt) {
      lastFetchRef.current = lastFetchedAt
    }
  }, [lastFetchedAt])

  const checkForNew = useNonReactiveCallback(async () => {
    if (!data?.pages[0] || isFetching || !onHasNew || !enabled || disablePoll) {
      return
    }

    // Discover always has fresh content
    if (feedUriOrActorDid === DISCOVER_FEED_URI) {
      return onHasNew(true)
    }

    try {
      if (await pollLatest(data.pages[0])) {
        if (isEmpty) {
          void refetch()
        } else {
          onHasNew(true)
        }
      }
    } catch (e) {
      if (!isNetworkError(e)) {
        logger.warn('Poll latest failed', {feed, message: String(e)})
      }
    }
  })

  const isScrolledDownRef = useRef(false)
  const handleScrolledDownChange = (isScrolledDown: boolean) => {
    isScrolledDownRef.current = isScrolledDown
    onScrolledDownChange?.(isScrolledDown)
  }

  const myDid = currentAccount?.did || ''
  const onPostCreated = useCallback(() => {
    // NOTE
    // only invalidate if at the top of the feed
    // changing content when scrolled can trigger some UI freakouts on iOS and android
    // -sfn
    if (
      !isScrolledDownRef.current &&
      (feed === 'following' ||
        feed === `author|${myDid}|posts_and_author_threads`)
    ) {
      void queryClient.invalidateQueries({queryKey: RQKEY(feed)})
    }
  }, [queryClient, feed, myDid])
  useEffect(() => {
    return listenPostCreated(onPostCreated)
  }, [onPostCreated])

  useEffect(() => {
    if (enabled && !disablePoll) {
      const timeSinceFirstLoad = Date.now() - lastFetchRef.current
      if (isEmpty || timeSinceFirstLoad > CHECK_LATEST_AFTER) {
        // check for new on enable (aka on focus)
        void checkForNew()
      }
    }
  }, [enabled, isEmpty, disablePoll, checkForNew])

  useEffect(() => {
    let cleanup1: () => void | undefined, cleanup2: () => void | undefined
    const subscription = AppState.addEventListener('change', nextAppState => {
      // check for new on app foreground
      if (nextAppState === 'active') {
        void checkForNew()
      }
    })
    cleanup1 = () => subscription.remove()
    if (pollInterval) {
      // check for new on interval
      const i = setInterval(() => {
        void checkForNew()
      }, pollInterval)
      cleanup2 = () => clearInterval(i)
    }
    return () => {
      cleanup1?.()
      cleanup2?.()
    }
  }, [pollInterval, checkForNew])

  const followProgressGuide = useProgressGuide('follow-10')
  const followAndLikeProgressGuide = useProgressGuide('like-10-and-follow-7')

  const showProgressInterstitial =
    (followProgressGuide || followAndLikeProgressGuide) && !rightNavVisible

  const {trendingVideoDisabled} = useTrendingSettings()

  const blockedOrMutedAuthors = usePostAuthorShadowFilter(
    // author feeds have their own handling
    feed.startsWith('author|') ? undefined : data?.pages,
  )

  const localRanking = useMemo(() => {
    const explanations = new Map<string, string[]>()
    const curationEnabled = Boolean(radlibCuration?.enabled)
    const contentFilterEnabled = Boolean(contentFilterPolicy?.enabled)
    if (
      (!localRerank &&
        !balancedMode &&
        !curationEnabled &&
        !contentFilterEnabled) ||
      !localFeedPreferences ||
      !data
    ) {
      return {pages: data?.pages, explanations}
    }

    const now = Date.now()
    const curatedPages = data.pages.map(page => ({
      page,
      capacity: page.slices.length,
      slices: page.slices.flatMap(slice => {
        if (!curationEnabled || !radlibCuration?.removeReplies) return [slice]
        const feedItem = slice.items.find(
          item => item.uri === slice.feedPostUri,
        )
        if (!feedItem) return [slice]
        return retainReplyForExplicitPreference(
          {
            uri: slice.feedPostUri,
            authorDid: feedItem.post.author.did,
            isReply: Boolean(feedItem.record.reply),
          },
          localFeedPreferences.explicitPostPreferences,
          localFeedPreferences.explicitAuthors,
        )
          ? [slice]
          : []
      }),
    }))
    const candidateForSlice = (
      slice: (typeof data.pages)[number]['slices'][number],
    ) => {
      const feedItem = slice.items.find(item => item.uri === slice.feedPostUri)
      const item = feedItem ?? slice.items[0]
      const authorDid = item?.post.author.did ?? slice.feedPostUri
      const text = getFeedCandidateText(
        item?.record.text ?? '',
        item?.post.embed,
      )
      const contentFilterTrace = contentFilterEnabled
        ? matchContentFilter(
            {
              authorDid,
              text,
            },
            contentFilterPolicy,
          )
        : undefined
      if (contentFilterTrace && !contentFilterTrace.included) return []
      const curationTrace = curationEnabled
        ? scoreRadlibCuration(
            {
              uri: slice.feedPostUri,
              authorDid,
              text,
              indexedAt: item?.post.indexedAt,
              likeCount: item?.post.likeCount,
              repostCount: item?.post.repostCount,
              replyCount: item?.post.replyCount,
              quoteCount: item?.post.quoteCount,
              isReply: Boolean(feedItem?.record.reply),
            },
            radlibCuration!,
            now,
          )
        : undefined
      if (curationTrace && !curationTrace.included) return []
      const indexedAt = item ? Date.parse(item.post.indexedAt) : Number.NaN
      const ageHours = Number.isFinite(indexedAt)
        ? (now - indexedAt) / 3_600_000
        : 24
      return [
        {
          slice,
          candidate: {
            uri: slice.feedPostUri,
            authorDid,
            text,
            topic: curationTrace?.topic,
            freshness: Math.exp(-Math.max(0, ageHours) / 24),
            networkRelevance: 0.5,
            conversationActivity: item?.post.replyCount ? 1 : 0,
            familiarity: item?.post.author.viewer?.following ? 1 : 0,
            variety: item?.post.author.viewer?.following ? 0.25 : 1,
            integrityWeight: 1,
            explorationEligible: !item?.post.author.viewer?.following,
            seen: false,
            curationScore: curationTrace?.score,
            curationReasons: curationTrace?.reasons,
          },
        },
      ]
    }

    if (balancedMode) {
      const explicit = {
        ...defaultExplicitPreferences,
        selectedFeedPreset: 'balanced',
        discovery: localFeedPreferences.discovery,
        familiarity: localFeedPreferences.familiarity,
        freshness: localFeedPreferences.freshness,
        variety: localFeedPreferences.variety ?? 0.5,
        conversationActivity: localFeedPreferences.conversationActivity,
        explorationLevel: localFeedPreferences.explorationLevel,
        inferredInterestsEnabled: localFeedPreferences.inferredInterestsEnabled,
        explicitInterests: localFeedPreferences.explicitInterests,
        explicitAuthors: localFeedPreferences.explicitAuthors,
        explicitPostPreferences: localFeedPreferences.explicitPostPreferences,
        topics: localFeedPreferences.topics,
        classifierModules: localFeedPreferences.classifierModules,
        contentFilterPolicy: localFeedPreferences.contentFilterPolicy,
        radlibCuration: localFeedPreferences.radlibCuration,
      }
      const learned = {
        ...defaultLearnedProfile,
        inferredTopics: localFeedPreferences.inferredTopics,
      }
      const pages = curatedPages.map(({page, slices}) => {
        const entries = slices.flatMap(candidateForSlice)
        const balancedCandidates: BalancedCandidate[] = entries.map(
          ({slice, candidate}) => {
            const item = slice.items.find(
              item => item.uri === slice.feedPostUri,
            )
            return {
              ...candidate,
              cid: item?.post.cid ?? candidate.uri,
              candidateTimestamp:
                item?.post.indexedAt ?? new Date(now).toISOString(),
              hydration: {
                state: 'visible' as const,
                checkedAt: new Date(now).toISOString(),
              },
              sourceCategory: item?.post.author.viewer?.following
                ? 'followed-network'
                : 'graph-near-discovery',
              features: {
                freshness: candidate.freshness,
                graphProximity: candidate.networkRelevance,
                engagementCount:
                  (item?.post.likeCount ?? 0) +
                  (item?.post.repostCount ?? 0) +
                  (item?.post.replyCount ?? 0),
                exploration: localFeedPreferences.explorationLevel,
                integrity: candidate.integrityWeight,
                familiarity: candidate.familiarity,
                variety: candidate.variety,
                conversationActivity: candidate.conversationActivity,
              },
            }
          },
        )
        const ranked = rankBalancedCandidates(
          balancedCandidates,
          explicit,
          learned,
          {now},
        )
        for (const trace of ranked.traces) {
          if (ranked.ordered.some(candidate => candidate.uri === trace.uri)) {
            explanations.set(trace.uri, [
              `Balanced local algorithm: ${trace.reason}`,
            ])
          }
        }
        const byUri = new Map(
          entries.map(entry => [entry.candidate.uri, entry.slice]),
        )
        return {
          ...page,
          slices: ranked.ordered
            .map(candidate => byUri.get(candidate.uri)!)
            .filter(Boolean),
        }
      })
      return {pages, explanations}
    }

    if (curationEnabled) {
      const entries = curatedPages.flatMap(({slices}) =>
        slices.flatMap(candidateForSlice),
      )
      const ranked = rankLocallyWithTrace(
        entries.map(entry => entry.candidate),
        localFeedPreferences,
        {
          maxAuthorPerWindow: radlibCuration!.maxPostsPerAuthor,
          explorationFloor: explorationFloorForLevel(
            localFeedPreferences.explorationLevel,
          ),
        },
      )
      for (const trace of ranked.traces) {
        if (trace.selected) explanations.set(trace.uri, trace.reasons)
      }
      const byUri = new Map(
        entries.map(entry => [entry.candidate.uri, entry.slice]),
      )
      const orderedSlices = ranked.ordered.flatMap(candidate => {
        const slice = byUri.get(candidate.uri)
        return slice ? [slice] : []
      })
      const repartitioned = repartitionCurationSlices(
        orderedSlices,
        curatedPages.map(({capacity}) => capacity),
      )
      const pages = curatedPages.map(({page}, index) => ({
        ...page,
        slices: repartitioned[index],
      }))
      return {pages, explanations}
    }

    if (!localRerank) {
      const pages = curatedPages.map(({page, slices}) => ({
        ...page,
        // A content-only policy filters the provider's candidates but does not
        // silently take ownership of ordering.
        slices: slices.flatMap(candidateForSlice).map(entry => entry.slice),
      }))
      return {pages, explanations}
    }

    const pages = curatedPages.map(({page, slices}) => {
      const entries = slices.flatMap(candidateForSlice)
      const ranked = rankLocallyWithTrace(
        entries.map(entry => entry.candidate),
        localFeedPreferences,
        {
          maxAuthorPerWindow: 2,
          explorationFloor: explorationFloorForLevel(
            localFeedPreferences.explorationLevel,
          ),
        },
      )
      for (const trace of ranked.traces) {
        if (trace.selected) explanations.set(trace.uri, trace.reasons)
      }
      const byUri = new Map(
        entries.map(entry => [entry.candidate.uri, entry.slice]),
      )
      return {
        ...page,
        slices: ranked.ordered
          .map(candidate => byUri.get(candidate.uri)!)
          .filter(Boolean),
      }
    })
    return {pages, explanations}
  }, [
    contentFilterPolicy,
    data,
    localFeedPreferences,
    localRerank,
    balancedMode,
    radlibCuration,
  ])
  const renderPages = localRanking.pages
  const feedItems: FeedRow[] = useMemo(() => {
    // wraps a slice item, and replaces it with a showLessFollowup item
    // if the user has pressed show less on it
    const sliceItem = (row: Extract<FeedRow, {type: 'sliceItem'}>) => {
      if (hasPressedShowLessUris.has(row.slice.items[row.indexInSlice]?.uri)) {
        return {
          type: 'showLessFollowup',
          key: row.key,
        } as const
      } else {
        return row
      }
    }

    let feedKind: 'following' | 'discover' | 'profile' | 'thevids' | undefined
    if (feedType === 'following') {
      feedKind = 'following'
    } else if (feedUriOrActorDid === DISCOVER_FEED_URI) {
      feedKind = 'discover'
    } else if (
      feedType === 'author' &&
      (feedTab === 'posts_and_author_threads' ||
        feedTab === 'posts_with_replies')
    ) {
      feedKind = 'profile'
    }

    let arr: FeedRow[] = []
    if (KNOWN_SHUTDOWN_FEEDS.includes(feedUriOrActorDid)) {
      arr.push({
        type: 'feedShutdownMsg',
        key: 'feedShutdownMsg',
      })
    }
    if (isFetched) {
      if (isError && isEmpty) {
        arr.push({
          type: 'error',
          key: 'error',
        })
      } else if (isEmpty) {
        arr.push({
          type: 'empty',
          key: 'empty',
        })
      } else if (data) {
        let sliceIndex = -1

        if (isVideoFeed) {
          const videos: {
            item: FeedPostSliceItem
            feedContext: string | undefined
            reqId: string | undefined
          }[] = []
          for (const page of renderPages ?? []) {
            for (const slice of page.slices) {
              const item = slice.items.find(
                item => item.uri === slice.feedPostUri,
              )
              if (
                item &&
                bsky.isType(app.bsky.embed.video.view, item.post.embed) &&
                !blockedOrMutedAuthors.includes(item.post.author.did)
              ) {
                videos.push({
                  item,
                  feedContext: slice.feedContext,
                  reqId: slice.reqId,
                })
              }
            }
          }

          const rows: {
            item: FeedPostSliceItem
            feedContext: string | undefined
            reqId: string | undefined
          }[][] = []
          for (let i = 0; i < videos.length; i++) {
            const video = videos[i]
            const item = video.item
            const cols = gtMobile ? 3 : 2
            const rowItem = {
              item,
              feedContext: video.feedContext,
              reqId: video.reqId,
            }
            if (i % cols === 0) {
              rows.push([rowItem])
            } else {
              rows[rows.length - 1].push(rowItem)
            }
          }

          for (const row of rows) {
            sliceIndex++
            arr.push({
              type: 'videoGridRow',
              key: row.map(r => r.item._reactKey).join('-'),
              items: row.map(r => r.item),
              sourceFeedUri: feedUriOrActorDid,
              feedContexts: row.map(r => r.feedContext),
              reqIds: row.map(r => r.reqId),
            })
          }
        } else {
          for (const page of renderPages ?? []) {
            for (const slice of page.slices) {
              sliceIndex++

              if (hasSession) {
                if (feedKind === 'discover') {
                  if (sliceIndex === 0) {
                    if (showProgressInterstitial) {
                      arr.push({
                        type: 'interstitialProgressGuide',
                        key: 'interstitial-' + sliceIndex + '-' + lastFetchedAt,
                      })
                    }
                    arr.push({
                      type: 'liveEventFeedsAndTrendingBanner',
                      key: 'liveEventFeedsAndTrendingBanner-' + sliceIndex,
                    })
                    // Show composer prompt for Discover and Following feeds
                    if (
                      hasSession &&
                      (showComposerPrompt ||
                        feedUriOrActorDid === DISCOVER_FEED_URI ||
                        feed === 'following')
                    ) {
                      arr.push({
                        type: 'composerPrompt',
                        key: 'composerPrompt-' + sliceIndex,
                      })
                    }
                  } else if (sliceIndex === trendingIndices.topics) {
                    arr.push({
                      type: 'interstitialFeedTrendingTopics',
                      key: 'interstitialFeedTrendingTopics-' + sliceIndex,
                      feedSliceIndex: sliceIndex,
                    })
                  } else if (sliceIndex === trendingIndices.videos) {
                    if (areVideoFeedsEnabled && !trendingVideoDisabled) {
                      arr.push({
                        type: 'interstitialTrendingVideos',
                        key: 'interstitial-' + sliceIndex + '-' + lastFetchedAt,
                      })
                    }
                  } else if (sliceIndex === trendingIndices.accounts) {
                    arr.push({
                      type: 'interstitialFollows',
                      key: 'interstitial-' + sliceIndex + '-' + lastFetchedAt,
                    })
                  }
                } else if (feedKind === 'following') {
                  if (sliceIndex === 0) {
                    // Show composer prompt for Following feed
                    if (hasSession) {
                      arr.push({
                        type: 'composerPrompt',
                        key: 'composerPrompt-' + sliceIndex,
                      })
                    }
                  }
                } else if (feedKind === 'profile') {
                  if (sliceIndex === 5) {
                    arr.push({
                      type: 'interstitialFollows',
                      key: 'interstitial-' + sliceIndex + '-' + lastFetchedAt,
                    })
                  }
                } else if (showComposerPrompt && sliceIndex === 0) {
                  arr.push({
                    type: 'composerPrompt',
                    key: 'composerPrompt-' + sliceIndex,
                  })
                }
              }

              if (slice.isFallbackMarker) {
                arr.push({
                  type: 'fallbackMarker',
                  key:
                    'sliceFallbackMarker-' + sliceIndex + '-' + lastFetchedAt,
                })
              } else if (
                slice.items.some(item =>
                  blockedOrMutedAuthors.includes(item.post.author.did),
                )
              ) {
                // skip
              } else if (slice.isIncompleteThread && slice.items.length >= 3) {
                const beforeLast = slice.items.length - 2
                const last = slice.items.length - 1
                arr.push(
                  sliceItem({
                    type: 'sliceItem',
                    key: slice.items[0]._reactKey,
                    slice: slice,
                    indexInSlice: 0,
                    showReplyTo: false,
                  }),
                )
                arr.push({
                  type: 'sliceViewFullThread',
                  key: slice._reactKey + '-viewFullThread',
                  uri: slice.items[0].uri,
                })
                arr.push(
                  sliceItem({
                    type: 'sliceItem',
                    key: slice.items[beforeLast]._reactKey,
                    slice: slice,
                    indexInSlice: beforeLast,
                    showReplyTo:
                      slice.items[beforeLast].parentAuthor?.did !==
                      slice.items[beforeLast].post.author.did,
                  }),
                )
                arr.push(
                  sliceItem({
                    type: 'sliceItem',
                    key: slice.items[last]._reactKey,
                    slice: slice,
                    indexInSlice: last,
                    showReplyTo: false,
                  }),
                )
              } else {
                for (let i = 0; i < slice.items.length; i++) {
                  arr.push(
                    sliceItem({
                      type: 'sliceItem',
                      key: slice.items[i]._reactKey,
                      slice: slice,
                      indexInSlice: i,
                      showReplyTo: i === 0,
                    }),
                  )
                }
              }
            }
          }
        }
      }
      if (isError && !isEmpty) {
        arr.push({
          type: 'loadMoreError',
          key: 'loadMoreError',
        })
      }
    } else {
      if (isVideoFeed) {
        arr.push({
          type: 'videoGridRowPlaceholder',
          key: 'videoGridRowPlaceholder',
        })
      } else {
        arr.push({
          type: 'loading',
          key: 'loading',
        })
      }
    }

    if (description?.text) {
      arr.unshift({
        key: 'description',
        type: 'description',
        value: description,
      })
    }

    return arr
  }, [
    description,
    isFetched,
    isError,
    isEmpty,
    lastFetchedAt,
    data,
    feed,
    feedType,
    feedUriOrActorDid,
    feedTab,
    hasSession,
    showProgressInterstitial,
    trendingVideoDisabled,
    gtMobile,
    isVideoFeed,
    showComposerPrompt,
    areVideoFeedsEnabled,
    hasPressedShowLessUris,
    blockedOrMutedAuthors,
    trendingIndices,
  ])

  // events
  // =
  //

  const refreshFeed = async () => {
    if (!enabled) return

    ax.metric('feed:refresh', {
      feedType: feedType,
      feedUrl: feed,
      reason: 'pull-to-refresh',
    })
    try {
      await truncateAndInvalidate(queryClient, RQKEY(feed, feedParams))
      if (onHasNew) {
        onHasNew(false)
      }
    } catch (err) {
      logger.error('Failed to refresh posts feed', {message: err})
    }
  }

  const onRefresh = async () => {
    setIsPTRing(true)
    await refreshFeed()
    setIsPTRing(false)
  }

  useImperativeHandle(ref, () => ({
    refreshFeed,
  }))

  const onEndReached = useCallback(async () => {
    if (isFetching || !hasNextPage || isError) return

    ax.metric('feed:endReached', {
      feedType: feedType,
      feedUrl: feed,
      itemCount: feedItems.length,
    })
    try {
      await fetchNextPage()
    } catch (err) {
      logger.error('Failed to load more posts', {message: err})
    }
  }, [
    ax,
    isFetching,
    hasNextPage,
    isError,
    fetchNextPage,
    feed,
    feedType,
    feedItems.length,
  ])

  const onPressTryAgain = useCallback(() => {
    void refetch()
    onHasNew?.(false)
  }, [refetch, onHasNew])

  const onPressRetryLoadMore = useCallback(() => {
    void fetchNextPage()
  }, [fetchNextPage])

  // rendering
  // =

  const renderItem = useCallback(
    ({item: row, index: rowIndex}: ListRenderItemInfo<FeedRow>) => {
      if (row.type === 'empty') {
        return renderEmptyState()
      } else if (row.type === 'error') {
        return (
          <PostFeedErrorMessage
            feedDesc={feed}
            error={error ?? undefined}
            onPressTryAgain={onPressTryAgain}
            savedFeedConfig={savedFeedConfig}
          />
        )
      } else if (row.type === 'loadMoreError') {
        return (
          <LoadMoreRetryBtn
            label={l`There was an issue fetching posts. Tap here to try again.`}
            onPress={onPressRetryLoadMore}
          />
        )
      } else if (row.type === 'loading') {
        return <PostFeedLoadingPlaceholder />
      } else if (row.type === 'feedShutdownMsg') {
        return <FeedShutdownMsg feedUri={feedUriOrActorDid} />
      } else if (row.type === 'description') {
        return (
          <RichText
            value={row.value}
            style={[
              a.m_md,
              a.text_md,
              a.leading_snug,
              t.atoms.text_contrast_high,
            ]}
          />
        )
      } else if (row.type === 'interstitialFollows') {
        return <SuggestedFollows feed={feed} />
      } else if (row.type === 'interstitialProgressGuide') {
        return <ProgressGuide />
      } else if (row.type === 'interstitialTrending') {
        return <TrendingInterstitial />
      } else if (row.type === 'interstitialFeedTrendingTopics') {
        return (
          <FeedTrendingTopicsInterstitial feedSliceIndex={row.feedSliceIndex} />
        )
      } else if (row.type === 'liveEventFeedsAndTrendingBanner') {
        return <DiscoverFeedLiveEventFeedsAndTrendingBanner />
      } else if (row.type === 'composerPrompt') {
        return <ComposerPrompt />
      } else if (row.type === 'interstitialTrendingVideos') {
        return <TrendingVideosInterstitial />
      } else if (row.type === 'fallbackMarker') {
        // HACK
        // tell the user we fell back to discover
        // see home.ts (feed api) for more info
        // -prf
        return <DiscoverFallbackHeader />
      } else if (row.type === 'sliceItem') {
        const slice = row.slice
        const indexInSlice = row.indexInSlice
        const item = slice.items[indexInSlice]
        const localExplanation = localRanking.explanations.get(item.uri)
        return (
          <PostFeedItem
            post={item.post}
            localExplanation={localExplanation}
            record={item.record}
            postNumbering={item.postNumbering}
            reason={indexInSlice === 0 ? slice.reason : undefined}
            feedContext={slice.feedContext}
            reqId={slice.reqId}
            moderation={item.moderation}
            parentAuthor={item.parentAuthor}
            showReplyTo={row.showReplyTo}
            isThreadParent={isThreadParentAt(slice.items, indexInSlice)}
            isThreadChild={isThreadChildAt(slice.items, indexInSlice)}
            isThreadLastChild={
              isThreadChildAt(slice.items, indexInSlice) &&
              slice.items.length === indexInSlice + 1
            }
            isParentBlocked={item.isParentBlocked}
            isParentNotFound={item.isParentNotFound}
            hideTopBorder={rowIndex === 0 && indexInSlice === 0}
            rootPost={slice.items[0].post}
            onShowLess={onPressShowLess}
            providerProvenance={slice.providerProvenance}
            providerCompositionStatus={slice.providerCompositionStatus}
            providerIndependence={slice.providerIndependence}
          />
        )
      } else if (row.type === 'sliceViewFullThread') {
        return <ViewFullThread uri={row.uri} />
      } else if (row.type === 'videoGridRowPlaceholder') {
        return (
          <View>
            <PostFeedVideoGridRowPlaceholder />
            <PostFeedVideoGridRowPlaceholder />
            <PostFeedVideoGridRowPlaceholder />
          </View>
        )
      } else if (row.type === 'videoGridRow') {
        let sourceContext: VideoFeedSourceContext
        if (feedType === 'author') {
          sourceContext = {
            type: 'author',
            did: feedUriOrActorDid,
            filter: feedTab as AuthorFilter,
          }
        } else {
          sourceContext = {
            type: 'feedgen',
            uri: row.sourceFeedUri,
            sourceInterstitial: feedCacheKey ?? 'none',
          }
        }

        return (
          <PostFeedVideoGridRow
            items={row.items}
            sourceContext={sourceContext}
          />
        )
      } else if (row.type === 'showLessFollowup') {
        return <ShowLessFollowup />
      } else {
        return null
      }
    },
    [
      renderEmptyState,
      feed,
      error,
      onPressTryAgain,
      savedFeedConfig,
      l,
      onPressRetryLoadMore,
      feedType,
      feedUriOrActorDid,
      feedTab,
      feedCacheKey,
      onPressShowLess,
      t,
    ],
  )

  const shouldRenderEndOfFeed =
    !hasNextPage && !isEmpty && !isFetching && !isError && !!renderEndOfFeed
  const bottomBarOffset = useBottomBarOffset()
  const FeedFooter = useCallback(() => {
    /*
     * A bit of padding at the bottom of the feed as you scroll and when you
     * reach the end, so that content isn't cut off by the bottom of the
     * screen. On mobile web, also clear the fixed bottom bar; on native the
     * doubled headerOffset already covers the tab bar.
     */
    const offset =
      Math.max(headerOffset, 32) * (IS_WEB ? 1 : 2) +
      (IS_WEB ? bottomBarOffset : 0)

    return isFetchingNextPage ? (
      <View style={[styles.feedFooter]}>
        <ActivityIndicator />
        <View style={{height: offset}} />
      </View>
    ) : shouldRenderEndOfFeed ? (
      <View style={{minHeight: offset}}>{renderEndOfFeed()}</View>
    ) : (
      <View style={{height: offset}} />
    )
  }, [
    isFetchingNextPage,
    shouldRenderEndOfFeed,
    renderEndOfFeed,
    headerOffset,
    bottomBarOffset,
  ])

  const liveNowConfig = useLiveNowConfig()

  const seenActorWithStatusRef = useRef<Set<string>>(new Set())
  const seenPostUrisRef = useRef<Set<string>>(new Set())
  // Tracks every post we've seen so we can fire per-post events exactly once,
  // regardless of the post's position within its slice.
  const seenPerPostUrisRef = useRef<Set<string>>(new Set())

  // Helper to calculate position in feed (count only root posts, not interstitials or thread replies)
  const getPostPosition = useNonReactiveCallback(
    (type: FeedRow['type'], key: string) => {
      // Calculate position: find the row index in feedItems, then calculate position
      const rowIndex = feedItems.findIndex(
        row => row.type === 'sliceItem' && row.key === key,
      )

      if (rowIndex >= 0) {
        let position = 0
        for (let i = 0; i < rowIndex && i < feedItems.length; i++) {
          const row = feedItems[i]
          if (row.type === 'sliceItem') {
            // Only count root posts (indexInSlice === 0), not thread replies
            if (row.indexInSlice === 0) {
              position++
            }
          } else if (row.type === 'videoGridRow') {
            // Count each video in the grid row
            position += row.items.length
          }
        }
        return position
      }
    },
  )

  const onItemSeen = useCallback(
    (item: FeedRow) => {
      feedFeedback.onItemSeen(item)

      // Events that should fire exactly once for every new post, regardless of
      // its position within a slice or video grid row.
      const onPostSeen = (post: app.bsky.feed.defs.PostView) => {
        if (seenPerPostUrisRef.current.has(post.uri)) return
        seenPerPostUrisRef.current.add(post.uri)

        // Standard site embed view tracking
        if (
          bsky.isType(app.bsky.embed.external.view, post.embed) &&
          isStandardSiteEmbed(post.embed.external)
        ) {
          ax.metric('embed:standardSite:view', {url: post.embed.external.uri})
        }

        // Photo embed impression tracking
        if (
          bsky.isType(app.bsky.embed.images.view, post.embed) ||
          bsky.isType(app.bsky.embed.gallery.view, post.embed)
        ) {
          const totalImages = bsky.isType(
            app.bsky.embed.gallery.view,
            post.embed,
          )
            ? post.embed.items.filter(item =>
                bsky.isType(app.bsky.embed.gallery.viewImage, item),
              ).length
            : post.embed.images.length
          const useExpandedLayout = bsky.isType(
            app.bsky.embed.gallery.view,
            post.embed,
          )
            ? totalImages > 4
            : ax.features.enabled(ax.features.PostGalleryEmbedEnable)
          const layout =
            totalImages === 1
              ? 'single'
              : useExpandedLayout
                ? 'carousel'
                : 'grid'

          ax.metric('post:photoEmbed:impression', {
            layout,
            totalImages,
            postUri: post.uri,
            postAuthorDid: post.author.did,
            feedDescriptor: feedFeedback.feedDescriptor || feed,
          })
        }
      }

      // Track post:view events
      if (item.type === 'sliceItem') {
        const slice = item.slice
        const indexInSlice = item.indexInSlice
        const postItem = slice.items[indexInSlice]
        const post = postItem.post

        onPostSeen(post)

        // Only track the root post of each slice (index 0) to avoid double-counting thread items
        if (indexInSlice === 0 && !seenPostUrisRef.current.has(post.uri)) {
          seenPostUrisRef.current.add(post.uri)

          const position = getPostPosition('sliceItem', item.key)

          ax.metric('post:view', {
            uri: post.uri,
            authorDid: post.author.did,
            logContext: 'FeedItem',
            feedDescriptor: feedFeedback.feedDescriptor || feed,
            position,
          })
        }

        // Live status tracking (existing code)
        const actor = post.author
        if (
          actor.status &&
          isStatusValidForViewers(actor.status, liveNowConfig) &&
          isStatusStillActive(actor.status.expiresAt)
        ) {
          if (!seenActorWithStatusRef.current.has(actor.did)) {
            seenActorWithStatusRef.current.add(actor.did)
            ax.metric('live:view:post', {
              subject: actor.did,
              feed,
            })
          }
        }
      } else if (item.type === 'videoGridRow') {
        // Track each video in the grid row
        for (let i = 0; i < item.items.length; i++) {
          const postItem = item.items[i]
          const post = postItem.post

          if (!seenPostUrisRef.current.has(post.uri)) {
            seenPostUrisRef.current.add(post.uri)

            const position = getPostPosition('videoGridRow', item.key)

            ax.metric('post:view', {
              uri: post.uri,
              authorDid: post.author.did,
              logContext: 'FeedItem',
              feedDescriptor: feedFeedback.feedDescriptor || feed,
              position,
            })
          }
        }
      }
    },
    [feedFeedback, feed, liveNowConfig, getPostPosition, ax],
  )

  return (
    <View testID={testID} style={style}>
      <List
        testID={testID ? `${testID}-flatlist` : undefined}
        ref={scrollElRef}
        data={feedItems}
        keyExtractor={(item: FeedRow) => item.key}
        renderItem={renderItem}
        ListFooterComponent={FeedFooter}
        ListHeaderComponent={ListHeaderComponent}
        refreshing={isPTRing}
        onRefresh={() => void onRefresh()}
        headerOffset={headerOffset}
        progressViewOffset={progressViewOffset}
        contentContainerStyle={{
          minHeight: Dimensions.get('window').height * 1.5,
        }}
        onScrolledDownChange={handleScrolledDownChange}
        onEndReached={() => void onEndReached()}
        onEndReachedThreshold={2} // number of posts left to trigger load more
        removeClippedSubviews={true}
        extraData={extraData}
        desktopFixedHeight={
          desktopFixedHeightOffset ? desktopFixedHeightOffset : true
        }
        initialNumToRender={initialNumToRenderOverride ?? initialNumToRender}
        windowSize={9}
        maxToRenderPerBatch={IS_IOS ? 5 : 1}
        updateCellsBatchingPeriod={40}
        onItemSeen={onItemSeen}
      />
    </View>
  )
}
PostFeed = memo(PostFeed)
export {PostFeed}

const styles = StyleSheet.create({
  feedFooter: {paddingTop: 20},
})

export function isThreadParentAt<T>(arr: Array<T>, i: number) {
  if (arr.length === 1) {
    return false
  }
  return i < arr.length - 1
}

export function isThreadChildAt<T>(arr: Array<T>, i: number) {
  if (arr.length === 1) {
    return false
  }
  return i > 0
}
