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
})
