import {StyleSheet, useWindowDimensions} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'

import {useBreakpoints} from '#/alf'
import {IS_LIQUID_GLASS} from '#/env'

export function useHeaderOffset() {
  const {gtMobile} = useBreakpoints()
  const {fontScale} = useWindowDimensions()
  const insets = useSafeAreaInsets()
  if (gtMobile) {
    return 0
  }
  const navBarHeight = 52 + (IS_LIQUID_GLASS ? insets.top : 0)
  // Mirrors the compact mobile TabBar: 10px top padding, a 20px line, a
  // 13px text/indicator bottom area, and its structural bottom rule. The
  // previous negative correction left feed content underneath the fixed header.
  const tabBarPad = 10 + 10 + 3
  const normalLineHeight = 20 // matches tab bar
  const tabBarText = normalLineHeight * fontScale
  return navBarHeight + tabBarPad + tabBarText + StyleSheet.hairlineWidth
}
