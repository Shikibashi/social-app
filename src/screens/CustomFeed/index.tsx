import {useCallback, useEffect, useMemo, useState} from 'react'
import {useAnimatedRef} from 'react-native-reanimated'
import {useLingui} from '@lingui/react/macro'
import {
  type NavigationProp,
  useIsFocused,
  useNavigation,
} from '@react-navigation/native'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'
import {useQueryClient} from '@tanstack/react-query'

import {isBlueskyOwnedFeed} from '#/lib/api/feed/utils'
import {TRENDING_DID, TRENDING_HANDLE, VIDEO_FEED_URIS} from '#/lib/constants'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {useSetTitle} from '#/lib/hooks/useSetTitle'
import {
  type AllNavigatorParams,
  type CommonNavigatorParams,
} from '#/lib/routes/types'
import {cleanError} from '#/lib/strings/errors'
import {makeRecordUri} from '#/lib/strings/url-helpers'
import {listenSoftReset} from '#/state/events'
import {FeedFeedbackProvider, useFeedFeedback} from '#/state/feed-feedback'
import {useLocalFeedPreferences} from '#/state/preferences/local-feed'
import {
  type FeedSourceFeedInfo,
  useFeedSourceInfoQuery,
} from '#/state/queries/feed'
import {type FeedDescriptor, type FeedParams} from '#/state/queries/post-feed'
import {RQKEY as FEED_RQKEY} from '#/state/queries/post-feed'
import {
  usePreferencesQuery,
  type UsePreferencesQueryResponse,
} from '#/state/queries/preferences'
import {useResolveUriQuery} from '#/state/queries/resolve-uri'
import {truncateAndInvalidate} from '#/state/queries/util'
import {useSession} from '#/state/session'
import {PostFeed} from '#/view/com/posts/PostFeed'
import {EmptyState} from '#/view/com/util/EmptyState'
import {ErrorScreen} from '#/view/com/util/error/ErrorScreen'
import {FAB} from '#/view/com/util/fab/FAB'
import {type ListRef} from '#/view/com/util/List'
import {LoadLatestBtn} from '#/view/com/util/load-latest/LoadLatestBtn'
import {PostFeedLoadingPlaceholder} from '#/view/com/util/LoadingPlaceholder'
import {useTheme} from '#/alf'
import {ActiveFeedProvenance} from '#/components/FeedProvenanceCard'
import {EditBig_Stroke2_Corner2_Rounded as EditBigIcon} from '#/components/icons/EditBig'
import {HashtagWide_Stroke1_Corner0_Rounded as HashtagWideIcon} from '#/components/icons/Hashtag'
import * as Layout from '#/components/Layout'
import {IS_NATIVE} from '#/env'
import {app} from '#/lexicons'
import {
  CustomFeedHeader,
  CustomFeedHeaderSkeleton,
} from './components/CustomFeedHeader'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'CustomFeed'>
export function CustomFeedScreen(props: Props) {
  const {rkey, name: handleOrDid} = props.route.params

  const feedParams: FeedParams | undefined = props.route.params.feedCacheKey
    ? {feedCacheKey: props.route.params.feedCacheKey}
    : undefined
  const {t: l} = useLingui()

  const uri = useMemo(
    () => makeRecordUri(handleOrDid, 'app.bsky.feed.generator', rkey),
    [rkey, handleOrDid],
  )
  let {
    error,
    data: resolvedUri,
    refetch,
    isRefetching,
  } = useResolveUriQuery(uri)

  if (error && !isRefetching) {
    return (
      <Layout.Screen testID="customFeedScreenError">
        <ErrorScreen
          showHeader
          title={l`Could not load feed`}
          message={cleanError(error)}
          onPressTryAgain={() => void refetch()}
        />
      </Layout.Screen>
    )
  }

  return resolvedUri ? (
    <Layout.Screen testID="customFeedScreen">
      <CustomFeedScreenIntermediate
        feedUri={resolvedUri.uri}
        feedParams={feedParams}
      />
    </Layout.Screen>
  ) : (
    <Layout.Screen testID="customFeedScreen">
      <CustomFeedHeaderSkeleton />
      <Layout.Content>
        <PostFeedLoadingPlaceholder />
      </Layout.Content>
    </Layout.Screen>
  )
}

function CustomFeedScreenIntermediate({
  feedUri,
  feedParams,
}: {
  feedUri: string
  feedParams: FeedParams | undefined
}) {
  const {data: preferences} = usePreferencesQuery()
  const {data: info} = useFeedSourceInfoQuery({uri: feedUri})

  if (!preferences || !info) {
    return (
      <Layout.Content>
        <CustomFeedHeaderSkeleton />
        <PostFeedLoadingPlaceholder />
      </Layout.Content>
    )
  }

  return (
    <CustomFeedScreenInner
      preferences={preferences}
      feedInfo={info as FeedSourceFeedInfo}
      feedParams={feedParams}
    />
  )
}

