import {Text} from 'react-native'
import {type PathProps, type SvgProps} from 'react-native-svg'

import {PRODUCT_NAME, PRODUCT_WORDMARK} from '#/lib/brand'
import {usePalette} from '#/lib/hooks/usePalette'

export function Logotype({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const pal = usePalette('default')
  const parsedSize = Number.parseInt(String(rest.width ?? 32), 10)
  const size = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 32
  // The public Plumbline wordmark has more glyph width than the previous
  // generic ratio allowed. Keep every existing width call site inside its own
  // box instead of rendering an ellipsis in splash screens and compact shells.
  const fontSize = Math.max(12, Math.min(28, size * 0.18))

  return (
    <Text
      accessibilityRole="image"
      accessibilityLabel={PRODUCT_NAME}
      accessibilityHint=""
      numberOfLines={1}
      allowFontScaling={false}
      style={[
        {
          color: fill || pal.text.color,
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize,
          fontWeight: '700',
          letterSpacing: 0.35,
          lineHeight: Math.max(18, fontSize * 1.2),
          width: size,
        },
        rest.style,
      ]}>
      {PRODUCT_WORDMARK}
    </Text>
  )
}
