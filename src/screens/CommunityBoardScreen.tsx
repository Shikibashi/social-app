import {useEffect, useMemo, useState} from 'react'
import {Alert, TextInput, View} from 'react-native'
import {type Client, type LexMap} from '@atproto/lex'
import {type NsidString} from '@atproto/syntax'
import {RichText} from '@bsky/sdk/richtext'
import {useNavigation} from '@react-navigation/native'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  createRadlibAuthorityClient,
  createSpaceCredentialSession,
} from '#/lib/atproto/spaces'
import {
  type CommunityDirectoryComposition,
  type CommunityDirectoryEntry,
  type CommunityDirectorySource,
  composeCommunityDirectory,
} from '#/lib/atproto/spaces/community-directory'
import {
  readAllSpaceRecords,
  type SpaceFanoutRecord,
} from '#/lib/atproto/spaces/fanout'
import {writePrivateTextPost} from '#/lib/permissioned-data'
import {
  type CommonNavigatorParams,
  type NavigationProp,
} from '#/lib/routes/types'
import {usePdsClient, useSession, useSessionApi} from '#/state/session'
import {assertOAuthFeatureGranted} from '#/state/session/oauth-authority'
import {useEnsureOAuthFeature} from '#/state/session/oauth-feature-gate'
import {hasOAuthFeature} from '#/state/session/oauth-scopes'
import {resolvePdsEndpointForDid} from '#/state/session/pds-resolution'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {H1, H2, H3, Text} from '#/components/Typography'
import {SPACES_ALPHA_ENABLED} from '#/env'
import {us} from '#/lexicons'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'CommunityBoard'>

type Community = CommunityDirectoryEntry
type CommunityVisibility = NonNullable<Community['visibility']>

type CommunityPage = {
  spaces: Community[]
  cursor?: string
}

type CommunityDeletionResult = {
  deleted: Community[]
  remaining: Community[]
  error?: unknown
}

type CommunityDirectoryFilter = 'all' | 'named' | 'owned'

type CommunityTab = 'threads' | 'latest' | 'members' | 'about'
type ComposerMode = 'topic' | 'reply'

type ForumColors = {
  canvas: string
  workspace: string
  surface: string
  recessed: string
  raised: string
  input: string
  ink: string
  secondary: string
  muted: string
  border: string
  borderStrong: string
  accent: string
  positive: string
  negative: string
}

type CommunityThread = {
  key: string
  root: SpaceFanoutRecord
  replies: SpaceFanoutRecord[]
}

type MembershipMutation = {
  isPending: boolean
  mutateAsync: (leave: boolean) => Promise<unknown>
}

const POST_COLLECTION = 'us.edriffles.radlib.private.post' as NsidString
const LEGACY_POST_COLLECTION = 'org.radlib.private.post' as NsidString

function postCollectionsForSpace(space: string): readonly NsidString[] {
  return space.includes('/space/org.radlib.community/')
    ? [LEGACY_POST_COLLECTION, POST_COLLECTION]
    : [POST_COLLECTION]
}

async function readCommunityDirectory(
  client: Client,
): Promise<readonly CommunityDirectoryEntry[]> {
  const spaces: CommunityDirectoryEntry[] = []
  let cursor: string | undefined
  const seenCursors = new Set<string>()
  do {
    const page = (await client.call(
      us.edriffles.radlib.private.listCommunities,
      {
        limit: 100,
        ...(cursor ? {cursor} : {}),
      },
    )) as CommunityPage
    spaces.push(...page.spaces)
    if (!page.cursor || seenCursors.has(page.cursor)) break
    seenCursors.add(page.cursor)
    cursor = page.cursor
  } while (cursor)
  return spaces
}

async function readAuthorityCommunityDirectory(
  client: Client,
  requestedSpace: string,
  authorityEndpoint: string | undefined,
): Promise<readonly CommunityDirectoryEntry[]> {
  const authorityClient = await createRadlibAuthorityClient(
    client,
    requestedSpace,
    us.edriffles.radlib.private.listCommunities.$lxm,
    () => Promise.resolve(authorityEndpoint),
  )
  const spaces = [...(await readCommunityDirectory(authorityClient))]
  if (!spaces.some(item => item.uri === requestedSpace)) {
    spaces.push(
      (await authorityClient.call(us.edriffles.radlib.private.getSpace, {
        space: requestedSpace,
      })) as CommunityDirectoryEntry,
    )
  }
  return spaces
}

