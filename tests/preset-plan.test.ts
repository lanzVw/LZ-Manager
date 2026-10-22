import { describe, it, expect } from 'vitest'
import { planPresetApply } from '../src/core/preset-plan'
import type { ModItem, Preset } from '../src/core/types'

function makeMod(characterName: string, name: string, enabled: boolean): ModItem {
  return {
    id: `${characterName}::${name}`,
    name,
    folderName: enabled ? name : `DISABLED_${name}`,
    characterName,
    enabled,
    coverPath: null,
    previewImages: [],
    fullPath: `C:/fake-mods/${characterName}/${enabled ? name : `DISABLED_${name}`}`,
    hasIni: true,
    mtime: 0
  }
}

function makePreset(refs: Array<{ characterName: string; modName: string; enabled?: boolean }>): Pick<Preset, 'mods'> {
  return {
    mods: refs.map((ref) => ({
      characterName: ref.characterName,
      modName: ref.modName,
      enabled: ref.enabled ?? true
    }))
  }
}

describe('planPresetApply', () => {
  it('replace：启用方案内停用项，并停用方案外已启用项', () => {
    const modsData = {
      安比: [makeMod('安比', 'A', true), makeMod('安比', 'B', true)],
      妮可: [makeMod('妮可', 'C', false), makeMod('妮可', 'D', false)]
    }
    const plan = planPresetApply(makePreset([
      { characterName: '安比', modName: 'A' },
      { characterName: '妮可', modName: 'C' }
    ]), modsData, 'replace')

    expect(plan.toEnable).toBe(1)
    expect(plan.toDisable).toBe(1)
    expect(plan.unchanged).toBe(1)
    expect(plan.missing).toEqual([])
    expect(plan.extraEnabledCount).toBe(1)
    expect(plan.currentEnabledCount).toBe(2)
    expect(plan.match).toBe(false)

    expect(plan.tasks).toHaveLength(2)
    expect(plan.tasks).toContainEqual({ characterName: '妮可', modName: 'C', enabled: true })
    expect(plan.tasks).toContainEqual({ characterName: '安比', modName: 'B', enabled: false })

    // items 只列方案引用 + replace 下将被停用的额外项，停用中的方案外 Mod 不应出现
    expect(plan.items).toHaveLength(3)
    expect(plan.items).toContainEqual({ characterName: '安比', modName: 'A', action: 'keep-enabled' })
    expect(plan.items).toContainEqual({ characterName: '妮可', modName: 'C', action: 'enable' })
    expect(plan.items).toContainEqual({ characterName: '安比', modName: 'B', action: 'disable' })
    expect(plan.items.some((item) => item.modName === 'D')).toBe(false)
  })

  it('replace：完全一致时 match 为 true 且不生成任务', () => {
    const modsData = { 安比: [makeMod('安比', 'A', true), makeMod('安比', 'B', false)] }
    const plan = planPresetApply(makePreset([{ characterName: '安比', modName: 'A' }]), modsData, 'replace')

    expect(plan.tasks).toEqual([])
    expect(plan.toEnable).toBe(0)
    expect(plan.toDisable).toBe(0)
    expect(plan.unchanged).toBe(1)
    expect(plan.match).toBe(true)
  })

  it('merge：只生成启用任务，方案外已启用项保留且不生成停用任务', () => {
    const modsData = {
      安比: [makeMod('安比', 'A', true), makeMod('安比', 'B', true)],
      妮可: [makeMod('妮可', 'C', false)]
    }
    const plan = planPresetApply(makePreset([
      { characterName: '安比', modName: 'A' },
      { characterName: '妮可', modName: 'C' }
    ]), modsData, 'merge')

    expect(plan.toEnable).toBe(1)
    expect(plan.toDisable).toBe(0)
    expect(plan.extraEnabledCount).toBe(1)
    expect(plan.match).toBe(false)

    expect(plan.tasks).toEqual([{ characterName: '妮可', modName: 'C', enabled: true }])
    // merge 不把方案外的已启用项列进 items，避免界面误导用户"这些会被停用"
    expect(plan.items).toHaveLength(2)
    expect(plan.items.some((item) => item.modName === 'B')).toBe(false)
  })

  it('merge：方案已全部启用、仅存在方案外启用项时仍视为 match', () => {
    const modsData = {
      安比: [makeMod('安比', 'A', true)],
      妮可: [makeMod('妮可', 'C', true)]
    }
    const plan = planPresetApply(makePreset([{ characterName: '安比', modName: 'A' }]), modsData, 'merge')

    expect(plan.tasks).toEqual([])
    expect(plan.toDisable).toBe(0)
    expect(plan.extraEnabledCount).toBe(1)
    expect(plan.match).toBe(true)
  })

  it('缺失引用计入 missing、不生成任务，并使 match 为 false', () => {
    const modsData = { 安比: [makeMod('安比', 'A', true)] }
    const plan = planPresetApply(makePreset([
      { characterName: '安比', modName: 'A' },
      { characterName: '安比', modName: '已删除的Mod' }
    ]), modsData, 'replace')

    expect(plan.toEnable).toBe(0)
    expect(plan.toDisable).toBe(0)
    expect(plan.missing).toHaveLength(1)
    expect(plan.missing[0]).toEqual({ characterName: '安比', modName: '已删除的Mod', enabled: true })
    expect(plan.items).toContainEqual({ characterName: '安比', modName: '已删除的Mod', action: 'missing' })
    expect(plan.tasks).toEqual([])
    expect(plan.match).toBe(false)
  })

  it('只把 enabled !== false 的引用视为期望启用', () => {
    const modsData = { 安比: [makeMod('安比', 'A', true)] }
    const preset = makePreset([{ characterName: '安比', modName: 'A', enabled: false }])

    const replacePlan = planPresetApply(preset, modsData, 'replace')
    expect(replacePlan.unchanged).toBe(0)
    expect(replacePlan.toEnable).toBe(0)
    expect(replacePlan.extraEnabledCount).toBe(1)
    expect(replacePlan.toDisable).toBe(1)
    expect(replacePlan.tasks).toEqual([{ characterName: '安比', modName: 'A', enabled: false }])
    expect(replacePlan.match).toBe(false)

    const mergePlan = planPresetApply(preset, modsData, 'merge')
    expect(mergePlan.tasks).toEqual([])
    expect(mergePlan.extraEnabledCount).toBe(1)
    expect(mergePlan.match).toBe(true)
  })

  it('按 角色::Mod 去重，重复引用只计算一次', () => {
    const modsData = { 安比: [makeMod('安比', 'A', false)] }
    const plan = planPresetApply(makePreset([
      { characterName: '安比', modName: 'A' },
      { characterName: '安比', modName: 'A' }
    ]), modsData, 'replace')

    expect(plan.toEnable).toBe(1)
    expect(plan.unchanged).toBe(0)
    expect(plan.tasks).toHaveLength(1)
    expect(plan.items).toHaveLength(1)
  })

  it('空方案在 replace 下停用全部已启用项，在 merge 下什么都不做', () => {
    const modsData = {
      安比: [makeMod('安比', 'A', true), makeMod('安比', 'B', false)],
      妮可: [makeMod('妮可', 'C', true)]
    }
    const preset = makePreset([])

    const replacePlan = planPresetApply(preset, modsData, 'replace')
    expect(replacePlan.toDisable).toBe(2)
    expect(replacePlan.extraEnabledCount).toBe(2)
    expect(replacePlan.tasks).toHaveLength(2)
    expect(replacePlan.tasks.every((task) => task.enabled === false)).toBe(true)
    expect(replacePlan.match).toBe(false)

    const mergePlan = planPresetApply(preset, modsData, 'merge')
    expect(mergePlan.tasks).toEqual([])
    expect(mergePlan.extraEnabledCount).toBe(2)
    expect(mergePlan.match).toBe(true)
  })

  it('mode 省略时按 replace 处理', () => {
    const modsData = { 安比: [makeMod('安比', 'A', true)] }
    const plan = planPresetApply(makePreset([]), modsData)

    expect(plan.toDisable).toBe(1)
    expect(plan.tasks).toEqual([{ characterName: '安比', modName: 'A', enabled: false }])
  })

  it('还原模式跨角色统计启用项', () => {
    const modsData = {
      安比: [makeMod('安比', 'A', true), makeMod('安比', 'B', false)],
      妮可: [makeMod('妮可', 'C', true), makeMod('妮可', 'D', true)]
    }
    const plan = planPresetApply(makePreset([{ characterName: '安比', modName: 'A' }]), modsData, 'replace')

    expect(plan.currentEnabledCount).toBe(3)
    expect(plan.extraEnabledCount).toBe(2)
    expect(plan.toDisable).toBe(2)
    expect(plan.unchanged).toBe(1)
  })
})
