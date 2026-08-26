import {
  PRODUCT_NAME,
  PUBLIC_WEB_ORIGIN,
  resolveProductName,
  resolvePublicWebOrigin,
} from './brand'

describe('public product identity', () => {
  it('uses the Edriffles default product name', () => {
    expect(resolveProductName(undefined)).toBe('Edriffles')
    expect(resolveProductName('  My Social  ')).toBe('My Social')
    expect(PRODUCT_NAME).toBeTruthy()
  })

  it('accepts HTTPS deployment origins and rejects unsafe public origins', () => {
    expect(resolvePublicWebOrigin(undefined)).toBe(
      'https://social.edriffles.us',
    )
    expect(resolvePublicWebOrigin('https://example.test/app')).toBe(
      'https://example.test',
    )
    expect(resolvePublicWebOrigin('http://example.test')).toBe(
      'https://social.edriffles.us',
    )
    expect(resolvePublicWebOrigin('http://127.0.0.1:19006')).toBe(
      'http://127.0.0.1:19006',
    )
    expect(PUBLIC_WEB_ORIGIN).toBeTruthy()
  })
})
