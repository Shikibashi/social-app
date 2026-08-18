import {useEffect, useState} from 'react'
import {Alert, TextInput} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {
  decryptPersonalization,
  deletePersonalization,
  encryptPersonalization,
  exportPersonalization,
  importPersonalization,
  loadPersonalization,
  type PersonalizationState,
  resetFeedPreferences,
  resetLearnedPersonalization,
  savePersonalization,
} from '#/lib/personalization'
import type {CommonNavigatorParams} from '#/lib/routes/types'
import {useQuietMetrics} from '#/state/preferences/local-feed'
import {useSession} from '#/state/session'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import * as Toggle from '#/components/forms/Toggle'
import * as Layout from '#/components/Layout'

type Props = NativeStackScreenProps<
  CommonNavigatorParams,
  'PersonalizationSettings'
>

export function PersonalizationSettingsScreen({}: Props) {
  const {currentAccount} = useSession()
  const {_} = useLingui()
  const [state, setState] = useState<PersonalizationState>()
  const [password, setPassword] = useState('')
  const {enabled: quietMetricsEnabled, setEnabled: setQuietMetricsEnabled} =
    useQuietMetrics()

  useEffect(() => {
    if (currentAccount)
      void loadPersonalization(currentAccount.did).then(setState)
  }, [currentAccount])

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

  async function updateExplicit(
    key: 'discovery' | 'variety' | 'freshness' | 'explorationLevel',
    value: number,
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

  function onQuietMetricsChange(enabled: boolean) {
    setQuietMetricsEnabled(enabled)
    setState(current =>
      current
        ? {
            ...current,
            explicit: {
              ...current.explicit,
              quietMode: {...current.explicit.quietMode, enabled},
            },
          }
        : current,
    )
  }

  function cycleLevel(value: number | undefined): number {
    if (value === undefined || value <= 0.25) return 0.5
    if (value < 0.75) return 1
    return 0
  }

  function levelLabel(value: number | undefined): string {
    if (value === undefined || value < 0.25) return 'Low'
    if (value < 0.75) return 'Default'
    return 'High'
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
  const learnedCount = state
    ? Object.keys(state.learned.inferredTopics).length +
      Object.keys(state.learned.authorAffinity).length
    : 0
  return (
    <Layout.Screen>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Personalization & data</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <SettingsList.Container>
          <SettingsList.Item>
            <SettingsList.ItemText>Attention controls</SettingsList.ItemText>
          </SettingsList.Item>
          <SettingsList.PressableItem
            label="Change discovery level"
            onPress={() =>
              void updateExplicit(
                'discovery',
                cycleLevel(state?.explicit.discovery),
              )
            }>
            <SettingsList.ItemText>Discovery</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {levelLabel(state?.explicit.discovery)}
            </SettingsList.BadgeText>
          </SettingsList.PressableItem>
          <SettingsList.PressableItem
            label="Change variety"
            onPress={() =>
              void updateExplicit(
                'variety',
                cycleLevel(state?.explicit.variety),
              )
            }>
            <SettingsList.ItemText>Variety</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {levelLabel(state?.explicit.variety)}
            </SettingsList.BadgeText>
          </SettingsList.PressableItem>
          <SettingsList.PressableItem
            label="Change freshness"
            onPress={() =>
              void updateExplicit(
                'freshness',
                cycleLevel(state?.explicit.freshness),
              )
            }>
            <SettingsList.ItemText>Freshness</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {levelLabel(state?.explicit.freshness)}
            </SettingsList.BadgeText>
          </SettingsList.PressableItem>
          <SettingsList.PressableItem
            label="Change exploration"
            onPress={() =>
              void updateExplicit(
                'explorationLevel',
                cycleLevel(state?.explicit.explorationLevel),
              )
            }>
            <SettingsList.ItemText>
              Exploration / serendipity
            </SettingsList.ItemText>
            <SettingsList.BadgeText>
              {levelLabel(state?.explicit.explorationLevel)}
            </SettingsList.BadgeText>
          </SettingsList.PressableItem>
          <Toggle.Item
            type="checkbox"
            name="quiet-metrics"
            label="Quiet Metrics"
            value={quietMetricsEnabled}
            onChange={onQuietMetricsChange}>
            <SettingsList.Item>
              <SettingsList.ItemText>
                Quiet Metrics hides social-proof counts while preserving your
                own likes.
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
              <SettingsList.BadgeText>Remove</SettingsList.BadgeText>
            </SettingsList.PressableItem>
          ))}
          <SettingsList.Item>
            <SettingsList.ItemText>Feed preferences</SettingsList.ItemText>
            <SettingsList.BadgeText>
              {state?.explicit.selectedFeedPreset ?? 'Following'}
            </SettingsList.BadgeText>
          </SettingsList.Item>
          <SettingsList.Item>
            <SettingsList.ItemText>
              Learned personalization
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
