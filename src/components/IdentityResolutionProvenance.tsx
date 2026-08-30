import {useState} from 'react'
import {Pressable, StyleSheet, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {
  type IdentityClaimsResult,
  type IdentityDocumentEvidence,
} from '#/lib/identity-runtime'
import {useTheme} from '#/alf'
import {Text} from '#/components/Typography'

/**
 * Progressive identity inspection for profile and navigation surfaces. The
 * collapsed state names the seam; the expanded state retains the claims and
 * PLC verification summaries needed to contest a resolver result.
 */
export function IdentityResolutionProvenance({
  result,
}: {
  result: IdentityClaimsResult
}) {
  const {_} = useLingui()
  const t = useTheme()
  const [expanded, setExpanded] = useState(false)

  return (
    <View
      testID="identity-resolution-provenance"
      style={[styles.container, {borderLeftColor: t.palette.contrast_200}]}>
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
            value={identityStatusLabel(result.status)}
          />
          {result.selected ? (
            <Detail
              label={_(msg`Selected claim`)}
              value={`${result.selected.providerId} · ${result.selected.did ?? 'no DID'}`}
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
                  {claim.providerId}: {claim.status} · DID{' '}
                  {claim.did ?? _(msg`not supplied`)}
                  {claim.endpoint ? ` · PDS ${claim.endpoint}` : ''}
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
  return (
    <View style={styles.evidenceBlock}>
      <Text style={styles.detail}>
        {evidence.method} · {evidence.composition} ·{' '}
        {evidence.distinctDocumentCount} distinct document state
        {evidence.distinctDocumentCount === 1 ? '' : 's'}
      </Text>
      {evidence.operatorIndependence ? (
        <Text style={styles.detail}>
          Operator independence:{' '}
          {evidence.operatorIndependence === 'declared-distinct'
            ? 'distinct operator IDs declared; independent control not proven'
            : 'not established'}
        </Text>
      ) : null}
      {evidence.selectedResolverId ? (
        <Text style={styles.detail}>
          Selected document source: {evidence.selectedResolverId}
        </Text>
      ) : null}
      {evidence.resolvers.map(resolver => (
        <Text
          key={`${resolver.resolverId}-${resolver.retrievedAt ?? 'unknown'}`}
          style={styles.detail}
          selectable>
          {resolver.displayName ?? resolver.resolverId}: {resolver.status}
          {resolver.operatorId ? ` · operator ${resolver.operatorId}` : ''}
          {resolver.verifiedOperations !== undefined
            ? ` · ${resolver.verifiedOperations} verified operations`
            : ''}
          {resolver.headCid ? ` · head ${resolver.headCid}` : ''}
          {resolver.error ? ` · ${resolver.error}` : ''}
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

function identityStatusLabel(status: IdentityClaimsResult['status']): string {
  switch (status) {
    case 'verified':
      return 'verified'
    case 'disagreement':
      return 'disagreement; no default claim selected'
    case 'resolver-unavailable':
      return 'resolver unavailable or incomplete'
    case 'invalid':
      return 'invalid input'
  }
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 2,
    marginBottom: 4,
    paddingLeft: 8,
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