export function CommunityBoardScreen({route}: Props) {
  const client = usePdsClient()
  const {currentAccount} = useSession()
  const {refreshSession} = useSessionApi()
  const ensureOAuthFeature = useEnsureOAuthFeature()
  const navigation = useNavigation<NavigationProp>()
  const queryClient = useQueryClient()
  const {gtMobile} = useBreakpoints()
  const t = useTheme()
  const requestedSpace = route.params?.space
  const [text, setText] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [status, setStatus] = useState<string>()
  const [composerMode, setComposerMode] = useState<ComposerMode>()
  const [activeTab, setActiveTab] = useState<CommunityTab>('threads')
  const [selectedTopicKey, setSelectedTopicKey] = useState<string>()
  const [topicSearch, setTopicSearch] = useState('')
  const [communitySearch, setCommunitySearch] = useState('')
  const [communityFilter, setCommunityFilter] =
    useState<CommunityDirectoryFilter>('named')
  const [deleteAllArmed, setDeleteAllArmed] = useState(false)
  const [createCommunityOpen, setCreateCommunityOpen] = useState(false)
  const [communityName, setCommunityName] = useState('')
  const [communityDescription, setCommunityDescription] = useState('')
  const [communityVisibility, setCommunityVisibility] =
    useState<CommunityVisibility>('private')
  const [membershipStates, setMembershipStates] = useState<
    Record<string, string>
  >({})
  const spacesAuthorizationRequired =
    currentAccount?.authType === 'oauth' &&
    !hasOAuthFeature(currentAccount.oauthScopes, 'spaces')

  const colors: ForumColors = {
    canvas: t.palette.contrast_0,
    workspace: t.palette.contrast_25,
    surface: t.palette.contrast_50,
    recessed: t.palette.contrast_100,
    raised: t.palette.contrast_50,
    input: t.palette.contrast_25,
    ink: t.palette.contrast_700,
    secondary: t.palette.contrast_500,
    muted: t.palette.contrast_400,
    border: t.palette.contrast_200,
    borderStrong: t.palette.contrast_300,
    accent: t.palette.pink,
    positive: t.palette.positive_500,
    negative: t.palette.negative_500,
  }

  const communitySpacesQuery = useQuery({
    queryKey: ['radlib-community-spaces', client.did, requestedSpace],
    enabled: !!client.did && SPACES_ALPHA_ENABLED,
    queryFn: async ({signal}) => {
      const accountPdsEndpoint =
        currentAccount?.pdsUrl ??
        (client.service && client.service.startsWith('http')
          ? client.service
          : await resolvePdsEndpointForDid(client.did!))
      const accountSource: CommunityDirectorySource = {
        id: `account-pds:${client.did}`,
        displayName: 'Account PDS community directory',
        endpoint: accountPdsEndpoint ?? 'account-pds:session-routed',
        kind: 'account-pds',
        read: () => readCommunityDirectory(client),
      }
      const sources: CommunityDirectorySource[] = [accountSource]

      // A member's own PDS does not host the authority's Radlib control DB.
      // Add a deep-linked authority as a second, narrowly-scoped directory
      // source. The composition result retains outages and disagreements
      // instead of silently making either source sovereign.
      const authorityDid = requestedSpace
        ? parseSpaceAuthority(requestedSpace)
        : undefined
      if (requestedSpace && authorityDid && authorityDid !== client.did) {
        const authorityEndpoint = await resolvePdsEndpointForDid(authorityDid)
        sources.push({
          id: `community-authority-pds:${authorityDid}`,
          displayName: 'Deep-linked community authority PDS',
          endpoint: authorityEndpoint ?? `community-authority:${authorityDid}`,
          serviceDid: authorityDid,
          kind: 'community-authority-pds',
          read: () =>
            readAuthorityCommunityDirectory(
              client,
              requestedSpace,
              authorityEndpoint,
            ),
        })
      }

      return composeCommunityDirectory(sources, {signal})
    },
  })

  const space =
    requestedSpace ?? communitySpacesQuery.data?.spaces[0]?.uri ?? ''
  const membershipState = membershipStates[space]

  const communityQuery = useQuery({
    queryKey: ['radlib-community', client.did, space],
    enabled: !!client.did && !!space && SPACES_ALPHA_ENABLED,
    queryFn: async () => {
      const authorityDid = parseSpaceAuthority(space)
      const controlClient =
        authorityDid === client.did
          ? client
          : await createRadlibAuthorityClient(
              client,
              space,
              us.edriffles.radlib.private.getSpace.$lxm,
            )
      return controlClient.call(us.edriffles.radlib.private.getSpace, {
        space,
      }) as Promise<Community>
    },
  })

  const notesQuery = useQuery({
    queryKey: ['radlib-community-board', client.did, space],
    enabled:
      !!client.did &&
      !!space &&
      SPACES_ALPHA_ENABLED &&
      !spacesAuthorizationRequired,
    queryFn: async () => {
      const session = await createSpaceCredentialSession(client, space)
      const reader = {
        listRepos: session.client.listRepos.bind(session.client),
        listRecords: session.client.listRecords.bind(session.client),
        readerForRepo: session.forRepo,
      }
      const results = await Promise.all(
        postCollectionsForSpace(space).map(collection =>
          readAllSpaceRecords(reader, {space, collection}),
        ),
      )
      return {
        records: results.flatMap(result => result.records),
        errors: results.flatMap(result => result.errors),
        complete: results.every(result => result.complete),
      }
    },
  })

  const communityMutation = useMutation({
    mutationFn: async () => {
      assertOAuthFeatureGranted(await ensureOAuthFeature('spaces'), 'spaces')
      return client.call(us.edriffles.radlib.private.createCommunity, {
        name: communityName.trim(),
        description: communityDescription.trim() || undefined,
        visibility: communityVisibility,
      })
    },
    onSuccess: result => {
      setCommunityName('')
      setCommunityDescription('')
      setCommunityVisibility('private')
      setCreateCommunityOpen(false)
      setStatus('Community created. Opening it now.')
      void queryClient.invalidateQueries({
        queryKey: ['radlib-community-spaces', client.did],
      })
      navigation.replace('CommunityBoard', {space: result.uri})
    },
    onError: error => {
      Alert.alert(
        'Could not create community',
        error instanceof Error ? error.message : String(error),
      )
    },
  })

  const membershipMutation = useMutation({
    mutationFn: async (leave: boolean) => {
      assertOAuthFeatureGranted(await ensureOAuthFeature('spaces'), 'spaces')
      const authorityDid = parseSpaceAuthority(space)
      const controlClient =
        authorityDid === client.did
          ? client
          : await createRadlibAuthorityClient(
              client,
              space,
              leave
                ? us.edriffles.radlib.private.leaveCommunity.$lxm
                : us.edriffles.radlib.private.joinCommunity.$lxm,
            )
      return leave
        ? controlClient.call(us.edriffles.radlib.private.leaveCommunity, {
            space,
          })
        : controlClient.call(us.edriffles.radlib.private.joinCommunity, {
            space,
            inviteToken: inviteToken.trim() || undefined,
          })
    },
    onSuccess: result => {
      setMembershipStates(states => ({...states, [space]: result.state}))
      setStatus(`Membership: ${formatMembershipState(result.state)}`)
      void queryClient.invalidateQueries({
        queryKey: ['radlib-community-board', client.did, space],
      })
    },
    onError: error => {
      Alert.alert(
        'Community membership unavailable',
        error instanceof Error ? error.message : String(error),
      )
    },
  })

  const deleteCommunitiesMutation = useMutation({
    mutationFn: async (
      targets: Community[],
    ): Promise<CommunityDeletionResult> => {
      assertOAuthFeatureGranted(await ensureOAuthFeature('spaces'), 'spaces')
      const deleted: Community[] = []

      for (const target of targets) {
        try {
          // The client-side inventory is only a confirmation aid. The PDS
          // repeats this owner check and refuses every non-community target.
          if (
            target.kind !== 'community' ||
            target.ownerDid !== client.did ||
            !target.uri
          ) {
            throw new Error('Deletion target is not owned by this account')
          }

          const authorityDid = parseSpaceAuthority(target.uri)
          const controlClient =
            authorityDid === client.did
              ? client
              : await createRadlibAuthorityClient(
                  client,
                  target.uri,
                  us.edriffles.radlib.private.deleteCommunity.$lxm,
                )
          await controlClient.call(
            us.edriffles.radlib.private.deleteCommunity,
            {
              space: target.uri,
            },
          )
          deleted.push(target)
        } catch (error) {
          return {
            deleted,
            remaining: targets.slice(deleted.length),
            error,
          }
        }
      }

      return {deleted, remaining: []}
    },
    onSuccess: result => {
      setDeleteAllArmed(false)
      void queryClient.invalidateQueries({
        queryKey: ['radlib-community-spaces', client.did],
      })

      if (result.error) {
        const message =
          result.error instanceof Error
            ? result.error.message
            : 'The server rejected one deletion.'
        setStatus(
          `Cleanup stopped after ${result.deleted.length} deletion${
            result.deleted.length === 1 ? '' : 's'
          }. ${result.remaining.length} target${
            result.remaining.length === 1 ? '' : 's'
          } remain. ${message}`,
        )
      } else {
        setStatus(
          `Deleted ${result.deleted.length} owned communit${
            result.deleted.length === 1 ? 'y' : 'ies'
          }. Ready to start from scratch.`,
        )
      }

      if (result.deleted.some(item => item.uri === space)) {
        navigation.replace('CommunityBoard', {
          space: result.remaining[0]?.uri,
        })
      }
    },
  })

  const records = notesQuery.data?.records
  const threadList = useMemo(() => buildThreads(records ?? []), [records])
  const selectedThread = threadList.find(
    thread => thread.key === selectedTopicKey,
  )
  const filteredThreads = useMemo(() => {
    const query = topicSearch.trim().toLocaleLowerCase()
    if (!query) return threadList
    return threadList.filter(thread => {
      const title = topicTitle(thread.root).toLocaleLowerCase()
      const body = formatPostText(thread.root).toLocaleLowerCase()
      return title.includes(query) || body.includes(query)
    })
  }, [threadList, topicSearch])
  const latestActivities = useMemo(() => {
    return filteredThreads
      .flatMap(thread =>
        [thread.root, ...thread.replies].map(record => ({record, thread})),
      )
      .sort((left, right) => compareRecords(left.record, right.record))
  }, [filteredThreads])

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!space.trim()) throw new Error('Community space is unavailable')
      assertOAuthFeatureGranted(await ensureOAuthFeature('spaces'), 'spaces')
      const selectedThread = threadList.find(
        thread => thread.key === selectedTopicKey,
      )
      const reply =
        composerMode === 'reply' && selectedThread
          ? buildReplyReference(selectedThread)
          : undefined
      if (composerMode === 'reply' && !reply) {
        throw new Error('The selected topic is no longer available')
      }
      return writePrivateTextPost(
        client,
        space,
        new RichText({text: text.trim()}),
        ['en'],
        undefined,
        reply,
      )
    },
    onSuccess: () => {
      const wasReply = composerMode === 'reply'
      setText('')
      setComposerMode(undefined)
      setStatus(wasReply ? 'Reply posted in this community.' : 'Topic posted.')
      void queryClient.invalidateQueries({
        queryKey: ['radlib-community-board', client.did, space],
      })
    },
    onError: error => {
      Alert.alert(
        composerMode === 'reply'
          ? 'Could not post reply'
          : 'Could not post topic',
        error instanceof Error ? error.message : String(error),
      )
    },
  })

  const community =
    communityQuery.data ??
    communitySpacesQuery.data?.spaces.find(item => item.uri === space)
  const communities =
    communitySpacesQuery.data?.spaces ?? (community ? [community] : [])
  const ownedCommunities = useMemo(
    () =>
      communities.filter(
        item =>
          item.kind === 'community' &&
          item.ownerDid === client.did &&
          Boolean(item.uri),
      ),
    [client.did, communities],
  )
  const orderedCommunities = useMemo(
    () =>
      [...communities].sort((left, right) => {
        const leftSelected = left.uri === space
        const rightSelected = right.uri === space
        if (leftSelected !== rightSelected) return leftSelected ? -1 : 1

        const leftOwned = left.ownerDid === client.did
        const rightOwned = right.ownerDid === client.did
        if (leftOwned !== rightOwned) return leftOwned ? -1 : 1

        const createdOrder = communityDate(right).localeCompare(
          communityDate(left),
        )
        if (createdOrder !== 0) return createdOrder
        return communityLabel(left).localeCompare(communityLabel(right))
      }),
    [client.did, communities, space],
  )
  const visibleCommunities = useMemo(() => {
    const search = communitySearch.trim().toLocaleLowerCase()
    return orderedCommunities.filter(item => {
      const isSelected = item.uri === space
      const isOwned = item.ownerDid === client.did
      const isNamed = Boolean(item.name?.trim())
      const matchesFilter =
        communityFilter === 'all' ||
        (communityFilter === 'named' ? isNamed : isOwned) ||
        isSelected
      const searchableText = [item.name, item.description, item.uri]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
      return matchesFilter && (!search || searchableText.includes(search))
    })
  }, [client.did, communityFilter, communitySearch, orderedCommunities, space])
  const boardIndexUnavailable = communitySpacesQuery.isError && !community
  const spaceAuthority =
    community?.authorityDid || parseSpaceAuthoritySafe(space)
  const isOwner = community?.ownerDid === client.did
  const needsInviteToken =
    !isOwner &&
    (community?.visibility === 'private' ||
      community?.visibility === 'invite-only')

  useEffect(() => {
    setActiveTab('threads')
    setSelectedTopicKey(undefined)
    setComposerMode(undefined)
    setText('')
    setTopicSearch('')
    setDeleteAllArmed(false)
  }, [space])

  async function refreshCommunityIndex() {
    try {
      await refreshSession()
      const result = await communitySpacesQuery.refetch()
      if (result.isError) {
        throw result.error ?? new Error('Community index refresh failed')
      }
      setStatus('Community index refreshed.')
    } catch (error) {
      Alert.alert(
        'Could not refresh community index',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  async function reviewOwnedCommunityDeletion() {
    try {
      const result = await communitySpacesQuery.refetch()
      if (result.isError) {
        throw result.error ?? new Error('Community inventory refresh failed')
      }
      setDeleteAllArmed(true)
    } catch (error) {
      Alert.alert(
        'Could not prepare community deletion',
        error instanceof Error
          ? error.message
          : 'The community inventory could not be refreshed.',
      )
    }
  }

  async function refreshTopics() {
    const result = await notesQuery.refetch()
    if (result.isError) {
      Alert.alert(
        'Could not refresh topics',
        result.error instanceof Error
          ? result.error.message
          : String(result.error),
      )
    } else {
      setStatus('Topics refreshed.')
    }
  }

  function openTopic(thread: CommunityThread) {
    setSelectedTopicKey(thread.key)
    setActiveTab('threads')
    setComposerMode(undefined)
  }

  function openTopicComposer() {
    if (spacesAuthorizationRequired) {
      navigation.navigate('ServicesSettings', {section: 'authorization'})
      return
    }
    setSelectedTopicKey(undefined)
    setActiveTab('threads')
    setComposerMode('topic')
  }

  function openReplyComposer() {
    if (spacesAuthorizationRequired) {
      navigation.navigate('ServicesSettings', {section: 'authorization'})
      return
    }
    if (!selectedThread) return
    setComposerMode('reply')
  }

  return (
    <Layout.Screen ecwMode="workbench">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Communities</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content
        contentContainerStyle={{
          paddingHorizontal: gtMobile ? 16 : 12,
          paddingBottom: 56,
          backgroundColor: colors.canvas,
        }}>
        {!SPACES_ALPHA_ENABLED ? (
          <View style={[a.p_lg, a.gap_sm, {backgroundColor: colors.surface}]}>
            <H2 style={{color: colors.ink}}>Communities are offline</H2>
            <Text style={{color: colors.secondary}}>
              Community spaces require the Spaces alpha transport.
            </Text>
          </View>
        ) : (
          <View
            style={{
              width: '100%',
              maxWidth: 900,
              alignSelf: 'center',
              gap: 12,
            }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.borderStrong,
                backgroundColor: colors.surface,
                padding: 16,
                gap: 14,
              }}>
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  a.justify_between,
                  a.gap_sm,
                ]}>
                <View style={[a.flex_1, {gap: 3}]}>
                  <Text style={[eyebrowStyle(colors), {color: colors.accent}]}>
                    COMMUNITIES / PLUMBLINE
                  </Text>
                  <H1 style={{color: colors.ink}}>Find your people.</H1>
                  <Text style={{color: colors.secondary, lineHeight: 21}}>
                    Enter a community to read local topics, reply in context,
                    and start a conversation that stays here.
                  </Text>
                </View>
                <Button
                  label="Create a new community"
                  size="small"
                  variant="outline"
                  color="secondary"
                  shape="rectangular"
                  onPress={() => setCreateCommunityOpen(open => !open)}>
                  <ButtonText>New community</ButtonText>
                </Button>
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.recessed,
                  padding: 10,
                  gap: 8,
                }}>
                <View style={{gap: 8}}>
                  <View style={[a.flex_row, a.align_center, a.justify_between]}>
                    <Text style={eyebrowStyle(colors)}>
                      COMMUNITY DIRECTORY
                    </Text>
                    <Text style={metaStyle(colors)}>
                      {visibleCommunities.length} of {communities.length} shown
                    </Text>
                  </View>
                  <TextInput
                    accessibilityLabel="Search communities"
                    accessibilityHint="Filters communities by name, description, or address"
                    value={communitySearch}
                    onChangeText={setCommunitySearch}
                    placeholder="Find a community"
                    placeholderTextColor={colors.muted}
                    style={[
                      fieldStyle(colors, 42),
                      {textAlignVertical: 'center'},
                    ]}
                  />
                  <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                    {(
                      [
                        ['named', 'Named'],
                        ['owned', 'Owned by me'],
                        ['all', 'All'],
                      ] as const
                    ).map(([filter, label]) => (
                      <Button
                        key={filter}
                        label={`Show ${label.toLocaleLowerCase()} communities`}
                        accessibilityState={{
                          selected: communityFilter === filter,
                        }}
                        size="small"
                        shape="rectangular"
                        color={
                          communityFilter === filter ? 'primary' : 'secondary'
                        }
                        variant={
                          communityFilter === filter ? 'solid' : 'outline'
                        }
                        onPress={() => setCommunityFilter(filter)}>
                        <ButtonText>{label}</ButtonText>
                      </Button>
                    ))}
                  </View>
                </View>
                {communitySpacesQuery.isPending ? (
                  <Text style={{color: colors.secondary}}>
                    Reading communities from the PDS…
                  </Text>
                ) : boardIndexUnavailable ? (
                  <View style={{gap: 8}}>
                    <Text style={{color: colors.secondary}}>
                      Communities are unavailable or not authorized on this PDS.
                      Refresh the session and try again.
                    </Text>
                    <Button
                      label="Refresh community index"
                      size="small"
                      color="secondary"
                      variant="outline"
                      shape="rectangular"
                      disabled={communitySpacesQuery.isFetching}
                      onPress={() => void refreshCommunityIndex()}>
                      <ButtonText>
                        {communitySpacesQuery.isFetching
                          ? 'Refreshing…'
                          : 'Refresh index'}
                      </ButtonText>
                    </Button>
                  </View>
                ) : visibleCommunities.length ? (
                  <View style={{gap: 6}}>
                    {communitySpacesQuery.data?.composition ? (
                      <CommunityDirectoryEvidence
                        composition={communitySpacesQuery.data.composition}
                        colors={colors}
                      />
                    ) : null}
                    {visibleCommunities.map(item => {
                      const itemName = item.name || 'Untitled community'
                      const isSelected = item.uri === space
                      const isOwned = item.ownerDid === client.did
                      return (
                        <Link
                          key={item.uri}
                          to={`/community?space=${encodeURIComponent(item.uri)}`}
                          action="replace"
                          label={`Open ${itemName}`}
                          variant="ghost"
                          color="secondary"
                          shape="rectangular"
                          accessibilityState={{selected: isSelected}}
                          style={{
                            width: '100%',
                            minHeight: 58,
                            paddingHorizontal: 12,
                            paddingVertical: 9,
                            borderWidth: 1,
                            borderColor: isSelected
                              ? colors.borderStrong
                              : colors.border,
                            borderLeftWidth: isSelected ? 4 : 1,
                            backgroundColor: isSelected
                              ? colors.raised
                              : colors.surface,
                            alignItems: 'flex-start',
                          }}>
                          <View style={[a.w_full, {gap: 3}]}>
                            <View
                              style={[
                                a.flex_row,
                                a.align_center,
                                a.justify_between,
                                a.gap_sm,
                              ]}>
                              <Text
                                numberOfLines={1}
                                style={[
                                  a.flex_1,
                                  {color: colors.ink, fontWeight: '700'},
                                ]}>
                                {itemName}
                              </Text>
                              {isSelected || isOwned ? (
                                <Text style={metaStyle(colors)}>
                                  {isSelected ? 'OPEN' : 'OWNED'}
                                </Text>
                              ) : null}
                            </View>
                            <Text numberOfLines={1} style={metaStyle(colors)}>
                              {formatVisibility(item.visibility)}
                              {item.description ? ` · ${item.description}` : ''}
                            </Text>
                          </View>
                        </Link>
                      )
                    })}
                  </View>
                ) : (
                  <View style={{gap: 6}}>
                    {communitySpacesQuery.data?.composition ? (
                      <CommunityDirectoryEvidence
                        composition={communitySpacesQuery.data.composition}
                        colors={colors}
                      />
                    ) : null}
                    <Text style={{color: colors.secondary}}>
                      No communities match this view. Try All or clear the
                      search.
                    </Text>
                    <Button
                      label="Show all communities"
                      size="small"
                      color="secondary"
                      variant="outline"
                      shape="rectangular"
                      onPress={() => {
                        setCommunityFilter('all')
                        setCommunitySearch('')
                      }}>
                      <ButtonText>Show all</ButtonText>
                    </Button>
                  </View>
                )}

                {ownedCommunities.length ? (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderColor: colors.border,
                      paddingTop: 12,
                      gap: 8,
                    }}>
                    <View
                      style={[a.flex_row, a.align_center, a.justify_between]}>
                      <Text style={eyebrowStyle(colors)}>
                        OWNED COMMUNITIES
                      </Text>
                      <Text style={metaStyle(colors)}>
                        {ownedCommunities.length} eligible for cleanup
                      </Text>
                    </View>
                    {!deleteAllArmed ? (
                      <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                        <Text style={[a.flex_1, {color: colors.secondary}]}>
                          Remove all communities owned by this account and begin
                          with a clean directory.
                        </Text>
                        <Button
                          label="Review deletion of all owned communities"
                          size="small"
                          color="negative"
                          variant="outline"
                          shape="rectangular"
                          disabled={communitySpacesQuery.isFetching}
                          onPress={() => void reviewOwnedCommunityDeletion()}>
                          <ButtonText>Review deletion</ButtonText>
                        </Button>
                      </View>
                    ) : (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: colors.negative,
                          backgroundColor: colors.surface,
                          padding: 10,
                          gap: 8,
                        }}>
                        <Text
                          style={{color: colors.negative, fontWeight: '700'}}>
                          This permanently deletes all {ownedCommunities.length}{' '}
                          owned communit
                          {ownedCommunities.length === 1 ? 'y' : 'ies'}.
                        </Text>
                        <Text style={{color: colors.secondary}}>
                          Confirm the exact targets below. Other owners’
                          communities are not included and will not be changed.
                        </Text>
                        <View style={{gap: 5}}>
                          {ownedCommunities.map(target => (
                            <Text
                              key={target.uri}
                              selectable
                              style={{color: colors.ink, lineHeight: 18}}>
                              {communityLabel(target)} · {target.uri}
                            </Text>
                          ))}
                        </View>
                        <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                          <Button
                            label="Cancel community deletion"
                            size="small"
                            color="secondary"
                            variant="outline"
                            shape="rectangular"
                            disabled={deleteCommunitiesMutation.isPending}
                            onPress={() => setDeleteAllArmed(false)}>
                            <ButtonText>Cancel</ButtonText>
                          </Button>
                          <Button
                            label="Permanently delete all owned communities"
                            size="small"
                            color="negative"
                            variant="solid"
                            shape="rectangular"
                            disabled={deleteCommunitiesMutation.isPending}
                            onPress={() =>
                              void deleteCommunitiesMutation.mutateAsync(
                                ownedCommunities,
                              )
                            }>
                            <ButtonText>
                              {deleteCommunitiesMutation.isPending
                                ? 'Deleting…'
                                : 'Delete all owned communities'}
                            </ButtonText>
                          </Button>
                        </View>
                      </View>
                    )}
                  </View>
                ) : null}
              </View>

              {createCommunityOpen ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.borderStrong,
                    backgroundColor: colors.recessed,
                    padding: 14,
                    gap: 10,
                  }}>
                  <View style={[a.flex_row, a.align_center, a.justify_between]}>
                    <View style={[a.flex_1, {gap: 3}]}>
                      <Text style={eyebrowStyle(colors)}>NEW COMMUNITY</Text>
                      <Text style={{color: colors.secondary}}>
                        Create a Space-backed place without leaving the forum.
                      </Text>
                    </View>
                    <Button
                      label="Close new community form"
                      size="small"
                      color="secondary"
                      variant="outline"
                      shape="rectangular"
                      onPress={() => setCreateCommunityOpen(false)}>
                      <ButtonText>Close</ButtonText>
                    </Button>
                  </View>
                  <TextInput
                    accessibilityLabel="New community name"
                    accessibilityHint="Enter a name for the new community"
                    value={communityName}
                    onChangeText={setCommunityName}
                    placeholder="Community name"
                    placeholderTextColor={colors.muted}
                    style={fieldStyle(colors, 48)}
                  />
                  <TextInput
                    accessibilityLabel="New community description"
                    accessibilityHint="Enter an optional community description"
                    value={communityDescription}
                    onChangeText={setCommunityDescription}
                    placeholder="What is this community for? (optional)"
                    placeholderTextColor={colors.muted}
                    multiline
                    style={fieldStyle(colors, 80)}
                  />
                  <View style={{gap: 6}}>
                    <Text style={eyebrowStyle(colors)}>ACCESS</Text>
                    <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                      {(
                        [
                          ['private', 'Private'],
                          ['invite-only', 'Invite only'],
                          ['restricted', 'Restricted'],
                          ['public', 'Public'],
                        ] as const
                      ).map(([visibility, label]) => (
                        <Button
                          key={visibility}
                          label={`Set new community access to ${label}`}
                          size="small"
                          shape="rectangular"
                          color={
                            communityVisibility === visibility
                              ? 'primary'
                              : 'secondary'
                          }
                          variant={
                            communityVisibility === visibility
                              ? 'solid'
                              : 'outline'
                          }
                          onPress={() => setCommunityVisibility(visibility)}>
                          <ButtonText>{label}</ButtonText>
                        </Button>
                      ))}
                    </View>
                  </View>
                  <Button
                    label="Create community"
                    size="small"
                    color="primary"
                    shape="rectangular"
                    variant="solid"
                    disabled={
                      !communityName.trim() || communityMutation.isPending
                    }
                    onPress={() => void communityMutation.mutateAsync()}>
                    <ButtonText>
                      {communityMutation.isPending
                        ? 'Creating…'
                        : 'Create community'}
                    </ButtonText>
                  </Button>
                </View>
              ) : null}
            </View>

            {!space ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: 28,
                  alignItems: 'center',
                  gap: 8,
                }}>
                <Text style={eyebrowStyle(colors)}>NO COMMUNITY SELECTED</Text>
                <H2 style={{color: colors.ink}}>Choose a place to begin.</H2>
                <Text style={[a.text_center, {color: colors.secondary}]}>
                  Create a community or choose one from your list above.
                </Text>
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  backgroundColor: colors.workspace,
                }}>
                <View
                  style={{
                    backgroundColor: colors.surface,
                    padding: 16,
                    gap: 12,
                  }}>
                  <View
                    style={[
                      a.flex_row,
                      a.align_start,
                      a.justify_between,
                      a.gap_md,
                    ]}>
                    <View style={[a.flex_1, {gap: 5}]}>
                      <Text style={eyebrowStyle(colors)}>
                        {community?.kind === 'account'
                          ? 'ACCOUNT COMMUNITY'
                          : 'COMMUNITY SPACE'}
                      </Text>
                      <H2 style={{color: colors.ink}}>
                        {community?.name || 'Untitled community'}
                      </H2>
                      <Text style={{color: colors.secondary, lineHeight: 21}}>
                        {community?.description ||
                          'A Space-backed place for local conversation.'}
                      </Text>
                    </View>
                    <Button
                      label="Start a new topic in this community"
                      size="small"
                      color="primary"
                      variant="solid"
                      shape="rectangular"
                      onPress={openTopicComposer}>
                      <ButtonText>New topic</ButtonText>
                    </Button>
                  </View>
                  <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                    <InfoChip
                      label={formatVisibility(community?.visibility)}
                      colors={colors}
                    />
                    <InfoChip
                      label={`${threadList.length} ${
                        threadList.length === 1 ? 'topic' : 'topics'
                      }`}
                      colors={colors}
                    />
                    <InfoChip
                      label={accessLabel(community, isOwner, membershipState)}
                      colors={colors}
                    />
                  </View>
                  {communityQuery.isError && !communitySpacesQuery.isError ? (
                    <StatusNotice
                      colors={colors}
                      tone="warning"
                      message="Community details could not be refreshed. The metadata shown here is from the community index."
                    />
                  ) : null}
                </View>

                <View
                  style={{
                    borderTopWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.recessed,
                    paddingHorizontal: 10,
                    paddingTop: 10,
                    gap: 10,
                  }}>
                  <View
                    accessibilityRole="tablist"
                    style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                    {(
                      [
                        ['threads', 'Threads'],
                        ['latest', 'Latest'],
                        ['members', 'Members'],
                        ['about', 'About'],
                      ] as const
                    ).map(([tab, label]) => (
                      <Button
                        key={tab}
                        label={`Show ${label.toLocaleLowerCase()}`}
                        accessibilityRole="tab"
                        accessibilityState={{selected: activeTab === tab}}
                        size="small"
                        shape="rectangular"
                        color={activeTab === tab ? 'primary' : 'secondary'}
                        variant={activeTab === tab ? 'solid' : 'outline'}
                        onPress={() => {
                          setActiveTab(tab)
                          if (tab !== 'threads') {
                            setSelectedTopicKey(undefined)
                            setComposerMode(undefined)
                          }
                        }}>
                        <ButtonText>{label}</ButtonText>
                      </Button>
                    ))}
                  </View>

                  <View
                    style={{
                      borderTopWidth: 1,
                      borderColor: colors.border,
                      paddingTop: 10,
                      paddingBottom: 12,
                    }}>
                    {activeTab === 'members' ? (
                      <MembersPanel
                        community={community}
                        isOwner={isOwner}
                        membershipState={membershipState}
                        needsInviteToken={needsInviteToken}
                        inviteToken={inviteToken}
                        setInviteToken={setInviteToken}
                        membershipMutation={membershipMutation}
                        colors={colors}
                      />
                    ) : activeTab === 'about' ? (
                      <AboutPanel
                        community={community}
                        space={space}
                        spaceAuthority={spaceAuthority}
                        colors={colors}
                      />
                    ) : activeTab === 'latest' ? (
                      <LatestPanel
                        activities={latestActivities}
                        search={topicSearch}
                        setSearch={setTopicSearch}
                        onOpen={openTopic}
                        colors={colors}
                      />
                    ) : selectedThread ? (
                      <TopicDetail
                        thread={selectedThread}
                        onBack={() => {
                          setSelectedTopicKey(undefined)
                          setComposerMode(undefined)
                        }}
                        onReply={openReplyComposer}
                        colors={colors}
                      />
                    ) : (
                      <ThreadsPanel
                        threads={filteredThreads}
                        totalThreads={threadList.length}
                        search={topicSearch}
                        setSearch={setTopicSearch}
                        onOpen={openTopic}
                        onNewTopic={openTopicComposer}
                        colors={colors}
                      />
                    )}
                  </View>
                </View>

                <AccessPanel
                  community={community}
                  isOwner={isOwner}
                  membershipState={membershipState}
                  needsInviteToken={needsInviteToken}
                  inviteToken={inviteToken}
                  setInviteToken={setInviteToken}
                  membershipMutation={membershipMutation}
                  colors={colors}
                />

                {spacesAuthorizationRequired ? (
                  <View style={{gap: 8}}>
                    <StatusNotice
                      colors={colors}
                      tone="warning"
                      message="This OAuth session does not have the Spaces permission required to read or post community topics. Open Services to authorize Spaces; your existing posting and profile permissions remain unchanged."
                    />
                    <Button
                      label="Open OAuth permission settings for Spaces"
                      size="small"
                      color="secondary"
                      variant="outline"
                      shape="rectangular"
                      onPress={() =>
                        navigation.navigate('ServicesSettings', {
                          section: 'authorization',
                        })
                      }>
                      <ButtonText>Open Services</ButtonText>
                    </Button>
                  </View>
                ) : null}

                {!spacesAuthorizationRequired &&
                notesQuery.data &&
                !notesQuery.data.complete ? (
                  <StatusNotice
                    colors={colors}
                    tone="warning"
                    message="This is a partial topic read. Some authorized writer repositories could not be read, so the list is not complete."
                  />
                ) : null}

                {!spacesAuthorizationRequired && notesQuery.isError ? (
                  <StatusNotice
                    colors={colors}
                    tone="error"
                    message="Topics are unavailable or this community is not authorized for the current identity. Use Refresh topics to try again."
                  />
                ) : null}

                <View
                  style={{
                    borderTopWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    padding: 14,
                    gap: 8,
                  }}>
                  {spacesAuthorizationRequired ? null : notesQuery.isPending ? (
                    <Text style={{color: colors.secondary}}>
                      Loading topics from this community…
                    </Text>
                  ) : notesQuery.isError ? (
                    <Button
                      label="Refresh community topics"
                      size="small"
                      color="secondary"
                      variant="outline"
                      shape="rectangular"
                      disabled={notesQuery.isFetching}
                      onPress={() => void refreshTopics()}>
                      <ButtonText>
                        {notesQuery.isFetching
                          ? 'Refreshing…'
                          : 'Refresh topics'}
                      </ButtonText>
                    </Button>
                  ) : composerMode ? (
                    <ForumComposer
                      mode={composerMode}
                      text={text}
                      setText={setText}
                      onClose={() => setComposerMode(undefined)}
                      onSubmit={() => void postMutation.mutateAsync()}
                      pending={postMutation.isPending}
                      topic={selectedThread}
                      colors={colors}
                    />
                  ) : (
                    <View style={[a.flex_row, a.align_center, a.gap_sm]}>
                      <View style={[a.flex_1, {gap: 3}]}>
                        <Text style={eyebrowStyle(colors)}>IN THIS PLACE</Text>
                        <Text style={{color: colors.secondary}}>
                          Start a topic or open one to reply. Posts stay in this
                          community and follow its access rules.
                        </Text>
                      </View>
                      <Button
                        label="Start a new topic in this community"
                        size="small"
                        color="primary"
                        variant="solid"
                        shape="rectangular"
                        onPress={openTopicComposer}>
                        <ButtonText>New topic</ButtonText>
                      </Button>
                    </View>
                  )}
                  {status ? (
                    <Text style={statusStyle(colors)}>{status}</Text>
                  ) : null}
                </View>
              </View>
            )}
          </View>
        )}
      </Layout.Content>
    </Layout.Screen>
  )
}

