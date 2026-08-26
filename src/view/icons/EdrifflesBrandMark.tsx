import {type ImageStyle, type StyleProp} from 'react-native'
import {Image} from 'expo-image'

import {PRODUCT_NAME} from '#/lib/brand'

const EDRIFFLES_EMBLEM = require('../../../assets/edriffles/edriffles-emblem.png')

export function EdrifflesBrandMark({
  size,
  style,
}: {
  size: number
  style?: StyleProp<ImageStyle>
}) {
  return (
    <Image
      source={EDRIFFLES_EMBLEM}
      accessibilityLabel={PRODUCT_NAME}
      accessibilityHint=""
      accessibilityIgnoresInvertColors
      contentFit="contain"
      style={[{width: size, height: size}, style]}
    />
  )
}
