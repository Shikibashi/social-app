import {type StyleProp, StyleSheet, View, type ViewStyle} from 'react-native'

import {
  PLUMBLINE_BRASS,
  PLUMBLINE_TUCKER_MOTTO,
  PLUMBLINE_TUCKER_MOTTO_CITATION,
  PRODUCT_NAME,
} from '#/lib/brand'
import {
  PlumblineBrandMark,
  PlumblineMastheadSymbol,
} from '#/view/icons/PlumblineBrandMark'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

/**
 * Desktop Page Mode reserves this measured strip for the product masthead.
 * Keep layout callers on the same baseline as its rules and metadata.
 */
export const PLUMBLINE_PAGE_MASTHEAD_HEIGHT = 132

/**
 * Shared shell identity for the web workbench and the native drawer.
 *
 * Keep the product mark separate from account identity: the account card below
 * it describes the actor, while this block describes the user agent currently
 * presenting the account.
 */
export function PlumblineShellBrand({
  minimal = false,
  style,
}: {
  minimal?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()

  return (
    <View
      testID="plumbline-shell-brand"
      style={[a.w_full, a.gap_xs, style]}
      accessibilityRole="image"
      accessibilityLabel={PRODUCT_NAME}
      accessibilityHint="">
      <View
        testID="plumbline-brand-lockup"
        style={[a.flex_row, a.align_center, a.gap_sm]}>
        <PlumblineBrandMark size={minimal ? 36 : 40} />
        {!minimal && (
          <Text
            numberOfLines={1}
            style={[
              a.font_bold,
              a.text_xl,
              a.flex_shrink,
              {
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 24,
                lineHeight: 28,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              },
            ]}>
            {PRODUCT_NAME}
          </Text>
        )}
      </View>
      {!minimal && (
        <Text
          style={[
            a.text_xs,
            t.atoms.text_contrast_medium,
            {
              fontFamily: 'Courier New, "Liberation Mono", monospace',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            },
          ]}>
          Social client for the open web
        </Text>
      )}
      {!minimal && (
        <Text
          style={[
            a.text_xs,
            t.atoms.text_contrast_medium,
            {
              fontFamily: 'Courier New, "Liberation Mono", monospace',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            },
          ]}>
          Align · Inspect · Understand
        </Text>
      )}
    </View>
  )
}

/**
 * Product identity belongs above the desktop composition, not only inside the
 * navigator. The Page Mode masthead is intentionally informational: it does
 * not duplicate a route action or claim authority over the current provider.
 */
export function PlumblinePageMasthead() {
  const t = useTheme()

  return (
    <View
      role="banner"
      testID="plumbline-page-masthead"
      accessibilityLabel={PRODUCT_NAME}
      accessibilityHint="Identifies the Plumbline social client"
      style={[
        styles.pageMasthead,
        a.z_10,
        t.atoms.bg,
        {height: PLUMBLINE_PAGE_MASTHEAD_HEIGHT},
      ]}>
      <View
        aria-hidden={true}
        testID="plumbline-page-masthead-top-rule"
        style={[styles.pageRule, {backgroundColor: t.palette.contrast_300}]}
      />
      <View testID="plumbline-page-masthead-content" style={styles.pageContent}>
        <View testID="plumbline-page-identity" style={styles.pageIdentity}>
          <PlumblineMastheadSymbol size={40} />
          <View style={styles.pageWordmarkBlock}>
            <Text testID="plumbline-page-wordmark" style={styles.pageWordmark}>
              {PRODUCT_NAME}
            </Text>
            <Text
              testID="plumbline-page-descriptor"
              style={[styles.pageDescriptor, t.atoms.text_contrast_medium]}>
              Social client for the open web
            </Text>
            <Text
              testID="plumbline-page-motto"
              style={[styles.pageMotto, t.atoms.text_contrast_medium]}>
              {PLUMBLINE_TUCKER_MOTTO}
            </Text>
            <Text
              testID="plumbline-page-motto-citation"
              style={[styles.pageMottoCitation, t.atoms.text_contrast_medium]}>
              — {PLUMBLINE_TUCKER_MOTTO_CITATION}
            </Text>
          </View>
        </View>
      </View>
      <View
        aria-hidden={true}
        testID="plumbline-page-masthead-bottom-rule"
        style={[styles.pageRule, {backgroundColor: t.palette.contrast_975}]}
      />
    </View>
  )
}

/**
 * The compact desktop shell uses an icon-only Navigator to preserve the
 * document stream width. Keep the full product identity in the workspace so
 * that compact navigation does not make the user agent anonymous.
 */
export function PlumblineWorkbenchMasthead({
  style,
}: {
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()

  return (
    <View
      testID="plumbline-responsive-masthead"
      style={[a.w_full, a.flex_row, a.align_start, style]}>
      <View testID="plumbline-masthead-marker" style={styles.mastheadMarker}>
        <View
          aria-hidden={true}
          style={[styles.mastheadLine, {backgroundColor: PLUMBLINE_BRASS}]}
        />
        <View
          aria-hidden={true}
          style={[
            styles.mastheadBob,
            {
              backgroundColor: PLUMBLINE_BRASS,
              borderColor: t.palette.contrast_975,
            },
          ]}
        />
      </View>
      <View style={[a.flex_1]}>
        <PlumblineShellBrand />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  pageMasthead: {
    width: '100%',
    position: 'relative',
    justifyContent: 'space-between',
  },
  pageRule: {
    height: 1,
    width: '100%',
  },
  pageContent: {
    width: '100%',
    maxWidth: 1440,
    height: PLUMBLINE_PAGE_MASTHEAD_HEIGHT - 2,
    marginHorizontal: 'auto',
    paddingHorizontal: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pageIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minWidth: 0,
  },
  pageWordmarkBlock: {
    alignItems: 'center',
    gap: 3,
    minWidth: 0,
  },
  pageWordmark: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 46,
    fontWeight: '700',
    letterSpacing: 1.2,
    lineHeight: 48,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  pageDescriptor: {
    fontFamily: 'Verdana, "DejaVu Sans", sans-serif',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    lineHeight: 15,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  pageMotto: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 13.5,
    fontStyle: 'italic',
    letterSpacing: 0.1,
    lineHeight: 18,
    maxWidth: 760,
    textAlign: 'center',
  },
  pageMottoCitation: {
    fontFamily: 'Verdana, "DejaVu Sans", sans-serif',
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.9,
    lineHeight: 12,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  mastheadMarker: {
    width: 12,
    height: 52,
    marginRight: 10,
    position: 'relative',
  },
  mastheadLine: {
    position: 'absolute',
    top: 0,
    bottom: 7,
    left: 5,
    width: 2,
  },
  mastheadBob: {
    position: 'absolute',
    bottom: 0,
    left: 2,
    width: 8,
    height: 8,
    borderWidth: 1,
    transform: [{rotate: '45deg'}],
  },
})
