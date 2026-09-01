import {getImageAccessibilityLabel} from './accessibility'

describe('getImageAccessibilityLabel', () => {
  it('preserves authored alt text', () => {
    expect(getImageAccessibilityLabel('A lighthouse in fog', 'Image')).toBe(
      'A lighthouse in fog',
    )
  })

  it('uses the supplied control label when authored alt text is absent', () => {
    expect(getImageAccessibilityLabel(undefined, 'Image')).toBe('Image')
    expect(getImageAccessibilityLabel('   ', 'Image 2')).toBe('Image 2')
  })
})
