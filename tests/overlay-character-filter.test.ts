import { describe, expect, it } from 'vitest'
import { filterOverlayCharacterNames } from '../src/renderer/overlay/overlay-character-selection'

describe('filterOverlayCharacterNames', () => {
  it('keeps official characters and removes local tool categories', () => {
    expect(
      filterOverlayCharacterNames(
        ['功能', '简', '千夏', '武器', '席德'],
        ['简', '千夏', '席德', '雅']
      )
    ).toEqual(['简', '千夏', '席德'])
  })

  it('keeps the local list when no official character is installed', () => {
    expect(filterOverlayCharacterNames(['功能', '武器'], ['简', '千夏'])).toEqual([
      '功能',
      '武器'
    ])
  })

  it('keeps the local list when the official roster is empty', () => {
    expect(filterOverlayCharacterNames(['功能', '简'], [])).toEqual(['功能', '简'])
  })

  it('trims roster names and ignores empty entries', () => {
    expect(
      filterOverlayCharacterNames(['功能', '简'], [' 简 ', '', '   '])
    ).toEqual(['简'])
  })
})
