import { describe, it, expect } from 'vitest'
import {
  getHotkeyDescription,
  getHotkeyTypeLabel,
  isModifierKey,
  isNonKeyboardKey,
  isNonKeyboardHotkey
} from '../src/renderer/overlay/hotkeyPresentation'

describe('hotkeyPresentation.getHotkeyDescription', () => {
  it('描述与中文名重复时返回 null（忽略大小写与空白）', () => {
    expect(
      getHotkeyDescription({
        name: 'Hold',
        chineseName: 'Hold',
        description: 'Hold',
        chineseDescription: 'hold'
      })
    ).toBeNull()
  })

  it('描述与内部名重复时返回 null', () => {
    expect(
      getHotkeyDescription({
        name: 'KeyHair',
        chineseName: '切换发型',
        description: 'keyhair',
        chineseDescription: 'keyhair'
      })
    ).toBeNull()
  })

  it('真实描述保留', () => {
    expect(
      getHotkeyDescription({
        name: 'KeyHair',
        chineseName: '切换发型',
        chineseDescription: '切换发型样式'
      })
    ).toBe('切换发型样式')
  })

  it('中文描述重复时回退到英文描述', () => {
    expect(
      getHotkeyDescription({
        name: 'KeyHair',
        chineseName: '切换发型',
        chineseDescription: '切换发型',
        description: 'Switch hairstyle'
      })
    ).toBe('Switch hairstyle')
  })
})

describe('hotkeyPresentation.isModifierKey', () => {
  it('识别 Ctrl / Alt / Shift 及左右键变体', () => {
    expect(['Ctrl', 'L-Ctrl', 'R-Shift', 'Alt', 'L-Alt', 'Shift', 'R-Ctrl', 'Win'].every(isModifierKey)).toBe(true)
  })

  it('不把主键识别为修饰键', () => {
    expect(['F10', 'A', '鼠标左键', '🎮 A'].some(isModifierKey)).toBe(false)
  })
})

describe('hotkeyPresentation.isNonKeyboardHotkey', () => {
  it('识别鼠标与手柄组合', () => {
    expect(isNonKeyboardHotkey(['Ctrl', '🎮 A'])).toBe(true)
    expect(isNonKeyboardHotkey(['鼠标左键'])).toBe(true)
    expect(isNonKeyboardKey('鼠标右键')).toBe(true)
    expect(isNonKeyboardHotkey(['Ctrl', 'F10'])).toBe(false)
  })
})

describe('hotkeyPresentation.getHotkeyTypeLabel', () => {
  it('cycle / hold / toggle 映射为中文，未知类型返回 null', () => {
    expect(getHotkeyTypeLabel('cycle')).toBe('循环')
    expect(getHotkeyTypeLabel('hold')).toBe('长按')
    expect(getHotkeyTypeLabel('toggle')).toBe('切换')
    expect(getHotkeyTypeLabel('weird')).toBeNull()
    expect(getHotkeyTypeLabel(undefined)).toBeNull()
  })
})
