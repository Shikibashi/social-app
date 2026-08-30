import {StyleSheet, View} from 'react-native'

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
  const t = useTheme()

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      style={[styles.container, {borderLeftColor: t.palette.contrast_200}]}>
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <Text
        style={[styles.text, {color: t.atoms.text_contrast_medium.color}]}
        numberOfLines={2}>
        <Text style={styles.label}>Source: </Text>
        {source}
      </Text>
      <Text
        style={[styles.text, {color: t.atoms.text_contrast_medium.color}]}
        numberOfLines={2}>
        <Text style={styles.label}>Rule: </Text>
        {rule}
        {' · '}
        <Text style={styles.label}>State: </Text>
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