function ThreadsPanel({
  threads,
  totalThreads,
  search,
  setSearch,
  onOpen,
  onNewTopic,
  colors,
}: {
  threads: CommunityThread[]
  totalThreads: number
  search: string
  setSearch: (value: string) => void
  onOpen: (thread: CommunityThread) => void
  onNewTopic: () => void
  colors: ForumColors
}) {
  return (
    <View style={{gap: 10}}>
      <View style={[a.flex_row, a.align_center, a.justify_between, a.gap_sm]}>
        <View style={{gap: 3}}>
          <H3 style={{color: colors.ink}}>Threads</H3>
          <Text style={{color: colors.secondary}}>
            {search.trim()
              ? `${threads.length} of ${totalThreads} topics`
              : 'Start with a topic, then keep the replies together.'}
          </Text>
        </View>
        <TextInput
          accessibilityLabel="Search community topics"
          accessibilityHint="Filters the list of community topics"
          value={search}
          onChangeText={setSearch}
          placeholder="Search topics"
          placeholderTextColor={colors.muted}
          style={searchFieldStyle(colors)}
        />
      </View>
      {threads.length ? (
        <View style={{gap: 6}}>
          {threads.map(thread => (
            <TopicRow
              key={thread.key}
              thread={thread}
              onPress={() => onOpen(thread)}
              colors={colors}
            />
          ))}
        </View>
      ) : (
        <EmptyForumState
          filtered={Boolean(search.trim())}
          onNewTopic={onNewTopic}
          colors={colors}
        />
      )}
    </View>
  )
}

