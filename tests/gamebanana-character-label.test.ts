import { describe, it, expect } from 'vitest'
import {
  buildCharacterLabelLookup,
  resolveCharacterLabel
} from '../src/renderer/utils/gamebanana-character-label'

// 用合成数据而非真实角色表：这里只验证映射规则本身
const CHARACTERS = [
  { id: 'all', name: '全部角色', enName: 'All Characters', gbCatId: null },
  { id: 'hero-a', name: '甲角色', enName: 'Hero Alpha', gbCatId: 46553 },
  { id: 'hero-b', name: '乙角色', enName: 'Hero Beta', gbCatId: 44902 }
]

describe('gamebanana-character-label', () => {
  it('按分类 ID 命中时返回中文名', () => {
    const lookup = buildCharacterLabelLookup(CHARACTERS)
    const mod = { subCategory: { id: 46553, name: 'Hero Alpha' }, category: 'Hero Alpha' }
    expect(resolveCharacterLabel(mod, lookup)).toBe('甲角色')
  })

  it('分类 ID 是字符串时也能命中', () => {
    const lookup = buildCharacterLabelLookup(CHARACTERS)
    expect(resolveCharacterLabel({ categoryId: '44902' }, lookup)).toBe('乙角色')
  })

  it('没有分类 ID 时按英文名（忽略大小写）回退匹配', () => {
    const lookup = buildCharacterLabelLookup(CHARACTERS)
    expect(resolveCharacterLabel({ category: 'hero alpha' }, lookup)).toBe('甲角色')
  })

  it('未入库的分类保留原文，不显示空白', () => {
    const lookup = buildCharacterLabelLookup(CHARACTERS)
    expect(resolveCharacterLabel({ category: 'Some New Hero' }, lookup)).toBe('Some New Hero')
  })

  it('角色字典尚未加载时保留原文', () => {
    const lookup = buildCharacterLabelLookup([])
    expect(resolveCharacterLabel({ category: 'Hero Alpha' }, lookup)).toBe('Hero Alpha')
  })

  it('「全部角色」占位项不参与匹配', () => {
    const lookup = buildCharacterLabelLookup(CHARACTERS)
    expect(resolveCharacterLabel({ category: 'All Characters' }, lookup)).toBe('All Characters')
  })

  it('完全没有分类信息时使用兜底文案', () => {
    const lookup = buildCharacterLabelLookup(CHARACTERS)
    expect(resolveCharacterLabel({}, lookup, '通用模组')).toBe('通用模组')
  })
})
