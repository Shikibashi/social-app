import {Text, View} from 'react-native'
import {type PathProps, type SvgProps} from 'react-native-svg'

import {PRODUCT_NAME, PRODUCT_WORDMARK} from '#/lib/brand'
import {PlumblineBrandMark} from '#/view/icons/PlumblineBrandMark'
import {useTheme} from '#/alf'

const ratio = 17 / 64

export function LogomarkWithType({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const t = useTheme()
  const parsedSize = Number.parseInt(String(rest.width ?? 32), 10)
  const size = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 32
  const markSize = Math.max(22, Math.round(size * 0.24))

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={PRODUCT_NAME}
      accessibilityHint=""
      style={[
        {
          width: size,
          height: Number(size) * ratio,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        rest.style,
      ]}>
      <PlumblineBrandMark size={markSize} />
      <Text
        numberOfLines={1}
        style={{
          color: fill || t.atoms.text.color,
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: Math.max(14, Math.round(markSize * 0.62)),
          fontWeight: '700',
          letterSpacing: 0.25,
        }}>
        {PRODUCT_WORDMARK}
      </Text>
    </View>
  )
}
