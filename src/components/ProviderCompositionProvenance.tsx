import {useState} from 'react'
import {Pressable, StyleSheet, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'

import {
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
  const {_} = useLingui()
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
    : 'No provider answered'
  const status = compositionStatusLabel(composition.status)
  const rule = reconciliationLabel(composition)

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
            value={compositionStatusLabel(composition.status)}
          />
          <Detail
            label={_(msg`Reconciliation`)}
            value={reconciliationLabel(composition)}
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
  return (
    <View style={styles.observation}>
      <Text style={styles.detail} selectable>
        {observation.provider.displayName} · {observation.status} ·{' '}
        {observation.verification}
      </Text>
      <Text style={styles.detail} selectable>
        {observation.provider.endpoint}
        {observation.provider.operatorId
          ? ` · operator ${observation.provider.operatorId}`
          : ''}
      </Text>
      {observation.retrievedAt ? (
        <Text style={styles.detail} selectable>
          Retrieved: {observation.retrievedAt}
        </Text>
      ) : null}
      {observation.error ? (
        <Text style={styles.detail} selectable>
          Error: {observation.error}
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
): string {
  switch (status) {
    case 'agreement':
      return 'agreement'
    case 'disagreement':
      return 'disagreement; provider results differ'
    case 'partial':
      return 'partial; at least one provider did not answer'
    case 'unavailable':
      return 'unavailable'
    case 'empty':
      return 'empty'
  }
}

function reconciliationLabel(
  composition: ProviderCompositionResult<unknown>,
): string {
  switch (composition.policy.mode) {
    case 'require-agreement':
      return 'Require agreement'
    case 'first-verified':
      return 'Use first verified result'
    case 'merge':
      return 'Merge attributable results'
    case 'prefer-provider':
      return `Prefer ${
        composition.policy.preferredProviderId ?? 'provider not specified'
      }`
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
