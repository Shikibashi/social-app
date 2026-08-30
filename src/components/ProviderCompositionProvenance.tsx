import {useState} from 'react'
import {Pressable, StyleSheet, View} from 'react-native'
import {type I18n} from '@lingui/core'
import {msg, plural} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'

import {
  getProviderClaimSummary,
  ProviderCompositionError,
  type ProviderCompositionResult,
} from '#/lib/provider-composition'
import {type NavigationProp} from '#/lib/routes/types'
import {useTheme} from '#/alf'
import {PlumblineAuthoritySummary} from '#/components/PlumblineAuthoritySummary'
import {Text} from '#/components/Typography'

/**
 * Progressive inspection for a composed public read. The selected value is
 * deliberately not enough for this component: the user needs the complete
 * observation set to see disagreement, outages, stale responses, and the
 * limits of declared operator identity.
 */
export function ProviderCompositionProvenance({
  surfaceLabel,
  composition,
}: {
  surfaceLabel: string
  composition?: ProviderCompositionResult<unknown>
}) {
  const {_, i18n} = useLingui()
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const [expanded, setExpanded] = useState(false)

  if (!composition) return null

  const sourceNames = composition.observations.length
    ? [
        ...new Set(
          composition.observations.map(
            observation => observation.provider.displayName,
          ),
        ),
      ].join(', ')
    : _(msg`No provider answered`)
  const status = compositionStatusLabel(composition.status, i18n)
  const rule = reconciliationLabel(composition, i18n)

  return (
    <View
      testID={`provider-composition-provenance-${composition.surface}`}
      style={styles.container}>
      <PlumblineAuthoritySummary
        testID={`provider-composition-summary-${composition.surface}`}
        source={sourceNames}
        rule={rule}
        state={status}
      />
      <Pressable
        testID={`provider-composition-provenance-toggle-${composition.surface}`}
        accessibilityRole="button"
        accessibilityLabel={
          expanded
            ? _(msg`Hide ${surfaceLabel} source details`)
            : _(msg`Show ${surfaceLabel} source details`)
        }
        accessibilityHint={_(
          msg`Show provider observations and the local reconciliation policy`,
        )}
        accessibilityState={{expanded}}
        onPress={() => setExpanded(value => !value)}
        style={({pressed}) => [styles.toggle, pressed && styles.pressed]}>
        <Text style={[styles.toggleText, {color: t.atoms.text_link.color}]}>
          {expanded
            ? _(msg`Hide ${surfaceLabel} source details`)
            : _(msg`Inspect ${surfaceLabel} sources`)}
        </Text>
      </Pressable>

      {expanded ? (
        <View
          testID={`provider-composition-provenance-details-${composition.surface}`}
          style={styles.details}>
          <Text accessibilityRole="header">{surfaceLabel}</Text>
          <Detail
            label={_(msg`Evidence status`)}
            value={compositionStatusLabel(composition.status, i18n)}
          />
          <Detail
            label={_(msg`Reconciliation`)}
            value={reconciliationLabel(composition, i18n)}
          />
          <Detail
            label={_(msg`Claims compared`)}
            value={providerClaimsLabel(composition, i18n)}
          />
          <Detail
            label={_(msg`Selected providers`)}
            value={
              composition.selectedProviderIds.length
                ? composition.selectedProviderIds.join(', ')
                : _(msg`None; no provider result was promoted`)
            }
            selectable
          />
          <Detail
            label={_(msg`Operator independence`)}
            value={
              composition.independence === 'declared-distinct'
                ? _(
                    msg`Distinct operator IDs declared; independent control not proven`,
                  )
                : _(msg`Not established`)
            }
          />
          {composition.declaredOperatorIds.length > 0 ? (
            <Detail
              label={_(msg`Declared operators`)}
              value={composition.declaredOperatorIds.join(', ')}
              selectable
            />
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {_(msg`Provider observations`)}
            </Text>
            {composition.observations.map((observation, index) => (
              <Observation
                key={`${observation.provider.id}-${index}`}
                observation={observation}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable
              testID={`provider-composition-change-${composition.surface}`}
              accessibilityRole="button"
              accessibilityLabel={_(msg`Change read provider`)}
              accessibilityHint={_(
                msg`Open Services to choose which providers can answer this surface`,
              )}
              onPress={() =>
                navigation.navigate('ServicesSettings', {
                  section:
                    composition.surface === 'identity-resolution'
                      ? 'identity'
                      : 'providers',
                })
              }
              style={({pressed}) => [
                styles.action,
                {borderColor: t.palette.contrast_200},
                pressed && styles.pressed,
              ]}>
              <Text
                style={[styles.actionText, {color: t.atoms.text_link.color}]}>
                {_(msg`Change read provider`)}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  )
}

/** Read composition evidence from a fail-closed provider error when present. */
export function getProviderCompositionFromError(
  error: unknown,
): ProviderCompositionResult<unknown> | undefined {
  return error instanceof ProviderCompositionError
    ? error.composition
    : undefined
}

function Observation({
  observation,
}: {
  observation: ProviderCompositionResult<unknown>['observations'][number]
}) {
  const {i18n} = useLingui()

  return (
    <View style={styles.observation}>
      <Text style={styles.detail} selectable>
        {observation.provider.displayName} ·{' '}
        {providerObservationStatusLabel(observation.status, i18n)} ·{' '}
        {providerVerificationLabel(observation.verification, i18n)}
      </Text>
      <Text style={styles.detail} selectable>
        {observation.provider.endpoint}
        {observation.provider.operatorId
          ? ` · ${i18n._(msg`operator ${observation.provider.operatorId}`)}`
          : ''}
      </Text>
      {observation.retrievedAt ? (
        <Text style={styles.detail} selectable>
          {i18n._(msg`Retrieved: ${observation.retrievedAt}`)}
        </Text>
      ) : null}
      {observation.error ? (
        <Text style={styles.detail} selectable>
          {i18n._(msg`Error: ${observation.error}`)}
        </Text>
      ) : null}
    </View>
  )
}

function Detail({
  label,
  value,
  selectable = false,
}: {
  label: string
  value: string
  selectable?: boolean
}) {
  return (
    <Text style={styles.detail} selectable={selectable}>
      <Text style={styles.label}>{label}: </Text>
      {value}
    </Text>
  )
}

function compositionStatusLabel(
  status: ProviderCompositionResult<unknown>['status'],
  i18n: I18n,
): string {
  switch (status) {
    case 'agreement':
      return i18n._(msg`agreement`)
    case 'disagreement':
      return i18n._(msg`disagreement; provider results differ`)
    case 'partial':
      return i18n._(msg`partial; at least one provider did not answer`)
    case 'unavailable':
      return i18n._(msg`unavailable`)
    case 'empty':
      return i18n._(msg`empty`)
  }
}

function reconciliationLabel(
  composition: ProviderCompositionResult<unknown>,
  i18n: I18n,
): string {
  switch (composition.policy.mode) {
    case 'require-agreement':
      return i18n._(msg`Require agreement`)
    case 'first-verified':
      return i18n._(msg`Use first verified result`)
    case 'merge':
      return i18n._(msg`Merge attributable results`)
    case 'prefer-provider':
      return composition.policy.preferredProviderId
        ? i18n._(msg`Prefer ${composition.policy.preferredProviderId}`)
        : i18n._(msg`Prefer provider not specified`)
  }
}

function providerClaimsLabel(
  composition: ProviderCompositionResult<unknown>,
  i18n: I18n,
): string {
  const {
    observedProviderCount,
    respondingProviderCount,
    distinctClaimCount,
    nonClaimObservationCount,
  } = getProviderClaimSummary(composition)

  if (respondingProviderCount === 0) {
    const observations = i18n._(
      plural(observedProviderCount, {
        one: '# provider observation',
        other: '# provider observations',
      }),
    )
    return i18n._(msg`No usable claims from ${observations}`)
  }

  const respondingProviders = i18n._(
    plural(respondingProviderCount, {
      one: '# responding provider',
      other: '# responding providers',
    }),
  )
  const claimSummary =
    distinctClaimCount === 1
      ? respondingProviderCount === 1
        ? i18n._(msg`1 claim from 1 responding provider`)
        : i18n._(msg`1 shared claim from ${respondingProviders}`)
      : i18n._(
          msg`${distinctClaimCount} distinct claims from ${respondingProviders}`,
        )

  if (nonClaimObservationCount === 0) return claimSummary

  const nonClaimObservations = i18n._(
    plural(nonClaimObservationCount, {
      one: '# provider observation',
      other: '# provider observations',
    }),
  )
  return i18n._(
    msg`${claimSummary}; ${nonClaimObservations} did not provide a usable claim`,
  )
}

function providerObservationStatusLabel(
  status: ProviderCompositionResult<unknown>['observations'][number]['status'],
  i18n: I18n,
): string {
  switch (status) {
    case 'ok':
      return i18n._(msg`available`)
    case 'unavailable':
      return i18n._(msg`unavailable`)
    case 'invalid':
      return i18n._(msg`invalid`)
    case 'stale':
      return i18n._(msg`stale`)
  }
}

function providerVerificationLabel(
  verification: ProviderCompositionResult<unknown>['observations'][number]['verification'],
  i18n: I18n,
): string {
  switch (verification) {
    case 'verified':
      return i18n._(msg`verified`)
    case 'unverified':
      return i18n._(msg`unverified`)
    case 'invalid':
      return i18n._(msg`invalid evidence`)
  }
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  toggle: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.65,
  },
  details: {
    gap: 3,
    paddingTop: 3,
  },
  section: {
    gap: 3,
    paddingTop: 3,
  },
  sectionTitle: {
    fontWeight: '600',
  },
  actions: {
    paddingTop: 5,
  },
  action: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  observation: {
    gap: 2,
    paddingLeft: 8,
  },
  detail: {
    fontSize: 12,
  },
  label: {
    fontWeight: '600',
  },
})