function LatestPanel({
  activities,
  search,
  setSearch,
  onOpen,
  colors,
}: {
  activities: Array<{record: SpaceFanoutRecord; thread: CommunityThread}>
  search: string
  setSearch: (value: string) => void
  onOpen: (thread: CommunityThread) => void
  colors: ForumColors
}) {
  return (
    <View style={{gap: 10}}>
      <View style={[a.flex_row, a.align_center, a.justify_between, a.gap_sm]}>
        <View style={{gap: 3}}>
          <H3 style={{color: colors.ink}}>Latest activity</H3>
          <Text style={{color: colors.secondary}}>
            Recent posts across this community's topics.
          </Text>
        </View>
        <TextInput
          accessibilityLabel="Search latest community activity"
          accessibilityHint="Filters the list of recent community activity"
          value={search}
          onChangeText={setSearch}
          placeholder="Search topics"
          placeholderTextColor={colors.muted}
          style={searchFieldStyle(colors)}
        />
      </View>
      {activities.length ? (
        <View style={{gap: 6}}>
          {activities.map(({record, thread}) => (
            <Button
              key={`${thread.key}/${recordKey(record)}`}
              label={`Open activity in ${topicTitle(thread.root)}`}
              color="secondary"
              variant="ghost"
              shape="rectangular"
              onPress={() => onOpen(thread)}
              style={{
                width: '100%',
                alignItems: 'stretch',
                justifyContent: 'flex-start',
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                padding: 12,
              }}
              hoverStyle={{backgroundColor: colors.recessed}}>
              <View style={{width: '100%', gap: 5}}>
                <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                  <Text style={eyebrowStyle(colors)}>
                    {isReplyRecord(record) ? 'REPLY' : 'TOPIC'}
                  </Text>
                  <Text numberOfLines={1} style={metaStyle(colors)}>
                    in {topicTitle(thread.root)}
                  </Text>
                </View>
                <Text
                  numberOfLines={3}
                  style={{color: colors.ink, lineHeight: 21}}>
                  {formatPostText(record)}
                </Text>
                <Text style={metaStyle(colors)}>
                  {shortDid(record.repo)} · {formatRelativeDate(record.value)}
                </Text>
              </View>
            </Button>
          ))}
        </View>
      ) : (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: 18,
            gap: 5,
          }}>
          <Text style={{color: colors.ink, fontWeight: '700'}}>
            No recent activity.
          </Text>
          <Text style={{color: colors.secondary}}>
            Try a different search or return to Threads.
          </Text>
        </View>
      )}
    </View>
  )
}

