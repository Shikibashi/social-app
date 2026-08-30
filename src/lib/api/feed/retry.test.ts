import {XrpcResponseError} from '@atproto/lex'
import {describe, expect, it} from '@jest/globals'

import {
  composeProviderResults,
  ProviderCompositionError,
} from '#/lib/provider-composition'
import {shouldRetryPostFeedError} from './retry'

const method = {
  nsid: 'app.bsky.feed.getFeed',
  type: 'query',
  errors: [],
} as unknown as ConstructorParameters<typeof XrpcResponseError>[0]

function xrpcStatusError(status: number) {
  return new XrpcResponseError(method, new Response(null, {status}), undefined)
}

describe('shouldRetryPostFeedError', () => {
  it('retries a transient feed-provider response', () => {
    expect(shouldRetryPostFeedError(xrpcStatusError(503))).toBe(true)
  })

  it('retries a transport failure', () => {
    expect(shouldRetryPostFeedError(new Error('Failed to fetch'))).toBe(true)
  })

  it('does not retry a permanent provider response', () => {
    expect(shouldRetryPostFeedError(xrpcStatusError(400))).toBe(false)
    expect(shouldRetryPostFeedError(new Error('invalid feed response'))).toBe(
      false,
    )
  })

  it('retries a composition error when an explicitly queried provider timed out', async () => {
    const result = await composeProviderResults(
      [
        {
          id: 'feed-provider',
          displayName: 'Feed provider',
          endpoint: 'https://feeds.example',
        },
      ],
      () => Promise.reject(new Error('Failed to fetch')),
      {
        surface: 'feeds',
        isRetryableError: error => shouldRetryPostFeedError(error),
      },
    )

    const error = new ProviderCompositionError(result)
    expect(error.composition.observations[0].status).toBe('unavailable')
    expect(shouldRetryPostFeedError(error)).toBe(true)
  })

  it('does not retry a composition error for a permanent provider failure', async () => {
    const result = await composeProviderResults(
      [
        {
          id: 'feed-provider',
          displayName: 'Feed provider',
          endpoint: 'https://feeds.example',
        },
      ],
      () => Promise.reject(new Error('invalid feed response')),
      {
        surface: 'feeds',
        isRetryableError: error => shouldRetryPostFeedError(error),
      },
    )

    expect(shouldRetryPostFeedError(new ProviderCompositionError(result))).toBe(
      false,
    )
  })
})
