import {Trans} from '@lingui/react/macro'

import {atoms as a, useTheme} from '#/alf'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

export function ModerationInboxScreen() {
  const ax = useAnalytics()
  const isEnabled = ax.features.enabled(ax.features.ModerationInboxEnable)
  const t = useTheme()

  if (!isEnabled) {
    return (
      <Layout.Screen testID="moderationInboxScreen" ecwMode="workbench">
        <Layout.Header.Outer>
          <Layout.Header.BackButton />
          <Layout.Header.Content>
            <Layout.Header.TitleText>
              <Trans>Moderation inbox</Trans>
            </Layout.Header.TitleText>
          </Layout.Header.Content>
          <Layout.Header.Slot />
        </Layout.Header.Outer>
        <Layout.Content contentContainerStyle={[a.p_lg]}>
          <Text style={[a.text_lg, a.font_semi_bold, t.atoms.text]}>
            <Trans>Moderation inbox is not enabled for this account.</Trans>
          </Text>
          <Text style={[a.mt_md, a.text_md, t.atoms.text_contrast_medium]}>
            <Trans>
              Moderation controls remain available in Moderation &amp; Reach.
            </Trans>
          </Text>
        </Layout.Content>
      </Layout.Screen>
    )
  }

  return (
    <Layout.Screen testID="moderationInboxScreen" ecwMode="workbench">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Moderation inbox</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
    </Layout.Screen>
  )
}
