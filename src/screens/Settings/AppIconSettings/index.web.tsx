import {Trans} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

export function AppIconSettingsScreen() {
  const t = useTheme()

  return (
    <Layout.Screen testID="appIconSettingsScreen" ecwMode="workbench">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>App Icon</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content contentContainerStyle={[a.p_lg]}>
        <Text style={[a.text_lg, a.font_semi_bold, t.atoms.text]}>
          <Trans>App icon settings are available in the native app.</Trans>
        </Text>
        <Text style={[a.mt_md, a.text_md, t.atoms.text_contrast_medium]}>
          <Trans>
            The web client uses the Plumbline browser icon and cannot change a
            device's installed app icon.
          </Trans>
        </Text>
      </Layout.Content>
    </Layout.Screen>
  )
}
