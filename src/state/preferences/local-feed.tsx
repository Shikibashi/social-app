import {useCallback, useEffect, useState, useSyncExternalStore} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {type FeedPreferences} from '#/lib/feed-sovereignty/profile'
import {loadPersonalization, savePersonalization} from '#/lib/personalization'
import {listenPersonalizationChanged} from '#/state/events'
import {useSession} from '#/state/session'

export const LOCAL_FEED_ENABLED_KEY = 'LOCAL_FEED_ENABLED:'
type StoredState = {enabled: boolean; preferences: FeedPreferences}

export const defaultLocalFeedPreferences: FeedPreferences = {
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
  inferredTopics: {},
}

const defaults: StoredState = {
  enabled: false,
  preferences: defaultLocalFeedPreferences,
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
    entry = {enabled: false, loading: false, listeners: new Set()}
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
    entry.enabled = (
      await loadPersonalization(accountDid)
    ).explicit.quietMode.enabled
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
      quietMode: {...state.explicit.quietMode, enabled},
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
    () => (accountDid ? getQuietMetricsEntry(accountDid).enabled : false),
    [accountDid],
  )
  const enabled = useSyncExternalStore(subscribe, getSnapshot, () => false)

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
  const [state, setState] = useState<StoredState>(defaults)

  useEffect(() => {
    let cancelled = false
    if (!accountDid) {
      setState(defaults)
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
            inferredTopics: personalization.learned.inferredTopics,
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
      setState(next)
      const personalization = await loadPersonalization(accountDid)
      await AsyncStorage.setItem(
        LOCAL_FEED_ENABLED_KEY + accountDid,
        String(next.enabled),
      )
      await savePersonalization({
        ...personalization,
        explicit: {
          ...personalization.explicit,
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
      void persist({...state, enabled})
    },
    [persist, state],
  )

  const reset = useCallback(() => void persist(defaults), [persist])

  return {
    enabled: state.enabled,
    preferences: state.preferences,
    update,
    setEnabled,
    reset,
  }
}
