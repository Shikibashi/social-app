import {describe, expect, it, jest} from '@jest/globals'

import {callSameProviderPublicFallback} from './feed-provider-fallback'

describe('callSameProviderPublicFallback', () => {
  it('uses the authenticated read when it succeeds', async () => {
    const authenticatedRead = jest.fn(async () => 'authenticated')
    const publicRead = jest.fn(async () => 'public')

    await expect(
      callSameProviderPublicFallback(authenticatedRead, publicRead),
    ).resolves.toBe('authenticated')
    expect(authenticatedRead).toHaveBeenCalledTimes(1)
    expect(publicRead).not.toHaveBeenCalled()
  })

  it('retries the same provider without viewer credentials', async () => {
    const authenticatedRead = jest.fn(async () => {
      throw new Error('viewer is not indexed')
    })
    const publicRead = jest.fn(async () => 'public')

    await expect(
      callSameProviderPublicFallback(authenticatedRead, publicRead),
    ).resolves.toBe('public')
    expect(authenticatedRead).toHaveBeenCalledTimes(1)
    expect(publicRead).toHaveBeenCalledTimes(1)
  })

  it('surfaces the selected provider failure when both reads fail', async () => {
    const authenticatedRead = jest.fn(async () => {
      throw new Error('viewer is not indexed')
    })
    const publicError = new Error('provider is unavailable')
    const publicRead = jest.fn(async () => {
      throw publicError
    })

    await expect(
      callSameProviderPublicFallback(authenticatedRead, publicRead),
    ).rejects.toBe(publicError)
  })
})