function TopicRow({
  thread,
  onPress,
  colors,
}: {
  thread: CommunityThread
  onPress: () => void
  colors: ForumColors
}) {
  return (
    <Button
      label={`Open topic ${topicTitle(thread.root)}`}
      color="secondary"
      variant="ghost"
      shape="rectangular"
      onPress={onPress}
      style={{
        width: '100%',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 12,
      }}
      hoverStyle={{backgroundColor: colors.recessed}}>
      <View style={{width: '100%', gap: 5}}>
        <View style={[a.flex_row, a.align_center, a.justify_between, a.gap_sm]}>
          <Text
            numberOfLines={2}
            style={{
              flex: 1,
              color: colors.ink,
              fontSize: 16,
              fontWeight: '700',
              lineHeight: 21,
            }}>
            {topicTitle(thread.root)}
          </Text>
          <Text style={{color: colors.accent, fontSize: 18}}>›</Text>
        </View>
        <Text
          numberOfLines={2}
          style={{color: colors.secondary, lineHeight: 20}}>
          {topicExcerpt(thread.root)}
        </Text>
        <Text style={metaStyle(colors)}>
          {shortDid(thread.root.repo)} · {thread.replies.length}{' '}
          {thread.replies.length === 1 ? 'reply' : 'replies'} ·{' '}
          {formatRelativeDate(latestRecord(thread).value)}
        </Text>
      </View>
    </Button>
  )
}

