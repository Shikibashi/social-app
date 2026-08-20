import {useEffect, useState} from 'react'
import {Alert, TextInput, View} from 'react-native'
import {type DidString, type NsidString} from '@atproto/syntax'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {spacesClient} from '#/lib/atproto/spaces'
import {type CommonNavigatorParams} from '#/lib/routes/types'
import {useProtectedAccountQuery} from '#/state/queries/protected-account'
import {usePdsClient} from '#/state/session'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {SPACES_ALPHA_ENABLED} from '#/env'
import {org} from '#/lexicons'

type Props = NativeStackScreenProps<
  CommonNavigatorParams,
  'PermissionedSpacesSettings'
>

type CommunityVisibility = 'public' | 'restricted' | 'invite-only' | 'private'

const inputStyle = {
  minHeight: 44,
  borderWidth: 1,
  borderRadius: 8,
  paddingHorizontal: 12,
}

export function PermissionedSpacesSettingsScreen({}: Props) {
  const {_} = useLingui()
  const t = useTheme()
  const client = usePdsClient()
  const queryClient = useQueryClient()
  const accountQuery = useProtectedAccountQuery()
  const [space, setSpace] = useState('')
  const [collection, setCollection] = useState('org.radlib.private.post')
  const [lookupRepo, setLookupRepo] = useState('')
  const [lookupCollection, setLookupCollection] = useState(
    'org.radlib.private.post',
  )
  const [lookupRkey, setLookupRkey] = useState('')
  const [lookupResult, setLookupResult] = useState<string>()
  const [blobId, setBlobId] = useState('')
  const [blobResult, setBlobResult] = useState<string>()
  const [communityName, setCommunityName] = useState('')
  const [communityDescription, setCommunityDescription] = useState('')
  const [communityVisibility, setCommunityVisibility] =
    useState<CommunityVisibility>('public')
  const [communitySpace, setCommunitySpace] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [status, setStatus] = useState<string>()

  useEffect(() => {
    if (accountQuery.data?.space && !space) setSpace(accountQuery.data.space)
  }, [accountQuery.data?.space, space])

  const recordsQuery = useQuery({
    queryKey: ['radlib-private-records', client.did, space, collection],
    enabled: !!client.did && !!space,
    queryFn: () =>
      SPACES_ALPHA_ENABLED
        ? spacesClient(client).listRecords({
            space,
            collection: collection.trim() || undefined,
            limit: 50,
          })
        : client.call(org.radlib.private.listRecords, {
            space,
            collection: collection.trim()
              ? (collection.trim() as NsidString)
              : undefined,
            limit: 50,
          }),
  })

  const communityMutation = useMutation({
    mutationFn: () =>
      client.call(org.radlib.private.createCommunity, {
        name: communityName.trim(),
        description: communityDescription.trim() || undefined,
        visibility: communityVisibility,
      }),
    onSuccess: result => {
      setCommunitySpace(result.uri)
      setStatus(`Community created: ${result.uri}`)
    },
  })

  const membershipMutation = useMutation({
    mutationFn: (leave: boolean) =>
      leave
        ? client.call(org.radlib.private.leaveCommunity, {
            space: communitySpace.trim(),
          })
        : client.call(org.radlib.private.joinCommunity, {
            space: communitySpace.trim(),
            inviteToken: inviteToken.trim() || undefined,
          }),
    onSuccess: result => {
      setStatus(`Community membership: ${result.state}`)
      void queryClient.invalidateQueries({
        queryKey: ['radlib-private-records'],
      })
    },
  })

  async function getRecord() {
    try {
      const result = SPACES_ALPHA_ENABLED
        ? await spacesClient(client).getRecord({
            space: space.trim(),
            repo: lookupRepo.trim(),
            collection: lookupCollection.trim(),
            rkey: lookupRkey.trim(),
          })
        : await client.call(org.radlib.private.getRecord, {
            space: space.trim(),
            repo: lookupRepo.trim() as DidString,
            collection: lookupCollection.trim() as NsidString,
            rkey: lookupRkey.trim(),
          })
      setLookupResult(
        JSON.stringify('record' in result ? result.record : result.value),
      )
    } catch (error) {
      setLookupResult('Record unavailable or not authorized')
      Alert.alert(
        _(msg`Private record unavailable`),
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  async function getBlob() {
    try {
      const result = SPACES_ALPHA_ENABLED
        ? await spacesClient(client).getBlob({
            space: space.trim(),
            cid: blobId.trim(),
          })
        : await client.call(org.radlib.private.getBlob, {
            space: space.trim(),
            id: blobId.trim(),
          })
      setBlobResult(
        `Authorized private media response received (${result.byteLength} bytes)`,
      )
    } catch (error) {
      setBlobResult('Private media unavailable or not authorized')
      Alert.alert(
        _(msg`Private media unavailable`),
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  return (
    <Layout.Screen ecwMode="workbench">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            Private spaces &amp; communities
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <SettingsList.Container>
          <SettingsList.Item>
            <View style={[a.flex_1, a.gap_sm]}>
              <SettingsList.ItemText style={[a.px_0]}>
                Permissioned data
              </SettingsList.ItemText>
              <Text style={t.atoms.text_contrast_medium}>
                These records and spaces are served by your selected PDS private
                API. They are not public repository records, public feed items,
                or public community discovery.
              </Text>
              <Text style={t.atoms.text_contrast_medium}>
                {accountQuery.data
                  ? `Account space: ${accountQuery.data.space} · ${accountQuery.data.visibility}`
                  : 'Protected account space is unavailable on this PDS.'}
              </Text>
            </View>
          </SettingsList.Item>
          <SettingsList.LinkItem
            to="/private-feed"
            label="Private feed"
            accessibilityLabel="Open private feed"
            accessibilityHint={_(msg`Opens your private PDS feed`)}>
            <SettingsList.ItemText>Open private feed</SettingsList.ItemText>
          </SettingsList.LinkItem>
          <SettingsList.Divider />
          <SettingsList.Item>
            <View style={[a.flex_1, a.gap_sm]}>
              <SettingsList.ItemText style={[a.px_0]}>
                Read private records
              </SettingsList.ItemText>
              <TextInput
                accessibilityLabel={_(msg`Private space URI`)}
                accessibilityHint={_(msg`Enter the permissioned space to read`)}
                autoCapitalize="none"
                autoCorrect={false}
                value={space}
                onChangeText={setSpace}
                placeholder="at://did:.../space/..."
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              <TextInput
                accessibilityLabel={_(msg`Private collection`)}
                accessibilityHint={_(msg`Enter the collection to list`)}
                autoCapitalize="none"
                autoCorrect={false}
                value={collection}
                onChangeText={setCollection}
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              {recordsQuery.isError ? (
                <Text style={t.atoms.text_contrast_medium}>
                  Private records unavailable or not authorized
                </Text>
              ) : recordsQuery.data ? (
                <Text style={t.atoms.text_contrast_medium}>
                  {recordsQuery.data.records.length} authorized records loaded
                </Text>
              ) : null}
              <Text style={t.atoms.text_contrast_medium}>
                Every read is authorized again by the PDS. A revoked or blocked
                viewer receives no private record body or metadata.
              </Text>
              <TextInput
                accessibilityLabel={_(msg`Record owner DID`)}
                accessibilityHint={_(
                  msg`Enter the DID that owns the private record`,
                )}
                autoCapitalize="none"
                autoCorrect={false}
                value={lookupRepo}
                onChangeText={setLookupRepo}
                placeholder="did:plc:..."
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              <TextInput
                accessibilityLabel={_(msg`Record key`)}
                accessibilityHint={_(msg`Enter the private record key`)}
                autoCapitalize="none"
                autoCorrect={false}
                value={lookupRkey}
                onChangeText={setLookupRkey}
                placeholder="record key"
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              <TextInput
                accessibilityLabel={_(msg`Record collection`)}
                accessibilityHint={_(
                  msg`Enter the collection for the private record`,
                )}
                autoCapitalize="none"
                autoCorrect={false}
                value={lookupCollection}
                onChangeText={setLookupCollection}
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              <Button
                label={_(msg`Read private record`)}
                size="small"
                color="primary"
                variant="solid"
                disabled={
                  !space.trim() ||
                  !lookupRepo.trim() ||
                  !lookupCollection.trim() ||
                  !lookupRkey.trim()
                }
                onPress={() => void getRecord()}>
                <ButtonText>Read record</ButtonText>
              </Button>
              {lookupResult ? (
                <Text style={t.atoms.text_contrast_medium}>{lookupResult}</Text>
              ) : null}
              <TextInput
                accessibilityLabel={_(msg`Private media identifier`)}
                accessibilityHint={_(
                  msg`Enter a private blob identifier to check authorized access`,
                )}
                autoCapitalize="none"
                autoCorrect={false}
                value={blobId}
                onChangeText={setBlobId}
                placeholder="Private media id"
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              <Button
                label={_(msg`Read private media`)}
                size="small"
                color="secondary"
                variant="outline"
                disabled={!space.trim() || !blobId.trim()}
                onPress={() => void getBlob()}>
                <ButtonText>Read private media</ButtonText>
              </Button>
              {blobResult ? (
                <Text style={t.atoms.text_contrast_medium}>{blobResult}</Text>
              ) : null}
            </View>
          </SettingsList.Item>
          <SettingsList.Divider />
          <SettingsList.Item>
            <View style={[a.flex_1, a.gap_sm]}>
              <SettingsList.ItemText style={[a.px_0]}>
                Create a community
              </SettingsList.ItemText>
              <TextInput
                accessibilityLabel={_(msg`Community name`)}
                accessibilityHint={_(msg`Enter a name for the new community`)}
                value={communityName}
                onChangeText={setCommunityName}
                placeholder="Community name"
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              <TextInput
                accessibilityLabel={_(msg`Community description`)}
                accessibilityHint={_(
                  msg`Optional description for the new community`,
                )}
                value={communityDescription}
                onChangeText={setCommunityDescription}
                placeholder="Description (optional)"
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              <View style={[a.flex_row, a.gap_xs, a.flex_wrap]}>
                {(
                  ['public', 'restricted', 'invite-only', 'private'] as const
                ).map(visibility => (
                  <Button
                    key={visibility}
                    label={_(msg`Set community visibility to ${visibility}`)}
                    size="small"
                    color={
                      communityVisibility === visibility
                        ? 'primary'
                        : 'secondary'
                    }
                    variant={
                      communityVisibility === visibility ? 'solid' : 'outline'
                    }
                    onPress={() => setCommunityVisibility(visibility)}>
                    <ButtonText>{visibility}</ButtonText>
                  </Button>
                ))}
              </View>
              <Button
                label={_(msg`Create community`)}
                size="small"
                color="primary"
                variant="solid"
                disabled={!communityName.trim() || communityMutation.isPending}
                onPress={() => void communityMutation.mutateAsync()}>
                <ButtonText>Create community</ButtonText>
              </Button>
            </View>
          </SettingsList.Item>
          <SettingsList.Divider />
          <SettingsList.Item>
            <View style={[a.flex_1, a.gap_sm]}>
              <SettingsList.ItemText style={[a.px_0]}>
                Join or leave a community
              </SettingsList.ItemText>
              <TextInput
                accessibilityLabel={_(msg`Community space URI`)}
                accessibilityHint={_(msg`Enter a community space URI`)}
                autoCapitalize="none"
                autoCorrect={false}
                value={communitySpace}
                onChangeText={setCommunitySpace}
                placeholder="at://did:.../space/..."
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              <TextInput
                accessibilityLabel={_(msg`Community invite token`)}
                accessibilityHint={_(
                  msg`Enter an invite token when the community requires one`,
                )}
                autoCapitalize="none"
                autoCorrect={false}
                value={inviteToken}
                onChangeText={setInviteToken}
                placeholder="Invite token (if required)"
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
                <Button
                  label={_(msg`Join community`)}
                  size="small"
                  color="primary"
                  variant="solid"
                  disabled={
                    !communitySpace.trim() || membershipMutation.isPending
                  }
                  onPress={() => void membershipMutation.mutateAsync(false)}>
                  <ButtonText>Join</ButtonText>
                </Button>
                <Button
                  label={_(msg`Leave community`)}
                  size="small"
                  color="secondary"
                  variant="outline"
                  disabled={
                    !communitySpace.trim() || membershipMutation.isPending
                  }
                  onPress={() => void membershipMutation.mutateAsync(true)}>
                  <ButtonText>Leave</ButtonText>
                </Button>
              </View>
              {status ? (
                <Text style={t.atoms.text_contrast_medium}>{status}</Text>
              ) : null}
            </View>
          </SettingsList.Item>
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}
