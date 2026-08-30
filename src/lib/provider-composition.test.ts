import {describe, expect, it} from '@jest/globals'

import {
  BOUNDARY_OWNED_PROVIDER_SURFACES,
  composeProviderResults,
  getProviderClaimSummary,
  isProviderCompositionQueryMeta,
  PROVIDER_COMPOSITION_QUERY_META,
  PROVIDER_SURFACE_DETAILS,
  PROVIDER_SURFACES,
  type ProviderDescriptor,
  RUNTIME_COMPOSED_PROVIDER_SURFACES,
} from './provider-composition'

const providers: ProviderDescriptor[] = [
  {
    id: 'provider-a',
    displayName: 'Provider A',
    endpoint: 'https://a.example',
    operatorId: 'operator-a',
  },
  {
    id: 'provider-b',
    displayName: 'Provider B',
    endpoint: 'https://b.example',
    operatorId: 'operator-b',
  },
]

type FixtureValue = {
  uri: string
  status?: 'fresh' | 'stale' | 'malicious' | 'revoked' | 'blocked' | 'migrated'
  support?: 'full' | 'partial'
  labels?: string[]
}

/** No fixture contains a token; credential scope is tested only at the SDK boundary. */
const credentialedIntegrationFixtures: Array<{
  name: string
  value: FixtureValue
  expectedObservation: 'ok' | 'stale' | 'invalid' | 'unavailable'
}> = [
  {
    name: 'stale provider',
    value: {
      uri: 'at://did:plc:fixture/app.bsky.feed.post/old',
      status: 'stale',
    },
    expectedObservation: 'stale',
  },
  {
    name: 'malicious response',
    value: {
      uri: 'at://did:plc:fixture/app.bsky.feed.post/tampered',
      status: 'malicious',
    },
    expectedObservation: 'invalid',
  },
  {
    name: 'partial support',
    value: {
      uri: 'at://did:plc:fixture/app.bsky.feed.post/partial',
      support: 'partial',
    },
    expectedObservation: 'ok',
  },
  {
    name: 'revoked grant',
    value: {
      uri: 'at://did:plc:fixture/app.bsky.feed.post/revoked',
      status: 'revoked',
    },
    expectedObservation: 'unavailable',
  },
  {
    name: 'block boundary',
    value: {
      uri: 'at://did:plc:fixture/app.bsky.feed.post/blocked',
      status: 'blocked',
    },
    expectedObservation: 'ok',
  },
  {
    name: 'labeler disagreement',
    value: {
      uri: 'at://did:plc:fixture/app.bsky.feed.post/labelled',
      labels: ['spam'],
    },
    expectedObservation: 'ok',
  },
  {
    name: 'migration state',
    value: {
      uri: 'at://did:plc:fixture/app.bsky.feed.post/migrated',
      status: 'migrated',
    },
    expectedObservation: 'ok',
  },
]

