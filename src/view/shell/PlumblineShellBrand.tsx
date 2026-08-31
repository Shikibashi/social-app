import {type StyleProp, View, type ViewStyle} from 'react-native'

import {PRODUCT_NAME} from '#/lib/brand'
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
      <View style={[a.flex_row, a.align_center, a.gap_sm]}>
        <PlumblineBrandMark size={minimal ? 36 : 34} />
        {!minimal && (
          <Text
            numberOfLines={1}
            style={[
              a.font_bold,
              a.text_xl,
              a.flex_shrink,
              {
                fontFamily: 'Georgia, "Times New Roman", serif',
                letterSpacing: 0.3,
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
