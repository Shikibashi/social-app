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
  contrast_0: '#d5d8de',
  contrast_25: '#ebe9e2',
  contrast_50: '#f6f4ef',
  contrast_100: '#e2e5e8',
  contrast_200: '#8b95a3',
  contrast_300: '#151f3a',
  contrast_400: '#596579',
  contrast_500: '#334058',
  contrast_600: '#334058',
  contrast_700: '#151f3a',
  contrast_800: '#151f3a',
  contrast_900: '#151f3a',
  contrast_950: '#151f3a',
  contrast_975: '#151f3a',
  contrast_1000: '#151f3a',
  primary_25: '#eef4ff',
  primary_50: '#dce8fb',
  primary_100: '#c2d6f3',
  primary_200: '#a1bfe8',
  primary_300: '#759bd1',
  primary_400: '#477bc9',
  primary_500: '#2666cc',
  primary_600: '#1f55ab',
  primary_700: '#184386',
  primary_800: '#123566',
  primary_900: '#0e2a50',
  primary_950: '#0b203d',
  primary_975: '#08172d',
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
  white: '#f6f4ef',
  black: '#000000',
  pink: '#d888a6',
  yellow: '#e5bf70',
  like: '#d888a6',
  contrast_0: '#0b1020',
  contrast_25: '#151f3a',
  contrast_50: '#202b43',
  contrast_100: '#111a2c',
  contrast_200: '#7d899a',
  contrast_300: '#d5d8de',
  contrast_400: '#aab4c4',
  contrast_500: '#d5d8de',
  contrast_600: '#d5d8de',
  contrast_700: '#f6f4ef',
  contrast_800: '#f6f4ef',
  contrast_900: '#f6f4ef',
  contrast_950: '#f6f4ef',
  contrast_975: '#f6f4ef',
  contrast_1000: '#f6f4ef',
  primary_25: '#e8f0ff',
  primary_50: '#d4e2fb',
  primary_100: '#b9d0f5',
  primary_200: '#9fc1ff',
  primary_300: '#8db7ff',
  primary_400: '#9fc1ff',
  primary_500: '#9fc1ff',
  primary_600: '#9fc1ff',
  primary_700: '#7199dc',
  primary_800: '#557ab8',
  primary_900: '#3b5d91',
  primary_950: '#2b466e',
  primary_975: '#203653',
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
  contrast_0: '#101828',
  contrast_25: '#18243b',
  contrast_50: '#24324b',
  contrast_100: '#141f33',
  contrast_200: '#718096',
  contrast_300: '#cbd3dc',
  contrast_400: '#a1adbd',
  contrast_500: '#d0d5dc',
  contrast_600: '#d0d5dc',
  contrast_700: '#f1eee7',
  contrast_800: '#f1eee7',
  contrast_900: '#f1eee7',
  contrast_950: '#f1eee7',
  contrast_975: '#f1eee7',
  contrast_1000: '#f1eee7',
  primary_25: '#e2ecff',
  primary_50: '#c9dcfb',
  primary_100: '#afc9ed',
  primary_200: '#91b7f2',
  primary_300: '#80a8e1',
  primary_400: '#91b7f2',
  primary_500: '#91b7f2',
  primary_600: '#91b7f2',
  primary_700: '#668bc4',
  primary_800: '#4b6e9f',
  primary_900: '#35537c',
  primary_950: '#294363',
  primary_975: '#20344e',
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
