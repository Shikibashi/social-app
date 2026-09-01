import {useId, useState} from 'react'
import {Pressable, View} from 'react-native'
import {type I18n} from '@lingui/core'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {cleanError} from '#/lib/strings/errors'
import {useEnsureOAuthFeature} from '#/state/session/oauth-feature-gate'
import {
  getOAuthAuthorityLabelMessage,
  getOAuthFeatureGrantPresentations,
  getOAuthFeatureLabelMessage,
  getOAuthFeaturePurposeMessage,
  getOAuthFeatureResourceLabelMessage,
  getOAuthFeatureResourceMessage,
  getOAuthGrantStatusMessage,
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

function featureLabel(feature: OAuthFeature, i18n: I18n): string {
  return i18n._(getOAuthFeatureLabelMessage(feature))
}

function resourceLabel(feature: OAuthFeature, i18n: I18n): string {
  return i18n._(getOAuthFeatureResourceLabelMessage(feature))
}

function featureResource(feature: OAuthFeature, i18n: I18n): string {
  return i18n._(getOAuthFeatureResourceMessage(feature))
}

function statusLabel(grant: OAuthFeatureGrantPresentation, i18n: I18n): string {
  return i18n._(getOAuthGrantStatusMessage(grant.status))
}

function authorityLabel(
  authority: OAuthFeatureGrantPresentation['authority'],
  i18n: I18n,
): string {
  return i18n._(getOAuthAuthorityLabelMessage(authority))
}

function ScopeBlock({
  label,
  scopes,
}: {
  label: string
  scopes: readonly string[]
}) {
  const {i18n} = useLingui()
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
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          {i18n._(msg`None`)}
        </Text>
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
  const {_, i18n} = useLingui()
  const t = useTheme()
  const featureName = featureLabel(grant.feature, i18n)
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
        <Text style={[a.font_semi_bold]}>{featureName}</Text>
        <Text style={[a.text_xs, {color: statusColor}]}>
          {statusLabel(grant, i18n)}
        </Text>
      </View>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
        {i18n._(getOAuthFeaturePurposeMessage(grant.feature))}
      </Text>
      <Text style={a.text_xs}>
        {_(msg`Authority`)}: {authorityLabel(grant.authority, i18n)} ·{' '}
        {featureResource(grant.feature, i18n)}
      </Text>
      {grant.audiences.length > 0 ? (
        <Text
          selectable
          style={[
            a.text_xs,
            t.atoms.text_contrast_medium,
            {fontFamily: 'Courier New, "Liberation Mono", monospace'},
          ]}>
          {_(msg`Audience`)}: {grant.audiences.join(', ')}
        </Text>
      ) : null}
      <ScopeBlock
        label={_(msg`Requested by Plumbline`)}
        scopes={grant.requiredScopes}
      />
      <ScopeBlock
        label={_(msg`Granted by the authorization server`)}
        scopes={grant.grantedScopes}
      />
      {grant.missingScopes.length > 0 ? (
        <ScopeBlock
          label={_(msg`Still missing`)}
          scopes={grant.missingScopes}
        />
      ) : null}
      {grant.status !== 'granted' ? (
        <Button
          label={
            pending
              ? _(msg`Opening consent for ${featureName}`)
              : _(msg`Authorize ${featureName}`)
          }
          onPress={onUpgrade}
          disabled={pending}
          size="small"
          color="secondary"
          variant="outline"
          shape="rectangular">
          <ButtonText>
            {pending
              ? _(msg`Opening consent…`)
              : _(msg`Authorize this feature`)}
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
  const {_, i18n} = useLingui()
  const ensureOAuthFeature = useEnsureOAuthFeature()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const name = featureLabel(feature, i18n)
  const resource = resourceLabel(feature, i18n)

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
      accessibilityLabel={_(msg`Additional authorization required`)}
      accessibilityHint={_(
        msg`Explains why this permission is needed and how to change it`,
      )}
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
          {_(
            msg`This part of Plumbline uses a separate ${name} permission. No request has been sent to the ${resource} for this feature.`,
          )}
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
            pending
              ? _(msg`Opening consent for ${name}`)
              : _(msg`Authorize ${name}`)
          }
          onPress={() => void authorize()}
          disabled={pending}
          size="small"
          color="primary"
          shape="rectangular">
          <ButtonText>
            {pending
              ? _(msg`Opening consent…`)
              : _(msg`Authorize this feature`)}
          </ButtonText>
        </Button>
        <Button
          testID={`oauth-feature-services-${feature}`}
          label={_(msg`Inspect authorization settings`)}
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
  const {_} = useLingui()
  const t = useTheme()
  const [expanded, setExpanded] = useState(false)
  const detailsId = `authorization-provenance-details-${useId()}`
  const grants = getOAuthFeatureGrantPresentations(account.oauthScopes)

  return (
    <View style={[a.gap_sm]} testID="authorization-provenance">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          expanded
            ? _(msg`Hide delegated authority`)
            : _(msg`Inspect delegated authority`)
        }
        accessibilityHint={_(
          msg`Shows the OAuth permissions, service authority, and revocation boundary for this session`,
        )}
        accessibilityState={{expanded}}
        aria-expanded={expanded}
        aria-controls={expanded ? detailsId : undefined}
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
            ? _(msg`Hide delegated authority`)
            : _(msg`Inspect delegated authority`)}
        </Text>
      </Pressable>

      {expanded ? (
        <View
          nativeID={detailsId}
          role="region"
          accessibilityLabel={_(msg`Delegated authority details`)}
          accessibilityHint={_(
            msg`Contains OAuth session information, delegated capabilities, and revocation options`,
          )}
          style={[a.gap_md]}
          testID="authorization-provenance-details">
          <View style={[a.gap_2xs, a.p_md, t.atoms.bg_contrast_25]}>
            <Text style={a.font_semi_bold}>{_(msg`Account`)}</Text>
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
            <Text style={a.font_semi_bold}>{_(msg`OAuth session`)}</Text>
            <Text>
              {_(
                msg`OAuth service recorded by this session: ${account.service}`,
              )}
            </Text>
            <Text>
              {_(
                msg`Account PDS: ${account.pdsUrl ?? _(msg`Not advertised by this session`)}`,
              )}
            </Text>
          </View>

          <View style={[a.gap_sm]}>
            <Text style={a.font_semi_bold}>{_(msg`Feature authority`)}</Text>
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
              {_(
                msg`Feature upgrades are supported individually. The current session integration revokes the OAuth session as a whole; it does not claim to revoke one feature independently.`,
              )}
            </Text>
            {onRevokeSession ? (
              <Button
                label={_(msg`Revoke this OAuth session`)}
                onPress={onRevokeSession}
                size="small"
                color="secondary"
                variant="outline"
                shape="rectangular">
                <ButtonText>{_(msg`Revoke whole session`)}</ButtonText>
              </Button>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}
