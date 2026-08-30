import {type PathProps, type SvgProps} from 'react-native-svg'

import {PlumblineBrandMark} from '#/view/icons/PlumblineBrandMark'

export function Logomark({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  // @ts-expect-error it's fiiiiine
  const size = parseInt(rest.width || 32)

  return <PlumblineBrandMark size={size} style={rest.style} />
}
