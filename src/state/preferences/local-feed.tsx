import AsyncStorage from '@react-native-async-storage/async-storage'
import {useCallback, useEffect, useState} from 'react'

import {type FeedPreferences} from '#/lib/feed-sovereignty/profile'
import {loadPersonalization, savePersonalization} from '#/lib/personalization'
import {useSession} from '#/state/session'

const ENABLED_KEY = 'LOCAL_FEED_ENABLED:'
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
  const {currentAccount} = useSession()
  const accountDid = currentAccount?.did
  const [state, setState] = useState<StoredState>(defaults)

  useEffect(() => {
    let cancelled = false
    if (!accountDid) {
      setState(defaults)
      return () => { cancelled = true }
    }
    void Promise.all([
      AsyncStorage.getItem(ENABLED_KEY + accountDid),
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
          languages: explicit.languages,
          topics: explicit.topics,
          classifierModules: explicit.classifierModules,
        },
      })
    })
    return () => { cancelled = true }
  }, [accountDid])

  const persist = useCallback(async (next: StoredState) => {
    if (!accountDid) return
    setState(next)
    const personalization = await loadPersonalization(accountDid)
    await savePersonalization({
      ...personalization,
      explicit: {
        ...personalization.explicit,
        freshness: next.preferences.freshness,
        discovery: next.preferences.discovery,
        familiarity: next.preferences.familiarity,
        conversationActivity: next.preferences.conversationActivity,
        languages: next.preferences.languages,
        topics: next.preferences.topics,
        classifierModules: next.preferences.classifierModules,
      },
    })
    await AsyncStorage.setItem(ENABLED_KEY + accountDid, String(next.enabled))
  }, [accountDid])

  const update = useCallback((patch: Partial<FeedPreferences>) => {
    setState(current => {
      const next = {...current, preferences: {...current.preferences, ...patch}}
      void persist(next)
      return next
    })
  }, [persist])

  const setEnabled = useCallback((enabled: boolean) => {
    void persist({...state, enabled})
  }, [persist, state])

  const reset = useCallback(() => void persist(defaults), [persist])

  return {enabled: state.enabled, preferences: state.preferences, update, setEnabled, reset}
}
