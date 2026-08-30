import {describe, expect, it} from '@jest/globals'
import {QueryClient, QueryObserver} from '@tanstack/react-query'

import {PROVIDER_COMPOSITION_QUERY_META} from '#/lib/provider-composition'
import {resetProviderCompositionQueries} from './provider-cache'

describe('provider composition query cache boundary', () => {
  it('resets provider-backed reads while preserving unrelated account state', async () => {
    const queryClient = new QueryClient()
    const providerKey = ['profile', 'did:plc:provider']
    const privateKey = ['chat', 'conversation-1']

    await queryClient.fetchQuery({
      queryKey: providerKey,
      queryFn: () => 'provider result',
      meta: PROVIDER_COMPOSITION_QUERY_META,
    })
    await queryClient.fetchQuery({
      queryKey: privateKey,
      queryFn: () => 'private result',
    })

    await resetProviderCompositionQueries(queryClient)

    expect(queryClient.getQueryData(providerKey)).toBeUndefined()
    expect(queryClient.getQueryData(privateKey)).toBe('private result')
  })

  it('refetches an active provider-backed read after the policy changes', async () => {
    const queryClient = new QueryClient()
    const providerKey = ['search-posts', 'plumbline']
    let value = 'old provider result'
    const observer = new QueryObserver(queryClient, {
      queryKey: providerKey,
      queryFn: () => value,
      meta: PROVIDER_COMPOSITION_QUERY_META,
    })
    const unsubscribe = observer.subscribe(() => {})

    await observer.refetch()
    value = 'new provider result'
    await resetProviderCompositionQueries(queryClient)

    expect(queryClient.getQueryData(providerKey)).toBe('new provider result')
    unsubscribe()
  })
})
