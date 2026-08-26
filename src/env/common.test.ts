import {isSpacesAlphaDeploymentSafe} from './common'

describe('Spaces alpha deployment gate', () => {
  it('allows only explicitly named non-production environments', () => {
    expect(isSpacesAlphaDeploymentSafe('development', true)).toBe(true)
    expect(isSpacesAlphaDeploymentSafe('test', true)).toBe(true)
    expect(isSpacesAlphaDeploymentSafe('e2e', true)).toBe(true)
    expect(isSpacesAlphaDeploymentSafe('testflight', true)).toBe(true)
    expect(isSpacesAlphaDeploymentSafe('production', true)).toBe(false)
    expect(isSpacesAlphaDeploymentSafe('production', true, false)).toBe(false)
    expect(isSpacesAlphaDeploymentSafe('production', true, true)).toBe(true)
    expect(isSpacesAlphaDeploymentSafe('unknown', true)).toBe(false)
    expect(isSpacesAlphaDeploymentSafe(undefined, true)).toBe(false)
  })

  it('does not block a build when the alpha feature is disabled', () => {
    expect(isSpacesAlphaDeploymentSafe('production', false)).toBe(true)
    expect(isSpacesAlphaDeploymentSafe(undefined, false)).toBe(true)
  })
})
