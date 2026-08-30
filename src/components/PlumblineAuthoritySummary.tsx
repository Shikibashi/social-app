import {StyleSheet, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {PLUMBLINE_BRASS} from '#/lib/brand'
import {useTheme} from '#/alf'
import {Text} from '#/components/Typography'

/**
 * Compact, progressively disclosed authority information for a Plumbline
 * surface. The values come from an existing provider or policy result; this
 * component only makes that boundary visible before the detailed inspector.
 */
export function PlumblineAuthoritySummary({
  source,
  rule,
  state,
  testID,
  title,
}: {
  source: string
  rule: string
  state: string
  testID: string
  title?: string
}) {
  const {_} = useLingui()
  const t = useTheme()

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      style={[styles.container, {borderLeftColor: t.palette.contrast_200}]}>
      <View
        aria-hidden={true}
        pointerEvents="none"
        testID={`${testID}-marker`}
        style={[styles.marker, {backgroundColor: t.palette.contrast_200}]}>
        <View
          style={[
            styles.bob,
            {
              backgroundColor: PLUMBLINE_BRASS,
              borderColor: t.palette.contrast_975,
            },
          ]}
        />
      </View>
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <Text
        style={[styles.text, {color: t.atoms.text_contrast_medium.color}]}
        numberOfLines={2}>
        <Text style={styles.label}>{_(msg`Source`)}: </Text>
        {source}
      </Text>
      <Text
        style={[styles.text, {color: t.atoms.text_contrast_medium.color}]}
        numberOfLines={2}>
        <Text style={styles.label}>{_(msg`Rule`)}: </Text>
        {rule}
        {' · '}
        <Text style={styles.label}>{_(msg`State`)}: </Text>
        {state}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 2,
    gap: 2,
    marginBottom: 4,
    paddingLeft: 8,
    position: 'relative',
  },
  marker: {
    bottom: 4,
    left: -2,
    position: 'absolute',
    top: 4,
    width: 2,
  },
  bob: {
    borderWidth: 1,
    height: 8,
    left: -3,
    position: 'absolute',
    top: 12,
    transform: [{rotate: '45deg'}],
    width: 8,
  },
  title: {
    fontWeight: '600',
  },
  text: {
    fontSize: 12,
  },
  label: {
    fontWeight: '600',
  },
})
