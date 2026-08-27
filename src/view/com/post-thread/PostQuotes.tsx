import {useCallback, useState} from 'react'
import {moderatePost, type ModerationDecision} from '#/lib/moderation'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {useInitialNumToRender} from '#/lib/hooks/useInitialNumToRender'
import {usePostViewTracking} from '#/lib/hooks/usePostViewTracking'
import {cleanError} from '#/lib/strings/errors'
import {logger} from '#/logger'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {usePostQuotesQuery} from '#/state/queries/post-quotes'
import {stripNonLocalBlockVisibility} from '#/state/queries/public-visibility'
import {useResolveUriQuery} from '#/state/queries/resolve-uri'
import {Post} from '#/view/com/post/Post'
import {ListFooter, ListMaybePlaceholder} from '#/components/Lists'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {List} from '../util/List'

function renderItem({
  item,
  index,
}: {
  item: {
    post: app.bsky.feed.defs.PostView
    moderation: ModerationDecision
    record: app.bsky.feed.post.Main
  }
  index: number
}) {
  return <Post post={item.post} hideTopBorder={index === 0} />
}

function keyExtractor(item: {
  post: app.bsky.feed.defs.PostView
  moderation: ModerationDecision
  record: app.bsky.feed.post.Main
}) {
  return item.post.uri
}

export function PostQuotes({
  uri,
  quoteCount = 0,
}: {
  uri: string
  quoteCount?: number
}) {
  const {_} = useLingui()
  const initialNumToRender = useInitialNumToRender()
  const [isPTRing, setIsPTRing] = useState(false)
  const trackPostView = usePostViewTracking('PostQuotes')

  const {
    data: resolvedUri,
    error: resolveError,
    isLoading: isLoadingUri,
  } = useResolveUriQuery(uri)
  const {
    data,
    isLoading: isLoadingQuotes,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = usePostQuotesQuery(resolvedUri?.uri, quoteCount)

  const moderationOpts = useModerationOpts()

  const isError = Boolean(resolveError || error)

  const quotes =
    data?.pages
      .flatMap(page =>
        page.posts.map(post => {
          const visiblePost = stripNonLocalBlockVisibility(post)
          if (
            !bsky.isType(app.bsky.feed.post, visiblePost.record) ||
            !moderationOpts
          ) {
            return null
          }
          const moderation = moderatePost(visiblePost, moderationOpts)
          return {post: visiblePost, record: visiblePost.record, moderation}
        }),
      )
      .filter(item => item !== null) ?? []

  const onRefresh = useCallback(async () => {
    setIsPTRing(true)
    try {
      await refetch()
    } catch (err) {
      logger.error('Failed to refresh quotes', {message: err})
    }
    setIsPTRing(false)
  }, [refetch, setIsPTRing])

  const onEndReached = useCallback(async () => {
    if (isFetchingNextPage || !hasNextPage || isError) return
    try {
      await fetchNextPage()
    } catch (err) {
      logger.error('Failed to load more quotes', {message: err})
    }
  }, [isFetchingNextPage, hasNextPage, isError, fetchNextPage])

  const providerReportedMissingQuotes =
    quoteCount > 0 && !isLoadingUri && !isLoadingQuotes && !isError
  const emptyTitle = providerReportedMissingQuotes
    ? _(msg`Quotes unavailable from this provider`)
    : _(msg`No quotes yet`)
  const emptyMessage = providerReportedMissingQuotes
    ? _(
        msg`This service reports quotes for this post, but did not return their public records. Refresh or try another provider.`,
      )
    : _(msg`Nobody has quoted this yet. Maybe you should be the first!`)

  if (quotes.length < 1) {
    return (
      <ListMaybePlaceholder
        isLoading={isLoadingUri || isLoadingQuotes}
        isError={isError}
        emptyType="results"
        emptyTitle={emptyTitle}
        emptyMessage={emptyMessage}
        errorMessage={cleanError(resolveError || error)}
        sideBorders={false}
      />
    )
  }

  // loaded
  // =
  return (
    <List
      data={quotes}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      refreshing={isPTRing}
      onRefresh={onRefresh}
      onEndReached={onEndReached}
      onEndReachedThreshold={4}
      onItemSeen={item => trackPostView(item.post)}
      ListFooterComponent={
        <ListFooter
          isFetchingNextPage={isFetchingNextPage}
          error={cleanError(error)}
          onRetry={fetchNextPage}
          showEndMessage
          endMessageText={_(msg`That's all, folks!`)}
        />
      }
      desktopFixedHeight
      initialNumToRender={initialNumToRender}
      windowSize={11}
      sideBorders={false}
    />
  )
}
