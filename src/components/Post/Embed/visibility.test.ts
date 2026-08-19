import {describe, expect, it} from '@jest/globals'

import {shouldSuppressEmbed} from './visibility'

describe('post embed visibility', () => {
  it('suppresses provider-withheld quoted posts', () => {
    expect(shouldSuppressEmbed({type: 'post_blocked'})).toBe(true)
  })

  it('keeps ordinary quoted posts visible', () => {
    expect(shouldSuppressEmbed({type: 'post'})).toBe(false)
    expect(shouldSuppressEmbed({type: 'post_not_found'})).toBe(false)
  })
})
