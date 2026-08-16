import AsyncStorage from '@react-native-async-storage/async-storage'
import {useCallback, useEffect, useState} from 'react'

import {type FeedPreferences} from '#/lib/feed-sovereignty/profile'

const STORAGE_KEY = 'LOCAL_FEED_PREFERENCES_V1'
type StoredState = {enabled: boolean; preferences: FeedPreferences}

export const defaultLocalFeedPreferences: FeedPreferences = {
  freshness: 0.65,
  discovery: 0.4,
  familiarity: 0.55,
  conversationActivity: 0.3,
  languages: [],
  topics: {},
  classifierModules: {},
}

const defaults: StoredState = {enabled: false, preferences: defaultLocalFeedPreferences}

export function useLocalFeedPreferences() {
  const [state, setState] = useState<StoredState>(defaults)

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then(value => {
      if (!value) return
      try {
        const parsed = JSON.parse(value) as Partial<StoredState>
        setState({
          enabled: Boolean(parsed.enabled),
          preferences: {...defaultLocalFeedPreferences, ...parsed.preferences},
        })
      } catch {
        // Corrupt local preference data is ignored; defaults remain active.
      }
    })
  }, [])

  const persist = useCallback((next: StoredState) => {
    setState(next)
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, [])

  const update = useCallback((patch: Partial<FeedPreferences>) => {
    setState(current => {
      const next = {...current, preferences: {...current.preferences, ...patch}}
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const setEnabled = useCallback((enabled: boolean) => {
    setState(current => {
      const next = {...current, enabled}
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const reset = useCallback(() => persist(defaults), [persist])

  return {enabled: state.enabled, preferences: state.preferences, update, setEnabled, reset}
}
