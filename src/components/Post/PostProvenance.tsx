import {useMemo, useState} from 'react'
import {Pressable, StyleSheet, View} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {type FeedProviderProvenance} from '#/lib/api/feed/types'
import {
  buildWhyThisPostModel,
  hasWhyThisPostPlacementDetails,
} from '#/lib/attention-ui'
import {
  type ProviderCompositionStatus,
  type ProviderIndependence,
} from '#/lib/provider-composition'
import {type FeedSourceInfo} from '#/state/queries/feed'
import {useTheme} from '#/alf'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'

export function PostProvenance({
  postUri,
  localExplanation,
  feedContext,
  feedDescriptor,
  feedSourceInfo,
  providerProvenance,
  providerCompositionStatus,
  providerIndependence,
}: {
  postUri: string
  localExplanation?: readonly string[]
  feedContext?: string
  feedDescriptor?: string
  feedSourceInfo?: FeedSourceInfo
  providerProvenance?: readonly FeedProviderProvenance[]
  providerCompositionStatus?: ProviderCompositionStatus
  providerIndependence?: ProviderIndependence
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
        providerProvenance,
        providerCompositionStatus,
        providerIndependence,
      }),
    [
      postUri,
      localExplanation,
      feedContext,
      feedDescriptor,
      feedSourceInfo,
      providerProvenance,
      providerCompositionStatus,
      providerIndependence,
    ],
  )

  if (!hasWhyThisPostPlacementDetails(model)) return null

  const onCopyPostUri = (event: {stopPropagation: () => void}) => {
    event.stopPropagation()
    void Clipboard.setStringAsync(model.postUri).then(() => {
      Toast.show(_(msg`AT URI copied to clipboard`), {type: 'success'})
    })
  }

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
          {model.providerProvenance?.length ? (
            <>
              <Text style={styles.detail}>
                <Text style={styles.label}>{_(msg`Read provider(s)`)}: </Text>
                {model.providerProvenance
                  .map(provider => provider.displayName)
                  .join(', ')}
              </Text>
              {model.providerProvenance.map(provider => (
                <View key={provider.id} style={styles.providerDetail}>
                  <Text style={styles.detail} selectable>
                    <Text style={styles.label}>{provider.displayName}: </Text>
                    {provider.endpoint}
                  </Text>
                  {provider.serviceDid ? (
                    <Text style={styles.detail} selectable>
                      <Text style={styles.label}>{_(msg`Service DID`)}: </Text>
                      {provider.serviceDid}
                    </Text>
                  ) : null}
                  {provider.operatorId ? (
                    <Text style={styles.detail} selectable>
                      <Text style={styles.label}>
                        {_(msg`Declared operator`)}:{' '}
                      </Text>
                      {provider.operatorId}
                    </Text>
                  ) : null}
                </View>
              ))}
            </>
          ) : null}
          {model.providerCompositionStatus ? (
            <Text style={styles.detail}>
              <Text style={styles.label}>{_(msg`Provider composition`)}: </Text>
              {model.providerCompositionStatus}
            </Text>
          ) : null}
          {model.providerIndependence ? (
            <Text style={styles.detail}>
              <Text style={styles.label}>
                {_(msg`Operator independence`)}:{' '}
              </Text>
              {model.providerIndependence === 'declared-distinct'
                ? _(
                    msg`Distinct operator IDs declared; independent control not proven`,
                  )
                : _(msg`Not established`)}
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
          <Pressable
            testID="post-provenance-copy-uri"
            accessibilityRole="button"
            accessibilityLabel={_(msg`Copy AT URI`)}
            accessibilityHint={_(
              msg`Copy the post's stable AT Protocol address to the clipboard`,
            )}
            onPress={onCopyPostUri}
            style={({pressed}) => [
              styles.copyAction,
              {borderColor: t.palette.contrast_200},
              pressed && styles.pressed,
            ]}>
            <Text
              style={[styles.copyActionText, {color: t.atoms.text_link.color}]}>
              {_(msg`Copy AT URI`)}
            </Text>
          </Pressable>
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
  copyAction: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  copyActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  providerDetail: {
    gap: 2,
    paddingLeft: 8,
  },
  label: {
    fontWeight: '600',
  },
})
