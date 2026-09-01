import {type FontVariant, type TextStyle} from 'react-native'

import {IS_ANDROID, IS_WEB} from '#/env'
import {type Device, device} from '#/storage'

export type MutableTextStyle = {-readonly [K in keyof TextStyle]: TextStyle[K]}

const WEB_SYSTEM_FONT_FAMILIES = `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"`

/*
 * The theme face is a deliberately legible, browser-native interface stack.
 * Keep it distinct from the System preference below: the latter is an
 * explicit user choice and must not be silently replaced by Plumbline's
 * default typography.
 */
const WEB_THEME_FONT_FAMILIES = `Verdana, "DejaVu Sans", Tahoma, "Noto Sans", Arial, "Liberation Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"`

const factor = 0.0625 // 1 - (15/16)
const fontScaleMultipliers: Record<Device['fontScale'], number> = {
  '-2': 1 - factor * 1, // unused
  '-1': 1 - factor * 1,
  '0': 1, // default
  '1': 1 + factor * 1,
  '2': 1 + factor * 1, // unused
}

export function computeFontScaleMultiplier(scale: Device['fontScale']) {
  return fontScaleMultipliers[scale]
}

export function getFontScale() {
  return device.get(['fontScale']) ?? '0'
}

export function setFontScale(fontScale: Device['fontScale']) {
  device.set(['fontScale'], fontScale)
}

export function getFontFamily() {
  return device.get(['fontFamily']) || 'theme'
}

export function setFontFamily(fontFamily: Device['fontFamily']) {
  device.set(['fontFamily'], fontFamily)
}

/*
 * Unused fonts are commented out, but the files are there if we need them.
 */
export function applyFonts(
  style: MutableTextStyle,
  fontFamily: 'system' | 'theme',
) {
  if (fontFamily === 'theme') {
    if (IS_WEB) {
      /*
       * Semantic display and infrastructure roles pass their own family.
       * Preserve those explicit roles on the web, then retain the UI stack as
       * a fallback. The old unconditional Inter assignment erased Georgia and
       * Courier declarations before they could reach the browser.
       */
      style.fontFamily = style.fontFamily
        ? `${style.fontFamily}, ${WEB_THEME_FONT_FAMILIES}`
        : WEB_THEME_FONT_FAMILIES
    } else if (IS_ANDROID) {
      style.fontFamily =
        {
          400: 'Inter-Regular',
          500: 'Inter-Medium',
          600: 'Inter-SemiBold',
          700: 'Inter-Bold',
          800: 'Inter-Bold',
          900: 'Inter-Bold',
        }[String(style.fontWeight || '400')] || 'Inter-Regular'

      if (style.fontStyle === 'italic') {
        if (style.fontFamily === 'Inter-Regular') {
          style.fontFamily = 'Inter-Italic'
        } else {
          style.fontFamily += 'Italic'
        }
      }

      /*
       * These are not supported on Android and actually break the styling.
       */
      delete style.fontWeight
      delete style.fontStyle
    } else {
      style.fontFamily = 'InterVariable'

      if (style.fontStyle === 'italic') {
        style.fontFamily += 'Italic'
      }
    }

    /**
     * Disable contextual alternates and emoji overrides in Inter
     * {@link https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant}
     */
    if (IS_WEB) {
      style.fontVariant = (style.fontVariant || []).concat(
        'no-contextual',
        'unicode' as FontVariant, // web supports 'unicode' as a valid value for fontVariant
      )
    } else {
      style.fontVariant = (style.fontVariant || []).concat('no-contextual')
    }
  } else {
    // fallback families only supported on web
    if (IS_WEB) {
      style.fontFamily = style.fontFamily || WEB_SYSTEM_FONT_FAMILIES
    }

    /**
     * Overridden to previous spacing for the `system` font option.
     * https://github.com/bluesky-social/social-app/commit/2419096e2409008b7d71fd6b8f8d0dd5b016e267
     */
    style.letterSpacing = 0.25
  }
}

/**
 * Here only for bundling purposes, not actually used.
 */
export {DO_NOT_USE} from '#/alf/util/unusedUseFonts'
