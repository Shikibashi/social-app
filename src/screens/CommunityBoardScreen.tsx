import {useState} from 'react'
import {Alert, ScrollView, TextInput, View} from 'react-native'
import {type NsidString} from '@atproto/syntax'
import {RichText} from '@bsky/sdk/richtext'
import {useNavigation} from '@react-navigation/native'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  createRadlibAuthorityClient,
  createSpaceCredentialSession,
} from '#/lib/atproto/spaces'
import {readAllSpaceRecords} from '#/lib/atproto/spaces/fanout'
import {writePrivateTextPostToSpace} from '#/lib/permissioned-data'
import {
  type CommonNavigatorParams,
  type NavigationProp,
} from '#/lib/routes/types'
import {usePdsClient} from '#/state/session'
import {atoms as a} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Pin_Filled_Corner0_Rounded as PinIcon} from '#/components/icons/Pin'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {SPACES_ALPHA_ENABLED} from '#/env'
import {org} from '#/lexicons'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'CommunityBoard'>

type CommunityVisibility = 'public' | 'restricted' | 'invite-only' | 'private'
type Community = {
  uri: string
  authorityDid?: string
  ownerDid?: string
  kind?: 'account' | 'community'
  name?: string
  description?: string
  visibility?: CommunityVisibility | 'protected'
  createdAt?: string
}

const POST_COLLECTION = 'org.radlib.private.post' as NsidString

const inputStyle = {
  minHeight: 128,
  borderWidth: 1,
  borderColor: '#383f78',
  borderRadius: 0,
  paddingHorizontal: 14,
  paddingVertical: 14,
  textAlignVertical: 'top' as const,
  backgroundColor: '#fffdf6',
}

const inviteInputStyle = {
  minHeight: 40,
  minWidth: 180,
  borderWidth: 2,
  borderColor: '#626a9c',
  borderRadius: 0,
  paddingHorizontal: 10,
  backgroundColor: '#ffffff',
}

const NOTE_ROTATIONS = ['-1deg', '1deg', '-0.5deg', '0.75deg']

const BULLETIN = {
  paper: '#f4efdf',
  card: '#fffdf6',
  ink: '#222018',
  muted: '#716b5d',
  line: '#d1c7ae',
  wood: '#6f4528',
  cork: '#c99b61',
  pin: '#c4493d',
}

const ECW = {
  bg: '#d6d9e8',
  canvas: '#c7ccdf',
  panel: '#f4f3eb',
  panelDeep: '#e1e3ee',
  raised: '#ffffff',
  ink: '#11132d',
  secondary: '#24274a',
  muted: '#5e6480',
  border: '#626a9c',
  strong: '#383f78',
  rule: '#9da2bd',
  purple: '#5530a3',
  pink: '#a82378',
  yellow: '#a66c00',
  green: '#08775f',
  cyan: '#006f88',
  control: '#d4d0c8',
  highlight: '#ffffff',
  shadow: '#777777',
  hardShadow: 'rgba(17, 19, 45, 0.48)',
}

const ECW_BEVEL = {
  borderWidth: 1,
  borderTopColor: ECW.highlight,
  borderLeftColor: ECW.highlight,
  borderRightColor: ECW.shadow,
  borderBottomColor: ECW.shadow,
}

const ECW_INSET = {
  borderWidth: 1,
  borderTopColor: ECW.shadow,
  borderLeftColor: ECW.shadow,
  borderRightColor: ECW.highlight,
  borderBottomColor: ECW.highlight,
}

