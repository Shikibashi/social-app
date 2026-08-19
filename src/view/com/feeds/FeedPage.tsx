import {
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {type NavigationProp, useNavigation} from '@react-navigation/native'
import {useQueryClient} from '@tanstack/react-query'

import {isBlueskyOwnedFeed} from '#/lib/api/feed/utils'
import {DISCOVER_FEED_URI, VIDEO_FEED_URIS} from '#/lib/constants'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {getRootNavigation, getTabState, TabState} from '#/lib/routes/helpers'
import {type AllNavigatorParams} from '#/lib/routes/types'
import {listenSoftReset} from '#/state/events'
import {FeedFeedbackProvider, useFeedFeedback} from '#/state/feed-feedback'
import {useSetHomeBadge} from '#/state/home-badge'
import {useLocalFeedPreferences} from '#/state/preferences/local-feed'
import {type FeedSourceInfo} from '#/state/queries/feed'
import {
  type FeedDescriptor,
  type FeedParams,
  RQKEY as FEED_RQKEY,
} from '#/state/queries/post-feed'
import {truncateAndInvalidate} from '#/state/queries/util'
import {useSession} from '#/state/session'
import {PostFeed} from '#/view/com/posts/PostFeed'
import {FAB} from '#/view/com/util/fab/FAB'
import {type ListMethods} from '#/view/com/util/List'
import {LoadLatestBtn} from '#/view/com/util/load-latest/LoadLatestBtn'
import {MainScrollProvider} from '#/view/com/util/MainScrollProvider'
import {useTheme} from '#/alf'
import {ActiveFeedProvenance} from '#/components/FeedProvenanceCard'
import {useHeaderOffset} from '#/components/hooks/useHeaderOffset'
import {EditBig_Stroke2_Corner2_Rounded as EditBigIcon} from '#/components/icons/EditBig'
import {useAnalytics} from '#/analytics'
import {IS_NATIVE} from '#/env'
import {app} from '#/lexicons'

const POLL_FREQ = 60e3 // 60sec

export function FeedPage({
  testID,
  isPageFocused,
  isPageAdjacent,
  feed,
  feedParams,
  renderEmptyState,
  renderEndOfFeed,
  savedFeedConfig,
  feedInfo,
}: {
  testID?: string
  feed: FeedDescriptor
  feedParams?: FeedParams
  isPageFocused: boolean
  isPageAdjacent: boolean
  renderEmptyState: () => JSX.Element
  renderEndOfFeed?: () => JSX.Element
  savedFeedConfig?: app.bsky.actor.defs.SavedFeed
  feedInfo: FeedSourceInfo
}) {
  const {enabled: localFeedEnabled, preferences: localFeedPreferences} =
    useLocalFeedPreferences()
  const radlibCurationEnabled = Boolean(
    localFeedPreferences.radlibCuration?.enabled,
  )
  const contentFilterEnabled = Boolean(
    localFeedPreferences.contentFilterPolicy?.enabled,
  )
  const balancedEnabled =
    localFeedEnabled && localFeedPreferences.rankingPreset === 'balanced'
  const ax = useAnalytics()
  const {hasSession} = useSession()
  const {_} = useLingui()
  const navigation = useNavigation<NavigationProp<AllNavigatorParams>>()
  const queryClient = useQueryClient()
  const {openComposer} = useOpenComposer()
  const [isScrolledDown, setIsScrolledDown] = useState(false)
  const [feedContext, setFeedContext] = useState<string>()
  const headerOffset = useHeaderOffset()
  const feedFeedback = useFeedFeedback(feedInfo, hasSession)
  const scrollElRef = useRef<ListMethods>(null)
  const [hasNew, setHasNew] = useState(false)
  const setHomeBadge = useSetHomeBadge()
  const isVideoFeed = useMemo(() => {
    const isBskyVideoFeed = VIDEO_FEED_URIS.includes(feedInfo.uri)
    const feedIsVideoMode =
      feedInfo.contentMode === app.bsky.feed.defs.contentModeVideo.value
    const _isVideoFeed = isBskyVideoFeed || feedIsVideoMode
    return IS_NATIVE && _isVideoFeed
  }, [feedInfo])
  const t = useTheme()

  useEffect(() => {
    if (isPageFocused) {
      setHomeBadge(hasNew)
    }
  }, [isPageFocused, hasNew, setHomeBadge])

  const scrollToTop = useCallback(() => {
    scrollElRef.current?.scrollToOffset({
      animated: IS_NATIVE,
      offset: -headerOffset,
    })
  }, [headerOffset])

  const onSoftReset = useCallback(() => {
    const isScreenFocused =
      getTabState(getRootNavigation(navigation).getState(), 'Home') ===
      TabState.InsideAtRoot
    if (isScreenFocused && isPageFocused) {
      scrollToTop()
      truncateAndInvalidate(queryClient, FEED_RQKEY(feed))
      setHasNew(false)
      ax.metric('feed:refresh', {
        feedType: feed.split('|')[0],
        feedUrl: feed,
        reason: 'soft-reset',
      })
    }
  }, [ax, navigation, isPageFocused, scrollToTop, queryClient, feed])

  // fires when page within screen is activated/deactivated
  useEffect(() => {
    if (!isPageFocused) {
      return
    }
    return listenSoftReset(onSoftReset)
  }, [onSoftReset, isPageFocused])

  useEffect(() => {
    setFeedContext(undefined)
  }, [feed])

  const onPressCompose = useCallback(() => {
    openComposer({logContext: 'Fab'})
  }, [openComposer])

  const onPressLoadLatest = useCallback(() => {
    scrollToTop()
    truncateAndInvalidate(queryClient, FEED_RQKEY(feed))
    setHasNew(false)
    ax.metric('feed:refresh', {
      feedType: feed.split('|')[0],
      feedUrl: feed,
      reason: 'load-latest',
    })
  }, [ax, scrollToTop, feed, queryClient])

  const shouldPrefetch = IS_NATIVE && isPageAdjacent
  const isDiscoverFeed = feedInfo.uri === DISCOVER_FEED_URI
  return (
    <View
      testID={testID}
      // @ts-expect-error web only -sfn
      dataSet={{nosnippet: isDiscoverFeed ? '' : undefined}}>
      <MainScrollProvider>
        <ActiveFeedProvenance
          feedName={feedInfo.displayName}
          algorithmName={
            feed === 'following'
              ? balancedEnabled
                ? 'Balanced local algorithm (Following only)'
                : radlibCurationEnabled && contentFilterEnabled
                  ? 'Filtered Following + local curation'
                  : radlibCurationEnabled || contentFilterEnabled
                    ? contentFilterEnabled
                      ? 'Filtered Following (local content policy)'
                      : 'Local curation over Following'
                    : localFeedEnabled
                      ? 'Local Following reranker'
                      : 'Following / chronological'
              : radlibCurationEnabled && contentFilterEnabled
                ? `Filtered ${feedInfo.displayName} + local curation`
                : radlibCurationEnabled || contentFilterEnabled
                  ? contentFilterEnabled
                    ? `Filtered ${feedInfo.displayName} (local content policy)`
                    : `Local curation over ${feedInfo.displayName}`
                  : 'Feed generator ranking'
          }
          algorithmVersion={
            balancedEnabled
              ? 'balanced/1'
              : radlibCurationEnabled && contentFilterEnabled
                ? 'content-filter/1 + local-curation/1'
                : contentFilterEnabled
                  ? 'content-filter/1'
                  : radlibCurationEnabled
                    ? '1'
                    : 'not declared'
          }
          objective={
            balancedEnabled
              ? 'Bounded structural variety, freshness, explicit preferences, and exploration; no ideological quota'
              : radlibCurationEnabled && contentFilterEnabled
                ? 'User-selected hard content exclusions plus a user-selected topic and exclusion overlay; follows, blocks, and ranking remain separate'
                : contentFilterEnabled
                  ? 'User-selected hard content exclusions; follows, blocks, and ranking remain separate'
                  : radlibCurationEnabled
                    ? 'User-selected topic and exclusion overlay; no ideological quota'
                    : feed === 'following' && !localFeedEnabled
                      ? 'Chronological access'
                      : 'Not declared by the feed source'
          }
          feedOwnerDid={feedInfo.creatorDid}
          feedUri={feedInfo.uri}
          feedContext={feedContext}
          privacy={
            balancedEnabled
              ? 'Candidate posts are supplied by the selected provider; Balanced ordering and preferences stay on this device'
              : radlibCurationEnabled && contentFilterEnabled
                ? 'Custom filter terms and curation state stay on this device; the selected provider supplies candidates'
                : contentFilterEnabled
                  ? 'Custom terms and excluded authors stay on this device; the selected provider supplies candidates'
                  : radlibCurationEnabled
                    ? 'Local curation stays on this device; the selected provider supplies candidates'
                    : feed === 'following'
                      ? localFeedEnabled
                        ? 'Local reranking stays on this device'
                        : 'Chronological access; no local reranking is applied'
                      : isBlueskyOwnedFeed(feedInfo.uri)
                        ? 'Selected interests may be sent to this AppView'
                        : 'Local ranking preferences stay on this device'
          }
          onChangeRanking={() =>
            navigation.navigate(
              feed === 'following'
                ? 'PreferencesFollowingFeed'
                : 'PersonalizationSettings',
            )
          }
          onChangeProvider={() => navigation.navigate('ServicesSettings')}
        />
        <FeedFeedbackProvider value={feedFeedback}>
          <PostFeed
            testID={testID ? `${testID}-feed` : undefined}
            enabled={isPageFocused || shouldPrefetch}
            feed={feed}
            feedParams={feedParams}
            pollInterval={POLL_FREQ}
            disablePoll={hasNew || !isPageFocused}
            scrollElRef={scrollElRef}
            onScrolledDownChange={setIsScrolledDown}
            onHasNew={setHasNew}
            renderEmptyState={renderEmptyState}
            renderEndOfFeed={renderEndOfFeed}
            localRerank={localFeedEnabled && feed === 'following'}
            balancedMode={balancedEnabled && feed === 'following'}
            localFeedPreferences={localFeedPreferences}
            radlibCuration={localFeedPreferences.radlibCuration}
            contentFilterPolicy={localFeedPreferences.contentFilterPolicy}
            onFeedContext={setFeedContext}
            headerOffset={headerOffset}
            savedFeedConfig={savedFeedConfig}
            isVideoFeed={isVideoFeed}
          />
        </FeedFeedbackProvider>
      </MainScrollProvider>
      {(isScrolledDown || hasNew) && (
        <LoadLatestBtn
          onPress={onPressLoadLatest}
          label={_(msg`Load new posts`)}
          showIndicator={hasNew}
        />
      )}

      {hasSession && (
        <FAB
          testID="composeFAB"
          onPress={onPressCompose}
          icon={<EditBigIcon size="lg" fill={t.palette.white} />}
          accessibilityRole="button"
          accessibilityLabel={_(msg({message: `New post`, context: 'action'}))}
          accessibilityHint=""
        />
      )}
    </View>
  )
}
