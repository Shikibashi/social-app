import {themes} from './themes'
import {contrastRatio} from './util/colorGeneration'

describe('ECW theme contract', () => {
  it('maps the shared ALF surface roles to the current ECW dark palette', () => {
    expect(themes.dark.atoms.bg.backgroundColor).toBe('#0b1020')
    expect(themes.dark.atoms.text.color).toBe('#f6f4ef')
    expect(themes.dark.atoms.text_link.color).toBe('#9fc1ff')
    expect(themes.dark.atoms.border_contrast_medium.borderColor).toBe('#7d899a')
  })

  it('maps the shared ALF surface roles to the current ECW light palette', () => {
    expect(themes.light.atoms.bg.backgroundColor).toBe('#d5d8de')
    expect(themes.light.atoms.text.color).toBe('#151f3a')
    expect(themes.light.atoms.text_link.color).toBe('#2666cc')
    expect(themes.light.atoms.border_contrast_medium.borderColor).toBe(
      '#8b95a3',
    )
  })

  it('keeps dim as a dark ECW surface without changing theme selection semantics', () => {
    expect(themes.dim.name).toBe('dim')
    expect(themes.dim.scheme).toBe('dark')
    expect(themes.dim.atoms.bg.backgroundColor).toBe('#101828')
    expect(themes.dim.atoms.bg.backgroundColor).not.toBe(
      themes.dark.atoms.bg.backgroundColor,
    )
  })

  it('keeps focused sign-in fields and OAuth actions legible on dark ECW themes', () => {
    for (const theme of [themes.dark, themes.dim]) {
      const inputContrast = contrastRatio(
        theme.atoms.text.color,
        theme.palette.primary_950,
      )
      const invalidInputContrast = contrastRatio(
        theme.atoms.text.color,
        theme.palette.negative_950,
      )
      const actionContrast = contrastRatio(
        theme.palette.contrast_0,
        theme.palette.primary_500,
      )

      expect(inputContrast).not.toBeNull()
      expect(invalidInputContrast).not.toBeNull()
      expect(actionContrast).not.toBeNull()
      expect(inputContrast!).toBeGreaterThanOrEqual(4.5)
      expect(invalidInputContrast!).toBeGreaterThanOrEqual(4.5)
      expect(actionContrast!).toBeGreaterThanOrEqual(4.5)
    }
  })
})
