import {type JSX} from 'react'
import {StyleSheet, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {PLUMBLINE_BRASS} from '#/lib/brand'
import {HITSLOP_10} from '#/lib/constants'
import {useSession} from '#/state/session'
import {useShellLayout} from '#/state/shell/shell-layout'
import {HomeHeaderLayoutMobile} from '#/view/com/home/HomeHeaderLayoutMobile'
import {PlumblineBrandMark} from '#/view/icons/PlumblineBrandMark'
import {atoms as a, useBreakpoints, useGutters, useTheme} from '#/alf'
import {ButtonIcon} from '#/components/Button'
import {Hashtag_Stroke2_Corner0_Rounded as FeedsIcon} from '#/components/icons/Hashtag'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

export function HomeHeaderLayout(props: {
  children: React.ReactNode
  tabBarAnchor: JSX.Element | null | undefined
  surfaceTitle: string
}) {
  const {gtMobile} = useBreakpoints()
  if (!gtMobile) {
    return <HomeHeaderLayoutMobile {...props} />
  } else {
    return <HomeHeaderLayoutDesktopAndTablet {...props} />
  }
}

function HomeHeaderLayoutDesktopAndTablet({
  children,
  tabBarAnchor,
  surfaceTitle,
}: {
  children: React.ReactNode
  tabBarAnchor: JSX.Element | null | undefined
  surfaceTitle: string
}) {
  const t = useTheme()
  const {headerHeight} = useShellLayout()
  const {hasSession} = useSession()
  const {_} = useLingui()
  const ax = useAnalytics()
  const gutters = useGutters([0, 'base'])

  return (
    <>
      <Layout.Center>
        <View
          testID="plumbline-document-stream-heading"
          style={[
            a.flex_row,
            a.align_center,
            gutters,
            a.pt_md,
            a.pb_sm,
            t.atoms.bg,
          ]}>
          <View testID="plumbline-document-stream-marker" style={styles.marker}>
            <View
              aria-hidden={true}
              style={[styles.markerLine, {backgroundColor: PLUMBLINE_BRASS}]}
            />
            <View
              aria-hidden={true}
              style={[
                styles.markerBob,
                {
                  backgroundColor: PLUMBLINE_BRASS,
                  borderColor: t.palette.contrast_975,
                },
              ]}
            />
          </View>
          <PlumblineBrandMark size={28} />
          <View
            testID="plumbline-document-stream-title-group"
            style={[a.flex_1, a.pl_sm, {minWidth: 0}]}
            accessible={false}>
            <Text style={styles.headingEyebrow}>DOCUMENT STREAM</Text>
            <Text
              testID="plumbline-document-stream-title"
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.headingTitle, t.atoms.text]}>
              {surfaceTitle}
            </Text>
          </View>
          {hasSession && (
            <Link
              to="/feeds"
              hitSlop={HITSLOP_10}
              label={_(msg`View your feeds and explore more`)}
              size="small"
              variant="ghost"
              color="secondary"
              shape="square"
              onPress={() => {
                ax.metric('nav:click', {item: 'feeds', surface: 'topBar'})
              }}
              style={[a.justify_center]}>
              <ButtonIcon icon={FeedsIcon} size="lg" />
            </Link>
          )}
        </View>
      </Layout.Center>
      {tabBarAnchor}
      <Layout.Center
        style={[a.sticky, a.z_10, a.align_center, t.atoms.bg, {top: 0}]}
        onLayout={e => {
          headerHeight.set(e.nativeEvent.layout.height)
        }}>
        {children}
      </Layout.Center>
    </>
  )
}

const styles = StyleSheet.create({
  marker: {
    width: 10,
    height: 32,
    marginRight: 8,
    position: 'relative',
  },
  markerLine: {
    position: 'absolute',
    top: 0,
    bottom: 5,
    left: 4,
    width: 1,
  },
  markerBob: {
    position: 'absolute',
    bottom: 0,
    left: 1,
    width: 7,
    height: 7,
    borderWidth: 1,
    transform: [{rotate: '45deg'}],
  },
  headingEyebrow: {
    fontFamily: 'Courier New, "Liberation Mono", monospace',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    lineHeight: 15,
  },
  headingTitle: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
})
