import {useEffect, useState} from 'react'
import {StyleSheet, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'

import {FEEDBACK_FORM_URL, HELP_DESK_URL} from '#/lib/constants'
import {usePinnedFeedsInfos} from '#/state/queries/feed'
import {useSession} from '#/state/session'
import {useSelectedFeed} from '#/state/shell/selected-feed'
import {DesktopFeeds} from '#/view/shell/desktop/Feeds'
import {DesktopSearch} from '#/view/shell/desktop/Search'
import {SidebarTrendingTopics} from '#/view/shell/desktop/SidebarTrendingTopics'
import {
  atoms as a,
  useGutters,
  useLayoutBreakpoints,
  useTheme,
  web,
} from '#/alf'
import {AppLanguageDropdown} from '#/components/AppLanguageDropdown'
import {CENTER_COLUMN_OFFSET} from '#/components/Layout'
import {InlineLinkText} from '#/components/Link'
import {ProgressGuideList} from '#/components/ProgressGuide/List'
import {Text} from '#/components/Typography'
import {SidebarLiveEventFeedsBanner} from '#/features/liveEvents/components/SidebarLiveEventFeedsBanner'

function useWebQueryParams() {
  const navigation = useNavigation()
  const [params, setParams] = useState<Record<string, string>>({})

  useEffect(() => {
    return navigation.addListener('state', e => {
      try {
        const {state} = e.data
        const lastRoute = state.routes[state.routes.length - 1]
        setParams(lastRoute.params)
      } catch (err) {}
    })
  }, [navigation, setParams])

  return params
}

export function DesktopRightNav({routeName}: {routeName: string}) {
  const t = useTheme()
  const {_} = useLingui()
  const {hasSession, currentAccount} = useSession()
  const gutters = useGutters(['base', 0, 'base', 'wide'])
  const isSearchScreen = routeName === 'Search'
  const isMessagesRelatedScreen = routeName.startsWith('Messages')
  const webqueryParams = useWebQueryParams()
  const searchQuery = webqueryParams?.q
  const showExploreScreenDuplicatedContent =
    !isSearchScreen || (isSearchScreen && !!searchQuery)
  const {rightNavVisible, centerColumnOffset, leftNavMinimal} =
    useLayoutBreakpoints()

  if (!rightNavVisible || isMessagesRelatedScreen) {
    return null
  }

  const width = centerColumnOffset ? 250 : 300

  return (
    <View
      testID="plumbline-right-nav"
      style={[
        gutters,
        a.gap_lg,
        a.pr_2xs,
        web({
          position: 'fixed',
          left: '50%',
          transform: [
            {
              translateX: 300 + (centerColumnOffset ? CENTER_COLUMN_OFFSET : 0),
            },
            ...a.scrollbar_offset.transform,
          ],
          /**
           * Compensate for the right padding above (2px) to retain intended width.
           */
          width: width + gutters.paddingLeft + 2,
          maxHeight: '100vh',
        }),
      ]}>
      <DesktopWorkbenchInspector routeName={routeName} />
      {!isSearchScreen && <DesktopSearch />}

      {hasSession && (
        <>
          <DesktopFeeds />
          <ProgressGuideList />
        </>
      )}

      {showExploreScreenDuplicatedContent && <SidebarLiveEventFeedsBanner />}
      {showExploreScreenDuplicatedContent && <SidebarTrendingTopics />}

      <Text style={[a.leading_snug, t.atoms.text_contrast_low]}>
        {hasSession && (
          <>
            <InlineLinkText
              to={FEEDBACK_FORM_URL({
                email: currentAccount?.email,
                handle: currentAccount?.handle,
              })}
              style={[t.atoms.text_contrast_medium]}
              label={_(msg`Feedback`)}>
              {_(msg`Feedback`)}
            </InlineLinkText>
            <Text style={[t.atoms.text_contrast_low]}>{' ∙ '}</Text>
          </>
        )}
        <InlineLinkText
          to="/support/privacy"
          style={[t.atoms.text_contrast_medium]}
          label={_(msg`Privacy`)}>
          {_(msg`Privacy`)}
        </InlineLinkText>
        <Text style={[t.atoms.text_contrast_low]}>{' ∙ '}</Text>
        <InlineLinkText
          to="/support/tos"
          style={[t.atoms.text_contrast_medium]}
          label={_(msg`Terms`)}>
          {_(msg`Terms`)}
        </InlineLinkText>
        <Text style={[t.atoms.text_contrast_low]}>{' ∙ '}</Text>
        <InlineLinkText
          label={_(msg`Help`)}
          to={HELP_DESK_URL}
          style={[t.atoms.text_contrast_medium]}>
          {_(msg`Help`)}
        </InlineLinkText>
      </Text>

      {!hasSession && leftNavMinimal && (
        <View style={[a.w_full, {height: 32}]}>
          <AppLanguageDropdown />
        </View>
      )}
    </View>
  )
}

type WorkbenchInspectorContext = {
  route: string
  source: string
  rule: string
  control: string
  href: string
  action: string
}

function DesktopWorkbenchInspector({routeName}: {routeName: string}) {
  const {_} = useLingui()
  const t = useTheme()
  const {data: pinnedFeeds} = usePinnedFeedsInfos()
  const selectedFeed = useSelectedFeed()
  const activeFeed =
    pinnedFeeds?.find(feed => feed.feedDescriptor === selectedFeed) ??
    pinnedFeeds?.[0]

  let context: WorkbenchInspectorContext
  switch (routeName) {
    case 'Home':
      context = {
        route: activeFeed?.displayName || _(msg`Selected feed`),
        source: activeFeed?.creatorHandle
          ? `@${activeFeed.creatorHandle}`
          : _(msg`Configured read provider`),
        rule: _(msg`Pinned feed choice; feed ordering is provider-defined`),
        control: _(msg`Choose, compare, or remove feeds`),
        href: '/feeds',
        action: _(msg`Open feed settings`),
      }
      break
    case 'Profile':
      context = {
        route: _(msg`Profile`),
        source: _(msg`Account PDS and selected read providers`),
        rule: _(msg`Profile record, identity resolution, and local moderation`),
        control: _(msg`Inspect providers and identity evidence`),
        href: '/settings/services',
        action: _(msg`Open Services`),
      }
      break
    case 'ProfileFollowers':
      context = {
        route: _(msg`Followers`),
        source: _(msg`Profile record and graph read provider`),
        rule: _(msg`Follow records with local moderation and block boundaries`),
        control: _(msg`Compare providers or inspect the profile record`),
        href: '/settings/services',
        action: _(msg`Inspect graph providers`),
      }
      break
    case 'ProfileFollows':
      context = {
        route: _(msg`Following`),
        source: _(msg`Profile record and graph read provider`),
        rule: _(msg`Follow records with local moderation and block boundaries`),
        control: _(msg`Compare providers or inspect the profile record`),
        href: '/settings/services',
        action: _(msg`Inspect graph providers`),
      }
      break
    case 'ProfileKnownFollowers':
      context = {
        route: _(msg`Followers you know`),
        source: _(msg`Profile graph and viewer relationship provider`),
        rule: _(
          msg`Known relationship results with local moderation and blocks`,
        ),
        control: _(msg`Compare providers or inspect the profile record`),
        href: '/settings/services',
        action: _(msg`Inspect graph providers`),
      }
      break
    case 'ProfileLabelerLikedBy':
      context = {
        route: _(msg`Labeler liked by`),
        source: _(msg`Labeler service record and engagement read provider`),
        rule: _(msg`Like records with local moderation and block boundaries`),
        control: _(msg`Compare providers or inspect the labeler record`),
        href: '/settings/services',
        action: _(msg`Inspect engagement providers`),
      }
      break
    case 'ProfileList':
      context = {
        route: _(msg`List`),
        source: _(msg`List record and selected read provider`),
        rule: _(msg`List purpose, member records, and local moderation`),
        control: _(msg`Compare providers or inspect the list record`),
        href: '/settings/services',
        action: _(msg`Inspect list providers`),
      }
      break
    case 'PostThread':
      context = {
        route: _(msg`Post thread`),
        source: _(msg`Author repository and thread read providers`),
        rule: _(msg`Thread composition and local moderation rules`),
        control: _(msg`Compare providers or change local rules`),
        href: '/settings/services',
        action: _(msg`Inspect providers`),
      }
      break
    case 'PostLikedBy':
      context = {
        route: _(msg`Liked by`),
        source: _(msg`Post record and engagement read provider`),
        rule: _(msg`Like records with local moderation and block boundaries`),
        control: _(msg`Compare providers or inspect the post record`),
        href: '/settings/services',
        action: _(msg`Inspect engagement providers`),
      }
      break
    case 'PostRepostedBy':
      context = {
        route: _(msg`Reposted by`),
        source: _(msg`Post record and engagement read provider`),
        rule: _(msg`Repost records with local moderation and block boundaries`),
        control: _(msg`Compare providers or inspect the post record`),
        href: '/settings/services',
        action: _(msg`Inspect engagement providers`),
      }
      break
    case 'PostQuotes':
      context = {
        route: _(msg`Quotes`),
        source: _(msg`Quoted-post records and thread read providers`),
        rule: _(
          msg`Quote visibility with local moderation and block boundaries`,
        ),
        control: _(msg`Compare providers or inspect the quote records`),
        href: '/settings/services',
        action: _(msg`Inspect thread providers`),
      }
      break
    case 'CustomFeed':
      context = {
        route: _(msg`Custom feed`),
        source: _(msg`Feed generator and selected read provider`),
        rule: _(msg`Generator ordering and local feed policy`),
        control: _(msg`Inspect, compare, or change the feed provider`),
        href: '/settings/services',
        action: _(msg`Inspect feed providers`),
      }
      break
    case 'CustomFeedLikedBy':
      context = {
        route: _(msg`Feed liked by`),
        source: _(msg`Feed generator record and engagement read provider`),
        rule: _(msg`Like records for this feed with local moderation`),
        control: _(msg`Compare providers or inspect the feed record`),
        href: '/settings/services',
        action: _(msg`Inspect engagement providers`),
      }
      break
    case 'Moderation':
    case 'ModerationInbox':
      context = {
        route: _(msg`Moderation & Reach`),
        source: _(msg`Labelers and attributable assertions`),
        rule: _(msg`Your moderation and reach policy`),
        control: _(msg`Change the client action without erasing the source`),
        href: '/moderation',
        action: _(msg`Open Moderation & Reach`),
      }
      break
    case 'ServicesSettings':
      context = {
        route: _(msg`Services`),
        source: _(msg`Declared providers and identity services`),
        rule: _(msg`User-selected capability and reconciliation policy`),
        control: _(msg`Inspect, change, export, or reset a boundary`),
        href: '/settings/services',
        action: _(msg`Open service workbench`),
      }
      break
    case 'IdentitySovereigntySettings':
      context = {
        route: 'Identity & recovery',
        source: 'DID record, repository PDS, and recovery custody',
        rule: 'Identity continuity is distinct from repository hosting; local custody and session authority remain explicit',
        control: 'Export, back up, migrate, or revoke sessions',
        href: '/settings/identity-sovereignty',
        action: 'Inspect identity and recovery',
      }
      break
    case 'PersonalizationSettings':
      context = {
        route: 'Attention & policy',
        source: 'Local attention policy and portable preferences',
        rule: 'Your explicit choices outrank bounded local inference and provider defaults',
        control: 'Export, import, reset, or replace policy',
        href: '/settings/personalization',
        action: 'Inspect attention policy',
      }
      break
    case 'Search':
      context = {
        route: _(msg`Search`),
        source: _(msg`Selected search provider`),
        rule: _(msg`Query and provider reconciliation policy`),
        control: _(msg`Change the read provider in Services`),
        href: '/settings/services',
        action: _(msg`Change search provider`),
      }
      break
    case 'Feeds':
      context = {
        route: _(msg`Feeds`),
        source: _(msg`Feed generators, lists, and account preferences`),
        rule: _(msg`Saved-feed order and moderation policy`),
        control: _(msg`Pin, reorder, compare, or remove`),
        href: '/feeds',
        action: _(msg`Configure feeds`),
      }
      break
    case 'Lists':
      context = {
        route: _(msg`Lists`),
        source: _(msg`Account repository and list read provider`),
        rule: _(msg`Authored list records and local moderation`),
        control: _(msg`Create, edit, compare, or remove lists`),
        href: '/settings/services',
        action: _(msg`Inspect list providers`),
      }
      break
    case 'Bookmarks':
      context = {
        route: _(msg`Saved Posts`),
        source: _(msg`Bookmark service and author repositories`),
        rule: _(msg`Your saved-post collection and local moderation`),
        control: _(msg`Refresh, inspect, or remove saved posts`),
        href: '/settings/services',
        action: _(msg`Inspect saved-post services`),
      }
      break
    case 'SavedFeeds':
      context = {
        route: _(msg`Saved feeds`),
        source: _(msg`Account preference repository`),
        rule: _(msg`Pinned order and saved-feed selection`),
        control: _(msg`Reorder, compare, or remove feed preferences`),
        href: '/settings/saved-feeds',
        action: _(msg`Edit saved feeds`),
      }
      break
    case 'Notifications':
      context = {
        route: _(msg`Notifications`),
        source: _(msg`Notification service`),
        rule: _(msg`Filter who you receive notifications from`),
        control: _(msg`Notification settings`),
        href: '/settings/notifications',
        action: _(msg`Notification settings`),
      }
      break
    case 'CommunityBoard':
      context = {
        route: _(msg`Communities`),
        source: _(msg`Spaces transport and community authority`),
        rule: _(
          msg`Membership and community records use the declared Spaces/Radlib transport, not AppView fan-out.`,
        ),
        control: _(msg`Inspect, change, export, or reset a boundary`),
        href: '/settings/services',
        action: _(msg`Open Services`),
      }
      break
    default:
      context = {
        route: routeName,
        source: _(msg`Current surface providers`),
        rule: _(msg`Configured local policy`),
        control: _(msg`Inspect the service boundary`),
        href: '/settings/services',
        action: _(msg`Inspect Services`),
      }
  }

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={_(msg`Workbench inspector`)}
      accessibilityHint={_(
        msg`Shows the provider, rule, and control for this surface`,
      )}
      testID="plumbline-workbench-inspector"
      style={[
        styles.inspector,
        t.atoms.bg,
        t.atoms.border_contrast_low,
        web({borderRadius: 1}),
      ]}>
      <Text accessibilityRole="header" style={styles.inspectorTitle}>
        {_(msg`Inspector`)}
      </Text>
      <Text
        testID="plumbline-workbench-inspector-route"
        style={[styles.inspectorRoute, t.atoms.text]}>
        {context.route}
      </Text>
      <InspectorDetail
        testID="plumbline-workbench-inspector-source"
        label={_(msg`Source`)}
        value={context.source}
      />
      <InspectorDetail
        testID="plumbline-workbench-inspector-rule"
        label={_(msg`Rule`)}
        value={context.rule}
      />
      <InspectorDetail
        testID="plumbline-workbench-inspector-control"
        label={_(msg`Control`)}
        value={context.control}
      />
      <InlineLinkText
        to={context.href}
        label={context.action}
        style={[styles.inspectorAction, t.atoms.text_link]}>
        {context.action}
      </InlineLinkText>
    </View>
  )
}

function InspectorDetail({
  testID,
  label,
  value,
}: {
  testID: string
  label: string
  value: string
}) {
  return (
    <Text testID={testID} style={styles.inspectorDetail}>
      <Text style={styles.inspectorLabel}>{label}: </Text>
      {value}
    </Text>
  )
}

const styles = StyleSheet.create({
  inspector: {
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  inspectorTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  inspectorRoute: {
    fontSize: 15,
    fontWeight: '700',
    paddingBottom: 2,
  },
  inspectorDetail: {
    fontSize: 12,
    lineHeight: 16,
  },
  inspectorLabel: {
    fontWeight: '700',
  },
  inspectorAction: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
})
