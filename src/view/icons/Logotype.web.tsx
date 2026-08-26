import {Text} from 'react-native'
import {type PathProps, type SvgProps} from 'react-native-svg'

import {PRODUCT_NAME} from '#/lib/brand'
import {usePalette} from '#/lib/hooks/usePalette'

export function Logotype({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const pal = usePalette('default')
  const parsedSize = Number.parseInt(String(rest.width ?? 32), 10)
  const size = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 32

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
          fontSize: Math.max(12, Math.min(32, size * 0.2)),
          fontWeight: '700',
          letterSpacing: 0.35,
          lineHeight: Math.max(18, size * 0.24),
          width: size,
        },
        rest.style,
      ]}>
      edriffles
    </Text>
  )
}
