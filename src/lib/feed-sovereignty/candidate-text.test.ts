import {type app} from '#/lexicons'
import {getFeedCandidateText} from './candidate-text'

type PostEmbed = app.bsky.feed.defs.PostView['embed']

describe('feed candidate text', () => {
  it('includes visible external-card text for local policy and curation', () => {
    const embed = {
      $type: 'app.bsky.embed.external#view',
      external: {
        $type: 'app.bsky.embed.external#viewExternal',
        uri: 'https://example.com/story',
        title: 'Audio gear review',
        description: 'A detailed DAC and headphone amplifier comparison.',
      },
    } as unknown as PostEmbed

    const text = getFeedCandidateText('My listening notes', embed)

    expect(text).toContain('Audio gear review')
    expect(text).toContain('DAC and headphone amplifier')
  })

  it('includes quoted post text without treating it as a relationship', () => {
    const embed = {
      $type: 'app.bsky.embed.record#view',
      record: {
        $type: 'app.bsky.embed.record#viewRecord',
        uri: 'at://did:example:author/app.bsky.feed.post/quote',
        cid: 'bafyreihdwdz6xq2v3qz6xq2v3qz6xq2v3qz6xq2v3qz6xq2v3qz6xq2v3qz',
        author: {},
        value: {
          $type: 'app.bsky.feed.post',
          text: 'K-pop girl group release discussion',
        },
        indexedAt: '2026-08-18T12:00:00.000Z',
      },
    } as unknown as PostEmbed

    expect(getFeedCandidateText('A quote', embed)).toContain(
      'K-pop girl group release discussion',
    )
  })
})
