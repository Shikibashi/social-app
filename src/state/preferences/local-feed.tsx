import {useCallback, useEffect, useState, useSyncExternalStore} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {defaultContentFilterPolicy} from '#/lib/feed-sovereignty/content-filter'
import {
  applyRankingPreset,
  type LocalFeedState,
  type RankingPreset,
} from '#/lib/feed-sovereignty/local-feed-state'
import {type FeedPreferences} from '#/lib/feed-sovereignty/profile'
import {defaultLocalCurationConfig} from '#/lib/feed-sovereignty/radlib-curation'
import {loadPersonalization, savePersonalization} from '#/lib/personalization'
import {listenPersonalizationChanged} from '#/state/events'
import {useSession} from '#/state/session'

export const LOCAL_FEED_ENABLED_KEY = 'LOCAL_FEED_ENABLED:'
type StoredState = LocalFeedState

export const defaultLocalFeedPreferences: FeedPreferences = {
  rankingPreset: 'following',
  freshness: 0.65,
  discovery: 0.4,
  familiarity: 0.55,
  conversationActivity: 0.3,
  explorationLevel: 0.5,
  languages: [],
  topics: {},
  classifierModules: {},
  explicitInterests: [],
  explicitAuthors: [],
  explicitPostPreferences: [],
  inferredInterestsEnabled: true,
  inferredTopics: {},
  contentFilterPolicy: defaultContentFilterPolicy,
  radlibCuration: defaultLocalCurationConfig,
}

function createDefaultLocalFeedState(): StoredState {
  return {
    enabled: false,
    preferences: {
      ...defaultLocalFeedPreferences,
      languages: [],
      topics: {},
      classifierModules: {},
      explicitInterests: [],
      explicitAuthors: [],
      explicitPostPreferences: [],
      inferredTopics: {},
      contentFilterPolicy: {
        ...defaultContentFilterPolicy,
        termPacks: [...defaultContentFilterPolicy.termPacks],
        customTerms: [...defaultContentFilterPolicy.customTerms],
        excludedAuthorDids: [...defaultContentFilterPolicy.excludedAuthorDids],
      },
      radlibCuration: {
        ...defaultLocalCurationConfig,
        curationTerms: [...(defaultLocalCurationConfig.curationTerms ?? [])],
        excludedTerms: [...defaultLocalCurationConfig.excludedTerms],
        excludedAuthorDids: [...defaultLocalCurationConfig.excludedAuthorDids],
      },
    },
  }
}

type QuietMetricsEntry = {
  enabled: boolean
  loading: boolean
  listeners: Set<() => void>
}
const quietMetrics = new Map<string, QuietMetricsEntry>()

function getQuietMetricsEntry(accountDid: string): QuietMetricsEntry {
  let entry = quietMetrics.get(accountDid)
  if (!entry) {
    entry = {enabled: true, loading: false, listeners: new Set()}
    quietMetrics.set(accountDid, entry)
  }
  return entry
}

function notifyQuietMetrics(accountDid: string) {
  for (const listener of getQuietMetricsEntry(accountDid).listeners) listener()
}

async function loadQuietMetrics(accountDid: string) {
  const entry = getQuietMetricsEntry(accountDid)
  if (entry.loading) return
  entry.loading = true
  try {
    const state = await loadPersonalization(accountDid)
    const quietMode = state.explicit.quietMode
    if (quietMode.userConfigured === undefined) {
      entry.enabled = true
      await savePersonalization({
        ...state,
        explicit: {
          ...state.explicit,
          quietMode: {...quietMode, enabled: true, userConfigured: true},
        },
      })
    } else {
      entry.enabled = quietMode.enabled
    }
    notifyQuietMetrics(accountDid)
  } finally {
    entry.loading = false
  }
}

export async function setQuietMetrics(accountDid: string, enabled: boolean) {
  const state = await loadPersonalization(accountDid)
  await savePersonalization({
    ...state,
    explicit: {
      ...state.explicit,
      quietMode: {
        ...state.explicit.quietMode,
        enabled,
        userConfigured: true,
      },
    },
  })
  getQuietMetricsEntry(accountDid).enabled = enabled
  notifyQuietMetrics(accountDid)
}

export function useQuietMetrics() {
  const {currentAccount} = useSession()
  const accountDid = currentAccount?.did
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!accountDid) return () => {}
      const entry = getQuietMetricsEntry(accountDid)
      entry.listeners.add(listener)
      return () => entry.listeners.delete(listener)
    },
    [accountDid],
  )
  const getSnapshot = useCallback(
    () => (accountDid ? getQuietMetricsEntry(accountDid).enabled : true),
    [accountDid],
  )
  const enabled = useSyncExternalStore(subscribe, getSnapshot, () => true)

  useEffect(() => {
    if (!accountDid) return
    void loadQuietMetrics(accountDid)
    return listenPersonalizationChanged(changedDid => {
      if (changedDid === accountDid) void loadQuietMetrics(accountDid)
    })
  }, [accountDid])

  const update = useCallback(
    (next: boolean) => {
      if (accountDid) void setQuietMetrics(accountDid, next)
    },
    [accountDid],
  )
  return {enabled, setEnabled: update}
}

