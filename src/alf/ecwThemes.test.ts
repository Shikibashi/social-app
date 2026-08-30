import {themes} from './themes'

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
})
