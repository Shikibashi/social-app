import {useEffect, useState} from 'react'
import {Alert, TextInput, View} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import {isDidString} from '@atproto/lex'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {
  type ContentFilterPolicy,
  defaultContentFilterPolicy,
  normalizeContentFilterText,
} from '#/lib/feed-sovereignty/content-filter'
import {
  defaultLocalCurationConfig,
  type RadlibCurationConfig,
} from '#/lib/feed-sovereignty/radlib-curation'
import {
  decryptPersonalization,
  deletePersonalization,
  encryptPersonalization,
  type ExplicitPreferences,
  exportPersonalization,
  importPersonalization,
  loadPersonalization,
  type PersonalizationState,
  resetFeedPreferences,
  resetLearnedPersonalization,
  savePersonalization,
} from '#/lib/personalization'
import {type CommonNavigatorParams} from '#/lib/routes/types'
import {
  useLocalFeedPreferences,
  useQuietMetrics,
} from '#/state/preferences/local-feed'
import {useSession} from '#/state/session'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a} from '#/alf'
import * as Button from '#/components/Button'
import * as SegmentedControl from '#/components/forms/SegmentedControl'
import * as Toggle from '#/components/forms/Toggle'
import {
  ArrowLeft_Stroke2_Corner0_Rounded as ArrowLeftIcon,
  ArrowRight_Stroke2_Corner0_Rounded as ArrowRightIcon,
} from '#/components/icons/Arrow'
import * as Layout from '#/components/Layout'

type Props = NativeStackScreenProps<
  CommonNavigatorParams,
  'PersonalizationSettings'
>

type AttentionKey =
  | 'discovery'
  | 'familiarity'
  | 'freshness'
  | 'variety'
  | 'conversationActivity'
  | 'explorationLevel'

function NumericStepper({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  formatValue: (value: number) => string
  onChange: (value: number) => void
}) {
  const current = Math.max(min, Math.min(max, value))
  const nextValue = (delta: number) =>
    Math.max(min, Math.min(max, Math.round((current + delta) * 100) / 100))
  return (
    <SettingsList.Item>
      <SettingsList.ItemText>{label}</SettingsList.ItemText>
      <View style={[a.flex_row, a.align_center, a.gap_2xs]}>
        <Button.Button
          label={`Decrease ${label}`}
          variant="outline"
          color="secondary"
          size="small"
          shape="square"
          disabled={current <= min}
          onPress={() => onChange(nextValue(-step))}>
          <Button.ButtonIcon icon={ArrowLeftIcon} />
        </Button.Button>
        <SettingsList.BadgeText>{formatValue(current)}</SettingsList.BadgeText>
        <Button.Button
          label={`Increase ${label}`}
          variant="outline"
          color="secondary"
          size="small"
          shape="square"
          disabled={current >= max}
          onPress={() => onChange(nextValue(step))}>
          <Button.ButtonIcon icon={ArrowRightIcon} />
        </Button.Button>
      </View>
    </SettingsList.Item>
  )
}

function AttentionStepper({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (value: number) => void
}) {
  return (
    <NumericStepper
      label={label}
      value={value ?? 0}
      min={0}
      max={1}
      step={0.1}
      formatValue={current => `${Math.round(current * 100)}%`}
      onChange={onChange}
    />
  )
}

