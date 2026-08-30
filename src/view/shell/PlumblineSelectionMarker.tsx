import {StyleSheet, View} from 'react-native'

import {PLUMBLINE_BRASS} from '#/lib/brand'
import {useTheme} from '#/alf'

/**
 * The shared selected-state mark for Plumbline workbench navigation.
 *
 * The line establishes the current alignment; the brass bob identifies the
 * selected location without replacing the accessible selected state on the
 * interactive control that owns it.
 */
export function PlumblineSelectionMarker({testID}: {testID: string}) {
  const t = useTheme()

  return (
    <View
      aria-hidden={true}
      pointerEvents="none"
      testID={testID}
      style={[styles.track, {backgroundColor: t.palette.contrast_200}]}>
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
  )
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    left: 5,
    top: 8,
    bottom: 8,
    width: 2,
  },
  bob: {
    position: 'absolute',
    top: '50%',
    left: -3,
    width: 8,
    height: 8,
    borderWidth: 1,
    transform: [{rotate: '45deg'}],
  },
})