export function CommunityBoardScreen({route}: Props) {
  const client = usePdsClient()
  const navigation = useNavigation<NavigationProp>()
  const queryClient = useQueryClient()
  const requestedSpace = route.params?.space
  const [text, setText] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [status, setStatus] = useState<string>()
  const [composerOpen, setComposerOpen] = useState(false)
  const [createBoardOpen, setCreateBoardOpen] = useState(false)
  const [communityName, setCommunityName] = useState('')
  const [communityDescription, setCommunityDescription] = useState('')
  const [communityVisibility, setCommunityVisibility] =
    useState<CommunityVisibility>('private')
  const [membershipStates, setMembershipStates] = useState<
    Record<string, string>
  >({})

  const communitySpacesQuery = useQuery({
    queryKey: ['radlib-community-spaces', client.did],
    enabled: !!client.did && SPACES_ALPHA_ENABLED,
    queryFn: async () => {
      const localPage = await client.call(org.radlib.private.listCommunities, {
        limit: 50,
      })
      const spaces = [...(localPage.spaces as Community[])]

      // A member's own PDS does not host the authority's Radlib control DB.
      // Resolve a deep-linked remote board through a narrowly-scoped service
      // auth call so the board can be discovered without mirroring policy data
      // into every member PDS.
      if (requestedSpace && !spaces.some(item => item.uri === requestedSpace)) {
        try {
          const authorityClient = await createRadlibAuthorityClient(
            client,
            requestedSpace,
            org.radlib.private.getSpace.$lxm,
          )
          spaces.push(
            (await authorityClient.call(org.radlib.private.getSpace, {
              space: requestedSpace,
            })) as Community,
          )
        } catch {
          // The query's normal error boundary will explain an unavailable
          // board once the requested route is actually selected.
        }
      }
      return {...localPage, spaces}
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
              org.radlib.private.getSpace.$lxm,
            )
      return controlClient.call(org.radlib.private.getSpace, {
        space,
      }) as Promise<Community>
    },
  })

  const notesQuery = useQuery({
    queryKey: ['radlib-community-board', client.did, space],
    enabled: !!client.did && !!space && SPACES_ALPHA_ENABLED,
    queryFn: async () => {
      const session = await createSpaceCredentialSession(client, space)
      return readAllSpaceRecords(
        {
          listRepos: session.client.listRepos.bind(session.client),
          listRecords: session.client.listRecords.bind(session.client),
          readerForRepo: session.forRepo,
        },
        {
          space,
          collection: POST_COLLECTION,
        },
      )
    },
  })

  const communityMutation = useMutation({
    mutationFn: () =>
      client.call(org.radlib.private.createCommunity, {
        name: communityName.trim(),
        description: communityDescription.trim() || undefined,
        visibility: communityVisibility,
      }),
    onSuccess: result => {
      setCommunityName('')
      setCommunityDescription('')
      setCommunityVisibility('private')
      setCreateBoardOpen(false)
      setStatus('Board created. Opening your new bulletin…')
      void queryClient.invalidateQueries({
        queryKey: ['radlib-community-spaces', client.did],
      })
      navigation.replace('CommunityBoard', {space: result.uri})
    },
    onError: error => {
      Alert.alert(
        'Could not create board',
        error instanceof Error ? error.message : String(error),
      )
    },
  })

  const membershipMutation = useMutation({
    mutationFn: async (leave: boolean) => {
      const authorityDid = parseSpaceAuthority(space)
      const controlClient =
        authorityDid === client.did
          ? client
          : await createRadlibAuthorityClient(
              client,
              space,
              leave
                ? org.radlib.private.leaveCommunity.$lxm
                : org.radlib.private.joinCommunity.$lxm,
            )
      return leave
        ? controlClient.call(org.radlib.private.leaveCommunity, {space})
        : controlClient.call(org.radlib.private.joinCommunity, {
            space,
            inviteToken: inviteToken.trim() || undefined,
          })
    },
    onSuccess: result => {
      setMembershipStates(states => ({...states, [space]: result.state}))
      setStatus(`Membership: ${result.state}`)
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

  const noteMutation = useMutation({
    mutationFn: async () => {
      if (!space.trim()) throw new Error('Community space is unavailable')
      const session = await createSpaceCredentialSession(client, space)
      return writePrivateTextPostToSpace(
        session.client,
        space,
        new RichText({text: text.trim()}),
        ['en'],
      )
    },
    onSuccess: () => {
      setText('')
      setStatus('Your note is now pinned to this board.')
      void queryClient.invalidateQueries({
        queryKey: ['radlib-community-board', client.did, space],
      })
    },
    onError: error => {
      Alert.alert(
        'Could not pin a note',
        error instanceof Error ? error.message : String(error),
      )
    },
  })

  const community =
    communityQuery.data ??
    communitySpacesQuery.data?.spaces.find(item => item.uri === space)
  const communities = communitySpacesQuery.data?.spaces ?? []
  const spaceAuthority =
    community?.authorityDid || parseSpaceAuthoritySafe(space)
  const isOwner = community?.ownerDid === client.did
  const needsInviteToken =
    !isOwner &&
    (community?.visibility === 'private' ||
      community?.visibility === 'invite-only')
  const isPublicCommunity = community?.visibility === 'public'
  const noteCardStyles = [
    {backgroundColor: '#fff2a9', borderColor: '#d8c062'},
    {backgroundColor: '#dcebc8', borderColor: '#aec58d'},
    {backgroundColor: '#d4ecf2', borderColor: '#9abfc9'},
    {backgroundColor: '#f9d6dd', borderColor: '#d7aeb6'},
  ]

  return (
    <Layout.Screen ecwMode="workbench">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Communities</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 56,
            backgroundColor: ECW.bg,
          }}>
          {!SPACES_ALPHA_ENABLED ? (
            <View style={[a.p_lg, a.gap_sm, {backgroundColor: ECW.panel}]}>
              <Text style={[a.text_2xl, a.font_bold, {color: ECW.ink}]}>
                bulletin is offline
              </Text>
              <Text style={{color: ECW.secondary}}>
                Community boards require Spaces alpha transport.
              </Text>
            </View>
          ) : (
            <View
              style={[
                a.gap_md,
                {maxWidth: 900, alignSelf: 'center', width: '100%'},
              ]}>
              <View
                style={[
                  ECW_BEVEL,
                  a.p_xs,
                  a.flex_row,
                  a.align_center,
                  a.justify_between,
                  {
                    backgroundColor: ECW.green,
                    shadowColor: ECW.hardShadow,
                    shadowOpacity: 1,
                    shadowOffset: {width: 3, height: 3},
                  },
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                  <View
                    style={{width: 9, height: 9, backgroundColor: '#b7f3d9'}}
                  />
                  <Text
                    style={{
                      fontFamily: 'Courier New',
                      fontSize: 12,
                      fontWeight: '700',
                      letterSpacing: 1,
                      color: ECW.raised,
                    }}>
                    EDRIFFLES://BULLETIN
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: 'Courier New',
                    fontSize: 11,
                    color: '#d8fff1',
                  }}>
                  SPACE ALPHA · LOCAL PDS
                </Text>
              </View>

              <View
                style={[
                  ECW_BEVEL,
                  a.p_lg,
                  a.gap_md,
                  {
                    backgroundColor: ECW.panel,
                    shadowColor: ECW.hardShadow,
                    shadowOpacity: 1,
                    shadowOffset: {width: 4, height: 4},
                  },
                ]}>
                <View
                  style={[
                    a.flex_row,
                    a.align_end,
                    a.justify_between,
                    a.gap_md,
                  ]}>
                  <View style={[a.flex_1, a.gap_2xs]}>
                    <Text
                      style={{
                        fontFamily: 'Courier New',
                        fontSize: 12,
                        fontWeight: '700',
                        letterSpacing: 1,
                        color: ECW.purple,
                      }}>
                      COMMUNITY DESK / 01
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'Georgia',
                        fontSize: 38,
                        fontWeight: '700',
                        lineHeight: 42,
                        color: ECW.ink,
                      }}>
                      bulletin
                    </Text>
                    <Text
                      style={{
                        fontSize: 15,
                        lineHeight: 21,
                        color: ECW.secondary,
                      }}>
                      A private board for the people you choose. Pick a board,
                      then pin a note.
                    </Text>
                  </View>
                  <Button
                    label="Create a new community board"
                    size="small"
                    variant="outline"
                    color="secondary"
                    onPress={() => setCreateBoardOpen(open => !open)}>
                    <ButtonText>+ NEW BOARD</ButtonText>
                  </Button>
                </View>

                <View
                  style={[
                    ECW_INSET,
                    a.gap_sm,
                    {backgroundColor: ECW.panelDeep, padding: 10},
                  ]}>
                  <View style={[a.flex_row, a.align_center, a.justify_between]}>
                    <Text
                      style={{
                        fontFamily: 'Courier New',
                        fontSize: 12,
                        fontWeight: '700',
                        letterSpacing: 1,
                        color: ECW.purple,
                      }}>
                      BOARD INDEX
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'Courier New',
                        fontSize: 11,
                        color: ECW.muted,
                      }}>
                      {communities.length} REGISTERED
                    </Text>
                  </View>
                  {communitySpacesQuery.isPending ? (
                    <Text style={{color: ECW.secondary}}>
                      Reading boards from the PDS…
                    </Text>
                  ) : communitySpacesQuery.isError ? (
                    <Text style={{color: ECW.secondary}}>
                      Boards are unavailable or not authorized on this PDS.
                    </Text>
                  ) : communities.length ? (
                    <View style={[a.gap_xs]}>
                      {communities.map((item, index) => {
                        const itemName = item.name || 'Untitled board'
                        const isSelected = item.uri === space
                        return (
                          <Link
                            key={item.uri}
                            to={`/community?space=${encodeURIComponent(item.uri)}`}
                            action="replace"
                            label={`Open ${itemName}`}
                            variant="ghost"
                            color="secondary"
                            shape="rectangular"
                            style={[
                              ECW_BEVEL,
                              a.flex_row,
                              a.align_center,
                              a.gap_sm,
                              {
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                                backgroundColor: isSelected
                                  ? ECW.raised
                                  : ECW.panel,
                              },
                              isSelected && {
                                borderWidth: 2,
                                borderColor: ECW.purple,
                                borderLeftWidth: 7,
                              },
                            ]}>
                            <Text
                              style={{
                                fontFamily: 'Courier New',
                                fontSize: 12,
                                color: ECW.muted,
                                width: 24,
                              }}>
                              {String(index + 1).padStart(2, '0')}
                            </Text>
                            <View style={[a.flex_1, a.gap_2xs]}>
                              <Text
                                numberOfLines={1}
                                style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: ECW.ink,
                                }}>
                                {itemName}
                              </Text>
                              <Text
                                numberOfLines={1}
                                style={{
                                  fontFamily: 'Courier New',
                                  fontSize: 11,
                                  color: ECW.muted,
                                }}>
                                {formatVisibility(
                                  item.visibility,
                                ).toUpperCase()}{' '}
                                · {isSelected ? 'OPEN NOW' : 'OPEN BOARD'}
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontFamily: 'Courier New',
                                fontSize: 11,
                                color: isSelected ? ECW.green : ECW.muted,
                              }}>
                              {isSelected ? '●' : '○'}
                            </Text>
                          </Link>
                        )
                      })}
                    </View>
                  ) : (
                    <View style={[a.p_md, {backgroundColor: ECW.panel}]}>
                      <Text style={{color: ECW.secondary}}>
                        No boards are visible to this account yet.
                      </Text>
                    </View>
                  )}
                </View>

                {createBoardOpen ? (
                  <View
                    style={[
                      ECW_INSET,
                      a.p_md,
                      a.gap_sm,
                      {backgroundColor: BULLETIN.paper},
                    ]}>
                    <View
                      style={[a.flex_row, a.align_center, a.justify_between]}>
                      <View style={[a.gap_2xs, a.flex_1]}>
                        <Text
                          style={{
                            fontFamily: 'Courier New',
                            fontSize: 12,
                            fontWeight: '700',
                            letterSpacing: 1,
                            color: ECW.purple,
                          }}>
                          NEW BULLETIN BOARD
                        </Text>
                        <Text style={{fontSize: 13, color: ECW.secondary}}>
                          Create a Space-backed board without leaving
                          Communities.
                        </Text>
                      </View>
                      <Button
                        label="Close new board form"
                        size="small"
                        color="secondary"
                        variant="outline"
                        onPress={() => setCreateBoardOpen(false)}>
                        <ButtonText>Close</ButtonText>
                      </Button>
                    </View>
                    <TextInput
                      accessibilityLabel="New board name"
                      accessibilityHint="Enter a name for the new community board"
                      value={communityName}
                      onChangeText={setCommunityName}
                      placeholder="Board name"
                      style={[inputStyle, {minHeight: 48, color: BULLETIN.ink}]}
                    />
                    <TextInput
                      accessibilityLabel="New board description"
                      accessibilityHint="Enter an optional description for the new community board"
                      value={communityDescription}
                      onChangeText={setCommunityDescription}
                      placeholder="What is this board for? (optional)"
                      multiline
                      style={[inputStyle, {minHeight: 80, color: BULLETIN.ink}]}
                    />
                    <View style={[a.gap_2xs]}>
                      <Text
                        style={{
                          fontFamily: 'Courier New',
                          fontSize: 11,
                          fontWeight: '700',
                          color: ECW.purple,
                        }}>
                        VISIBILITY
                      </Text>
                      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
                        {(
                          [
                            ['private', 'PRIVATE'],
                            ['invite-only', 'INVITE ONLY'],
                            ['restricted', 'RESTRICTED'],
                            ['public', 'PUBLIC'],
                          ] as const
                        ).map(([visibility, label]) => (
                          <Button
                            key={visibility}
                            label={`Set new board visibility to ${visibility}`}
                            size="small"
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
                      label="Create board"
                      size="small"
                      color="primary"
                      variant="solid"
                      disabled={
                        !communityName.trim() || communityMutation.isPending
                      }
                      onPress={() => void communityMutation.mutateAsync()}>
                      <ButtonText>
                        {communityMutation.isPending
                          ? 'Creating…'
                          : 'Create board'}
                      </ButtonText>
                    </Button>
                  </View>
                ) : null}
              </View>

              {!space ? (
                <View
                  style={[
                    ECW_BEVEL,
                    a.p_xl,
                    a.gap_sm,
                    a.align_center,
                    {
                      backgroundColor: ECW.panel,
                      shadowColor: ECW.hardShadow,
                      shadowOpacity: 1,
                      shadowOffset: {width: 4, height: 4},
                    },
                  ]}>
                  <Text
                    style={{
                      fontFamily: 'Courier New',
                      fontSize: 12,
                      fontWeight: '700',
                      color: ECW.purple,
                    }}>
                    NO BOARD SELECTED
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Georgia',
                      fontSize: 27,
                      fontWeight: '700',
                      color: ECW.ink,
                    }}>
                    Your desk is empty
                  </Text>
                  <Text style={[a.text_center, {color: ECW.secondary}]}>
                    Create a community board or choose one from the board index.
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    ECW_BEVEL,
                    a.gap_md,
                    {
                      padding: 10,
                      backgroundColor: ECW.canvas,
                      shadowColor: ECW.hardShadow,
                      shadowOpacity: 1,
                      shadowOffset: {width: 4, height: 4},
                    },
                  ]}>
                  <View
                    style={[
                      a.flex_row,
                      a.align_center,
                      a.justify_between,
                      a.gap_md,
                      {paddingHorizontal: 6},
                    ]}>
                    <View style={[a.flex_1, a.gap_2xs]}>
                      <Text
                        style={{
                          fontFamily: 'Courier New',
                          fontSize: 12,
                          fontWeight: '700',
                          letterSpacing: 1,
                          color: ECW.purple,
                        }}>
                        {isPublicCommunity
                          ? 'PUBLIC BULLETIN'
                          : 'PRIVATE BULLETIN'}
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'Georgia',
                          fontSize: 27,
                          fontWeight: '700',
                          lineHeight: 32,
                          color: ECW.ink,
                        }}>
                        {community?.name || 'Untitled board'}
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          lineHeight: 19,
                          color: ECW.secondary,
                        }}>
                        {community?.description ||
                          'A Space-backed board for notes and conversation.'}
                      </Text>
                    </View>
                    <View style={[a.align_end, a.gap_2xs]}>
                      <Text
                        style={{
                          fontFamily: 'Courier New',
                          fontSize: 12,
                          fontWeight: '700',
                          color: ECW.pink,
                        }}>
                        {notesQuery.data?.records.length ?? 0} NOTES
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'Courier New',
                          fontSize: 10,
                          color: ECW.muted,
                        }}>
                        {shortDid(spaceAuthority)}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      ECW_INSET,
                      a.flex_row,
                      a.align_center,
                      a.flex_wrap,
                      a.gap_sm,
                      {padding: 10, backgroundColor: ECW.panelDeep},
                    ]}>
                    <View style={[a.flex_1, a.gap_2xs, {minWidth: 180}]}>
                      <Text
                        style={{
                          fontFamily: 'Courier New',
                          fontSize: 11,
                          fontWeight: '700',
                          color: ECW.green,
                        }}>
                        ACCESS CONTROL
                      </Text>
                      <Text style={{fontSize: 13, color: ECW.secondary}}>
                        {isOwner
                          ? 'You own this board. Your access is automatic.'
                          : membershipState
                            ? `PDS response: ${formatMembershipState(membershipState)}`
                            : 'Membership is controlled by this board.'}
                      </Text>
                    </View>
                    {isOwner ? (
                      <View
                        style={[
                          ECW_BEVEL,
                          {
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            backgroundColor: '#dcebc8',
                          },
                        ]}>
                        <Text
                          style={{
                            fontFamily: 'Courier New',
                            fontSize: 11,
                            fontWeight: '700',
                            color: ECW.ink,
                          }}>
                          AUTHORITY ACCESS
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={[
                          a.flex_row,
                          a.align_center,
                          a.flex_wrap,
                          a.gap_sm,
                        ]}>
                        {needsInviteToken ? (
                          <TextInput
                            accessibilityLabel="Community invite token"
                            accessibilityHint="Enter the invite token supplied by the community owner"
                            autoCapitalize="none"
                            autoCorrect={false}
                            maxLength={256}
                            placeholder="Invite token"
                            secureTextEntry
                            value={inviteToken}
                            onChangeText={setInviteToken}
                            style={inviteInputStyle}
                          />
                        ) : null}
                        <Button
                          label="Join or request community membership"
                          size="small"
                          color="primary"
                          variant="solid"
                          disabled={
                            membershipMutation.isPending ||
                            membershipState === 'approved'
                          }
                          onPress={() =>
                            void membershipMutation.mutateAsync(false)
                          }>
                          <ButtonText>
                            {membershipState === 'approved' ? 'Joined' : 'Join'}
                          </ButtonText>
                        </Button>
                        <Button
                          label="Leave this community"
                          size="small"
                          color="secondary"
                          variant="outline"
                          disabled={membershipMutation.isPending}
                          onPress={() =>
                            void membershipMutation.mutateAsync(true)
                          }>
                          <ButtonText>Leave</ButtonText>
                        </Button>
                      </View>
                    )}
                  </View>

                  <View
                    style={{
                      borderWidth: 8,
                      borderColor: BULLETIN.wood,
                      backgroundColor: BULLETIN.cork,
                      shadowColor: ECW.hardShadow,
                      shadowOpacity: 1,
                      shadowRadius: 8,
                      shadowOffset: {width: 4, height: 6},
                      elevation: 5,
                    }}>
                    <View
                      style={[
                        a.p_sm,
                        a.flex_row,
                        a.align_center,
                        a.justify_between,
                        {backgroundColor: BULLETIN.wood},
                      ]}>
                      <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                        <PinIcon width={17} style={{color: '#fff2a9'}} />
                        <Text
                          style={{
                            fontFamily: 'Courier New',
                            fontSize: 12,
                            fontWeight: '700',
                            letterSpacing: 1,
                            color: '#fffdf6',
                          }}>
                          PINBOARD // PRIVATE NOTES
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontFamily: 'Courier New',
                          fontSize: 10,
                          color: '#f4efdf',
                        }}>
                        {shortSpace(space)}
                      </Text>
                    </View>
                    {notesQuery.data && !notesQuery.data.complete ? (
                      <View
                        style={[a.p_sm, {backgroundColor: '#fff2a9'}]}
                        accessibilityRole="alert">
                        <Text
                          style={{
                            fontFamily: 'Courier New',
                            fontSize: 11,
                            fontWeight: '700',
                            color: BULLETIN.ink,
                          }}>
                          PARTIAL BOARD READ — some authorized writer repos
                          could not be read. The notes below are not complete.
                        </Text>
                      </View>
                    ) : null}
                    <View style={[a.p_lg, {minHeight: 280}]}>
                      {notesQuery.isPending ? (
                        <Text style={[a.p_xl, {color: '#fffdf6'}]}>
                          Fetching notes from the Space…
                        </Text>
                      ) : notesQuery.isError ? (
                        <View
                          style={[a.p_lg, {backgroundColor: BULLETIN.paper}]}>
                          <Text style={{color: BULLETIN.muted}}>
                            Notes are unavailable or you are not authorized for
                            this board.
                          </Text>
                        </View>
                      ) : notesQuery.data?.records.length ? (
                        <View style={[a.flex_row, a.flex_wrap, a.gap_md]}>
                          {notesQuery.data.records.map((note, index) => (
                            <View
                              key={`${note.repo}/${note.rkey}`}
                              style={[
                                {
                                  flexGrow: 1,
                                  flexBasis: '46%',
                                  minWidth: 150,
                                  minHeight: 160,
                                  paddingTop: 28,
                                  paddingHorizontal: 14,
                                  paddingBottom: 14,
                                  borderWidth: 1,
                                  borderRadius: 2,
                                  shadowColor: '#3d281b',
                                  shadowOpacity: 0.16,
                                  shadowRadius: 5,
                                  shadowOffset: {width: 4, height: 5},
                                  elevation: 2,
                                },
                                noteCardStyles[index % noteCardStyles.length],
                                {
                                  transform: [
                                    {
                                      rotate:
                                        NOTE_ROTATIONS[
                                          index % NOTE_ROTATIONS.length
                                        ],
                                    },
                                  ],
                                },
                              ]}>
                              <View
                                style={{
                                  position: 'absolute',
                                  top: 7,
                                  left: '50%',
                                  width: 10,
                                  height: 10,
                                  marginLeft: -5,
                                  borderRadius: 5,
                                  backgroundColor: BULLETIN.pin,
                                  borderWidth: 1,
                                  borderColor: '#8d332a',
                                  shadowColor: '#3d281b',
                                  shadowOpacity: 0.28,
                                  shadowRadius: 2,
                                  shadowOffset: {width: 1, height: 2},
                                  elevation: 2,
                                }}
                              />
                              <View
                                style={[
                                  a.flex_row,
                                  a.align_center,
                                  a.justify_between,
                                ]}>
                                <View
                                  style={[
                                    a.flex_row,
                                    a.align_center,
                                    a.gap_xs,
                                  ]}>
                                  <PinIcon
                                    width={14}
                                    style={{color: BULLETIN.wood}}
                                  />
                                  <Text
                                    style={{
                                      fontFamily: 'Courier New',
                                      fontSize: 11,
                                      fontWeight: '700',
                                      color: BULLETIN.ink,
                                    }}>
                                    NOTE
                                  </Text>
                                </View>
                                <Text
                                  style={{
                                    fontFamily: 'Courier New',
                                    fontSize: 10,
                                    color: BULLETIN.muted,
                                  }}>
                                  {formatDate(note.value)}
                                </Text>
                              </View>
                              <Text
                                numberOfLines={6}
                                style={{
                                  fontSize: 18,
                                  lineHeight: 24,
                                  color: BULLETIN.ink,
                                  marginTop: 10,
                                }}>
                                {formatNote(note.value)}
                              </Text>
                              <Text
                                style={{
                                  fontFamily: 'Courier New',
                                  fontSize: 10,
                                  color: BULLETIN.muted,
                                  marginTop: 10,
                                }}>
                                From {shortDid(note.repo)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View
                          style={[
                            a.p_xl,
                            a.align_center,
                            {backgroundColor: BULLETIN.paper},
                          ]}>
                          <Text
                            style={[
                              a.text_lg,
                              a.font_semi_bold,
                              {color: BULLETIN.ink},
                            ]}>
                            This board is empty.
                          </Text>
                          <Text
                            style={[a.text_center, {color: BULLETIN.muted}]}>
                            Pin the first note and start the conversation.
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {composerOpen ? (
                    <View
                      style={[
                        ECW_BEVEL,
                        a.p_md,
                        a.gap_sm,
                        {
                          backgroundColor: ECW.panel,
                          shadowColor: ECW.hardShadow,
                          shadowOpacity: 1,
                          shadowOffset: {width: 3, height: 3},
                        },
                      ]}>
                      <View
                        style={[a.flex_row, a.align_center, a.justify_between]}>
                        <View style={[a.gap_2xs]}>
                          <Text
                            style={{
                              fontFamily: 'Courier New',
                              fontSize: 12,
                              fontWeight: '700',
                              letterSpacing: 1,
                              color: ECW.purple,
                            }}>
                            WRITE TO BOARD
                          </Text>
                          <Text style={{fontSize: 13, color: ECW.secondary}}>
                            This writes to the Space, not the public feed.
                          </Text>
                        </View>
                        <Button
                          label="Close note composer"
                          size="small"
                          color="secondary"
                          variant="outline"
                          onPress={() => setComposerOpen(false)}>
                          <ButtonText>Close</ButtonText>
                        </Button>
                      </View>
                      <TextInput
                        accessibilityLabel="Community note"
                        accessibilityHint="Write a private note for this community"
                        autoCapitalize="sentences"
                        autoCorrect
                        multiline
                        maxLength={300}
                        placeholder="write something for the board…"
                        value={text}
                        onChangeText={setText}
                        style={[inputStyle, {color: BULLETIN.ink}]}
                      />
                      <View
                        style={[a.flex_row, a.align_center, a.justify_between]}>
                        <Text
                          style={{
                            fontFamily: 'Courier New',
                            fontSize: 11,
                            color: ECW.muted,
                          }}>
                          {text.length}/300
                        </Text>
                        <Button
                          label="Post note to community board"
                          size="small"
                          color="primary"
                          variant="solid"
                          disabled={!text.trim() || noteMutation.isPending}
                          onPress={() => void noteMutation.mutateAsync()}>
                          <ButtonText>
                            {noteMutation.isPending ? 'Pinning…' : 'Pin note'}
                          </ButtonText>
                        </Button>
                      </View>
                      {status ? (
                        <Text
                          style={{
                            fontFamily: 'Courier New',
                            fontSize: 11,
                            color: ECW.green,
                          }}>
                          {status}
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <View
                      style={[
                        ECW_BEVEL,
                        a.p_sm,
                        a.flex_row,
                        a.align_center,
                        a.justify_between,
                        a.gap_sm,
                        {backgroundColor: ECW.panel},
                      ]}>
                      <View style={[a.flex_1, a.gap_2xs]}>
                        <Text
                          style={{
                            fontFamily: 'Courier New',
                            fontSize: 12,
                            fontWeight: '700',
                            color: ECW.purple,
                          }}>
                          READY TO PIN?
                        </Text>
                        <Text style={{fontSize: 13, color: ECW.secondary}}>
                          Add a private note to this bulletin board.
                        </Text>
                      </View>
                      <Button
                        label="Open note composer"
                        size="small"
                        color="primary"
                        variant="solid"
                        onPress={() => setComposerOpen(true)}>
                        <ButtonText>Pin a note</ButtonText>
                      </Button>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </Layout.Content>
    </Layout.Screen>
  )
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
  if (!did) return 'unknown'
  return did.length > 24 ? `${did.slice(0, 12)}…${did.slice(-8)}` : did
}

function shortSpace(space: string): string {
  if (!space) return 'space unavailable'
  return space.length > 48 ? `${space.slice(0, 26)}…${space.slice(-14)}` : space
}

function formatVisibility(
  visibility: CommunityVisibility | 'protected' | undefined,
): string {
  if (!visibility) return 'Visibility checking'
  return visibility === 'invite-only'
    ? 'Invite only'
    : visibility.charAt(0).toUpperCase() + visibility.slice(1)
}

function formatMembershipState(state: string): string {
  return state === 'approved'
    ? 'Approved'
    : state === 'requested'
      ? 'Request pending'
      : state.charAt(0).toUpperCase() + state.slice(1)
}

function formatNote(value: Record<string, unknown> | undefined): string {
  const text = value?.text
  return typeof text === 'string' && text.trim() ? text : 'Private record'
}

function recordDate(value: Record<string, unknown> | undefined): string {
  const createdAt = value?.createdAt
  return typeof createdAt === 'string' ? createdAt : new Date(0).toISOString()
}

function formatDate(value: Record<string, unknown> | undefined): string {
  return new Date(recordDate(value)).toLocaleString()
}