export function CustomFeedScreenInner({
  feedInfo,
  feedParams,
}: {
  preferences: UsePreferencesQueryResponse
  feedInfo: FeedSourceFeedInfo
  feedParams: FeedParams | undefined
}) {
  const {t: l} = useLingui()
  const navigation = useNavigation<NavigationProp<AllNavigatorParams>>()
  const {hasSession} = useSession()
  const {preferences: localFeedPreferences} = useLocalFeedPreferences()
  const {openComposer} = useOpenComposer()
  const isScreenFocused = useIsFocused()
  const t = useTheme()

  useSetTitle(feedInfo?.displayName)

  const feed = `feedgen|${feedInfo.uri}` as FeedDescriptor

  const [hasNew, setHasNew] = useState(false)
  const [isScrolledDown, setIsScrolledDown] = useState(false)
  const queryClient = useQueryClient()
  const feedFeedback = useFeedFeedback(feedInfo, hasSession)
  const scrollElRef = useAnimatedRef() as ListRef

  const onScrollToTop = useCallback(() => {
    scrollElRef.current?.scrollToOffset({
      animated: IS_NATIVE,
      offset: 0, // -headerHeight,
    })
    void truncateAndInvalidate(queryClient, FEED_RQKEY(feed))
    setHasNew(false)
  }, [scrollElRef, queryClient, feed, setHasNew])

  useEffect(() => {
    if (!isScreenFocused) {
      return
    }
    return listenSoftReset(onScrollToTop)
  }, [onScrollToTop, isScreenFocused])

  const renderPostsEmpty = useCallback(() => {
    return (
      <EmptyState
        icon={HashtagWideIcon}
        iconSize="2xl"
        message={l`This feed is empty.`}
      />
    )
  }, [l])

  const isVideoFeed = useMemo(() => {
    const isBskyVideoFeed = VIDEO_FEED_URIS.includes(feedInfo.uri)
    const feedIsVideoMode =
      feedInfo.contentMode === app.bsky.feed.defs.contentModeVideo.value
    const _isVideoFeed = isBskyVideoFeed || feedIsVideoMode
    return IS_NATIVE && _isVideoFeed
  }, [feedInfo])

  const isTrending =
    feedInfo.creatorDid.toLowerCase() === TRENDING_DID ||
    feedInfo.creatorHandle.toLowerCase() === TRENDING_HANDLE
  const radlibCurationEnabled = Boolean(
    localFeedPreferences.radlibCuration?.enabled,
  )
  const contentFilterEnabled = Boolean(
    localFeedPreferences.contentFilterPolicy?.enabled,
  )

  return (
    <>
      <CustomFeedHeader info={feedInfo} isTrending={isTrending} />
      <ActiveFeedProvenance
        feedName={feedInfo.displayName}
        algorithmName={
          radlibCurationEnabled && contentFilterEnabled
            ? `Filtered ${feedInfo.displayName} + local curation`
            : contentFilterEnabled
              ? `Filtered ${feedInfo.displayName} (local content policy)`
              : radlibCurationEnabled
                ? `Local curation over ${feedInfo.displayName}`
                : 'Feed generator ranking'
        }
        algorithmVersion={
          radlibCurationEnabled && contentFilterEnabled
            ? 'content-filter/1 + local-curation/1'
            : contentFilterEnabled
              ? 'content-filter/1'
              : radlibCurationEnabled
                ? '1'
                : 'not declared'
        }
        objective={
          radlibCurationEnabled && contentFilterEnabled
            ? 'User-selected hard content exclusions plus a user-selected topic and exclusion overlay; follows, blocks, and ranking remain separate'
            : contentFilterEnabled
              ? 'User-selected hard content exclusions; follows, blocks, and ranking remain separate'
              : radlibCurationEnabled
                ? 'User-selected topic and exclusion overlay; no ideological quota'
                : 'Not declared by the feed source'
        }
        feedOwnerDid={feedInfo.creatorDid}
        feedUri={feedInfo.uri}
        privacy={
          radlibCurationEnabled && contentFilterEnabled
            ? 'Custom filter terms and curation state stay on this device; the selected provider supplies candidates'
            : contentFilterEnabled
              ? 'Custom terms and excluded authors stay on this device; the selected provider supplies candidates'
              : radlibCurationEnabled
                ? 'Local curation stays on this device; the selected provider supplies candidates'
                : isBlueskyOwnedFeed(feedInfo.uri)
                  ? 'Selected interests may be sent to this AppView'
                  : 'Local ranking preferences stay on this device'
        }
        onChangeRanking={() => navigation.navigate('PersonalizationSettings')}
        onChangeProvider={() =>
          navigation.navigate('ServicesSettings', {section: 'providers'})
        }
      />
      <FeedFeedbackProvider value={feedFeedback}>
        <PostFeed
          enabled
          description={isTrending ? feedInfo.description : undefined}
          feed={feed}
          feedParams={feedParams}
          pollInterval={60e3}
          disablePoll={hasNew}
          onHasNew={setHasNew}
          scrollElRef={scrollElRef}
          onScrolledDownChange={setIsScrolledDown}
          renderEmptyState={renderPostsEmpty}
          localFeedPreferences={localFeedPreferences}
          radlibCuration={localFeedPreferences.radlibCuration}
          contentFilterPolicy={localFeedPreferences.contentFilterPolicy}
          isVideoFeed={isVideoFeed}
        />
      </FeedFeedbackProvider>
      {(isScrolledDown || hasNew) && (
        <LoadLatestBtn
          onPress={onScrollToTop}
          label={l`Load new posts`}
          showIndicator={hasNew}
        />
      )}
      {hasSession && (
        <FAB
          testID="composeFAB"
          onPress={() => openComposer({logContext: 'Fab'})}
          icon={<EditBigIcon size="lg" fill={t.palette.white} />}
          accessibilityRole="button"
          accessibilityLabel={l`New post`}
          accessibilityHint=""
        />
      )}
    </>
  )
}
