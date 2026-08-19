import {Platform} from 'react-native'

import {tokens} from '#/alf'
import {darkPalette, dimPalette, lightPalette} from '#/alf/themes'
import {fontWeight} from '#/alf/tokens'
import {type Theme} from './ThemeContext'

export const defaultTheme: Theme = {
  colorScheme: 'light',
  palette: {
    default: {
      background: lightPalette.contrast_0,
      backgroundLight: lightPalette.contrast_50,
      text: lightPalette.contrast_700,
      textLight: lightPalette.contrast_400,
      textInverted: lightPalette.white,
      link: lightPalette.primary_500,
      border: lightPalette.contrast_200,
    },
    primary: {
      background: lightPalette.primary_600,
      backgroundLight: lightPalette.primary_500,
      text: lightPalette.white,
      textLight: lightPalette.primary_700,
      textInverted: lightPalette.primary_600,
      link: lightPalette.primary_700,
      border: lightPalette.primary_700,
    },
    secondary: {
      background: lightPalette.positive_600,
      backgroundLight: lightPalette.positive_500,
      text: lightPalette.white,
      textLight: lightPalette.positive_700,
      textInverted: lightPalette.positive_600,
      link: lightPalette.positive_700,
      border: lightPalette.positive_700,
    },
    inverted: {
      background: darkPalette.contrast_0,
      backgroundLight: darkPalette.contrast_50,
      text: darkPalette.contrast_700,
      textLight: darkPalette.contrast_500,
      textInverted: darkPalette.contrast_0,
      link: darkPalette.primary_500,
      border: darkPalette.contrast_200,
    },
    error: {
      background: lightPalette.negative_600,
      backgroundLight: lightPalette.negative_500,
      text: lightPalette.white,
      textLight: lightPalette.negative_700,
      textInverted: lightPalette.negative_600,
      link: lightPalette.negative_700,
      border: lightPalette.negative_700,
    },
  },
  shapes: {
    button: {
      // TODO
    },
    bigButton: {
      // TODO
    },
    smallButton: {
      // TODO
    },
  },
  typography: {
    '2xl-thin': {
      fontSize: 18,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    '2xl': {
      fontSize: 18,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    '2xl-medium': {
      fontSize: 18,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    '2xl-bold': {
      fontSize: 18,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    '2xl-heavy': {
      fontSize: 18,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.bold,
    },
    'xl-thin': {
      fontSize: 17,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    xl: {
      fontSize: 17,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    'xl-medium': {
      fontSize: 17,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    'xl-bold': {
      fontSize: 17,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    'xl-heavy': {
      fontSize: 17,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.bold,
    },
    'lg-thin': {
      fontSize: 16,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    lg: {
      fontSize: 16,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    'lg-medium': {
      fontSize: 16,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    'lg-bold': {
      fontSize: 16,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    'lg-heavy': {
      fontSize: 16,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.bold,
    },
    'md-thin': {
      fontSize: 15,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    md: {
      fontSize: 15,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    'md-medium': {
      fontSize: 15,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    'md-bold': {
      fontSize: 15,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    'md-heavy': {
      fontSize: 15,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.bold,
    },
    'sm-thin': {
      fontSize: 14,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    sm: {
      fontSize: 14,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    'sm-medium': {
      fontSize: 14,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    'sm-bold': {
      fontSize: 14,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    'sm-heavy': {
      fontSize: 14,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.bold,
    },
    'xs-thin': {
      fontSize: 13,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    xs: {
      fontSize: 13,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    'xs-medium': {
      fontSize: 13,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    'xs-bold': {
      fontSize: 13,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    'xs-heavy': {
      fontSize: 13,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.bold,
    },

    'title-2xl': {
      fontSize: 34,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    'title-xl': {
      fontSize: 28,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.semiBold,
    },
    'title-lg': {
      fontSize: 22,
      fontWeight: fontWeight.semiBold,
    },
    title: {
      fontWeight: fontWeight.semiBold,
      fontSize: 20,
      letterSpacing: tokens.TRACKING,
    },
    'title-sm': {
      fontWeight: fontWeight.semiBold,
      fontSize: 17,
      letterSpacing: tokens.TRACKING,
    },
    'post-text': {
      fontSize: 16,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    'post-text-lg': {
      fontSize: 20,
      letterSpacing: tokens.TRACKING,
      fontWeight: fontWeight.normal,
    },
    'button-lg': {
      fontWeight: fontWeight.semiBold,
      fontSize: 18,
      letterSpacing: tokens.TRACKING,
    },
    button: {
      fontWeight: fontWeight.semiBold,
      fontSize: 14,
      letterSpacing: tokens.TRACKING,
    },
    mono: {
      fontSize: 14,
      fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier New',
    },
  },
}

export const darkTheme: Theme = {
  ...defaultTheme,
  colorScheme: 'dark',
  palette: {
    ...defaultTheme.palette,
    default: {
      background: darkPalette.contrast_0,
      backgroundLight: darkPalette.contrast_25,
      text: darkPalette.contrast_700,
      textLight: darkPalette.contrast_600,
      textInverted: darkPalette.contrast_0,
      link: darkPalette.primary_500,
      border: darkPalette.contrast_200,
    },
    primary: {
      ...defaultTheme.palette.primary,
      background: darkPalette.primary_800,
      backgroundLight: darkPalette.primary_700,
      text: darkPalette.contrast_0,
      textLight: darkPalette.primary_950,
      textInverted: darkPalette.primary_800,
      link: darkPalette.primary_300,
      border: darkPalette.primary_700,
    },
    secondary: {
      background: darkPalette.positive_800,
      backgroundLight: darkPalette.positive_700,
      text: darkPalette.contrast_0,
      textLight: darkPalette.positive_950,
      textInverted: darkPalette.positive_800,
      link: darkPalette.positive_300,
      border: darkPalette.positive_700,
    },
    error: {
      background: darkPalette.negative_800,
      backgroundLight: darkPalette.negative_700,
      text: darkPalette.contrast_0,
      textLight: darkPalette.negative_975,
      textInverted: darkPalette.negative_800,
      link: darkPalette.negative_300,
      border: darkPalette.negative_700,
    },
    inverted: {
      background: darkPalette.white,
      backgroundLight: lightPalette.contrast_50,
      text: lightPalette.contrast_700,
      textLight: lightPalette.contrast_400,
      textInverted: darkPalette.white,
      link: lightPalette.primary_500,
      border: lightPalette.contrast_200,
    },
  },
}

export const dimTheme: Theme = {
  ...darkTheme,
  palette: {
    ...darkTheme.palette,
    default: {
      ...darkTheme.palette.default,
      background: dimPalette.contrast_0,
      backgroundLight: dimPalette.contrast_25,
      text: dimPalette.contrast_700,
      textLight: dimPalette.contrast_500,
      textInverted: dimPalette.contrast_0,
      link: dimPalette.primary_500,
      border: dimPalette.contrast_200,
    },
    primary: {
      background: dimPalette.primary_800,
      backgroundLight: dimPalette.primary_700,
      text: dimPalette.contrast_0,
      textLight: dimPalette.primary_950,
      textInverted: dimPalette.primary_800,
      link: dimPalette.primary_300,
      border: dimPalette.primary_700,
    },
    secondary: {
      background: dimPalette.positive_800,
      backgroundLight: dimPalette.positive_700,
      text: dimPalette.contrast_0,
      textLight: dimPalette.positive_950,
      textInverted: dimPalette.positive_800,
      link: dimPalette.positive_300,
      border: dimPalette.positive_700,
    },
    error: {
      background: dimPalette.negative_800,
      backgroundLight: dimPalette.negative_700,
      text: dimPalette.contrast_0,
      textLight: dimPalette.negative_975,
      textInverted: dimPalette.negative_800,
      link: dimPalette.negative_300,
      border: dimPalette.negative_700,
    },
  },
}
