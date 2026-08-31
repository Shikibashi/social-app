import {useState} from 'react'
import {Pressable, StyleSheet, View} from 'react-native'
import {type I18n} from '@lingui/core'
import {msg, plural} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {
  type IdentityClaimsResult,
  type IdentityDocumentEvidence,
  type IdentityResolution,
  type IdentityResolutionPolicy,
} from '#/lib/identity-runtime'
import {useTheme} from '#/alf'
import {PlumblineAuthoritySummary} from '#/components/PlumblineAuthoritySummary'
import {Text} from '#/components/Typography'

/**
 * Progressive identity inspection for profile and navigation surfaces. The
 * collapsed state names the seam; the expanded state retains the claims and
 * PLC verification summaries needed to contest a resolver result.
 */
export function IdentityResolutionProvenance({
  result,
  summaryPresentation = 'full',
}: {
  result: IdentityClaimsResult
  summaryPresentation?: 'full' | 'compact'
}) {
  const {_, i18n} = useLingui()
  const t = useTheme()
  const [expanded, setExpanded] = useState(false)
  const source = identitySourceNames(result, i18n)
  const rule = identityPolicyLabel(result.policy, i18n)
  const state = identityStatusLabel(result.status, i18n)

  return (
    <View testID="identity-resolution-provenance" style={styles.container}>
      <PlumblineAuthoritySummary
        testID="identity-resolution-authority-summary"
        title={summaryPresentation === 'compact' ? _(msg`Identity`) : undefined}
        source={source}
        rule={rule}
        state={state}
        presentation={summaryPresentation}
      />
      <Pressable
        testID="identity-resolution-provenance-toggle"
        accessibilityRole="button"
        accessibilityLabel={
          expanded
            ? _(msg`Hide identity resolution details`)
            : _(msg`Show identity resolution details`)
        }
        accessibilityHint={_(
          msg`Show the resolver claims and document verification sources for this identity`,
        )}
        accessibilityState={{expanded}}
        onPress={() => setExpanded(value => !value)}
        style={({pressed}) => [styles.toggle, pressed && styles.pressed]}>
        <Text style={[styles.toggleText, {color: t.atoms.text_link.color}]}>
          {expanded
            ? _(msg`Hide identity resolution details`)
            : _(msg`Show identity resolution details`)}
        </Text>
      </Pressable>

      {expanded ? (
        <View
          testID="identity-resolution-provenance-details"
          style={styles.details}>
          <Text accessibilityRole="header">{_(msg`Identity resolution`)}</Text>
          <Detail label={_(msg`Input`)} value={result.input} selectable />
          <Detail
            label={_(msg`Evidence status`)}
            value={identityStatusLabel(result.status, i18n)}
          />
          <Detail label={_(msg`Reconciliation`)} value={rule} />
          {result.selected ? (
            <Detail
              label={_(msg`Selected claim`)}
              value={`${result.selected.providerId} · ${
                result.selected.did ?? _(msg`no DID`)
              }`}
              selectable
            />
          ) : (
            <Detail
              label={_(msg`Selected claim`)}
              value={_(
                msg`None; the current identity policy did not select a claim`,
              )}
            />
          )}

          {result.claims.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{_(msg`Identity claims`)}</Text>
              {result.claims.map((claim, index) => (
                <Text
                  key={`${claim.providerId}-${claim.did ?? 'none'}-${index}`}
                  style={styles.detail}
                  selectable>
                  {claim.providerId}:{' '}
                  {identityClaimStatusLabel(claim.status, i18n)} · {_(msg`DID`)}{' '}
                  {claim.did ?? _(msg`not supplied`)}
                  {claim.endpoint
                    ? ` · ${i18n._(msg`PDS ${claim.endpoint}`)}`
                    : ''}
                </Text>
              ))}
            </View>
          ) : null}

          {result.unavailableResolvers.length > 0 ? (
            <Detail
              label={_(msg`Unavailable resolvers`)}
              value={result.unavailableResolvers.join(', ')}
            />
          ) : null}

          {result.evidence.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {_(msg`Document verification sources`)}
              </Text>
              {result.evidence.map((evidence, index) => (
                <EvidenceBlock
                  key={`${evidence.method}-${evidence.composition}-${index}`}
                  evidence={evidence}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.detail}>
              {result.input.startsWith('did:')
                ? _(
                    msg`No DID-document resolver evidence was queried for this direct DID input.`,
                  )
                : _(
                    msg`No DID-document resolver evidence was returned by the configured identity providers.`,
                  )}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  )
}

function EvidenceBlock({evidence}: {evidence: IdentityDocumentEvidence}) {
  const {i18n} = useLingui()

  return (
    <View style={styles.evidenceBlock}>
      <Text style={styles.detail}>
        {evidence.method} · {evidence.composition} ·{' '}
        {i18n._(
          plural(evidence.distinctDocumentCount, {
            one: '# distinct document state',
            other: '# distinct document states',
          }),
        )}
      </Text>
      {evidence.operatorIndependence ? (
        <Text style={styles.detail}>
          {i18n._(msg`Operator independence`)}:{' '}
          {evidence.operatorIndependence === 'declared-distinct'
            ? i18n._(
                msg`distinct operator IDs declared; independent control not proven`,
              )
            : i18n._(msg`not established`)}
        </Text>
      ) : null}
      {evidence.selectedResolverId ? (
        <Text style={styles.detail}>
          {i18n._(msg`Selected document source`)}: {evidence.selectedResolverId}
        </Text>
      ) : null}
      {evidence.resolvers.map(resolver => (
        <Text
          key={`${resolver.resolverId}-${resolver.retrievedAt ?? 'unknown'}`}
          style={styles.detail}
          selectable>
          {resolver.displayName ?? resolver.resolverId}:{' '}
          {identityResolverStatusLabel(resolver.status, i18n)}
          {resolver.operatorId
            ? ` · ${i18n._(msg`operator ${resolver.operatorId}`)}`
            : ''}
          {resolver.verifiedOperations !== undefined
            ? ` · ${i18n._(
                msg`${resolver.verifiedOperations} verified operations`,
              )}`
            : ''}
          {resolver.headCid
            ? ` · ${i18n._(msg`head ${resolver.headCid}`)}`
            : ''}
          {resolver.error ? ` · ${i18n._(msg`Error: ${resolver.error}`)}` : ''}
        </Text>
      ))}
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

function identityStatusLabel(
  status: IdentityClaimsResult['status'],
  i18n: I18n,
): string {
  switch (status) {
    case 'verified':
      return i18n._(msg`verified`)
    case 'disagreement':
      return i18n._(msg`disagreement; no default claim selected`)
    case 'resolver-unavailable':
      return i18n._(msg`resolver unavailable or incomplete`)
    case 'invalid':
      return i18n._(msg`invalid input`)
  }
}

function identitySourceNames(result: IdentityClaimsResult, i18n: I18n): string {
  const names = [
    ...result.claims.map(claim => claim.providerId),
    ...result.evidence.flatMap(evidence =>
      evidence.resolvers.map(
        resolver => resolver.displayName || resolver.resolverId,
      ),
    ),
    ...result.unavailableResolvers,
  ]
  return (
    Array.from(new Set(names.filter(Boolean))).join(' · ') ||
    i18n._(msg`No resolver answered`)
  )
}

function identityPolicyLabel(
  policy: IdentityResolutionPolicy | undefined,
  i18n: I18n,
): string {
  switch (policy?.mode) {
    case 'require-agreement':
      return i18n._(msg`Require agreement`)
    case 'first-verified':
      return i18n._(msg`Use first verified claim`)
    case 'prefer-provider':
      return i18n._(msg`Prefer ${policy.preferredProviderId}`)
    default:
      return i18n._(msg`Configured identity policy`)
  }
}

function identityClaimStatusLabel(
  status: IdentityResolution['status'],
  i18n: I18n,
): string {
  switch (status) {
    case 'verified':
      return i18n._(msg`verified`)
    case 'unresolved':
      return i18n._(msg`unresolved`)
    case 'stale-cache':
      return i18n._(msg`stale cache`)
    case 'mismatched':
      return i18n._(msg`mismatched`)
    case 'resolver-unavailable':
      return i18n._(msg`resolver unavailable`)
    case 'invalid':
      return i18n._(msg`invalid`)
    case 'revoked':
      return i18n._(msg`revoked`)
  }
}

function identityResolverStatusLabel(
  status: IdentityDocumentEvidence['resolvers'][number]['status'],
  i18n: I18n,
): string {
  switch (status) {
    case 'verified':
      return i18n._(msg`verified`)
    case 'tombstoned':
      return i18n._(msg`tombstoned`)
    case 'invalid':
      return i18n._(msg`invalid`)
    case 'empty':
      return i18n._(msg`empty`)
    case 'unavailable':
      return i18n._(msg`unavailable`)
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
  evidenceBlock: {
    gap: 3,
    paddingLeft: 8,
  },
  detail: {
    fontSize: 12,
  },
  label: {
    fontWeight: '600',
  },
})