export function useLocalFeedPreferences() {
  const {currentAccount} = useSession()
  const accountDid = currentAccount?.did
  const [state, setState] = useState<StoredState>(createDefaultLocalFeedState)

  useEffect(() => {
    let cancelled = false
    // Do not let the previous account's ranking or filter state remain active
    // while the newly selected account is loading its own local state.
    setState(createDefaultLocalFeedState())
    if (!accountDid) {
      return () => {
        cancelled = true
      }
    }
    const load = () =>
      Promise.all([
        AsyncStorage.getItem(LOCAL_FEED_ENABLED_KEY + accountDid),
        loadPersonalization(accountDid),
      ]).then(([enabled, personalization]) => {
        if (cancelled) return
        const explicit = personalization.explicit
        setState({
          enabled: enabled === 'true',
          preferences: {
            rankingPreset:
              explicit.selectedFeedPreset === 'balanced'
                ? 'balanced'
                : 'following',
            freshness: explicit.freshness,
            discovery: explicit.discovery,
            familiarity: explicit.familiarity,
            conversationActivity: explicit.conversationActivity,
            explorationLevel: explicit.explorationLevel,
            languages: explicit.languages,
            topics: explicit.topics,
            classifierModules: explicit.classifierModules,
            explicitInterests: explicit.explicitInterests,
            explicitAuthors: explicit.explicitAuthors,
            explicitPostPreferences: explicit.explicitPostPreferences,
            inferredInterestsEnabled: explicit.inferredInterestsEnabled,
            inferredTopics: personalization.learned.inferredTopics,
            contentFilterPolicy:
              explicit.contentFilterPolicy ?? defaultContentFilterPolicy,
            radlibCuration:
              explicit.radlibCuration ?? defaultLocalCurationConfig,
          },
        })
      })
    void load()
    const unlisten = listenPersonalizationChanged(changedDid => {
      if (changedDid === accountDid) void load()
    })
    return () => {
      cancelled = true
      unlisten()
    }
  }, [accountDid])

  const persist = useCallback(
    async (next: StoredState) => {
      if (!accountDid) return
      const personalization = await loadPersonalization(accountDid)
      await AsyncStorage.setItem(
        LOCAL_FEED_ENABLED_KEY + accountDid,
        String(next.enabled),
      )
      await savePersonalization({
        ...personalization,
        explicit: {
          ...personalization.explicit,
          selectedFeedPreset:
            next.preferences.rankingPreset === 'balanced'
              ? 'balanced'
              : 'following',
          freshness: next.preferences.freshness,
          discovery: next.preferences.discovery,
          familiarity: next.preferences.familiarity,
          conversationActivity: next.preferences.conversationActivity,
          explorationLevel: next.preferences.explorationLevel,
          languages: next.preferences.languages,
          topics: next.preferences.topics,
          classifierModules: next.preferences.classifierModules,
          explicitInterests: next.preferences.explicitInterests,
          explicitAuthors: next.preferences.explicitAuthors,
          explicitPostPreferences: next.preferences.explicitPostPreferences,
          inferredInterestsEnabled:
            next.preferences.inferredInterestsEnabled ?? true,
          contentFilterPolicy: next.preferences.contentFilterPolicy,
          radlibCuration: next.preferences.radlibCuration,
        },
        learned: {
          ...personalization.learned,
          inferredTopics: next.preferences.inferredTopics,
        },
      })
    },
    [accountDid],
  )

  const update = useCallback(
    (patch: Partial<FeedPreferences>) => {
      setState(current => {
        const next = {
          ...current,
          preferences: {...current.preferences, ...patch},
        }
        void persist(next)
        return next
      })
    },
    [persist],
  )

  const setEnabled = useCallback(
    (enabled: boolean) => {
      if (!accountDid) return
      setState(current => {
        const next = {...current, enabled}
        void persist(next)
        return next
      })
    },
    [accountDid, persist],
  )

  const setRankingPreset = useCallback(
    (rankingPreset: RankingPreset) => {
      if (!accountDid) return
      setState(current => {
        const next = applyRankingPreset(current, rankingPreset)
        void persist(next)
        return next
      })
    },
    [accountDid, persist],
  )

  const reset = useCallback(() => {
    if (!accountDid) return
    const next = createDefaultLocalFeedState()
    setState(next)
    void persist(next)
  }, [accountDid, persist])

  return {
    enabled: state.enabled,
    preferences: state.preferences,
    update,
    setEnabled,
    setRankingPreset,
    reset,
  }
}