function EntryRow({
  label,
  value,
  onChangeText,
  onSubmit,
  placeholder,
  accessibilityLabel,
  accessibilityHint,
  buttonLabel,
  canSubmit,
  autoCapitalize,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  onSubmit: () => void
  placeholder: string
  accessibilityLabel: string
  accessibilityHint: string
  buttonLabel: string
  canSubmit?: boolean
  autoCapitalize?: React.ComponentProps<typeof TextInput>['autoCapitalize']
}) {
  const enabled = canSubmit ?? normalizeContentFilterText(value).length > 0
  return (
    <SettingsList.Item style={[a.flex_col, a.align_start, a.gap_xs]}>
      <SettingsList.ItemText>{label}</SettingsList.ItemText>
      <View
        style={[a.w_full, a.flex_row, a.align_center, a.gap_sm, a.flex_wrap]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          autoCapitalize={autoCapitalize}
          returnKeyType="done"
          style={[a.flex_1, {minWidth: 220, minHeight: 48}]}
        />
        <Button.Button
          label={buttonLabel}
          variant="outline"
          color="secondary"
          size="small"
          shape="rectangular"
          disabled={!enabled}
          onPress={onSubmit}
          style={{minHeight: 48}}>
          <Button.ButtonText>{buttonLabel}</Button.ButtonText>
        </Button.Button>
      </View>
    </SettingsList.Item>
  )
}

export function PersonalizationSettingsScreen({}: Props) {
  const {currentAccount} = useSession()
  const {_} = useLingui()
  const [state, setState] = useState<PersonalizationState>()
  const [password, setPassword] = useState('')
  const {enabled: quietMetricsEnabled, setEnabled: setQuietMetricsEnabled} =
    useQuietMetrics()
  const {
    enabled: localFeedEnabled,
    preferences: localFeedPreferences,
    update: updateLocalFeedPreferences,
    setEnabled: setLocalFeedEnabled,
    setRankingPreset,
  } = useLocalFeedPreferences()
  const [customTermDraft, setCustomTermDraft] = useState('')
  const [excludedAuthorDraft, setExcludedAuthorDraft] = useState('')
  const [curationTermDraft, setCurationTermDraft] = useState('')
  const [excludedCurationTermDraft, setExcludedCurationTermDraft] = useState('')
  const [curationAuthorDraft, setCurationAuthorDraft] = useState('')
  const [interestDraft, setInterestDraft] = useState('')
  const [explicitAuthorDraft, setExplicitAuthorDraft] = useState('')
  const [curationNotice, setCurationNotice] = useState('')
  const [explicitAuthorPreference, setExplicitAuthorPreference] = useState<
    'prefer' | 'avoid'
  >('prefer')

  useEffect(() => {
    let cancelled = false
    setState(undefined)
    if (currentAccount) {
      void loadPersonalization(currentAccount.did).then(next => {
        if (!cancelled) setState(next)
      })
    }
    return () => {
      cancelled = true
    }
  }, [currentAccount?.did])

  async function copyExport(level: 'settings' | 'profile' | 'archive') {
    if (!state) return
    await Clipboard.setStringAsync(exportPersonalization(state, level))
    Alert.alert(
      _(msg`Export copied`),
      _(
        msg`The ${level} portability export is on the clipboard. It contains no credentials.`,
      ),
    )
  }

  async function copyEncryptedExport() {
    if (!state || !password)
      return Alert.alert(
        _(msg`Password required`),
        _(msg`Enter a backup password first.`),
      )
    await Clipboard.setStringAsync(
      await encryptPersonalization(
        exportPersonalization(state, 'archive'),
        password,
      ),
    )
    Alert.alert(
      _(msg`Encrypted backup copied`),
      _(msg`The authenticated encrypted archive is on the clipboard.`),
    )
  }

  async function importFromClipboard() {
    if (!currentAccount) return
    try {
      const text = await Clipboard.getStringAsync()
      const next = text.includes('personalization.encrypted')
        ? !password
          ? (() => {
              throw new Error(
                'Enter the backup password before importing an encrypted backup',
              )
            })()
          : await decryptPersonalization(text, password, currentAccount.did)
        : importPersonalization(text, currentAccount.did)
      await savePersonalization(next)
      setState(next)
      Alert.alert(
        _(msg`Import complete`),
        _(msg`Personalization state was validated and restored.`),
      )
    } catch (error) {
      Alert.alert(
        _(msg`Import rejected`),
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  async function resetLearned() {
    if (!currentAccount) return
    const next = await resetLearnedPersonalization(currentAccount.did)
    setState(next)
  }

  async function resetExplicit() {
    if (!currentAccount) return
    const next = await resetFeedPreferences(currentAccount.did)
    setState(next)
  }

  async function removeAll() {
    if (!currentAccount) return
    await deletePersonalization(currentAccount.did)
    setState(await loadPersonalization(currentAccount.did))
  }

  async function updateExplicit<K extends AttentionKey>(
    key: K,
    value: ExplicitPreferences[K],
  ) {
    if (!state) return
    const next = {
      ...state,
      explicit: {...state.explicit, [key]: value},
      updatedAt: new Date().toISOString(),
    }
    await savePersonalization(next)
    setState(next)
  }

  async function updateExplicitPatch(
    patch: Partial<ExplicitPreferences>,
  ): Promise<void> {
    if (!state) return
    const next = {
      ...state,
      explicit: {...state.explicit, ...patch},
      updatedAt: new Date().toISOString(),
    }
    await savePersonalization(next)
    setState(next)
  }

  function onQuietMetricsChange(enabled: boolean) {
    setQuietMetricsEnabled(enabled)
    setState(current =>
      current
        ? {
            ...current,
            explicit: {
              ...current.explicit,
              quietMode: {
                ...current.explicit.quietMode,
                enabled,
                userConfigured: true,
              },
            },
          }
        : current,
    )
  }

  function updateRadlibCuration(patch: Partial<RadlibCurationConfig>) {
    const current =
      localFeedPreferences.radlibCuration ?? defaultLocalCurationConfig
    const next = {...current, ...patch}
    updateLocalFeedPreferences({radlibCuration: next})
    setState(value =>
      value
        ? {
            ...value,
            explicit: {...value.explicit, radlibCuration: next},
            updatedAt: new Date().toISOString(),
          }
        : value,
    )
  }

  function onRadlibCurationChange(enabled: boolean) {
    updateRadlibCuration({enabled})
  }

  function updateContentFilter(patch: Partial<ContentFilterPolicy>) {
    const current =
      localFeedPreferences.contentFilterPolicy ?? defaultContentFilterPolicy
    const next = {...current, ...patch}
    updateLocalFeedPreferences({contentFilterPolicy: next})
    setState(value =>
      value
        ? {
            ...value,
            explicit: {...value.explicit, contentFilterPolicy: next},
            updatedAt: new Date().toISOString(),
          }
        : value,
    )
  }

  function addCustomTerm() {
    const term = normalizeContentFilterText(customTermDraft)
    if (!term) return
    const current =
      localFeedPreferences.contentFilterPolicy ?? defaultContentFilterPolicy
    if (!current.customTerms.includes(term)) {
      updateContentFilter({customTerms: [...current.customTerms, term]})
    }
    setCustomTermDraft('')
  }

  function addExcludedAuthor() {
    const did = excludedAuthorDraft.trim()
    if (!did || !isDidString(did)) return
    const current =
      localFeedPreferences.contentFilterPolicy ?? defaultContentFilterPolicy
    if (!current.excludedAuthorDids.includes(did)) {
      updateContentFilter({
        excludedAuthorDids: [...current.excludedAuthorDids, did],
      })
    }
    setExcludedAuthorDraft('')
  }

  function addCurationTopic() {
    const term = normalizeContentFilterText(curationTermDraft)
    if (!term) return
    const current =
      localFeedPreferences.radlibCuration ?? defaultLocalCurationConfig
    const curationTerms = current.curationTerms ?? []
    if (!curationTerms.includes(term)) {
      updateRadlibCuration({curationTerms: [...curationTerms, term]})
      setCurationNotice(`Added “${term}” to local curation.`)
    } else {
      setCurationNotice(`“${term}” is already in local curation.`)
    }
    setCurationTermDraft('')
  }

  function addCurationExclusion() {
    const term = normalizeContentFilterText(excludedCurationTermDraft)
    if (!term) return
    const current =
      localFeedPreferences.radlibCuration ?? defaultLocalCurationConfig
    if (!current.excludedTerms.includes(term)) {
      updateRadlibCuration({excludedTerms: [...current.excludedTerms, term]})
    }
    setExcludedCurationTermDraft('')
  }

  function addCurationAuthor() {
    const did = curationAuthorDraft.trim()
    if (!did || !isDidString(did)) return
    const current =
      localFeedPreferences.radlibCuration ?? defaultLocalCurationConfig
    if (!current.excludedAuthorDids.includes(did)) {
      updateRadlibCuration({
        excludedAuthorDids: [...current.excludedAuthorDids, did],
      })
    }
    setCurationAuthorDraft('')
  }

  function addInterest() {
    const interest = normalizeContentFilterText(interestDraft)
    if (!interest) return
    const interests = state?.explicit.explicitInterests ?? []
    if (!interests.includes(interest)) {
      void updateExplicitPatch({explicitInterests: [...interests, interest]})
    }
    setInterestDraft('')
  }

  function addExplicitAuthor() {
    const did = explicitAuthorDraft.trim()
    if (!did || !isDidString(did)) return
    const authors = (state?.explicit.explicitAuthors ?? []).filter(
      author => author.did !== did,
    )
    authors.push({did, preference: explicitAuthorPreference})
    void updateExplicitPatch({explicitAuthors: authors})
    setExplicitAuthorDraft('')
  }

  async function removeInferredTopic(topic: string) {
    if (!state) return
    const inferredTopics = {...state.learned.inferredTopics}
    delete inferredTopics[topic]
    const next = {
      ...state,
      learned: {...state.learned, inferredTopics},
      updatedAt: new Date().toISOString(),
    }
    await savePersonalization(next)
    setState(next)
  }

  async function removeInferredAuthor(did: string) {
    if (!state) return
    const authorAffinity = {...state.learned.authorAffinity}
    delete authorAffinity[did]
    const next = {
      ...state,
      learned: {...state.learned, authorAffinity},
      updatedAt: new Date().toISOString(),
    }
    await savePersonalization(next)
    setState(next)
  }
  const learnedCount = state
    ? Object.keys(state.learned.inferredTopics).length +
      Object.keys(state.learned.authorAffinity).length
    : 0
  const contentFilterPolicy =
    localFeedPreferences.contentFilterPolicy ?? defaultContentFilterPolicy
  const radlibCuration =
    localFeedPreferences.radlibCuration ?? defaultLocalCurationConfig
  return (
    <Layout.Screen ecwMode="workbench">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Feed customization & data</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <SettingsList.Container>
          <SettingsList.Item>
            <SettingsList.ItemText>
              Attention controls · local, portable, reversible
            </SettingsList.ItemText>
          </SettingsList.Item>
          <AttentionStepper
            label="Discovery"
            value={state?.explicit.discovery}
            onChange={value => void updateExplicit('discovery', value)}
          />
          <AttentionStepper
            label="Familiarity"
            value={state?.explicit.familiarity}
            onChange={value => void updateExplicit('familiarity', value)}
          />
          <AttentionStepper
            label="Freshness"
            value={state?.explicit.freshness}
            onChange={value => void updateExplicit('freshness', value)}
          />
          <AttentionStepper
            label="Variety"
            value={state?.explicit.variety}
            onChange={value => void updateExplicit('variety', value)}
          />
          <AttentionStepper
            label="Conversation activity"
            value={state?.explicit.conversationActivity}
            onChange={value =>
              void updateExplicit('conversationActivity', value)
            }
          />
          <AttentionStepper
            label="Exploration / serendipity"
            value={state?.explicit.explorationLevel}
            onChange={value => void updateExplicit('explorationLevel', value)}
          />
          <SettingsList.Item>
            <SettingsList.ItemText>
              0% removes a signal from local ranking; 100% gives it the full
              bounded weight. Explicit More/Less choices still outrank these
              controls.
            </SettingsList.ItemText>
          </SettingsList.Item>
          <Toggle.Item
            type="checkbox"
            name="local-reranking"
            label="Use local attention reranking"
            value={localFeedEnabled}
            onChange={setLocalFeedEnabled}>
            <SettingsList.Item>
              <SettingsList.ItemText>
                Use local attention reranking on Following. Turn this off for
                chronological Following access.
              </SettingsList.ItemText>
              <Toggle.Platform />
            </SettingsList.Item>
          </Toggle.Item>
          <SettingsList.Group contentContainerStyle={[a.gap_sm]}>
            <SettingsList.ItemText>Following algorithm</SettingsList.ItemText>
            <SegmentedControl.Root
              label="Following algorithm"
              type="radio"
              size="small"
              value={localFeedPreferences.rankingPreset ?? 'following'}
              onChange={value => setRankingPreset(value)}>
              <SegmentedControl.Item value="following" label="Following">
                <SegmentedControl.ItemText>Following</SegmentedControl.ItemText>
              </SegmentedControl.Item>
              <SegmentedControl.Item value="balanced" label="Balanced">
                <SegmentedControl.ItemText>Balanced</SegmentedControl.ItemText>
              </SegmentedControl.Item>
            </SegmentedControl.Root>
          </SettingsList.Group>
          <Toggle.Item
            type="checkbox"
            name="local-curation"
            label="Use this account's local curation"
            value={Boolean(localFeedPreferences.radlibCuration?.enabled)}
            onChange={onRadlibCurationChange}>
            <SettingsList.Item>
              <SettingsList.ItemText>
                Use this account's local curation (opt-in). New accounts start
                neutral. This only reranks posts supplied by the selected feed;
                it does not create blocks, mutes, listblocks, or political
                outcome quotas.
              </SettingsList.ItemText>
              <Toggle.Platform />
            </SettingsList.Item>
          </Toggle.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              Your local curation profile · this account and device only
            </SettingsList.ItemText>
          </SettingsList.Item>
          <Toggle.Item
            type="checkbox"
            name="local-curation-include-replies"
            label="Include replies in local curation"
            value={!radlibCuration.removeReplies}
            onChange={includeReplies =>
              updateRadlibCuration({removeReplies: !includeReplies})
            }>
            <SettingsList.Item>
              <SettingsList.ItemText>
                Include replies as candidates. Explicit post preferences can
                still override this local curation choice.
              </SettingsList.ItemText>
              <Toggle.Platform />
            </SettingsList.Item>
          </Toggle.Item>
          <NumericStepper
            label="Maximum posts per author in a curation window"
            value={radlibCuration.maxPostsPerAuthor}
            min={1}
            max={5}
            step={1}
            formatValue={current => String(current)}
            onChange={maxPostsPerAuthor =>
              updateRadlibCuration({maxPostsPerAuthor})
            }
          />
          <SettingsList.Item>
            <SettingsList.ItemText>
              Local curation terms · explicit terms only
            </SettingsList.ItemText>
          </SettingsList.Item>
          <EntryRow
            label="Add a term to prioritize"
            value={curationTermDraft}
            onChangeText={setCurationTermDraft}
            onSubmit={addCurationTopic}
            placeholder="Enter a term to prioritize"
            accessibilityLabel="Local curation term"
            accessibilityHint="Enter a term to prioritize in this account's local curation."
            buttonLabel="Add term"
          />
          {curationNotice ? (
            <SettingsList.Item>
              <SettingsList.ItemText accessibilityLiveRegion="polite">
                {curationNotice}
              </SettingsList.ItemText>
            </SettingsList.Item>
          ) : null}
          {(radlibCuration.curationTerms ?? []).map(term => (
            <SettingsList.PressableItem
              key={`curation-term:${term}`}
              label={`Remove local curation term ${term}`}
              onPress={() => {
                updateRadlibCuration({
                  curationTerms: (radlibCuration.curationTerms ?? []).filter(
                    item => item !== term,
                  ),
                })
                setCurationNotice(`Removed “${term}” from local curation.`)
              }}>
              <SettingsList.ItemText>{term}</SettingsList.ItemText>
              <SettingsList.BadgeText>Remove</SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
          <SettingsList.Item>
            <SettingsList.ItemText>
              Local curation exclusions · ordering only
            </SettingsList.ItemText>
          </SettingsList.Item>
          <EntryRow
            label="Add a local curation exclusion"
            value={excludedCurationTermDraft}
            onChangeText={setExcludedCurationTermDraft}
            onSubmit={addCurationExclusion}
            placeholder="Enter a term to exclude"
            accessibilityLabel="Local curation exclusion"
            accessibilityHint="Enter a term to exclude from local curation ordering."
            buttonLabel="Add exclusion"
          />
          {radlibCuration.excludedTerms
            .filter(
              term => !defaultLocalCurationConfig.excludedTerms.includes(term),
            )
            .map(term => (
              <SettingsList.PressableItem
                key={`curation-exclusion:${term}`}
                label={`Remove local curation exclusion ${term}`}
                onPress={() =>
                  updateRadlibCuration({
                    excludedTerms: radlibCuration.excludedTerms.filter(
                      item => item !== term,
                    ),
                  })
                }>
                <SettingsList.ItemText>{term}</SettingsList.ItemText>
                <SettingsList.BadgeText>Remove</SettingsList.BadgeText>
              </SettingsList.PressableItem>
            ))}
          <EntryRow
            label="Exclude an author from local curation"
            value={curationAuthorDraft}
            onChangeText={setCurationAuthorDraft}
            onSubmit={addCurationAuthor}
            placeholder="Enter an author DID"
            accessibilityLabel="Local curation excluded author DID"
            accessibilityHint="Enter a DID to exclude from local curation."
            autoCapitalize="none"
            canSubmit={isDidString(curationAuthorDraft.trim())}
            buttonLabel="Exclude author"
          />
          {radlibCuration.excludedAuthorDids.map(did => (
            <SettingsList.PressableItem
              key={`curation-author:${did}`}
              label={`Remove local curation excluded author ${did}`}
              onPress={() =>
                updateRadlibCuration({
                  excludedAuthorDids: radlibCuration.excludedAuthorDids.filter(
                    item => item !== did,
                  ),
                })
              }>
              <SettingsList.ItemText>{did}</SettingsList.ItemText>
              <SettingsList.BadgeText>Remove</SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
          <SettingsList.Item>
            <SettingsList.ItemText>
              {`This account's local curation has ${(radlibCuration.curationTerms ?? []).length} explicit terms, ${radlibCuration.excludedTerms.length} term exclusions, and ${radlibCuration.excludedAuthorDids.length} author exclusions. These affect only this device's feed ordering.`}
            </SettingsList.ItemText>
          </SettingsList.Item>
          <SettingsList.PressableItem
            label="Restore neutral local curation term exclusions"
            onPress={() => updateRadlibCuration({excludedTerms: []})}>
            <SettingsList.ItemText>
              Clear local curation exclusions
            </SettingsList.ItemText>
          </SettingsList.PressableItem>
          <Toggle.Item
            type="checkbox"
            name="local-content-filter"
            label="Hide selected feed terms"
            value={contentFilterPolicy.enabled}
            onChange={enabled => updateContentFilter({enabled})}>
            <SettingsList.Item>
              <SettingsList.ItemText>
                Hide posts matching terms you enter below. This is a local,
                user-selected hard filter over feed content; it never changes
                follows, blocks, mutes, or ranking state.
              </SettingsList.ItemText>
              <Toggle.Platform />
            </SettingsList.Item>
          </Toggle.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              Filter status: rules-only lexical matching; no semantic model is
              configured. Only the current account's custom terms are active.
            </SettingsList.ItemText>
          </SettingsList.Item>
          <EntryRow
            label="Add a term to hide from feed results"
            value={customTermDraft}
            onChangeText={setCustomTermDraft}
            onSubmit={addCustomTerm}
            placeholder="Enter a term to hide"
            accessibilityLabel="Custom feed filter term"
            accessibilityHint="Enter a term to hide from feed results."
            buttonLabel="Add filter"
          />
          {contentFilterPolicy.customTerms.map(term => (
            <SettingsList.PressableItem
              key={`term:${term}`}
              label={`Remove custom filter term ${term}`}
              onPress={() =>
                updateContentFilter({
                  customTerms: contentFilterPolicy.customTerms.filter(
                    item => item !== term,
                  ),
                })
              }>
              <SettingsList.ItemText>{term}</SettingsList.ItemText>
              <SettingsList.BadgeText>Remove</SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
          <EntryRow
            label="Exclude an author from feed results"
            value={excludedAuthorDraft}
            onChangeText={setExcludedAuthorDraft}
            onSubmit={addExcludedAuthor}
            placeholder="Enter an author DID"
            accessibilityLabel="Excluded author DID"
            accessibilityHint="Enter a DID to hide from feed results."
            autoCapitalize="none"
            canSubmit={isDidString(excludedAuthorDraft.trim())}
            buttonLabel="Exclude author"
          />
          {contentFilterPolicy.excludedAuthorDids.map(did => (
            <SettingsList.PressableItem
              key={`author:${did}`}
              label={`Remove excluded author ${did}`}
              onPress={() =>
                updateContentFilter({
                  excludedAuthorDids:
                    contentFilterPolicy.excludedAuthorDids.filter(
                      item => item !== did,
                    ),
                })
              }>
              <SettingsList.ItemText>{did}</SettingsList.ItemText>
              <SettingsList.BadgeText>Remove</SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
          <Toggle.Item
            type="checkbox"
            name="quiet-metrics"
            label="Hide public post metrics"
            value={quietMetricsEnabled}
            onChange={onQuietMetricsChange}>
            <SettingsList.Item>
              <SettingsList.ItemText>
                Hide public post metrics by default. This controls likes,
                reposts, and reply counts while preserving your own actions.
              </SettingsList.ItemText>
              <Toggle.Platform />
            </SettingsList.Item>
          </Toggle.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>Explicit interests</SettingsList.ItemText>
          </SettingsList.Item>
          <EntryRow
            label="Add an explicit interest"
            value={interestDraft}
            onChangeText={setInterestDraft}
            onSubmit={addInterest}
            placeholder="Enter a topic or interest"
            accessibilityLabel="Explicit interest"
            accessibilityHint="Enter a topic that should carry explicit ranking weight."
            buttonLabel="Add interest"
          />
          {(state?.explicit.explicitInterests ?? []).map(interest => (
            <SettingsList.PressableItem
              key={`interest:${interest}`}
              label={`Remove explicit interest ${interest}`}
              onPress={() =>
                void updateExplicitPatch({
                  explicitInterests: (
                    state?.explicit.explicitInterests ?? []
                  ).filter(item => item !== interest),
                })
              }>
              <SettingsList.ItemText>{interest}</SettingsList.ItemText>
              <SettingsList.BadgeText>Remove</SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
          <SettingsList.Item>
            <SettingsList.ItemText>
              Explicit author preferences
            </SettingsList.ItemText>
          </SettingsList.Item>
          <EntryRow
            label="Add an author preference"
            value={explicitAuthorDraft}
            onChangeText={setExplicitAuthorDraft}
            onSubmit={addExplicitAuthor}
            placeholder="Enter an author DID"
            accessibilityLabel="Explicit author preference DID"
            accessibilityHint="Enter a DID to prefer or avoid in local ranking."
            autoCapitalize="none"
            canSubmit={isDidString(explicitAuthorDraft.trim())}
            buttonLabel="Add preference"
          />
          <SegmentedControl.Root
            label="Explicit author preference"
            type="radio"
            size="small"
            value={explicitAuthorPreference}
            onChange={value => setExplicitAuthorPreference(value)}>
            <SegmentedControl.Item value="prefer" label="More like this">
              <SegmentedControl.ItemText>More</SegmentedControl.ItemText>
            </SegmentedControl.Item>
            <SegmentedControl.Item value="avoid" label="Less like this">
              <SegmentedControl.ItemText>Less</SegmentedControl.ItemText>
            </SegmentedControl.Item>
          </SegmentedControl.Root>
          {(state?.explicit.explicitAuthors ?? []).map(author => (
            <SettingsList.PressableItem
              key={`explicit-author:${author.did}`}
              label={`Remove explicit author preference ${author.did}`}
              onPress={() =>
                void updateExplicitPatch({
                  explicitAuthors: (
                    state?.explicit.explicitAuthors ?? []
                  ).filter(item => item.did !== author.did),
                })
              }>
              <SettingsList.ItemText>{author.did}</SettingsList.ItemText>
              <SettingsList.BadgeText>
                {author.preference === 'prefer' ? 'More' : 'Less'} · Remove
              </SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
          <Toggle.Item
            type="checkbox"
            name="inferred-interests"
            label="Use inferred interests"
            value={state?.explicit.inferredInterestsEnabled !== false}
            onChange={inferredInterestsEnabled =>
              void updateExplicitPatch({inferredInterestsEnabled})
            }>
            <SettingsList.Item>
              <SettingsList.ItemText>
                Use interests inferred from passive activity. Explicit choices
                remain higher authority and this can be disabled at any time.
              </SettingsList.ItemText>
              <Toggle.Platform />
            </SettingsList.Item>
          </Toggle.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>Inferred interests</SettingsList.ItemText>
          </SettingsList.Item>
          {Object.keys(state?.learned.inferredTopics ?? {}).map(topic => (
            <SettingsList.PressableItem
              key={topic}
              label={`Remove inferred interest ${topic}`}
              onPress={() => void removeInferredTopic(topic)}>
              <SettingsList.ItemText>{topic}</SettingsList.ItemText>
              <SettingsList.BadgeText>
                {`${(state?.learned.inferredTopics[topic] ?? 0).toFixed(2)} · Remove`}
              </SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
          {Object.keys(state?.learned.authorAffinity ?? {}).map(did => (
            <SettingsList.PressableItem
              key={`inferred-author:${did}`}
              label={`Remove inferred author affinity ${did}`}
              onPress={() => void removeInferredAuthor(did)}>
              <SettingsList.ItemText>{did}</SettingsList.ItemText>
              <SettingsList.BadgeText>
                {`${(state?.learned.authorAffinity[did] ?? 0).toFixed(2)} · Remove`}
              </SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
          <SettingsList.Item>
            <SettingsList.ItemText>Home feed mode</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {`${localFeedPreferences.rankingPreset ?? 'following'} · ${localFeedEnabled ? 'local ranking on' : 'chronological'}`}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              Learned personalization · device-local
            </SettingsList.ItemText>
            <SettingsList.BadgeText>{`Topics/authors: ${learnedCount} · Stored on this device`}</SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.PressableItem
            label="Reset learned personalization"
            onPress={() => void resetLearned()}>
            <SettingsList.ItemText>
              Reset learned personalization
            </SettingsList.ItemText>
          </SettingsList.PressableItem>
          <SettingsList.PressableItem
            label="Reset feed preferences"
            onPress={() => void resetExplicit()}>
            <SettingsList.ItemText>
              Reset feed preferences
            </SettingsList.ItemText>
          </SettingsList.PressableItem>
          <SettingsList.Item>
            <SettingsList.ItemText>Portable profile</SettingsList.ItemText>
          </SettingsList.Item>
          <SettingsList.PressableItem
            label="Export settings"
            onPress={() => void copyExport('settings')}>
            <SettingsList.ItemText>Export settings</SettingsList.ItemText>
          </SettingsList.PressableItem>
          <SettingsList.PressableItem
            label="Export personalization"
            onPress={() => void copyExport('profile')}>
            <SettingsList.ItemText>
              Export personalization
            </SettingsList.ItemText>
          </SettingsList.PressableItem>
          <SettingsList.PressableItem
            label="Import from clipboard"
            onPress={() => void importFromClipboard()}>
            <SettingsList.ItemText>Import from clipboard</SettingsList.ItemText>
          </SettingsList.PressableItem>
          <SettingsList.Divider />
          <SettingsList.Item>
            <SettingsList.ItemText>Encrypted backup</SettingsList.ItemText>
          </SettingsList.Item>
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Backup password"
            accessibilityLabel="Backup password"
            accessibilityHint="Enter the password used for encrypted personalization backups."
          />
          <SettingsList.PressableItem
            label="Export encrypted backup"
            onPress={() => void copyEncryptedExport()}>
            <SettingsList.ItemText>
              Export encrypted backup
            </SettingsList.ItemText>
          </SettingsList.PressableItem>
          <SettingsList.PressableItem
            label="Import encrypted backup"
            onPress={() => void importFromClipboard()}>
            <SettingsList.ItemText>
              Import encrypted backup
            </SettingsList.ItemText>
          </SettingsList.PressableItem>
          <SettingsList.PressableItem
            label="Delete personalization"
            onPress={() => void removeAll()}>
            <SettingsList.ItemText>
              Delete personalization
            </SettingsList.ItemText>
          </SettingsList.PressableItem>
          <SettingsList.Item>
            <SettingsList.ItemText>
              Only this client’s local personalization is affected. Credentials
              and social graph records are never exported.
            </SettingsList.ItemText>
          </SettingsList.Item>
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}
