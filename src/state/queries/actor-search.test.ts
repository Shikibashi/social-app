import {describe, expect, it} from '@jest/globals'
import {type InfiniteData} from '@tanstack/react-query'

import {type ActorSearchPage, dedupeActorSearchPages} from './actor-search'

describe('dedupeActorSearchPages', () => {
  it('keeps pagination and provider evidence while removing duplicate actors', () => {
    const providerComposition = {
      surface: 'profiles' as const,
      policy: {mode: 'require-agreement' as const},
      status: 'agreement' as const,
      observations: [],
      selectedValues: [],
      selectedProviderIds: [],
      distinctResultKeys: [],
      declaredOperatorIds: [],
      independence: 'not-established' as const,
    }
    const data = {
      pages: [
        {
          cursor: 'next-page',
          actors: [
            {did: 'did:plc:one'},
            {did: 'did:plc:one'},
            {did: 'did:plc:two'},
          ],
          providerComposition,
        },
      ],
      pageParams: [undefined],
    } as unknown as InfiniteData<ActorSearchPage>

    const result = dedupeActorSearchPages(data)

    expect(result.pages[0]).toMatchObject({
      cursor: 'next-page',
      providerComposition,
    })
    expect(result.pages[0].actors.map(actor => actor.did)).toEqual([
      'did:plc:one',
      'did:plc:two',
    ])
  })
})
