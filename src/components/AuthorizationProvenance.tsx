import {useState} from 'react'
import {Pressable, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {cleanError} from '#/lib/strings/errors'
import {useEnsureOAuthFeature} from '#/state/session/oauth-feature-gate'
import {
  getOAuthFeatureGrantPresentations,
  type OAuthFeature,
  type OAuthFeatureGrantPresentation,
} from '#/state/session/oauth-scopes'
import {type SessionAccount} from '#/state/session/types'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'

type Props = {
  account: SessionAccount
  onUpgrade: (feature: OAuthFeature) => void
  pendingFeature?: OAuthFeature
  onRevokeSession?: () => void
}

const FEATURE_LABELS: Record<OAuthFeature, string> = {
  posting: 'Posting and interactions',
  'profile-editing': 'Profile editing',
  'social-graph': 'Social graph',
  'identity-recovery': 'Identity recovery and rotation',
  appview: 'Authenticated AppView reads',
  chat: 'Chat',
  spaces: 'Spaces',
  media: 'Media uploads',
  notifications: 'Notifications',
}

function featureLabel(feature: OAuthFeature): string {
  return FEATURE_LABELS[feature]
}

function statusLabel(grant: OAuthFeatureGrantPresentation): string {
  switch (grant.status) {
    case 'granted':
      return 'Granted by the authorization server'
    case 'compatibility':
      return 'Legacy compatibility grant'
    case 'missing':
      return 'Still missing'
  }
}

function authorityLabel(authority: OAuthFeatureGrantPresentation['authority']) {
  switch (authority) {
    case 'account-pds':
      return 'Account PDS'
    case 'appview-service':
      return 'Selected AppView service'
    case 'chat-service':
      return 'Chat service'
    case 'notification-service':
      return 'Notification service'
    case 'permissioned-spaces':
      return 'Permissioned Spaces authority'
    case 'blob-resource':
      return 'Account PDS blob resource'
    case 'unknown':
      return 'Unclassified resource'
  }
}

function ScopeBlock({
  label,
  scopes,
}: {
  label: string
  scopes: readonly string[]
}) {
  const t = useTheme()
  return (
    <View style={[a.gap_2xs]}>
      <Text style={[a.text_xs, a.font_semi_bold]}>{label}</Text>
      {scopes.length > 0 ? (
        scopes.map(scope => (
          <Text
            key={scope}
            selectable
            style={[
              a.text_xs,
              t.atoms.text_contrast_medium,
              {fontFamily: 'Courier New, "Liberation Mono", monospace'},
            ]}>
            {scope}
          </Text>
        ))
      ) : (
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>None</Text>
      )}
    </View>
  )
}

function FeatureGrant({
  grant,
  onUpgrade,
  pending,
}: {
  grant: OAuthFeatureGrantPresentation
  onUpgrade: () => void
  pending: boolean
}) {
  const t = useTheme()
  const statusColor =
    grant.status === 'granted'
      ? t.palette.positive_500
      : grant.status === 'compatibility'
        ? t.palette.yellow
        : t.palette.negative_500

  return (
    <View
      testID={`oauth-authority-${grant.feature}`}
      style={[
        a.gap_sm,
        a.p_md,
        a.border,
        t.atoms.border_contrast_low,
        {borderLeftWidth: 3, borderLeftColor: statusColor},
      ]}>
      <View style={[a.gap_2xs]}>
        <Text style={[a.font_semi_bold]}>{featureLabel(grant.feature)}</Text>
        <Text style={[a.text_xs, {color: statusColor}]}>
          {statusLabel(grant)}
        </Text>
      </View>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
        {grant.purpose}
      </Text>
      <Text style={a.text_xs}>
        Authority: {authorityLabel(grant.authority)} · {grant.resource}
      </Text>
      {grant.audiences.length > 0 ? (
        <Text
          selectable
          style={[
            a.text_xs,
            t.atoms.text_contrast_medium,
            {fontFamily: 'Courier New, "Liberation Mono", monospace'},
          ]}>
          Audience: {grant.audiences.join(', ')}
        </Text>
      ) : null}
      <ScopeBlock
        label="Requested by Plumbline"
        scopes={grant.requiredScopes}
      />
      <ScopeBlock
        label="Granted by the authorization server"
        scopes={grant.grantedScopes}
      />
      {grant.missingScopes.length > 0 ? (
        <ScopeBlock label="Still missing" scopes={grant.missingScopes} />
      ) : null}
      {grant.status !== 'granted' ? (
        <Button
          label={
            pending
              ? `Opening consent for ${featureLabel(grant.feature)}`
              : `Authorize ${featureLabel(grant.feature)}`
          }
          onPress={onUpgrade}
          disabled={pending}
          size="small"
          color="secondary"
          variant="outline"
          shape="rectangular">
          <ButtonText>
            {pending ? 'Opening consent…' : 'Authorize this feature'}
          </ButtonText>
        </Button>
      ) : null}
    </View>
  )
}

/**
 * A feature-scoped consent boundary for surfaces that cannot operate without
 * an additional OAuth grant. The prompt deliberately does not start consent
 * on mount: opening a new delegated authority remains an explicit user action.
 */
export function OAuthFeatureAccessPrompt({
  feature,
  onOpenServices,
}: {
  feature: OAuthFeature
  onOpenServices: () => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const ensureOAuthFeature = useEnsureOAuthFeature()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const name = featureLabel(feature)

  const authorize = async () => {
    setPending(true)
    setError(undefined)
    try {
      await ensureOAuthFeature(feature)
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <View
      testID={`oauth-feature-required-${feature}`}
      accessibilityRole="summary"
      accessibilityLabel={l`Additional authorization required`}
      accessibilityHint={l`
        Explains why this permission is needed and how to change it
      `}
      style={[
        a.gap_md,
        a.p_lg,
        a.border,
        t.atoms.border_contrast_low,
        {borderLeftWidth: 3, borderLeftColor: t.palette.yellow},
      ]}>
      <View style={[a.gap_2xs]}>
        <Text style={[a.text_lg, a.font_semi_bold]}>
          <Trans>Additional authorization required</Trans>
        </Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>
            This part of Plumbline uses a separate service permission. No
            request has been sent to the chat service.
          </Trans>
        </Text>
      </View>

      <Text style={a.text_sm}>
        <Text style={a.font_semi_bold}>
          <Trans>Feature</Trans>:{' '}
        </Text>
        {name}
      </Text>

      {error ? (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>Authorization did not finish:</Trans> {error}
        </Text>
      ) : null}

      <View style={[a.gap_sm]}>
        <Button
          testID={`oauth-feature-authorize-${feature}`}
          label={
            pending ? l`Opening consent for ${name}` : l`Authorize ${name}`
          }
          onPress={() => void authorize()}
          disabled={pending}
          size="small"
          color="primary"
          shape="rectangular">
          <ButtonText>
            {pending ? l`Opening consent…` : l`Authorize this feature`}
          </ButtonText>
        </Button>
        <Button
          testID={`oauth-feature-services-${feature}`}
          label={l`Inspect authorization settings`}
          onPress={onOpenServices}
          size="small"
          color="secondary"
          variant="outline"
          shape="rectangular">
          <ButtonText>
            <Trans>Open Services</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )
}

export function AuthorizationProvenance({
  account,
  onUpgrade,
  pendingFeature,
  onRevokeSession,
}: Props) {
  const t = useTheme()
  const [expanded, setExpanded] = useState(false)
  const grants = getOAuthFeatureGrantPresentations(account.oauthScopes)

  return (
    <View style={[a.gap_sm]} testID="authorization-provenance">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? 'Hide delegated authority' : 'Inspect delegated authority'
        }
        accessibilityHint="Shows the OAuth permissions, service authority, and revocation boundary for this session"
        accessibilityState={{expanded}}
        testID="authorization-provenance-toggle"
        onPress={() => setExpanded(value => !value)}
        style={({pressed}) => [
          a.p_sm,
          a.border,
          t.atoms.border_contrast_low,
          pressed && {opacity: 0.65},
        ]}>
        <Text style={a.font_semi_bold}>
          {expanded
            ? 'Hide delegated authority'
            : 'Inspect delegated authority'}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={[a.gap_md]} testID="authorization-provenance-details">
          <View style={[a.gap_2xs, a.p_md, t.atoms.bg_contrast_25]}>
            <Text style={a.font_semi_bold}>Account</Text>
            <Text>@{account.handle}</Text>
            <Text
              selectable
              style={[
                a.text_xs,
                t.atoms.text_contrast_medium,
                {fontFamily: 'Courier New, "Liberation Mono", monospace'},
              ]}>
              {account.did}
            </Text>
          </View>

          <View style={[a.gap_2xs, a.p_md, t.atoms.bg_contrast_25]}>
            <Text style={a.font_semi_bold}>OAuth session</Text>
            <Text>
              OAuth service recorded by this session: {account.service}
            </Text>
            <Text>
              Account PDS: {account.pdsUrl ?? 'Not advertised by this session'}
            </Text>
          </View>

          <View style={[a.gap_sm]}>
            <Text style={a.font_semi_bold}>Feature authority</Text>
            {grants.map(grant => (
              <FeatureGrant
                key={grant.feature}
                grant={grant}
                pending={pendingFeature === grant.feature}
                onUpgrade={() => onUpgrade(grant.feature)}
              />
            ))}
          </View>

          <View style={[a.gap_sm, a.p_md, t.atoms.bg_contrast_25]}>
            <Text style={a.text_sm}>
              Feature upgrades are supported individually. The current session
              integration revokes the OAuth session as a whole; it does not
              claim to revoke one feature independently.
            </Text>
            {onRevokeSession ? (
              <Button
                label="Revoke this OAuth session"
                onPress={onRevokeSession}
                size="small"
                color="secondary"
                variant="outline"
                shape="rectangular">
                <ButtonText>Revoke whole session</ButtonText>
              </Button>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}
