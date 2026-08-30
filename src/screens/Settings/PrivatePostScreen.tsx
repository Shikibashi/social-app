import {useState} from 'react'
import {Alert, ScrollView, TextInput, View} from 'react-native'
import {RichText} from '@bsky/sdk/richtext'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'
import {useMutation, useQueryClient} from '@tanstack/react-query'

import {writePrivateTextPost} from '#/lib/permissioned-data'
import {type CommonNavigatorParams} from '#/lib/routes/types'
import {useProtectedAccountQuery} from '#/state/queries/protected-account'
import {usePdsClient} from '#/state/session'
import {assertOAuthFeatureGranted} from '#/state/session/oauth-authority'
import {useEnsureOAuthFeature} from '#/state/session/oauth-feature-gate'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'PrivatePost'>

const inputStyle = {
  minHeight: 140,
  borderWidth: 1,
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 12,
  textAlignVertical: 'top' as const,
}

export function PrivatePostScreen({}: Props) {
  const t = useTheme()
  const client = usePdsClient()
  const queryClient = useQueryClient()
  const accountQuery = useProtectedAccountQuery()
  const ensureOAuthFeature = useEnsureOAuthFeature()
  const [text, setText] = useState('')
  const [status, setStatus] = useState<string>()

  const mutation = useMutation({
    mutationFn: async () => {
      assertOAuthFeatureGranted(await ensureOAuthFeature('spaces'), 'spaces')
      const space =
        accountQuery.data?.visibility === 'protected'
          ? accountQuery.data.space
          : undefined
      if (!space) {
        throw new Error('Protected account space is unavailable on this PDS')
      }
      return writePrivateTextPost(
        client,
        space,
        new RichText({text: text.trim()}),
        ['en'],
      )
    },
    onSuccess: () => {
      setText('')
      setStatus('Private post saved to your PDS.')
      void queryClient.invalidateQueries({
        queryKey: ['radlib-private-feed', client.did],
      })
    },
    onError: error => {
      Alert.alert(
        'Private post unavailable',
        error instanceof Error ? error.message : String(error),
      )
    },
  })

  const isProtected = accountQuery.data?.visibility === 'protected'

  return (
    <Layout.Screen ecwMode="workbench">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Private post</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <ScrollView contentContainerStyle={[a.px_lg, a.py_md, a.gap_md]}>
          <SettingsList.Item>
            <View style={[a.flex_1, a.gap_sm]}>
              <SettingsList.ItemText style={[a.px_0]}>
                Write to your private PDS space
              </SettingsList.ItemText>
              <Text style={t.atoms.text_contrast_medium}>
                This quick composer writes to your protected account Space
                through the Spaces alpha transport. For replies, media, links,
                quotes, or threads, use the main composer and enable Private
                post before publishing.
              </Text>
              <Text style={t.atoms.text_contrast_medium}>
                {isProtected
                  ? `Destination: ${accountQuery.data?.space}`
                  : accountQuery.isPending
                    ? 'Checking protected account space…'
                    : 'Enable Protected account first; no private space is available.'}
              </Text>
            </View>
          </SettingsList.Item>
          <SettingsList.Item>
            <View style={[a.flex_1, a.gap_sm]}>
              <TextInput
                accessibilityLabel="Private post text"
                accessibilityHint="Enter text to save in your private PDS space"
                autoCapitalize="sentences"
                autoCorrect
                multiline
                maxLength={300}
                placeholder="Write a private post…"
                value={text}
                onChangeText={setText}
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              <Button
                label="Publish private post"
                size="small"
                color="primary"
                variant="solid"
                disabled={!isProtected || !text.trim() || mutation.isPending}
                onPress={() => void mutation.mutateAsync()}>
                <ButtonText>Publish privately</ButtonText>
              </Button>
              {status ? (
                <Text style={t.atoms.text_contrast_medium}>{status}</Text>
              ) : null}
            </View>
          </SettingsList.Item>
        </ScrollView>
      </Layout.Content>
    </Layout.Screen>
  )
}