function TopicDetail({
  thread,
  onBack,
  onReply,
  colors,
}: {
  thread: CommunityThread
  onBack: () => void
  onReply: () => void
  colors: ForumColors
}) {
  return (
    <View style={{gap: 10}}>
      <Button
        label="Back to community topics"
        size="small"
        color="secondary"
        variant="outline"
        shape="rectangular"
        onPress={onBack}
        style={{alignSelf: 'flex-start'}}>
        <ButtonText>Back to topics</ButtonText>
      </Button>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
          padding: 14,
          gap: 8,
        }}>
        <Text style={eyebrowStyle(colors)}>TOPIC</Text>
        <H3 style={{color: colors.ink}}>{topicTitle(thread.root)}</H3>
        <Text style={metaStyle(colors)}>
          {shortDid(thread.root.repo)} · {formatDate(recordValue(thread.root))}
        </Text>
        <Text selectable style={{color: colors.ink, lineHeight: 23}}>
          {formatPostText(thread.root)}
        </Text>
      </View>
      <View style={{gap: 8}}>
        <View style={[a.flex_row, a.align_center, a.justify_between]}>
          <H3 style={{color: colors.ink}}>Replies</H3>
          <Text style={metaStyle(colors)}>
            {thread.replies.length}{' '}
            {thread.replies.length === 1 ? 'reply' : 'replies'}
          </Text>
        </View>
        {thread.replies.length ? (
          thread.replies.map(reply => (
            <View
              key={recordKey(reply)}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                padding: 12,
                gap: 6,
              }}>
              <Text style={metaStyle(colors)}>
                {shortDid(reply.repo)} · {formatDate(recordValue(reply))}
              </Text>
              <Text selectable style={{color: colors.ink, lineHeight: 21}}>
                {formatPostText(reply)}
              </Text>
            </View>
          ))
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.recessed,
              padding: 14,
              gap: 4,
            }}>
            <Text style={{color: colors.ink, fontWeight: '700'}}>
              No replies yet.
            </Text>
            <Text style={{color: colors.secondary}}>
              Add the first response and keep it attached to this topic.
            </Text>
          </View>
        )}
      </View>
      <View
        style={{borderTopWidth: 1, borderColor: colors.border, paddingTop: 10}}>
        <Button
          label={`Reply to ${topicTitle(thread.root)}`}
          size="small"
          color="primary"
          variant="solid"
          shape="rectangular"
          onPress={onReply}>
          <ButtonText>Reply in this topic</ButtonText>
        </Button>
      </View>
    </View>
  )
}

function EmptyForumState({
  filtered,
  onNewTopic,
  colors,
}: {
  filtered: boolean
  onNewTopic: () => void
  colors: ForumColors
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 20,
        gap: 6,
      }}>
      <Text style={{color: colors.ink, fontWeight: '700'}}>
        {filtered ? 'No topics match that search.' : 'No topics yet.'}
      </Text>
      <Text style={{color: colors.secondary}}>
        {filtered
          ? 'Clear the search or try another phrase.'
          : 'Start the first conversation in this community.'}
      </Text>
      {!filtered ? (
        <Button
          label="Start the first topic in this community"
          size="small"
          color="primary"
          variant="solid"
          shape="rectangular"
          onPress={onNewTopic}
          style={{alignSelf: 'flex-start', marginTop: 4}}>
          <ButtonText>New topic</ButtonText>
        </Button>
      ) : null}
    </View>
  )
}

function MembersPanel({
  community,
  isOwner,
  membershipState,
  needsInviteToken,
  inviteToken,
  setInviteToken,
  membershipMutation,
  colors,
}: {
  community: Community | undefined
  isOwner: boolean
  membershipState: string | undefined
  needsInviteToken: boolean
  inviteToken: string
  setInviteToken: (value: string) => void
  membershipMutation: MembershipMutation
  colors: ForumColors
}) {
  return (
    <View style={{gap: 10}}>
      <H3 style={{color: colors.ink}}>Members</H3>
      <Text style={{color: colors.secondary, lineHeight: 21}}>
        Membership is controlled by this community. The alpha client does not
        expose a complete member directory or a trusted member total, so it
        keeps those claims out of the UI.
      </Text>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 12,
          gap: 6,
        }}>
        <Text style={eyebrowStyle(colors)}>YOUR ACCESS</Text>
        <Text style={{color: colors.ink}}>
          {isOwner
            ? 'Owner access is active.'
            : membershipState
              ? formatMembershipState(membershipState)
              : `Access follows the ${formatVisibility(
                  community?.visibility,
                ).toLocaleLowerCase()} policy.`}
        </Text>
      </View>
      <MembershipActions
        isOwner={isOwner}
        membershipState={membershipState}
        needsInviteToken={needsInviteToken}
        inviteToken={inviteToken}
        setInviteToken={setInviteToken}
        membershipMutation={membershipMutation}
        colors={colors}
      />
    </View>
  )
}

function AboutPanel({
  community,
  space,
  spaceAuthority,
  colors,
}: {
  community: Community | undefined
  space: string
  spaceAuthority: string | undefined
  colors: ForumColors
}) {
  return (
    <View style={{gap: 10}}>
      <H3 style={{color: colors.ink}}>About this community</H3>
      <Text style={{color: colors.secondary, lineHeight: 21}}>
        {community?.description ||
          'This community has not added a description yet.'}
      </Text>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 12,
          gap: 8,
        }}>
        <AboutRow
          label="Access"
          value={formatVisibility(community?.visibility)}
          colors={colors}
        />
        <AboutRow
          label="Created"
          value={
            community?.createdAt
              ? formatDate({createdAt: community.createdAt})
              : 'Not supplied'
          }
          colors={colors}
        />
        <AboutRow
          label="Authority"
          value={shortDid(spaceAuthority)}
          colors={colors}
        />
        <AboutRow label="Space" value={shortSpace(space)} colors={colors} />
      </View>
    </View>
  )
}

