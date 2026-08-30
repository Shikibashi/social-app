import {type ImageStyle, type StyleProp} from 'react-native'
import Svg, {Path, Rect} from 'react-native-svg'

import {PRODUCT_NAME} from '#/lib/brand'

/**
 * The shared Plumbline mark used by the web and native application shell.
 * The matching public SVG is used for document icons and the first paint.
 */
export function PlumblineBrandMark({
  size,
  style,
}: {
  size: number
  style?: StyleProp<ImageStyle>
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      style={style}
      accessible
      accessibilityRole="image"
      accessibilityLabel={PRODUCT_NAME}
      accessibilityHint=""
      accessibilityIgnoresInvertColors>
      <Rect width="512" height="512" rx="76" fill="#151F3A" />
      <Rect
        x="24"
        y="24"
        width="464"
        height="464"
        rx="60"
        fill="none"
        stroke="#B79A5A"
        strokeWidth="8"
      />
      <Path
        d="M256 48v224"
        fill="none"
        stroke="#F6F4EF"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <Path
        d="M256 48v224"
        fill="none"
        stroke="#B79A5A"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Path
        d="M235 44h42"
        fill="none"
        stroke="#B79A5A"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <Path
        d="M226 270h60l-12 28h-36z"
        fill="#B79A5A"
        stroke="#F6F4EF"
        strokeWidth="3"
      />
      <Path
        d="M214 298h84l-20 38-22 111-22-111z"
        fill="#B79A5A"
        stroke="#F6F4EF"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <Path
        d="M256 302v128"
        fill="none"
        stroke="#F6F4EF"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.9"
      />
      <Path
        d="M236 338h40"
        fill="none"
        stroke="#8D713C"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </Svg>
  )
}
