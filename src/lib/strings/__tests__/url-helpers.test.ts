import {getRuntimePublicWebOrigin} from '#/lib/brand'
import {toShareUrl} from '../url-helpers'

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
})
