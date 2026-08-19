import {useState} from 'react'
import {Alert, TextInput, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {type CommonNavigatorParams} from '#/lib/routes/types'
import {
  useProtectedAccessMutation,
  useProtectedAccessStateQuery,
} from '#/state/queries/protected-access'
import {useSession} from '#/state/session'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {ShieldCheck_Stroke2_Corner0_Rounded as ShieldIcon} from '#/components/icons/Shield'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

type Props = NativeStackScreenProps<
  CommonNavigatorParams,
  'ProtectedAccessSettings'
>

const inputStyle = {
  minHeight: 44,
  borderWidth: 1,
  borderRadius: 8,
  paddingHorizontal: 12,
}

export function ProtectedAccessSettingsScreen({}: Props) {
  const {_} = useLingui()
  const t = useTheme()
  const {currentAccount} = useSession()
  const mutation = useProtectedAccessMutation()
  const [target, setTarget] = useState('')
  const [requester, setRequester] = useState('')
  const [message, setMessage] = useState<string>()
  const requestState = useProtectedAccessStateQuery(
    currentAccount?.did ?? '',
    target,
  )
  const manageState = useProtectedAccessStateQuery(
    requester,
    currentAccount?.did ?? '',
  )

  async function run(
    input:
      | {action: 'request' | 'cancel'; target: string}
      | {
          action: 'approve' | 'deny' | 'revoke'
          requester: string
        },
  ) {
    try {
      const result = await mutation.mutateAsync(input)
      setMessage(`Protected access state: ${result.state}`)
      if ('requester' in input) {
        setRequester(input.requester)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      Alert.alert(_(msg`Protected access unavailable`), detail)
    }
  }

  return (
    <Layout.Screen ecwMode="workbench">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Protected access</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <SettingsList.Container>
          <SettingsList.Item>
            <SettingsList.ItemIcon icon={ShieldIcon} />
            <View style={[a.flex_1, a.gap_sm]}>
              <SettingsList.ItemText style={[a.px_0]}>
                Permissioned account access
              </SettingsList.ItemText>
              <Text style={[a.leading_snug, t.atoms.text_contrast_medium]}>
                These controls operate on the selected PDS private-access API.
                They do not create public follows, and they do not make public
                posts private.
              </Text>
            </View>
          </SettingsList.Item>
          <SettingsList.Divider />
          <SettingsList.Item>
            <View style={[a.flex_1, a.gap_sm]}>
              <SettingsList.ItemText style={[a.px_0]}>
                Request access to a protected account
              </SettingsList.ItemText>
              <TextInput
                accessibilityLabel={_(msg`Protected account DID`)}
                accessibilityHint={_(
                  msg`Enter the DID whose private space you want to request`,
                )}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="did:plc:..."
                value={target}
                onChangeText={setTarget}
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              <Text style={t.atoms.text_contrast_medium}>
                {requestState.data
                  ? `Current request: ${requestState.data.state}`
                  : 'Enter a DID to inspect the directional request state.'}
              </Text>
              <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
                <Button
                  label={_(msg`Request private access`)}
                  size="small"
                  color="primary"
                  variant="solid"
                  disabled={!target.trim() || mutation.isPending}
                  onPress={() =>
                    void run({action: 'request', target: target.trim()})
                  }>
                  <ButtonText>Request access</ButtonText>
                </Button>
                <Button
                  label={_(msg`Cancel protected access request`)}
                  size="small"
                  color="secondary"
                  variant="outline"
                  disabled={!target.trim() || mutation.isPending}
                  onPress={() =>
                    void run({action: 'cancel', target: target.trim()})
                  }>
                  <ButtonText>Cancel request</ButtonText>
                </Button>
              </View>
            </View>
          </SettingsList.Item>
          <SettingsList.Divider />
          <SettingsList.Item>
            <View style={[a.flex_1, a.gap_sm]}>
              <SettingsList.ItemText style={[a.px_0]}>
                Manage a request for your protected account
              </SettingsList.ItemText>
              <TextInput
                accessibilityLabel={_(msg`Requester DID`)}
                accessibilityHint={_(msg`Enter the DID of a requester`)}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="did:plc:..."
                value={requester}
                onChangeText={setRequester}
                style={[inputStyle, t.atoms.bg_contrast_25, t.atoms.text]}
              />
              <Text style={t.atoms.text_contrast_medium}>
                {manageState.data
                  ? `Current request: ${manageState.data.state}`
                  : 'Only the protected account can approve, deny, or remove access.'}
              </Text>
              <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
                <Button
                  label={_(msg`Approve protected access`)}
                  size="small"
                  color="primary"
                  variant="solid"
                  disabled={!requester.trim() || mutation.isPending}
                  onPress={() =>
                    void run({action: 'approve', requester: requester.trim()})
                  }>
                  <ButtonText>Approve</ButtonText>
                </Button>
                <Button
                  label={_(msg`Deny protected access`)}
                  size="small"
                  color="secondary"
                  variant="outline"
                  disabled={!requester.trim() || mutation.isPending}
                  onPress={() =>
                    void run({action: 'deny', requester: requester.trim()})
                  }>
                  <ButtonText>Deny</ButtonText>
                </Button>
                <Button
                  label={_(msg`Remove approved protected access`)}
                  size="small"
                  color="secondary"
                  variant="outline"
                  disabled={!requester.trim() || mutation.isPending}
                  onPress={() =>
                    void run({action: 'revoke', requester: requester.trim()})
                  }>
                  <ButtonText>Remove access</ButtonText>
                </Button>
              </View>
            </View>
          </SettingsList.Item>
          {message ? (
            <SettingsList.Item>
              <Text style={t.atoms.text_contrast_medium}>{message}</Text>
            </SettingsList.Item>
          ) : null}
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}
