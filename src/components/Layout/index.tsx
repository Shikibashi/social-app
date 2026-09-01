import {memo, useContext, useEffect, useMemo} from 'react'
import {
  type StyleProp,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native'
import Animated, {
  type AnimatedRef,
  type AnimatedScrollViewProps,
  useAnimatedStyle,
} from 'react-native-reanimated'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {useIsFocused} from '@react-navigation/native'

import {useEnableMinimalShellModeForScreen} from '#/state/shell'
import {useShellLayout} from '#/state/shell/shell-layout'
import {
  PLUMBLINE_PAGE_MASTHEAD_HEIGHT,
  PlumblineWorkbenchMasthead,
} from '#/view/shell/PlumblineShellBrand'
import {useIsWithinSplitView} from '#/screens/Messages/components/splitView/context'
import {
  atoms as a,
  useBreakpoints,
  useLayoutBreakpoints,
  useTheme,
  web,
} from '#/alf'
import {useDialogContext} from '#/components/Dialog'
import {
  CENTER_COLUMN_OFFSET,
  CENTER_COLUMN_WIDTH,
  PAGE_MODE_CENTER_COLUMN_WIDTH,
  SCROLLBAR_OFFSET,
} from '#/components/Layout/const'
import {ScrollbarOffsetContext} from '#/components/Layout/context'
import {IS_WEB} from '#/env'

export * from '#/components/Layout/const'
export * as Header from '#/components/Layout/Header'

export type ScreenProps = React.ComponentProps<typeof View> & {
  style?: StyleProp<ViewStyle>
  noInsetTop?: boolean
  minimalShell?: boolean
  ecwMode?: 'page' | 'workbench'
}

/**
 * Outermost component of every screen
 */
export const Screen = memo(function Screen({
  style,
  noInsetTop,
  minimalShell = false,
  ecwMode = 'page',
  ...props
}: ScreenProps) {
  const {top} = useSafeAreaInsets()
  const {isWithinSplitView} = useIsWithinSplitView()
  const {isWithinOffsetView} = useContext(ScrollbarOffsetContext)
  const {gtMobile} = useBreakpoints()
  const {centerColumnOffset, leftNavMinimal} = useLayoutBreakpoints()
  const isFocused = useIsFocused()

  useEnableMinimalShellModeForScreen({enabled: minimalShell})

  useEffect(() => {
    if (!IS_WEB || !isFocused) return

    const shell = document.querySelector<HTMLElement>(
      "[data-testid='plumbline-shell']",
    )
    if (!shell) return

    shell.dataset.ecwShellMode = ecwMode

    return () => {
      if (shell.dataset.ecwShellMode === ecwMode) {
        delete shell.dataset.ecwShellMode
      }
    }
  }, [ecwMode, isFocused])

  const showResponsiveMasthead =
    IS_WEB &&
    !isWithinSplitView &&
    ecwMode === 'workbench' &&
    leftNavMinimal &&
    gtMobile

  return (
    <>
      {IS_WEB && !isWithinSplitView && <WebCenterBorders ecwMode={ecwMode} />}
      <View
        {...(IS_WEB && isFocused ? {dataSet: {ecwMode}} : {})}
        style={[
          a.util_screen_outer,
          {paddingTop: noInsetTop ? 0 : top},
          isWithinSplitView && {maxHeight: '100%'},
          style,
        ]}
        {...props}>
        {showResponsiveMasthead && (
          <View
            style={[
              a.w_full,
              gtMobile && [a.mx_auto, {maxWidth: CENTER_COLUMN_WIDTH}],
              !isWithinOffsetView &&
                !isWithinSplitView && {
                  transform: [
                    {
                      translateX: centerColumnOffset ? CENTER_COLUMN_OFFSET : 0,
                    },
                    {translateX: web(SCROLLBAR_OFFSET) ?? 0},
                  ],
                },
            ]}>
            <PlumblineWorkbenchMasthead />
          </View>
        )}
        {props.children}
      </View>
    </>
  )
})

export type ContentProps = AnimatedScrollViewProps & {
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
  ignoreTabletLayoutOffset?: boolean
  ref?: AnimatedRef<Animated.ScrollView>
}

/**
 * Default scroll view for simple pages
 */
export const Content = memo(function Content({
  children,
  style,
  contentContainerStyle,
  ignoreTabletLayoutOffset,
  ref,
  ...props
}: ContentProps) {
  const t = useTheme()
  const {footerHeight} = useShellLayout()
  const {isWithinSplitView} = useIsWithinSplitView()

  // note - if we ever make the footer transparent in any way,
  // we'll need to change this to use contentInsets/scrollIndicatorInsets
  // on iOS and contentContainerStyle padding on Android -sfn
  const animatedStyle = useAnimatedStyle(() => {
    return {
      marginBottom: footerHeight.get(),
    }
  })

  return (
    <Animated.ScrollView
      ref={ref}
      id="content"
      {...(IS_WEB ? {dataSet: {ecwRegion: 'content'}} : {})}
      automaticallyAdjustsScrollIndicatorInsets={false}
      indicatorStyle={t.scheme === 'dark' ? 'white' : 'black'}
      style={[
        a.w_full,
        animatedStyle,
        isWithinSplitView &&
          web({
            flex: 1,
            overflowY: 'scroll',
            scrollbarWidth: 'thin',
            scrollbarColor: `${t.palette.contrast_100} transparent`,
          }),
        style,
      ]}
      contentContainerStyle={[contentContainerStyle]}
      {...props}>
      {IS_WEB ? (
        <Center ignoreTabletLayoutOffset={ignoreTabletLayoutOffset}>
          {/* @ts-expect-error web only -esb */}
          {children}
        </Center>
      ) : (
        children
      )}
    </Animated.ScrollView>
  )
})

/**
 * Utility component to center content within the screen
 */
export const Center = memo(function LayoutCenter({
  children,
  style,
  ignoreTabletLayoutOffset,
  ...props
}: ViewProps & {ignoreTabletLayoutOffset?: boolean}) {
  const {isWithinOffsetView} = useContext(ScrollbarOffsetContext)
  const {gtMobile} = useBreakpoints()
  const {centerColumnOffset} = useLayoutBreakpoints()
  const {isWithinDialog} = useDialogContext()
  const {isWithinSplitView} = useIsWithinSplitView()
  const ctx = useMemo(() => ({isWithinOffsetView: true}), [])
  return (
    <View
      {...(IS_WEB ? {dataSet: {ecwRegion: 'center'}} : {})}
      style={[
        a.w_full,
        !isWithinSplitView && a.mx_auto,
        gtMobile && {
          maxWidth: CENTER_COLUMN_WIDTH,
        },
        !isWithinOffsetView &&
          !isWithinSplitView && {
            transform: [
              {
                translateX:
                  centerColumnOffset &&
                  !ignoreTabletLayoutOffset &&
                  !isWithinDialog
                    ? CENTER_COLUMN_OFFSET
                    : 0,
              },
              {translateX: web(SCROLLBAR_OFFSET) ?? 0},
            ],
          },
        style,
      ]}
      {...props}>
      <ScrollbarOffsetContext.Provider value={ctx}>
        {children}
      </ScrollbarOffsetContext.Provider>
    </View>
  )
})

/**
 * Only used within `Layout.Screen`, not for reuse
 */
const WebCenterBorders = memo(function LayoutWebCenterBorders({
  ecwMode,
}: {
  ecwMode: 'page' | 'workbench'
}) {
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const {centerColumnOffset} = useLayoutBreakpoints()
  const isPageMode = ecwMode === 'page'
  return gtMobile ? (
    <View
      testID="plumbline-center-borders"
      style={[
        a.fixed,
        a.inset_0,
        a.border_l,
        a.border_r,
        t.atoms.border_contrast_low,
        web({
          top: isPageMode ? PLUMBLINE_PAGE_MASTHEAD_HEIGHT : 0,
          width: isPageMode ? PAGE_MODE_CENTER_COLUMN_WIDTH + 2 : 602,
          left: '50%',
          transform: [
            {translateX: '-50%'},
            {
              translateX:
                !isPageMode && centerColumnOffset ? CENTER_COLUMN_OFFSET : 0,
            },
            ...a.scrollbar_offset.transform,
          ],
        }),
      ]}
    />
  ) : null
})
