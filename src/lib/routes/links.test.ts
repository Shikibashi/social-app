import {AtUri} from '@atproto/syntax'

import {getRuntimePublicWebOrigin} from '#/lib/brand'
import {makeStarterPackLink} from './links'

describe('route links', () => {
  it('creates starter-pack links on the canonical Plumbline origin', () => {
    expect(makeStarterPackLink('alice.example', '3starter')).toBe(
      `${getRuntimePublicWebOrigin()}/start/alice.example/3starter`,
    )
  })

  it('uses the creator handle for starter-pack view links', () => {
    const uri = new AtUri(
      'at://did:plc:example/app.bsky.graph.starterpack/3starter',
    ).toString()

    expect(
      makeStarterPackLink({
        uri,
        creator: {handle: 'alice.example'},
      } as Parameters<typeof makeStarterPackLink>[0]),
    ).toBe(`${getRuntimePublicWebOrigin()}/start/alice.example/3starter`)
  })
})