function AboutRow({
  label,
  value,
  colors,
}: {
  label: string
  value: string
  colors: ForumColors
}) {
  return (
    <View style={[a.flex_row, a.justify_between, a.gap_sm]}>
      <Text style={metaStyle(colors)}>{label}</Text>
      <Text
        selectable
        style={[
          metaStyle(colors),
          {color: colors.ink, flex: 1, textAlign: 'right'},
        ]}>
        {value}
      </Text>
    </View>
  )
}

function AccessPanel({
  community,
  isOwner,
  membershipState,
  needsInviteToken,
  inviteToken,
  setInviteToken,
  membershipMutation,
  colors,
}: {
  community: Community | undefined
  isOwner: boolean
  membershipState: string | undefined
  needsInviteToken: boolean
  inviteToken: string
  setInviteToken: (value: string) => void
  membershipMutation: MembershipMutation
  colors: ForumColors
}) {
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.recessed,
        padding: 14,
        gap: 8,
      }}>
      <View style={[a.flex_row, a.align_center, a.justify_between, a.gap_sm]}>
        <View style={[a.flex_1, {gap: 3}]}>
          <Text style={eyebrowStyle(colors)}>ACCESS CONTROL</Text>
          <Text style={{color: colors.secondary}}>
            {isOwner
              ? 'You own this community. Your access is automatic.'
              : membershipState
                ? `Your access: ${formatMembershipState(membershipState)}`
                : `This community uses a ${formatVisibility(
                    community?.visibility,
                  ).toLocaleLowerCase()} access rule.`}
          </Text>
        </View>
        {isOwner ? (
          <InfoChip label="Owner" colors={colors} />
        ) : (
          <MembershipActions
            isOwner={isOwner}
            membershipState={membershipState}
            needsInviteToken={needsInviteToken}
            inviteToken={inviteToken}
            setInviteToken={setInviteToken}
            membershipMutation={membershipMutation}
            colors={colors}
          />
        )}
      </View>
    </View>
  )
}

function MembershipActions({
  isOwner,
  membershipState,
  needsInviteToken,
  inviteToken,
  setInviteToken,
  membershipMutation,
  colors,
}: {
  isOwner: boolean
  membershipState: string | undefined
  needsInviteToken: boolean
  inviteToken: string
  setInviteToken: (value: string) => void
  membershipMutation: MembershipMutation
  colors: ForumColors
}) {
  if (isOwner) return null
  return (
    <View style={[a.flex_row, a.align_center, a.flex_wrap, a.gap_sm]}>
      {needsInviteToken ? (
        <TextInput
          accessibilityLabel="Community invite token"
          accessibilityHint="Enter the invite token supplied by the community owner"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={256}
          placeholder="Invite token"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={inviteToken}
          onChangeText={setInviteToken}
          style={inviteFieldStyle(colors)}
        />
      ) : null}
      <Button
        label="Join or request community membership"
        size="small"
        color="primary"
        variant="solid"
        shape="rectangular"
        disabled={
          membershipMutation.isPending || membershipState === 'approved'
        }
        onPress={() => void membershipMutation.mutateAsync(false)}>
        <ButtonText>
          {membershipState === 'approved'
            ? 'Joined'
            : membershipState === 'requested'
              ? 'Request pending'
              : 'Join'}
        </ButtonText>
      </Button>
      <Button
        label="Leave this community"
        size="small"
        color="secondary"
        variant="outline"
        shape="rectangular"
        disabled={membershipMutation.isPending}
        onPress={() => void membershipMutation.mutateAsync(true)}>
        <ButtonText>Leave</ButtonText>
      </Button>
    </View>
  )
}

function ForumComposer({
  mode,
  text,
  setText,
  onClose,
  onSubmit,
  pending,
  topic,
  colors,
}: {
  mode: ComposerMode
  text: string
  setText: (value: string) => void
  onClose: () => void
  onSubmit: () => void
  pending: boolean
  topic: CommunityThread | undefined
  colors: ForumColors
}) {
  const isReply = mode === 'reply'
  return (
    <View
      style={{
        gap: 9,
      }}>
      <View style={[a.flex_row, a.align_center, a.justify_between, a.gap_sm]}>
        <View style={[a.flex_1, {gap: 3}]}>
          <Text style={eyebrowStyle(colors)}>
            {isReply ? 'REPLY IN THIS TOPIC' : 'NEW TOPIC'}
          </Text>
          <Text style={{color: colors.secondary}}>
            {isReply && topic
              ? `Your reply will stay with “${topicTitle(topic.root)}”.`
              : 'This post will be written to the selected community.'}
          </Text>
        </View>
        <Button
          label="Close community composer"
          size="small"
          color="secondary"
          variant="outline"
          shape="rectangular"
          onPress={onClose}>
          <ButtonText>Close</ButtonText>
        </Button>
      </View>
      <TextInput
        accessibilityLabel={isReply ? 'Community reply' : 'Community topic'}
        accessibilityHint={
          isReply
            ? 'Write a reply to this community topic'
            : 'Write a new topic for this community'
        }
        autoCapitalize="sentences"
        autoCorrect
        multiline
        maxLength={3000}
        placeholder={
          isReply ? 'Write a reply…' : 'What should the community discuss?'
        }
        placeholderTextColor={colors.muted}
        value={text}
        onChangeText={setText}
        style={fieldStyle(colors, 128)}
      />
      <View style={[a.flex_row, a.align_center, a.justify_between, a.gap_sm]}>
        <Text style={metaStyle(colors)}>{text.length}/3000</Text>
        <Button
          label={
            isReply
              ? 'Post reply to community topic'
              : 'Post new community topic'
          }
          size="small"
          color="primary"
          variant="solid"
          shape="rectangular"
          disabled={!text.trim() || pending}
          onPress={onSubmit}>
          <ButtonText>
            {pending ? 'Posting…' : isReply ? 'Post reply' : 'Post topic'}
          </ButtonText>
        </Button>
      </View>
    </View>
  )
}

function InfoChip({label, colors}: {label: string; colors: ForumColors}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.recessed,
        paddingHorizontal: 8,
        paddingVertical: 5,
      }}>
      <Text style={[metaStyle(colors), {color: colors.ink}]}>{label}</Text>
    </View>
  )
}

function CommunityDirectoryEvidence({
  composition,
  colors,
}: {
  composition: CommunityDirectoryComposition['composition']
  colors: ForumColors
}) {
  const hasConflict =
    composition.status === 'disagreement' || composition.status === 'partial'
  const statusColor = (
    status: (typeof composition.observations)[number]['status'],
  ) => (status === 'ok' ? colors.positive : colors.negative)
  return (
    <View
      accessibilityRole="summary"
      style={{
        borderWidth: 1,
        borderColor: hasConflict ? colors.accent : colors.border,
        backgroundColor: colors.surface,
        padding: 9,
        gap: 3,
      }}>
      <View style={[a.flex_row, a.align_center, a.justify_between, a.gap_sm]}>
        <Text
          accessibilityRole="header"
          style={[metaStyle(colors), {color: colors.ink, fontWeight: '700'}]}>
          DIRECTORY EVIDENCE
        </Text>
        <Text
          style={[
            metaStyle(colors),
            {color: hasConflict ? colors.accent : colors.positive},
          ]}>
          {composition.status.toUpperCase()}
        </Text>
      </View>
      <Text style={[metaStyle(colors), {color: colors.secondary}]}>
        Each row is a source observation. The list remains a local merge, not a
        claim that one provider owns the community.
      </Text>
      {composition.observations.map((observation, index) => {
        const endpoint = observation.provider.endpoint.startsWith('http')
          ? observation.provider.endpoint
          : `source: ${observation.provider.endpoint}`
        return (
          <View
            key={`${observation.provider.id}-${index}`}
            accessible
            accessibilityLabel={`${observation.provider.displayName}: ${observation.status}`}
            accessibilityHint="Shows the provider endpoint and any read error"
            style={[a.flex_row, a.align_start, a.gap_sm, {paddingTop: 5}]}>
            <View
              aria-hidden
              style={{
                width: 8,
                height: 8,
                marginTop: 4,
                borderRadius: 4,
                backgroundColor: statusColor(observation.status),
              }}
            />
            <View style={[a.flex_1, {gap: 2}]}>
              <Text
                style={[
                  metaStyle(colors),
                  {color: colors.ink, fontWeight: '700'},
                ]}>
                {observation.provider.displayName} · {observation.status}
              </Text>
              <Text selectable style={metaStyle(colors)}>
                {observation.provider.id} · {endpoint}
              </Text>
              {observation.error ? (
                <Text
                  selectable
                  style={[metaStyle(colors), {color: colors.negative}]}>
                  {observation.error}
                </Text>
              ) : null}
            </View>
          </View>
        )
      })}
      <Text
        style={[metaStyle(colors), {color: colors.secondary, paddingTop: 5}]}>
        {composition.selectedProviderIds.length
          ? `Selected source${composition.selectedProviderIds.length === 1 ? '' : 's'}: ${composition.selectedProviderIds.join(', ')}`
          : 'No source was selected under the current reconciliation policy.'}
      </Text>
      {hasConflict ? (
        <Text
          style={[metaStyle(colors), {color: colors.accent, paddingTop: 3}]}>
          The list is usable under the local merge policy, but provider
          disagreement or an outage remains visible above.
        </Text>
      ) : null}
    </View>
  )
}

