import {type AtUriString} from '@atproto/syntax'
import {deleteLike, like} from '@bsky/sdk'
import {useMutation} from '@tanstack/react-query'

import {usePdsClient} from '#/state/session'
import {assertOAuthFeatureGranted} from '#/state/session/oauth-authority'
import {useEnsureOAuthFeature} from '#/state/session/oauth-feature-gate'

export function useLikeMutation() {
  const pdsClient = usePdsClient()
  const ensureOAuthFeature = useEnsureOAuthFeature()
  return useMutation({
    mutationFn: async ({uri, cid}: {uri: string; cid: string}) => {
      assertOAuthFeatureGranted(await ensureOAuthFeature('posting'), 'posting')
      const res = await pdsClient.call(like, {
        uri: uri as AtUriString,
        cid,
      })
      return {uri: res.uri}
    },
  })
}

export function useUnlikeMutation() {
  const pdsClient = usePdsClient()
  const ensureOAuthFeature = useEnsureOAuthFeature()
  return useMutation({
    mutationFn: async ({uri}: {uri: string}) => {
      assertOAuthFeatureGranted(await ensureOAuthFeature('posting'), 'posting')
      await pdsClient.call(deleteLike, uri as AtUriString)
    },
  })
}
