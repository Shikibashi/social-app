import {type ImageStyle} from 'react-native'
import {type PathProps, type SvgProps} from 'react-native-svg'

import {PlumblineBrandMark} from '#/view/icons/PlumblineBrandMark'

export function Logomark({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const parsedSize = Number.parseInt(String(rest.width ?? 32), 10)
  const size = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 32

  return <PlumblineBrandMark size={size} style={rest.style as ImageStyle} />
}