describe('provider result composition', () => {
  it('identifies provider-backed query metadata without accepting ambient flags', () => {
    expect(
      isProviderCompositionQueryMeta(PROVIDER_COMPOSITION_QUERY_META),
    ).toBe(true)
    expect(isProviderCompositionQueryMeta({providerComposition: false})).toBe(
      false,
    )
    expect(isProviderCompositionQueryMeta(undefined)).toBe(false)
  })

  it('distinguishes runtime composition from boundary-owned declarations', () => {
    expect(RUNTIME_COMPOSED_PROVIDER_SURFACES).toEqual([
      'identity-resolution',
      'profiles',
      'threads',
      'feeds',
      'search',
      'notifications',
      'labels',
    ])
    expect(BOUNDARY_OWNED_PROVIDER_SURFACES).toEqual(['media', 'communities'])
    expect(PROVIDER_SURFACE_DETAILS.media).toMatchObject({
      support: 'boundary-owned',
      authority: 'Account PDS blob and media delivery boundary',
    })
    expect(PROVIDER_SURFACE_DETAILS.communities).toMatchObject({
      support: 'boundary-owned',
      authority: 'Spaces transport and Radlib community control plane',
    })
  })

  it('composes every declared surface through one attributable contract', async () => {
    for (const surface of PROVIDER_SURFACES) {
      const result = await composeProviderResults(
        providers,
        () =>
          Promise.resolve({
            value: {surface},
            verification: 'verified' as const,
          }),
        {surface},
      )
      expect(result.status).toBe('agreement')
      expect(result.selected).toEqual({surface})
      expect(result.selectedProviderIds).toEqual(['provider-a'])
      expect(result.declaredOperatorIds).toEqual(['operator-a', 'operator-b'])
      expect(result.independence).toBe('declared-distinct')
    }
  })

  it('summarizes compared claims without discarding failed observations', async () => {
    const result = await composeProviderResults(
      providers,
      provider =>
        provider.id === 'provider-b'
          ? Promise.reject(new Error('temporary outage'))
          : Promise.resolve({value: {answer: 'same'}}),
      {surface: 'profiles'},
    )

    expect(getProviderClaimSummary(result)).toEqual({
      observedProviderCount: 2,
      respondingProviderCount: 1,
      distinctClaimCount: 1,
      nonClaimObservationCount: 1,
    })
  })

  it('retains stale evidence but refuses to use it as fresh agreement', async () => {
    const result = await composeProviderResults(
      providers,
      provider =>
        Promise.resolve({
          value: {uri: provider.id},
          retrievedAt: '2020-01-01T00:00:00.000Z',
        }),
      {surface: 'feeds', maxAgeMs: 1_000},
    )
    expect(result.status).toBe('unavailable')
    expect(result.selected).toBeUndefined()
    expect(result.observations.every(item => item.status === 'stale')).toBe(
      true,
    )
  })

  it('rejects a malicious result without hiding the provider claim', async () => {
    const result = await composeProviderResults(
      providers,
      provider => Promise.resolve({value: {uri: provider.id}}),
      {
        surface: 'profiles',
        verify: value => value.uri !== 'provider-b',
      },
    )
    expect(result.status).toBe('partial')
    expect(result.observations[1]).toMatchObject({
      status: 'invalid',
      verification: 'invalid',
      value: {uri: 'provider-b'},
    })
    expect(result.selected).toBeUndefined()
  })

  it('supports an explicit first-verified choice through a provider outage', async () => {
    const result = await composeProviderResults(
      providers,
      provider => {
        if (provider.id === 'provider-b') {
          return Promise.reject(new Error('outage'))
        }
        return Promise.resolve({
          value: {answer: 'a'},
          verification: 'verified' as const,
        })
      },
      {surface: 'threads', policy: {mode: 'first-verified'}},
    )
    expect(result.status).toBe('partial')
    expect(result.selected).toEqual({answer: 'a'})
    expect(result.observations[1].status).toBe('unavailable')
  })

  it('does not promote an unverified claim under first-verified policy', async () => {
    const result = await composeProviderResults(
      providers,
      provider => Promise.resolve({value: {answer: provider.id}}),
      {surface: 'profiles', policy: {mode: 'first-verified'}},
    )

    expect(result.status).toBe('disagreement')
    expect(result.selected).toBeUndefined()
    expect(result.selectedProviderIds).toEqual([])
    expect(
      result.observations.every(item => item.verification === 'unverified'),
    ).toBe(true)
  })

  it('bounds provider fan-out concurrency', async () => {
    const fanoutProviders = Array.from({length: 4}, (_, index) => ({
      ...providers[0],
      id: `provider-${index}`,
    }))
    let active = 0
    let maxActive = 0

    const result = await composeProviderResults(
      fanoutProviders,
      async provider => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active -= 1
        return {value: {provider: provider.id}}
      },
      {
        surface: 'feeds',
        maxConcurrentProviders: 2,
        policy: {mode: 'merge'},
      },
    )

    expect(maxActive).toBeLessThanOrEqual(2)
    expect(result.observations).toHaveLength(4)
    expect(result.selectedValues).toHaveLength(4)
  })

  it('fails before invoking providers when the read is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    let invoked = false

    await expect(
      composeProviderResults(
        providers,
        () => {
          invoked = true
          return {value: 'unexpected'}
        },
        {surface: 'profiles', signal: controller.signal},
      ),
    ).rejects.toMatchObject({name: 'AbortError'})
    expect(invoked).toBe(false)
  })

  it('only merges results when the user explicitly selects merge policy', async () => {
    const result = await composeProviderResults(
      providers,
      provider => Promise.resolve({value: {provider: provider.id}}),
      {surface: 'search', policy: {mode: 'merge'}},
    )
    expect(result.status).toBe('disagreement')
    expect(result.selected).toBeUndefined()
    expect(result.selectedValues).toEqual([
      {provider: 'provider-a'},
      {provider: 'provider-b'},
    ])
    expect(result.selectedProviderIds).toEqual(['provider-a', 'provider-b'])
  })

  it('only produces a merged value when an explicit merge function is supplied', async () => {
    const result = await composeProviderResults(
      providers,
      provider => Promise.resolve({value: [provider.id]}),
      {
        surface: 'media',
        policy: {mode: 'merge'},
        merge: values => values.flat(),
      },
    )

    expect(result.selected).toEqual(['provider-a', 'provider-b'])
    expect(result.selectedValues).toEqual([['provider-a'], ['provider-b']])
  })

  it.each(credentialedIntegrationFixtures)(
    'keeps the $name fixture at the attributable observation boundary',
    async fixture => {
      const result = await composeProviderResults(
        [providers[0]],
        () => {
          if (fixture.expectedObservation === 'unavailable') {
            return Promise.reject(new Error('grant revoked'))
          }
          return Promise.resolve({
            value: fixture.value,
            stale: fixture.expectedObservation === 'stale',
          })
        },
        {
          surface:
            fixture.name === 'labeler disagreement' ? 'labels' : 'communities',
          verify: value =>
            fixture.expectedObservation !== 'invalid' &&
            value.status !== 'malicious',
        },
      )
      expect(result.observations[0].status).toBe(fixture.expectedObservation)
      expect('accessToken' in (result.observations[0] ?? {})).toBe(false)
    },
  )
})
