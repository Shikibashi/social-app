import {isQueryPersisted} from './util'

describe('query persistence privacy boundary', () => {
  it('does not persist permissioned record or blob queries', () => {
    expect(
      isQueryPersisted([
        'radlib-private-records',
        {did: 'did:plc:alice'},
        {persistedVersion: 1},
      ]),
    ).toBe(false)
    expect(
      isQueryPersisted([
        'org.radlib.private.getBlob',
        {space: 'private'},
        {persistedVersion: 1},
      ]),
    ).toBe(false)
    expect(
      isQueryPersisted([
        'radlib-private-feed',
        {space: 'private'},
        {persistedVersion: 1},
      ]),
    ).toBe(false)
  })

  it('continues to persist ordinary structured queries', () => {
    expect(
      isQueryPersisted([
        'app.bsky.feed.getTimeline',
        {feed: 'following'},
        {persistedVersion: 1},
      ]),
    ).toBe(true)
  })
})
