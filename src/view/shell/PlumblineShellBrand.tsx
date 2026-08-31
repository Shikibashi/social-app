import {type StyleProp, StyleSheet, View, type ViewStyle} from 'react-native'

import {PLUMBLINE_BRASS, PRODUCT_NAME} from '#/lib/brand'
import {PlumblineBrandMark} from '#/view/icons/PlumblineBrandMark'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

/**
 * Shared shell identity for the web workbench and the native drawer.
 *
 * Keep the product mark separate from account identity: the account card below
 * it describes the actor, while this block describes the user agent currently
 * presenting the account.
 */
export function PlumblineShellBrand({
  minimal = false,
  style,
}: {
  minimal?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()

  return (
    <View
      testID="plumbline-shell-brand"
      style={[a.w_full, a.gap_xs, style]}
      accessibilityRole="image"
      accessibilityLabel={PRODUCT_NAME}
      accessibilityHint="">
      <View
        testID="plumbline-brand-lockup"
        style={[a.flex_row, a.align_center, a.gap_sm]}>
        <PlumblineBrandMark size={minimal ? 36 : 40} />
        {!minimal && (
          <Text
            numberOfLines={1}
            style={[
              a.font_bold,
              a.text_xl,
              a.flex_shrink,
              {
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 24,
                lineHeight: 28,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              },
            ]}>
            {PRODUCT_NAME}
          </Text>
        )}
      </View>
      {!minimal && (
        <Text
          style={[
            a.text_xs,
            t.atoms.text_contrast_medium,
            {
              fontFamily: 'Courier New, "Liberation Mono", monospace',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            },
          ]}>
          Social client for the open web
        </Text>
      )}
      {!minimal && (
        <Text
          style={[
            a.text_xs,
            t.atoms.text_contrast_medium,
            {
              fontFamily: 'Courier New, "Liberation Mono", monospace',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            },
          ]}>
          Align · Inspect · Understand
        </Text>
      )}
    </View>
  )
}

/**
 * The compact desktop shell uses an icon-only Navigator to preserve the
 * document stream width. Keep the full product identity in the workspace so
 * that compact navigation does not make the user agent anonymous.
 */
export function PlumblineWorkbenchMasthead({
  style,
}: {
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()

  return (
    <View
      testID="plumbline-responsive-masthead"
      style={[a.w_full, a.flex_row, a.align_start, style]}>
      <View testID="plumbline-masthead-marker" style={styles.mastheadMarker}>
        <View
          aria-hidden={true}
          style={[styles.mastheadLine, {backgroundColor: PLUMBLINE_BRASS}]}
        />
        <View
          aria-hidden={true}
          style={[
            styles.mastheadBob,
            {
              backgroundColor: PLUMBLINE_BRASS,
              borderColor: t.palette.contrast_975,
            },
          ]}
        />
      </View>
      <View style={[a.flex_1]}>
        <PlumblineShellBrand />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  mastheadMarker: {
    width: 12,
    height: 52,
    marginRight: 10,
    position: 'relative',
  },
  mastheadLine: {
    position: 'absolute',
    top: 0,
    bottom: 7,
    left: 5,
    width: 2,
  },
  mastheadBob: {
    position: 'absolute',
    bottom: 0,
    left: 2,
    width: 8,
    height: 8,
    borderWidth: 1,
    transform: [{rotate: '45deg'}],
  },
})
