import {themes} from './themes'

describe('ECW theme contract', () => {
  it('maps the shared ALF surface roles to the current ECW dark palette', () => {
    expect(themes.dark.atoms.bg.backgroundColor).toBe('#050719')
    expect(themes.dark.atoms.text.color).toBe('#f9f3ff')
    expect(themes.dark.atoms.text_link.color).toBe('#6ff4ff')
    expect(themes.dark.atoms.border_contrast_medium.borderColor).toBe('#6675c8')
  })

  it('maps the shared ALF surface roles to the current ECW light palette', () => {
    expect(themes.light.atoms.bg.backgroundColor).toBe('#d6d9e8')
    expect(themes.light.atoms.text.color).toBe('#11132d')
    expect(themes.light.atoms.text_link.color).toBe('#004fa3')
    expect(themes.light.atoms.border_contrast_medium.borderColor).toBe(
      '#626a9c',
    )
  })

  it('keeps dim as a dark ECW surface without changing theme selection semantics', () => {
    expect(themes.dim.name).toBe('dim')
    expect(themes.dim.scheme).toBe('dark')
    expect(themes.dim.atoms.bg.backgroundColor).toBe('#0b0d20')
    expect(themes.dim.atoms.bg.backgroundColor).not.toBe(
      themes.dark.atoms.bg.backgroundColor,
    )
  })
})
