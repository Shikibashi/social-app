import {useState} from 'react'
import {Pressable, StyleSheet, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {
  type AccountProfileMediaProvenance,
  buildPdsBlobUrl,
} from '#/lib/api/account-profile'
import {PLUMBLINE_BRASS} from '#/lib/brand'
import {useTheme} from '#/alf'
import {InlineLinkText} from '#/components/Link'
import {PlumblineAuthoritySummary} from '#/components/PlumblineAuthoritySummary'
import {Text} from '#/components/Typography'

/**
 * Progressive inspection for the account-owned profile-media boundary.
 *
 * Profile image URLs may be cached or rewritten by an AppView/CDN, but the
 * blob reference is authored in the account's profile record. This inspector
 * names that authority without pretending that a delivery endpoint is a
 * second author of the media.
 */
export function MediaDeliveryProvenance({
  provenance,
  summaryPresentation = 'full',
}: {
  provenance?: AccountProfileMediaProvenance
  summaryPresentation?: 'full' | 'compact'
}) {
  const {_} = useLingui()
  const t = useTheme()
  const [expanded, setExpanded] = useState(false)

  if (!provenance) return null

  const avatarSource = buildPdsBlobUrl(
    provenance.endpoint,
    provenance.did,
    provenance.avatarCid,
  )
  const bannerSource = buildPdsBlobUrl(
    provenance.endpoint,
    provenance.did,
    provenance.bannerCid,
  )

  return (
    <View testID="media-delivery-provenance" style={styles.container}>
      <PlumblineAuthoritySummary
        testID="media-delivery-authority-summary"
        title={_(msg`Profile media`)}
        source={_(msg`Account PDS profile record`)}
        rule={_(msg`Profile record determines blob CID`)}
        state={_(msg`Record available; direct PDS delivery`)}
        presentation={summaryPresentation}
      />
      <Pressable
        testID="media-delivery-provenance-toggle"
        accessibilityRole="button"
        accessibilityLabel={
          expanded
            ? _(msg`Hide profile media source details`)
            : _(msg`Show profile media source details`)
        }
        accessibilityHint={_(
          msg`Show the account PDS and blob references used for profile media`,
        )}
        accessibilityState={{expanded}}
        onPress={() => setExpanded(value => !value)}
        style={({pressed}) => [styles.toggle, pressed && styles.pressed]}>
        <Text style={[styles.toggleText, {color: t.atoms.text_link.color}]}>
          {expanded
            ? _(msg`Hide profile media source details`)
            : _(msg`Inspect profile media source`)}
        </Text>
      </Pressable>

      {expanded ? (
        <View testID="media-delivery-provenance-details" style={styles.details}>
          <Text accessibilityRole="header">
            {_(msg`Profile media delivery`)}
          </Text>
          <Detail label={_(msg`Authority`)} value={_(msg`Account PDS`)} />
          <Detail
            label={_(msg`Record owner`)}
            value={provenance.did}
            selectable
          />
          <Detail
            label={_(msg`Profile record`)}
            value={provenance.recordUri}
            selectable
          />
          <Detail
            label={_(msg`Delivery endpoint`)}
            value={provenance.endpoint}
            selectable
          />
          <Detail
            label={_(msg`Protocol method`)}
            value={provenance.deliveryMethod}
            selectable
          />
          <Detail
            label={_(msg`Avatar CID`)}
            value={provenance.avatarCid ?? _(msg`Not set`)}
            selectable
          />
          <Detail
            label={_(msg`Banner CID`)}
            value={provenance.bannerCid ?? _(msg`Not set`)}
            selectable
          />
          {avatarSource || bannerSource ? (
            <View style={styles.sources}>
              <Text style={styles.sectionTitle}>
                {_(msg`Open source media`)}
              </Text>
              {avatarSource ? (
                <InlineLinkText
                  testID="media-delivery-open-avatar-source"
                  to={avatarSource}
                  disableMismatchWarning
                  label={_(msg`Open avatar from account PDS`)}
                  accessibilityHint={_(
                    msg`Open the avatar blob served directly by the account PDS`,
                  )}>
                  {_(msg`Open avatar from account PDS`)}
                </InlineLinkText>
              ) : null}
              {bannerSource ? (
                <InlineLinkText
                  testID="media-delivery-open-banner-source"
                  to={bannerSource}
                  disableMismatchWarning
                  label={_(msg`Open banner from account PDS`)}
                  accessibilityHint={_(
                    msg`Open the banner blob served directly by the account PDS`,
                  )}>
                  {_(msg`Open banner from account PDS`)}
                </InlineLinkText>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.note}>
            {_(
              msg`These CIDs come from the account profile record. The links above open the derived PDS delivery URLs. An AppView or CDN may provide a cached view, but it cannot replace the account PDS as the record authority.`,
            )}
          </Text>
        </View>
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
  sources: {
    borderLeftWidth: 2,
    borderLeftColor: PLUMBLINE_BRASS,
    gap: 2,
    marginTop: 2,
    paddingLeft: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  detail: {
    fontSize: 12,
  },
  label: {
    fontWeight: '600',
  },
  note: {
    fontSize: 12,
    paddingTop: 3,
  },
})
