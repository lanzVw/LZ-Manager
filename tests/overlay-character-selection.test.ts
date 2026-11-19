import { describe, expect, it } from 'vitest'
import {
  parseLastCharacterByGame,
  pickUniqueEnabledOfficialCharacter,
  withLastCharacterForGame
} from '../src/renderer/overlay/overlay-character-selection'

const mods = (enabled: boolean, count = 1) =>
  Array.from({ length: count }, () => ({ enabled }))

describe('pickUniqueEnabledOfficialCharacter', () => {
  it('returns the only official character with an enabled mod', () => {
    expect(
      pickUniqueEnabledOfficialCharacter(
        { 星见雅: mods(true), 功能: mods(true) },
        ['星见雅']
      )
    ).toBe('星见雅')
  })

  it('returns null when multiple official characters are enabled', () => {
    expect(
      pickUniqueEnabledOfficialCharacter(
        { 星见雅: mods(true), 仪玄: mods(true) },
        ['星见雅', '仪玄']
      )
    ).toBeNull()
  })

  it('ignores non-official enabled folders', () => {
    expect(
      pickUniqueEnabledOfficialCharacter(
        { 功能: mods(true), 武器: mods(true) },
        ['星见雅', '仪玄']
      )
    ).toBeNull()
  })

  it('counts multiple enabled mods of one character as one candidate', () => {
    expect(
      pickUniqueEnabledOfficialCharacter(
        { 星见雅: mods(true, 3), 仪玄: mods(false, 2) },
        ['星见雅', '仪玄']
      )
    ).toBe('星见雅')
  })

  it('ignores disabled mods and empty rosters', () => {
    expect(
      pickUniqueEnabledOfficialCharacter({ 星见雅: mods(false) }, ['星见雅'])
    ).toBeNull()
    expect(
      pickUniqueEnabledOfficialCharacter({ 星见雅: mods(true) }, [])
    ).toBeNull()
  })

  it('skips the all-characters placeholder', () => {
    expect(
      pickUniqueEnabledOfficialCharacter(
        { 全部角色: mods(true) },
        ['全部角色']
      )
    ).toBeNull()
  })
})

describe('last character storage helpers', () => {
  it('parses valid entries and drops invalid values', () => {
    expect(
      parseLastCharacterByGame('{"zzz":"星见雅","wuwa":" 今汐 ","bad":123,"empty":"  "}')
    ).toEqual({ zzz: '星见雅', wuwa: '今汐' })
  })

  it('returns an empty map for malformed or non-object JSON', () => {
    expect(parseLastCharacterByGame('not json')).toEqual({})
    expect(parseLastCharacterByGame('[]')).toEqual({})
    expect(parseLastCharacterByGame(null)).toEqual({})
  })

  it('updates one game without dropping other games', () => {
    const before = { wuwa: '今汐' }
    const after = withLastCharacterForGame(before, 'zzz', '星见雅')

    expect(after).toEqual({ wuwa: '今汐', zzz: '星见雅' })
    expect(before).toEqual({ wuwa: '今汐' })
  })

  it('ignores empty game or character names', () => {
    const map = { zzz: '星见雅' }
    expect(withLastCharacterForGame(map, '', '仪玄')).toBe(map)
    expect(withLastCharacterForGame(map, 'zzz', '')).toBe(map)
  })
})
