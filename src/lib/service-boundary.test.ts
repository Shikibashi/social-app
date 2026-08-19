import {describe, expect, it, jest} from '@jest/globals'

import {
  ServiceBoundaryError,
  serviceBoundaryError,
} from './service-boundary'

describe('service-boundary failures', () => {
  it.each([
    {
      kind: 'identity resolver' as const,
      displayName: 'Project AppView',
      serviceDid: 'did:web:appview.example',
    },
    {
      kind: 'labeler directory' as const,
      displayName: 'Bluesky AppView',
      serviceDid: 'did:web:api.bsky.app',
    },
  ])('names the service responsible for the $kind read', boundary => {
    const cause = new Error('upstream detail must remain in cause')
    const error = serviceBoundaryError(boundary, cause)

    expect(error).toBeInstanceOf(ServiceBoundaryError)
    expect(error.message).toBe(
      `${boundary.kind} ${boundary.displayName} (${boundary.serviceDid}) is unavailable`,
    )
    expect(error.cause).toBe(cause)
  })

  it('does not turn a resolver failure into a misleading generic network message', () => {
    const error = serviceBoundaryError({
      kind: 'identity resolver',
      displayName: 'Project AppView',
      serviceDid: 'did:web:appview.example',
    }, new Error('Failed to fetch'))

    expect(error.message).not.toContain('Failed to fetch')
    expect(error.message).toContain('identity resolver Project AppView')
  })

  it('attributes an injected HTTP outage to the resolver boundary', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({error: 'ResolverUnavailable'}), {
          status: 503,
        }),
      )
    try {
      let boundaryError: ServiceBoundaryError | undefined
      try {
        const response = await fetch('https://resolver.fixture/xrpc/resolve')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
      } catch (cause) {
        boundaryError = serviceBoundaryError(
          {
            kind: 'identity resolver',
            displayName: 'Injected resolver fixture',
            serviceDid: 'did:web:resolver.fixture',
          },
          cause,
        )
      }

      expect(boundaryError?.message).toBe(
        'identity resolver Injected resolver fixture (did:web:resolver.fixture) is unavailable',
      )
      expect((boundaryError?.cause as Error).message).toBe('HTTP 503')
    } finally {
      fetchMock.mockRestore()
    }
  })
})
