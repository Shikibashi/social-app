import {useMemo, useState} from 'react'
import {Pressable, StyleSheet, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {buildWhyThisPostModel, hasWhyThisPostDetails} from '#/lib/attention-ui'
import {type FeedSourceInfo} from '#/state/queries/feed'
import {useTheme} from '#/alf'
import {Text} from '#/components/Typography'

export function PostProvenance({
  postUri,
  localExplanation,
  feedContext,
  feedDescriptor,
  feedSourceInfo,
}: {
  postUri: string
  localExplanation?: readonly string[]
  feedContext?: string
  feedDescriptor?: string
  feedSourceInfo?: FeedSourceInfo
}) {
  const {_} = useLingui()
  const t = useTheme()
  const [expanded, setExpanded] = useState(false)
  const model = useMemo(
    () =>
      buildWhyThisPostModel({
        postUri,
        localExplanation,
        feedContext,
        feedDescriptor,
        feedSource: feedSourceInfo,
      }),
    [postUri, localExplanation, feedContext, feedDescriptor, feedSourceInfo],
  )

  if (!hasWhyThisPostDetails(model)) return null

  return (
    <View
      testID="post-provenance"
      style={[styles.container, {borderLeftColor: t.palette.contrast_200}]}>
      <Pressable
        testID="post-provenance-toggle"
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? _(msg`Hide why this post`) : _(msg`Why this post?`)
        }
        accessibilityHint={_(
          msg`Show the public reasons and sources for this post's placement`,
        )}
        accessibilityState={{expanded}}
        onPress={event => {
          event.stopPropagation()
          setExpanded(value => !value)
        }}
        style={({pressed}) => [styles.toggle, pressed && styles.pressed]}>
        <Text style={[styles.toggleText, {color: t.atoms.text_link.color}]}>
          {expanded ? _(msg`Hide why this post`) : _(msg`Why this post?`)}
        </Text>
      </Pressable>

      {expanded ? (
        <View testID="post-provenance-details" style={styles.details}>
          {model.localReasons.map((reason, index) => (
            <Text key={`${reason}-${index}`} style={styles.detail}>
              <Text style={styles.label}>{_(msg`Local policy`)}: </Text>
              {reason}
            </Text>
          ))}
          {model.providerExplanation ? (
            <Text style={styles.detail}>
              <Text style={styles.label}>{_(msg`Feed provider`)}: </Text>
              {model.providerExplanation}
            </Text>
          ) : null}
          {model.feed ? (
            <>
              <Text style={styles.detail}>
                <Text style={styles.label}>{_(msg`Feed source`)}: </Text>
                {model.feed.name}
              </Text>
              <Text style={styles.detail}>
                <Text style={styles.label}>{_(msg`Feed owner`)}: </Text>
                {model.feed.owner}
              </Text>
              <Text style={styles.detail} selectable>
                <Text style={styles.label}>{_(msg`Feed record`)}: </Text>
                {model.feed.uri}
              </Text>
            </>
          ) : null}
          {model.feedDescriptor ? (
            <Text style={styles.detail} selectable>
              <Text style={styles.label}>{_(msg`Feed surface`)}: </Text>
              {model.feedDescriptor}
            </Text>
          ) : null}
          <Text style={styles.detail} selectable>
            <Text style={styles.label}>{_(msg`Post record`)}: </Text>
            {model.postUri}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 2,
    marginBottom: 4,
    paddingLeft: 8,
  },
  toggle: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.65,
  },
  details: {
    gap: 3,
    paddingTop: 3,
  },
  detail: {
    fontSize: 12,
  },
  label: {
    fontWeight: '600',
  },
})
