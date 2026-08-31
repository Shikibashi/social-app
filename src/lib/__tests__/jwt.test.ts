import {describe, expect, it} from '@jest/globals'

import {isAppPassword} from '#/lib/jwt'

describe('isAppPassword', () => {
  it('returns false for a non-JWT OAuth access credential', () => {
    expect(isAppPassword('opaque-access-token')).toBe(false)
  })

  it('recognizes the legacy App Password scope in a JWT', () => {
    const header = 'eyJhbGciOiJub25lIn0'
    const payload = 'eyJzY29wZSI6ImNvbS5hdHByb3RvLmFwcFBhc3MifQ'
    expect(isAppPassword(`${header}.${payload}.signature`)).toBe(true)
  })
})
