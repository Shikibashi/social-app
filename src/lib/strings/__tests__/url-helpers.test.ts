import {getRuntimePublicWebOrigin} from '#/lib/brand'
import {
  isBskyChatInviteUrl,
  isBskyPostUrl,
  isExternalUrl,
  isTrustedUrl,
  toShareUrl,
} from '../url-helpers'

describe('share URL resolution', () => {
  it('uses the runtime Plumbline origin for internal paths', () => {
    const path = '/profile/example.test/post/3abc'

    expect(toShareUrl(path)).toBe(`${getRuntimePublicWebOrigin()}${path}`)
  })

  it('preserves external HTTP(S) URLs', () => {
    expect(toShareUrl('https://example.test/article')).toBe(
      'https://example.test/article',
    )
    expect(toShareUrl('http://example.test/article')).toBe(
      'http://example.test/article',
    )
  })

  it('recognizes canonical Plumbline post and chat links', () => {
    const origin = getRuntimePublicWebOrigin()

    expect(isBskyPostUrl(`${origin}/profile/example.test/post/3abc`)).toBe(true)
    expect(isBskyChatInviteUrl(`${origin}/chat/ABC1234`)).toBe(true)
    expect(isExternalUrl(`${origin}/profile/example.test/post/3abc`)).toBe(
      false,
    )
    expect(isTrustedUrl(`${origin}/profile/example.test/post/3abc`)).toBe(true)
  })

  it('keeps reference Bluesky links compatible and rejects lookalike hosts', () => {
    expect(
      isBskyPostUrl('https://bsky.app/profile/example.test/post/3abc'),
    ).toBe(true)
    expect(isBskyChatInviteUrl('https://bsky.app/chat/ABC1234')).toBe(true)
    expect(
      isBskyPostUrl(
        'https://plumblines.uk.example.test/profile/example.test/post/3abc',
      ),
    ).toBe(false)
  })
})