function StatusNotice({
  colors,
  message,
  tone,
}: {
  colors: ForumColors
  message: string
  tone: 'warning' | 'error'
}) {
  const color = tone === 'error' ? colors.negative : colors.accent
  return (
    <View
      accessibilityRole="alert"
      style={{
        borderWidth: 1,
        borderColor: color,
        backgroundColor: colors.surface,
        padding: 10,
      }}>
      <Text style={{color: colors.ink, lineHeight: 20}}>{message}</Text>
    </View>
  )
}

function buildThreads(records: SpaceFanoutRecord[]): CommunityThread[] {
  const recordUris = new Set(records.map(recordUri))
  const repliesByRoot = new Map<string, SpaceFanoutRecord[]>()
  const roots: SpaceFanoutRecord[] = []

  for (const record of records) {
    const rootUri = replyRootUri(record)
    if (rootUri && rootUri !== recordUri(record) && recordUris.has(rootUri)) {
      const replies = repliesByRoot.get(rootUri) ?? []
      replies.push(record)
      repliesByRoot.set(rootUri, replies)
    } else {
      // Keep orphaned replies visible as standalone topics rather than hiding
      // a record whose root was not included in a partial read.
      roots.push(record)
    }
  }

  return roots
    .map(root => ({
      key: recordKey(root),
      root,
      replies: (repliesByRoot.get(recordUri(root)) ?? []).sort((left, right) =>
        compareRecords(right, left),
      ),
    }))
    .sort((left, right) =>
      compareRecords(latestRecord(left), latestRecord(right)),
    )
}

function buildReplyReference(thread: CommunityThread): LexMap {
  const parent = thread.replies.length
    ? thread.replies[thread.replies.length - 1]
    : thread.root
  return {
    root: {uri: recordUri(thread.root), cid: thread.root.cid},
    parent: {uri: recordUri(parent), cid: parent.cid},
  }
}

function latestRecord(thread: CommunityThread): SpaceFanoutRecord {
  return thread.replies.reduce(
    (latest, candidate) =>
      compareRecords(candidate, latest) < 0 ? candidate : latest,
    thread.root,
  )
}

function compareRecords(left: SpaceFanoutRecord, right: SpaceFanoutRecord) {
  const dateOrder = recordDate(right.value).localeCompare(
    recordDate(left.value),
  )
  if (dateOrder !== 0) return dateOrder
  return recordKey(left).localeCompare(recordKey(right))
}

function recordKey(record: SpaceFanoutRecord): string {
  return `${record.repo}/${record.collection}/${record.rkey}`
}

function recordUri(record: SpaceFanoutRecord): string {
  return `at://${record.repo}/${record.collection}/${record.rkey}`
}

function recordValue(record: SpaceFanoutRecord): Record<string, unknown> {
  return record.value && typeof record.value === 'object' ? record.value : {}
}

function replyRootUri(record: SpaceFanoutRecord): string | undefined {
  const reply = recordValue(record).reply
  if (!reply || typeof reply !== 'object') return undefined
  const root = (reply as Record<string, unknown>).root
  if (!root || typeof root !== 'object') return undefined
  const uri = (root as Record<string, unknown>).uri
  return typeof uri === 'string' ? uri : undefined
}

function isReplyRecord(record: SpaceFanoutRecord): boolean {
  return Boolean(replyRootUri(record))
}

function formatPostText(record: SpaceFanoutRecord): string {
  const text = recordValue(record).text
  return typeof text === 'string' && text.trim()
    ? text.trim()
    : 'Private record'
}

function topicTitle(record: SpaceFanoutRecord): string {
  const firstLine = formatPostText(record).split(/\r?\n/, 1)[0].trim()
  if (firstLine.length <= 88) return firstLine
  return `${firstLine.slice(0, 85).trimEnd()}…`
}

function topicExcerpt(record: SpaceFanoutRecord): string {
  const text = formatPostText(record)
  const lines = text.split(/\r?\n/)
  if (lines.length > 1) return lines.slice(1).join(' ').trim() || text
  if (text.length > 88) return text.slice(88).trim() || text
  return 'Open the topic to read the full post.'
}

function recordDate(value: unknown): string {
  if (value && typeof value === 'object' && 'createdAt' in value) {
    const createdAt = (value as {createdAt?: unknown}).createdAt
    if (typeof createdAt === 'string') return createdAt
  }
  return new Date(0).toISOString()
}

function formatDate(value: Record<string, unknown> | undefined): string {
  const date = new Date(recordDate(value))
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : date.toLocaleString()
}

function formatRelativeDate(value: LexMap | undefined): string {
  const timestamp = new Date(recordDate(value)).getTime()
  if (!Number.isFinite(timestamp)) return 'time unavailable'
  const elapsed = Math.max(0, Date.now() - timestamp)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (elapsed < minute) return 'just now'
  if (elapsed < hour) return `${Math.floor(elapsed / minute)}m ago`
  if (elapsed < day) return `${Math.floor(elapsed / hour)}h ago`
  if (elapsed < 7 * day) return `${Math.floor(elapsed / day)}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function communityLabel(community: Community): string {
  return community.name?.trim() || 'Untitled community'
}

function communityDate(community: Community): string {
  return community.createdAt || new Date(0).toISOString()
}

function parseSpaceAuthority(space: string): string {
  const match = /^at:\/\/(did:[^/]+)\/space\//.exec(space)
  if (!match) throw new Error(`Invalid community space URI: ${space}`)
  return match[1]
}

function parseSpaceAuthoritySafe(space: string): string | undefined {
  if (!space) return undefined
  try {
    return parseSpaceAuthority(space)
  } catch {
    return undefined
  }
}

function shortDid(did: string | undefined): string {
  if (!did) return 'unknown identity'
  return did.length > 24 ? `${did.slice(0, 12)}…${did.slice(-8)}` : did
}

function shortSpace(space: string): string {
  if (!space) return 'space unavailable'
  return space.length > 48 ? `${space.slice(0, 26)}…${space.slice(-14)}` : space
}

function formatVisibility(visibility: CommunityVisibility | undefined): string {
  if (!visibility) return 'Access checking'
  if (visibility === 'invite-only') return 'Invite only'
  return visibility.charAt(0).toUpperCase() + visibility.slice(1)
}

function formatMembershipState(state: string): string {
  return state === 'approved'
    ? 'Joined'
    : state === 'requested'
      ? 'Request pending'
      : state.charAt(0).toUpperCase() + state.slice(1)
}

function accessLabel(
  community: Community | undefined,
  isOwner: boolean,
  membershipState: string | undefined,
): string {
  if (isOwner) return 'Owner'
  if (membershipState) return formatMembershipState(membershipState)
  return formatVisibility(community?.visibility)
}

function eyebrowStyle(colors: ForumColors) {
  return {
    color: colors.accent,
    fontFamily: 'Courier New',
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1,
  }
}

function metaStyle(colors: ForumColors) {
  return {
    color: colors.muted,
    fontFamily: 'Courier New',
    fontSize: 11,
    lineHeight: 16,
  }
}

function statusStyle(colors: ForumColors) {
  return {
    color: colors.positive,
    fontFamily: 'Courier New',
    fontSize: 11,
  }
}

function fieldStyle(colors: ForumColors, minHeight: number) {
  return {
    minHeight,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    textAlignVertical: 'top' as const,
    backgroundColor: colors.input,
    color: colors.ink,
  }
}

function searchFieldStyle(colors: ForumColors) {
  return {
    minWidth: 140,
    maxWidth: 190,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    backgroundColor: colors.input,
    color: colors.ink,
  }
}

function inviteFieldStyle(colors: ForumColors) {
  return {
    minWidth: 160,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 10,
    backgroundColor: colors.input,
    color: colors.ink,
  }
}
