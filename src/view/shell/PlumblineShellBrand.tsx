import {type StyleProp, StyleSheet, View, type ViewStyle} from 'react-native'

import {PLUMBLINE_BRASS, PRODUCT_NAME} from '#/lib/brand'
import {PlumblineBrandMark} from '#/view/icons/PlumblineBrandMark'
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
        <View testID="plumbline-page-masthead-meta" style={styles.pageMeta}>
          <Text style={[styles.pageMetaText, t.atoms.text_contrast_medium]}>
            LIBERTY / OPEN WEB EDITION
          </Text>
          <Text style={[styles.pageMetaText, t.atoms.text_contrast_medium]}>
            AT PROTOCOL / USER AGENT
          </Text>
        </View>
        <View testID="plumbline-page-identity" style={styles.pageIdentity}>
          <PlumblineBrandMark size={32} />
          <View style={styles.pageWordmarkBlock}>
            <Text testID="plumbline-page-wordmark" style={styles.pageWordmark}>
              {PRODUCT_NAME}
            </Text>
            <Text
              testID="plumbline-page-descriptor"
              style={[styles.pageDescriptor, t.atoms.text_contrast_medium]}>
              Social client for the open web
            </Text>
          </View>
        </View>
        <View testID="plumbline-page-motto" style={styles.pageMottoBlock}>
          <View
            aria-hidden={true}
            testID="plumbline-page-masthead-marker"
            style={styles.pageMarker}>
            <View
              style={[
                styles.pageMarkerLine,
                {backgroundColor: PLUMBLINE_BRASS},
              ]}
            />
            <View
              style={[
                styles.pageMarkerBob,
                {
                  backgroundColor: PLUMBLINE_BRASS,
                  borderColor: t.palette.contrast_975,
                },
              ]}
            />
          </View>
          <Text style={[styles.pageMotto, t.atoms.text_contrast_medium]}>
            Exit · Voice · Association
          </Text>
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
  pageMeta: {
    position: 'absolute',
    top: 8,
    left: 40,
    right: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 15,
  },
  pageMetaText: {
    fontFamily: 'Verdana, "DejaVu Sans", sans-serif',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  pageIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minWidth: 0,
  },
  pageWordmarkBlock: {
    gap: 2,
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
  pageMottoBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    position: 'absolute',
    right: 40,
    bottom: 8,
  },
  pageMotto: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 15,
    fontStyle: 'italic',
    letterSpacing: 0.2,
    lineHeight: 20,
  },
  pageMarker: {
    width: 10,
    height: 30,
    position: 'relative',
  },
  pageMarkerLine: {
    position: 'absolute',
    top: 0,
    bottom: 5,
    left: 4,
    width: 1,
  },
  pageMarkerBob: {
    position: 'absolute',
    bottom: 0,
    left: 1,
    width: 7,
    height: 7,
    borderWidth: 1,
    transform: [{rotate: '45deg'}],
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
