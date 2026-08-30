import {forwardRef} from 'react'
import {type ImageStyle, type TextProps} from 'react-native'
import {type PathProps, type SvgProps} from 'react-native-svg'

import {PlumblineBrandMark} from '#/view/icons/PlumblineBrandMark'

type Props = {
  allowVariants?: boolean
  fill?: PathProps['fill']
  style?: TextProps['style']
} & Omit<SvgProps, 'style'>

export const Logo = forwardRef(function LogoImpl(
  {width = 32, style}: Props,
  _ref,
) {
  const parsedSize = Number.parseInt(String(width), 10)
  const size = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 32

  return <PlumblineBrandMark size={size} style={style as ImageStyle} />
})
