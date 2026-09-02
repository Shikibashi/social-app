import {
  PLUMBLINE_TUCKER_MOTTO,
  PLUMBLINE_TUCKER_MOTTO_CITATION,
  PLUMBLINE_TUCKER_SELF_GOVERNMENT_CITATION,
  PLUMBLINE_TUCKER_SELF_GOVERNMENT_QUOTE,
  PRODUCT_NAME,
  PRODUCT_WORDMARK,
  PUBLIC_WEB_ORIGIN,
  resolveProductName,
  resolvePublicWebOrigin,
  resolveRuntimePublicWebOrigin,
} from './brand'

describe('public product identity', () => {
  it('keeps the masthead motto and About quotation attribution stable', () => {
    expect(PLUMBLINE_TUCKER_MOTTO).toBe('Liberty the Mother of Order')
    expect(PLUMBLINE_TUCKER_MOTTO_CITATION).toBe(
      'Benjamin R. Tucker · Liberty masthead motto',
    )
    expect(PLUMBLINE_TUCKER_SELF_GOVERNMENT_QUOTE).toBe(
      'The right of self-government means with me the right of every individual to govern himself, or it means nothing.',
    )
    expect(PLUMBLINE_TUCKER_SELF_GOVERNMENT_CITATION).toBe(
      'Benjamin R. Tucker · Liberty, Vol. V, No. 22',
    )
  })

  it('uses the Plumbline default product name', () => {
    expect(resolveProductName(undefined)).toBe('Plumbline')
    expect(resolveProductName('  My Social  ')).toBe('My Social')
    expect(PRODUCT_NAME).toBeTruthy()
    expect(PRODUCT_WORDMARK).toBe(PRODUCT_NAME)
  })

  it('accepts HTTPS deployment origins and rejects unsafe public origins', () => {
    expect(resolvePublicWebOrigin(undefined)).toBe('https://plumblines.uk')
    expect(resolvePublicWebOrigin('https://example.test/app')).toBe(
      'https://example.test',
    )
    expect(resolvePublicWebOrigin('http://example.test')).toBe(
      'https://plumblines.uk',
    )
    expect(resolvePublicWebOrigin('http://127.0.0.1:19006')).toBe(
      'http://127.0.0.1:19006',
    )
    expect(PUBLIC_WEB_ORIGIN).toBeTruthy()
  })

  it('binds a hosted shell to the canonical runtime origin', () => {
    expect(
      resolveRuntimePublicWebOrigin(
        'http://127.0.0.1:19006',
        'https://plumblines.uk',
      ),
    ).toBe('https://plumblines.uk')
    expect(
      resolveRuntimePublicWebOrigin(
        'https://preview.example.test',
        'https://preview.example.test',
      ),
    ).toBe('https://preview.example.test')
  })
})
