import { describe, it, expect } from 'vitest'
import { resolveUpdateFilter, omitUpdateEntry } from '../src/renderer/utils/modUpdateFilter'

/**
 * 回归来源：用户勾选「可更新」筛选后进入 Mod 详情更新，返回角色库列表变空。
 * 筛选标记跨页面保留，而更新检查结果随 ModsPage 卸载丢失；这里锁定
 * 「结果为空则筛选不得生效」与「更新成功后剔除该条记录」两个纯函数行为。
 */
describe('resolveUpdateFilter', () => {
  it('筛选关闭时始终不生效', () => {
    expect(resolveUpdateFilter(false, 5)).toBe(false)
    expect(resolveUpdateFilter(false, 0)).toBe(false)
  })

  it('筛选开启但没有可更新项时不生效', () => {
    expect(resolveUpdateFilter(true, 0)).toBe(false)
  })

  it('筛选开启且有可更新项时生效', () => {
    expect(resolveUpdateFilter(true, 3)).toBe(true)
  })
})

describe('omitUpdateEntry', () => {
  it('删除命中的记录且不修改原对象', () => {
    const map = {
      'C:\\Mods\\A\\Old': { hasUpdate: true },
      'C:\\Mods\\B\\New': { hasUpdate: true }
    }
    const next = omitUpdateEntry(map, 'C:\\Mods\\A\\Old')

    expect(next).not.toBe(map)
    expect(next['C:\\Mods\\A\\Old']).toBeUndefined()
    expect(next['C:\\Mods\\B\\New']).toEqual({ hasUpdate: true })
    expect(map['C:\\Mods\\A\\Old']).toEqual({ hasUpdate: true })
  })

  it('斜杠方向与大小写不同也能匹配', () => {
    const map = { 'C:\\Mods\\A\\Old': { hasUpdate: true } }
    expect(omitUpdateEntry(map, 'c:/mods/a/old')).toEqual({})
  })

  it('路径为空或未命中时返回原引用', () => {
    const map = { 'C:\\Mods\\A': { hasUpdate: true } }
    expect(omitUpdateEntry(map, undefined)).toBe(map)
    expect(omitUpdateEntry(map, '')).toBe(map)
    expect(omitUpdateEntry(map, 'C:\\Mods\\B')).toBe(map)
  })
})
