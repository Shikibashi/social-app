import {type ImageStyle} from 'react-native'
import {type PathProps, type SvgProps} from 'react-native-svg'

import {EdrifflesBrandMark} from '#/view/icons/EdrifflesBrandMark'

export function Logomark({
  width,
  style,
}: {fill?: PathProps['fill']} & SvgProps) {
  const parsedSize = Number.parseInt(String(width ?? 32), 10)
  const size = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 32

  return <EdrifflesBrandMark size={size} style={style as ImageStyle} />
}
