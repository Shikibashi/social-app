import {createTheme, DEFAULT_PALETTE, type Palette} from '@bsky.app/alf'

/*
 * ECW maps its semantic roles onto ALF's existing palette slots. Keeping the
 * slots intact means all existing components retain their behavior while the
 * shared theme changes the rendered surface consistently on web and native.
 */
const ECW_LIGHT_PALETTE: Palette = {
  ...DEFAULT_PALETTE,
  white: '#ffffff',
  black: '#000000',
  pink: '#a82378',
  yellow: '#8a5900',
  like: '#a82378',
  contrast_0: '#d6d9e8',
  contrast_25: '#c7ccdf',
  contrast_50: '#f4f3eb',
  contrast_100: '#e1e3ee',
  contrast_200: '#626a9c',
  contrast_300: '#383f78',
  contrast_400: '#4d5372',
  contrast_500: '#24274a',
  contrast_600: '#24274a',
  contrast_700: '#11132d',
  contrast_800: '#11132d',
  contrast_900: '#11132d',
  contrast_950: '#11132d',
  contrast_975: '#11132d',
  contrast_1000: '#11132d',
  primary_25: '#eff7ff',
  primary_50: '#e2efff',
  primary_100: '#c6ddfb',
  primary_200: '#a8c9ef',
  primary_300: '#7fa8d2',
  primary_400: '#4d78b2',
  primary_500: '#004fa3',
  primary_600: '#004284',
  primary_700: '#00356b',
  primary_800: '#002a54',
  primary_900: '#001f3d',
  primary_950: '#00172d',
  primary_975: '#001124',
  positive_25: '#f1fbf7',
  positive_50: '#d7f2e9',
  positive_100: '#b3e7d7',
  positive_200: '#7ccfb7',
  positive_300: '#40b391',
  positive_400: '#168f71',
  positive_500: '#08775f',
  positive_600: '#055c49',
  positive_700: '#044637',
  positive_800: '#03362b',
  positive_900: '#02281f',
  positive_950: '#011b15',
  positive_975: '#01120e',
  negative_25: '#fff4f8',
  negative_50: '#fbe0eb',
  negative_100: '#f4c0d5',
  negative_200: '#e99ab9',
  negative_300: '#d96d99',
  negative_400: '#bb3f74',
  negative_500: '#9b245f',
  negative_600: '#7d1d4d',
  negative_700: '#64183e',
  negative_800: '#4d1230',
  negative_900: '#3b0d25',
  negative_950: '#29091a',
  negative_975: '#1b0611',
}

const ECW_DARK_PALETTE: Palette = {
  ...DEFAULT_PALETTE,
  white: '#f9f3ff',
  black: '#000000',
  pink: '#ff76d7',
  yellow: '#ffd45c',
  like: '#ff76d7',
  contrast_0: '#050719',
  contrast_25: '#070a2e',
  contrast_50: '#12144b',
  contrast_100: '#0b0d38',
  contrast_200: '#6675c8',
  contrast_300: '#7787e8',
  contrast_400: '#aeb6e9',
  contrast_500: '#dfe6ff',
  contrast_600: '#dfe6ff',
  contrast_700: '#f9f3ff',
  contrast_800: '#f9f3ff',
  contrast_900: '#f9f3ff',
  contrast_950: '#f9f3ff',
  contrast_975: '#f9f3ff',
  contrast_1000: '#f9f3ff',
  primary_25: '#e9feff',
  primary_50: '#c7fbff',
  primary_100: '#a8f7ff',
  primary_200: '#8ff4ff',
  primary_300: '#7af2ff',
  primary_400: '#6ff4ff',
  primary_500: '#6ff4ff',
  primary_600: '#6ff4ff',
  primary_700: '#40cbd5',
  primary_800: '#1aa3ad',
  primary_900: '#0b727d',
  primary_950: '#064e58',
  primary_975: '#033b42',
  positive_25: '#e6fff5',
  positive_50: '#baf8df',
  positive_100: '#85efc4',
  positive_200: '#51e1a7',
  positive_300: '#23d5a6',
  positive_400: '#23d5a6',
  positive_500: '#23d5a6',
  positive_600: '#15b989',
  positive_700: '#0b956f',
  positive_800: '#08775f',
  positive_900: '#055c49',
  positive_950: '#044637',
  positive_975: '#03362b',
  negative_25: '#fff0f7',
  negative_50: '#ffc9e3',
  negative_100: '#ffaad0',
  negative_200: '#ff8cbd',
  negative_300: '#ff76a8',
  negative_400: '#ff76a8',
  negative_500: '#ff76a8',
  negative_600: '#ec4e8d',
  negative_700: '#d63878',
  negative_800: '#bd2e68',
  negative_900: '#9b245f',
  negative_950: '#7d1d4d',
  negative_975: '#64183e',
}

