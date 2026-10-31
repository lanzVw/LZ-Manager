import { describe, it, expect } from 'vitest'
import { parseIniHotkeys } from '../src/renderer/overlay/iniParser'

describe('iniParser.parseIniHotkeys', () => {
  it('解析标准 [KeyX] 热键节（name 去掉 Key 前缀）', () => {
    const ini = [
      '[KeyCycle]',
      'key = F10',
      'type = cycle',
      '$var = 0, 1, 2'
    ].join('\n')
    const keys = parseIniHotkeys(ini)
    expect(keys.length).toBe(1)
    expect(keys[0].name.toLowerCase()).toBe('cycle')
    expect(keys[0].type).toBe('cycle')
    expect(keys[0].keys.join('+').toLowerCase()).toContain('f10')
  })

  it('跳过注释与空节', () => {
    const ini = [
      '; 这是注释',
      '[EmptySection]',
      '',
      '[KeyNext]',
      'key = Ctrl+R'
    ].join('\n')
    const keys = parseIniHotkeys(ini)
    expect(keys.length).toBe(1)
    expect(keys[0].keys.join('+').toLowerCase()).toContain('ctrl')
  })

  it('畸形输入不抛错（空串/null/undefined）', () => {
    expect(parseIniHotkeys('')).toEqual([])
    expect(parseIniHotkeys(null as any)).toEqual([])
    expect(parseIniHotkeys(undefined as any)).toEqual([])
  })

  it('过滤 no_ctrl / no_shift / no_alt 否定修饰键，只保留真实按键', () => {
    const keys = parseIniHotkeys(['[KeyHair]', 'key = no_ctrl no_shift no_alt VK_F10'].join('\n'))
    expect(keys).toHaveLength(1)
    expect(keys[0].keys).toEqual(['F10'])
    expect(keys[0].keys.join('+')).not.toMatch(/No_/i)
  })

  it('否定修饰词过滤大小写不敏感，且保留真实修饰键', () => {
    const upper = parseIniHotkeys(['[KeyHair]', 'key = NO_MODIFIERS No_Ctrl VK_F2'].join('\n'))
    expect(upper[0].keys).toEqual(['F2'])

    const mixed = parseIniHotkeys(['[KeyHair]', 'key = no_modifiers Ctrl VK_F2'].join('\n'))
    expect(mixed[0].keys).toEqual(['Ctrl', 'F2'])
  })

  it('支持 + 和 , 分隔符下的否定词过滤', () => {
    const keys = parseIniHotkeys(['[KeyHair]', 'key = no_ctrl+VK_F10,no_alt'].join('\n'))
    expect(keys[0].keys).toEqual(['F10'])
  })

  it('仅由否定修饰词组成的 key 行不产出空热键', () => {
    expect(parseIniHotkeys(['[KeyNothing]', 'key = no_modifiers'].join('\n'))).toEqual([])
    expect(parseIniHotkeys(['[KeyNothing]', 'key = no_ctrl no_alt no_shift'].join('\n'))).toEqual([])
  })

  it('同一 section 内否定词行不会清空前面的真实按键', () => {
    const after = parseIniHotkeys(['[KeyHair]', 'key = VK_F10', 'key = no_modifiers'].join('\n'))
    const before = parseIniHotkeys(['[KeyHair]', 'key = no_modifiers', 'key = VK_F10'].join('\n'))
    expect(after[0].keys).toEqual(['F10'])
    expect(before[0].keys).toEqual(['F10'])
  })

  it('真实鼠标按键不受否定词过滤影响', () => {
    const keys = parseIniHotkeys(['[KeyHold]', 'key = no_ctrl no_shift VK_LBUTTON'].join('\n'))
    expect(keys[0].keys).toEqual(['鼠标左键'])
  })

  it('过滤后 keys 相同的重复热键仍按 name + keys 去重', () => {
    const keys = parseIniHotkeys(
      ['[KeyHair]', 'key = no_ctrl VK_F10', '[KeyHair]', 'key = no_alt VK_F10'].join('\n')
    )
    expect(keys).toHaveLength(1)
    expect(keys[0].keys).toEqual(['F10'])
  })
})
