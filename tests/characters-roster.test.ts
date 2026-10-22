import { describe, it, expect } from 'vitest'
import {
  getCharactersForGame,
  normalizeCharacterName,
  detectCharacterForMod
} from '../src/core/characters-data'

/**
 * 回归来源：绝区零与终末地版本更新后新增角色未进库，GameBanana 分类里的
 * 菲欧妮 / 星徽·比利 / 祀 等角色在侧边栏与市场筛选里完全看不到。
 * 同时修正了两处旧数据错误：南宫羽、弭弗的 gbCatId 指向了空分类或别的角色。
 */

describe('角色库：新增角色', () => {
  it('绝区零新增角色已入库且带正确 gbCatId', () => {
    const zzz = getCharactersForGame('zzz')
    const expectMap = {
      菲欧妮: 50547,
      '星徽·比利': 46113,
      希格丽德: 47715,
      南宫羽: 43311
    }
    for (const [name, catId] of Object.entries(expectMap)) {
      const entry = zzz.find((c) => c.name === name)
      expect(entry, `缺少角色 ${name}`).toBeTruthy()
      expect(entry.gbCatId, `${name} 的 gbCatId 不对`).toBe(catId)
    }
  })

  it('终末地新增角色已入库且带正确 gbCatId', () => {
    const ef = getCharactersForGame('endfield')
    const expectMap = {
      祀: 50297,
      弭弗: 46272,
      提弗洛斯: 48868
    }
    for (const [name, catId] of Object.entries(expectMap)) {
      const entry = ef.find((c) => c.name === name)
      expect(entry, `缺少角色 ${name}`).toBeTruthy()
      expect(entry.gbCatId, `${name} 的 gbCatId 不对`).toBe(catId)
    }
  })

  it('每个角色的 gbCatId 唯一，不会两个角色抢同一个分类', () => {
    for (const game of ['zzz', 'endfield']) {
      const list = getCharactersForGame(game)
      const seen = new Map()
      for (const c of list) {
        if (!c.gbCatId) continue
        expect(seen.has(c.gbCatId), `${game} 中 ${c.name} 与 ${seen.get(c.gbCatId)} 共用分类 ${c.gbCatId}`).toBe(false)
        seen.set(c.gbCatId, c.name)
      }
    }
  })

  /**
   * 赛维里安·洛威尔是新版本角色，GameBanana 上尚无他的 Mod 与分类，
   * gbCatId 只能先留 null —— 代码会降级为按 enName 关键词搜索，功能不受影响。
   * 等市场出现分类后再补 gbCatId。
   */
  it('尚无市场分类的角色允许 gbCatId 为 null，且仍能按英文名检索', () => {
    const zzz = getCharactersForGame('zzz')
    const entry = zzz.find((c) => c.name === '赛维里安·洛威尔')
    expect(entry, '缺少角色 赛维里安·洛威尔').toBeTruthy()
    expect(entry.gbCatId).toBeNull()
    expect(entry.enName).toBe('Severian Lowell')
  })
})

describe('角色库：别名归一', () => {
  const cases: Array<[string, string, string]> = [
    ['菲尼克斯', 'zzz', '菲欧妮'],
    ['Phoenix Reffaella', 'zzz', '菲欧妮'],
    ['雷菲拉', 'zzz', '菲欧妮'],
    ['星光比利', 'zzz', '星徽·比利'],
    ['Starlight Billy', 'zzz', '星徽·比利'],
    ['希格莉德', 'zzz', '希格丽德'],
    ['Si', 'endfield', '祀'],
    ['Typhoeus', 'endfield', '提弗洛斯'],
    ['Mi Fu', 'endfield', '弭弗'],
    ['赛维里安', 'zzz', '赛维里安·洛威尔'],
    ['塞维里安', 'zzz', '赛维里安·洛威尔'],
    ['Severian', 'zzz', '赛维里安·洛威尔'],
    ['Severian Lowell', 'zzz', '赛维里安·洛威尔']
  ]
  for (const [raw, game, expected] of cases) {
    it(`${raw} → ${expected}`, () => {
      expect(normalizeCharacterName(raw, game)).toBe(expected)
    })
  }

  it('提弗洛斯与弭弗是两个独立干员，不能互相归一', () => {
    expect(normalizeCharacterName('提弗洛斯', 'endfield')).not.toBe(normalizeCharacterName('弭弗', 'endfield'))
  })
})

describe('角色库：从市场标题自动识别', () => {
  const cases: Array<[string, string, string]> = [
    ['Phoenix Ballet Heels & Recolor', 'zzz', '菲欧妮'],
    ['Starlight Billy - Pompey', 'zzz', '星徽·比利'],
    ['Si - Blooming Ink', 'endfield', '祀'],
    ['Mi Fu - Battle Maiden', 'endfield', '弭弗'],
    ['Typhoeus Fashionable Clothing', 'endfield', '提弗洛斯']
  ]
  for (const [title, game, expected] of cases) {
    it(`"${title}" → ${expected}`, () => {
      expect(detectCharacterForMod({ name: title, title }, game)).toBe(expected)
    })
  }
})