const ECW_DIM_PALETTE: Palette = {
  ...ECW_DARK_PALETTE,
  white: '#f1efff',
  pink: '#f28dcc',
  yellow: '#f2ca68',
  like: '#f28dcc',
  contrast_0: '#0b0d20',
  contrast_25: '#0e123a',
  contrast_50: '#171a4d',
  contrast_100: '#131640',
  contrast_200: '#5968ad',
  contrast_300: '#6c79c9',
  contrast_400: '#9da7d0',
  contrast_500: '#d2d8f4',
  contrast_600: '#d2d8f4',
  contrast_700: '#f1efff',
  contrast_800: '#f1efff',
  contrast_900: '#f1efff',
  contrast_950: '#f1efff',
  contrast_975: '#f1efff',
  contrast_1000: '#f1efff',
  primary_25: '#e4fbff',
  primary_50: '#b9f2f6',
  primary_100: '#98e7ee',
  primary_200: '#7fdae2',
  primary_300: '#71cbd4',
  primary_400: '#65dbe5',
  primary_500: '#65dbe5',
  primary_600: '#65dbe5',
  primary_700: '#3aa9b4',
  primary_800: '#167e89',
  primary_900: '#0d5963',
  primary_950: '#0a3f48',
  primary_975: '#073039',
  positive_25: '#e1fbf1',
  positive_50: '#b9efd8',
  positive_100: '#82dfbd',
  positive_200: '#52c9a2',
  positive_300: '#33bc94',
  positive_400: '#2db08c',
  positive_500: '#2aa17f',
  positive_600: '#208164',
  positive_700: '#16634f',
  positive_800: '#104e40',
  positive_900: '#0c3d32',
  positive_950: '#082b23',
  positive_975: '#06221c',
  negative_25: '#ffeaf2',
  negative_50: '#f9bcd3',
  negative_100: '#f49fc2',
  negative_200: '#ed82ae',
  negative_300: '#e66c9a',
  negative_400: '#d75b8b',
  negative_500: '#c64c7c',
  negative_600: '#aa3e69',
  negative_700: '#8d3258',
  negative_800: '#722847',
  negative_900: '#5e213b',
  negative_950: '#48182d',
  negative_975: '#371223',
}

const ECW_LIGHT = createTheme({
  scheme: 'light',
  name: 'light',
  palette: ECW_LIGHT_PALETTE,
  options: {shadowOpacity: 0.48},
})
const ECW_DARK = createTheme({
  scheme: 'dark',
  name: 'dark',
  palette: ECW_DARK_PALETTE,
  options: {shadowOpacity: 0.78},
})
const ECW_DIM = createTheme({
  scheme: 'dark',
  name: 'dim',
  palette: ECW_DIM_PALETTE,
  options: {shadowOpacity: 0.64},
})

const DEFAULT_THEMES = {
  light: ECW_LIGHT,
  dark: ECW_DARK,
  dim: ECW_DIM,
}

export const themes = {
  lightPalette: DEFAULT_THEMES.light.palette,
  darkPalette: DEFAULT_THEMES.dark.palette,
  dimPalette: DEFAULT_THEMES.dim.palette,
  light: DEFAULT_THEMES.light,
  dark: DEFAULT_THEMES.dark,
  dim: DEFAULT_THEMES.dim,
}

/**
 * @deprecated use ALF and access palette from `useTheme()`
 */
export const lightPalette = DEFAULT_THEMES.light.palette
/**
 * @deprecated use ALF and access palette from `useTheme()`
 */
export const darkPalette = DEFAULT_THEMES.dark.palette
/**
 * @deprecated use ALF and access palette from `useTheme()`
 */
export const dimPalette = DEFAULT_THEMES.dim.palette
/**
 * @deprecated use ALF and access theme from `useTheme()`
 */
export const light = DEFAULT_THEMES.light
/**
 * @deprecated use ALF and access theme from `useTheme()`
 */
export const dark = DEFAULT_THEMES.dark
/**
 * @deprecated use ALF and access theme from `useTheme()`
 */
export const dim = DEFAULT_THEMES.dim
