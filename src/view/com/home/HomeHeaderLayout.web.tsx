import {type JSX} from 'react'
import {StyleSheet, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {PLUMBLINE_BRASS} from '#/lib/brand'
import {HITSLOP_10} from '#/lib/constants'
import {useSession} from '#/state/session'
import {useShellLayout} from '#/state/shell/shell-layout'
import {HomeHeaderLayoutMobile} from '#/view/com/home/HomeHeaderLayoutMobile'
import {atoms as a, useBreakpoints, useGutters, useTheme} from '#/alf'
import {ButtonIcon} from '#/components/Button'
import {Hashtag_Stroke2_Corner0_Rounded as FeedsIcon} from '#/components/icons/Hashtag'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {H1, Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

export function HomeHeaderLayout(props: {
  children: React.ReactNode
  tabBarAnchor: JSX.Element | null | undefined
  surfaceTitle: string
  surfaceMetadata?: string
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
  surfaceMetadata,
}: {
  children: React.ReactNode
  tabBarAnchor: JSX.Element | null | undefined
  surfaceTitle: string
  surfaceMetadata?: string
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
          <View
            testID="plumbline-document-stream-title-group"
            style={[a.flex_1, {minWidth: 0}]}
            accessible={false}>
            <View style={styles.headingKicker}>
              <Text
                testID="plumbline-document-stream-issue"
                style={styles.headingIssue}>
                CURRENT EDITION
              </Text>
              <Text
                aria-hidden={true}
                style={[styles.headingDivider, t.atoms.text_contrast_low]}>
                /
              </Text>
              <Text
                testID="plumbline-document-stream-section"
                style={[styles.headingSection, t.atoms.text_contrast_medium]}>
                SECTION
              </Text>
            </View>
            <H1
              testID="plumbline-document-stream-title"
              numberOfLines={1}
              style={[styles.headingTitle, t.atoms.text]}>
              {surfaceTitle}
            </H1>
            {surfaceMetadata && (
              <View style={styles.headingMetadataRow}>
                <Text
                  style={[
                    styles.headingMetadataLabel,
                    t.atoms.text_contrast_low,
                  ]}>
                  MODE
                </Text>
                <Text
                  testID="plumbline-document-stream-metadata"
                  numberOfLines={1}
                  style={[
                    styles.headingMetadata,
                    t.atoms.text_contrast_medium,
                  ]}>
                  {surfaceMetadata}
                </Text>
              </View>
            )}
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
    width: 18,
    height: 62,
    marginRight: 14,
    position: 'relative',
  },
  markerLine: {
    position: 'absolute',
    top: 0,
    bottom: 8,
    left: 8,
    width: 2,
  },
  markerBob: {
    position: 'absolute',
    bottom: 0,
    left: 4,
    width: 9,
    height: 9,
    borderWidth: 1,
    transform: [{rotate: '45deg'}],
  },
  headingKicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headingIssue: {
    fontFamily: 'Verdana, "DejaVu Sans", sans-serif',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  headingDivider: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 13,
    lineHeight: 15,
  },
  headingSection: {
    fontFamily: 'Courier New, "Liberation Mono", monospace',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  headingTitle: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 34,
  },
  headingMetadataRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    minWidth: 0,
  },
  headingMetadataLabel: {
    flexShrink: 0,
    fontFamily: 'Courier New, "Liberation Mono", monospace',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  headingMetadata: {
    flexShrink: 1,
    fontFamily: 'Courier New, "Liberation Mono", monospace',
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 0.4,
    lineHeight: 15,
  },
})
