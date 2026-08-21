import {ScrollView, View} from 'react-native'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {type CommonNavigatorParams} from '#/lib/routes/types'
import {usePrivateFeedQuery} from '#/state/queries/private-feed'
import {useProtectedAccountQuery} from '#/state/queries/protected-account'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'PrivateFeed'>

export function PrivateFeedScreen({}: Props) {
  const t = useTheme()
  const accountQuery = useProtectedAccountQuery()
  const space = accountQuery.data?.space ?? ''
  const feedQuery = usePrivateFeedQuery(space)

  return (
    <Layout.Screen ecwMode="workbench">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Private feed</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <ScrollView contentContainerStyle={[a.px_lg, a.py_md, a.gap_md]}>
          <SettingsList.Item>
            <View style={[a.flex_1, a.gap_xs]}>
              <SettingsList.ItemText style={[a.px_0]}>
                Your private PDS feed
              </SettingsList.ItemText>
              <Text style={t.atoms.text_contrast_medium}>
                This feed is returned by the PDS that hosts the space. It is
                viewer-authorized and does not use the public AppView, Relay, or
                public repository.
              </Text>
              <Text style={t.atoms.text_contrast_medium}>
                {feedQuery.data
                  ? `Provider: ${feedQuery.data.providerDid}`
                  : space
                    ? 'Provider: checking'
                    : 'Private account space is unavailable'}
              </Text>
            </View>
          </SettingsList.Item>
          <SettingsList.LinkItem
            to="/private-post"
            label="Write private post"
            accessibilityLabel="Write private post"
            accessibilityHint="Opens the private post composer">
            <SettingsList.ItemText>Write private post</SettingsList.ItemText>
          </SettingsList.LinkItem>
          {feedQuery.isError ? (
            <SettingsList.Item>
              <Text style={t.atoms.text_contrast_medium}>
                The private feed is unavailable or you are not authorized for
                this space.
              </Text>
            </SettingsList.Item>
          ) : feedQuery.data?.feed.length ? (
            feedQuery.data.feed.map(item => (
              <SettingsList.Item key={`${item.repo}/${item.rkey}`}>
                <View style={[a.flex_1, a.gap_xs]}>
                  <Text style={t.atoms.text_contrast_medium}>
                    {formatPrivatePost(item.record)}
                  </Text>
                  <Text style={t.atoms.text_contrast_medium}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </View>
              </SettingsList.Item>
            ))
          ) : feedQuery.isPending && space ? (
            <SettingsList.Item>
              <Text style={t.atoms.text_contrast_medium}>
                Loading private feed…
              </Text>
            </SettingsList.Item>
          ) : space ? (
            <SettingsList.Item>
              <Text style={t.atoms.text_contrast_medium}>
                No private posts yet.
              </Text>
            </SettingsList.Item>
          ) : null}
        </ScrollView>
      </Layout.Content>
    </Layout.Screen>
  )
}

function formatPrivatePost(value: unknown): string {
  if (value && typeof value === 'object' && 'text' in value) {
    const text = (value as {text?: unknown}).text
    if (typeof text === 'string' && text.trim()) return text
  }
  return 'Private record'
}
