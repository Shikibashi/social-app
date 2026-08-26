import {forwardRef} from 'react'
import {type ImageStyle} from 'react-native'

import {EdrifflesBrandMark} from '#/view/icons/EdrifflesBrandMark'
import {type Props, sizes} from './common'

export const Mark = forwardRef(function MarkImpl(props: Props, _ref) {
  const size = sizes[props.size ?? 'md']

  return <EdrifflesBrandMark size={size} style={props.style as ImageStyle} />
})
