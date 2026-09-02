import {type ImageStyle, type StyleProp} from 'react-native'
import Svg, {Path, Rect} from 'react-native-svg'

import {PLUMBLINE_BRASS, PRODUCT_NAME} from '#/lib/brand'

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
        stroke={PLUMBLINE_BRASS}
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
        stroke={PLUMBLINE_BRASS}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Path
        d="M235 44h42"
        fill="none"
        stroke={PLUMBLINE_BRASS}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <Path
        d="M226 270h60l-12 28h-36z"
        fill={PLUMBLINE_BRASS}
        stroke="#F6F4EF"
        strokeWidth="3"
      />
      <Path
        d="M214 298h84l-20 38-22 111-22-111z"
        fill={PLUMBLINE_BRASS}
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

/**
 * An unboxed masthead symbol. The application mark remains a square tile for
 * browser/app identity, while the publication masthead uses the underlying
 * line-and-bob geometry without adding another little panel around it.
 */
export function PlumblineMastheadSymbol({
  size,
  style,
}: {
  size: number
  style?: StyleProp<ImageStyle>
}) {
  return (
    <Svg
      width={size}
      height={size * 1.32}
      viewBox="0 0 64 84"
      style={style}
      accessible={false}
      accessibilityIgnoresInvertColors>
      <Path
        d="M32 5v46"
        fill="none"
        stroke="#151F3A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Path
        d="M25 6h14"
        fill="none"
        stroke={PLUMBLINE_BRASS}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Rect x="26.5" y="49" width="11" height="5" fill={PLUMBLINE_BRASS} />
      <Path
        d="M23 54h18l-4.5 9.5L32 79l-4.5-15.5z"
        fill={PLUMBLINE_BRASS}
        stroke="#151F3A"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <Path
        d="M32 56v19"
        fill="none"
        stroke="#F6F4EF"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  )
}
