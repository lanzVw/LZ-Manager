import type { ModItem, Preset, PresetApplyMode, PresetModRef } from './types'

export type PresetPlanAction = 'enable' | 'disable' | 'keep-enabled' | 'keep-disabled' | 'missing'

export interface PresetPlanItem {
  characterName: string
  modName: string
  action: PresetPlanAction
}

export interface PresetPlanTask {
  characterName: string
  modName: string
  enabled: boolean
}

export interface PresetPlan {
  /** 仅列方案引用 + 严格还原下将被停用的额外项，避免把全库停用项都塞进预检 */
  items: PresetPlanItem[]
  tasks: PresetPlanTask[]
  toEnable: number
  toDisable: number
  missing: PresetModRef[]
  /** 方案内已经处于目标状态、无需切换的项数 */
  unchanged: number
  /** 当前已启用但不在方案内的项数，仅用于 merge 模式提示"保留" */
  extraEnabledCount: number
  currentEnabledCount: number
  match: boolean
}

const keyOf = (characterName: string, modName: string): string =>
  `${characterName}::${modName}`

/**
 * 计算一份预设相对当前磁盘状态的切换计划。
 * 引擎应用与渲染层预检共用同一份计算，避免"看到的差异"和"实际执行的切换"分叉。
 */
export function planPresetApply(
  preset: Pick<Preset, 'mods'>,
  modsData: Record<string, ModItem[]>,
  mode: PresetApplyMode = 'replace'
): PresetPlan {
  const desired = new Map<string, PresetModRef>()
  for (const ref of preset?.mods || []) {
    if (!ref || typeof ref.characterName !== 'string' || typeof ref.modName !== 'string') continue
    // 历史数据只记录启用项；未来若出现显式停用引用，不把它当作"期望启用"
    if (ref.enabled === false) continue
    const key = keyOf(ref.characterName, ref.modName)
    if (!desired.has(key)) desired.set(key, ref)
  }

  const disk = new Map<string, { characterName: string; modName: string; enabled: boolean }>()
  let currentEnabledCount = 0
  for (const [characterName, mods] of Object.entries(modsData || {})) {
    for (const mod of mods || []) {
      const modName = mod?.name
      if (typeof modName !== 'string') continue
      const enabled = !!mod.enabled
      disk.set(keyOf(characterName, modName), { characterName, modName, enabled })
      if (enabled) currentEnabledCount += 1
    }
  }

  const items: PresetPlanItem[] = []
  const tasks: PresetPlanTask[] = []
  const missing: PresetModRef[] = []
  let toEnable = 0
  let toDisable = 0
  let unchanged = 0

  for (const [key, ref] of desired) {
    const found = disk.get(key)
    if (!found) {
      missing.push(ref)
      items.push({ characterName: ref.characterName, modName: ref.modName, action: 'missing' })
      continue
    }
    if (found.enabled) {
      unchanged += 1
      items.push({ characterName: found.characterName, modName: found.modName, action: 'keep-enabled' })
    } else {
      toEnable += 1
      tasks.push({ characterName: found.characterName, modName: found.modName, enabled: true })
      items.push({ characterName: found.characterName, modName: found.modName, action: 'enable' })
    }
  }

  let extraEnabledCount = 0
  for (const [key, found] of disk) {
    if (desired.has(key)) continue
    if (!found.enabled) continue
    extraEnabledCount += 1
    // merge 模式只叠加启用，绝不动方案外的 Mod；只有严格还原才生成停用任务
    if (mode === 'replace') {
      toDisable += 1
      tasks.push({ characterName: found.characterName, modName: found.modName, enabled: false })
      items.push({ characterName: found.characterName, modName: found.modName, action: 'disable' })
    }
  }

  const match =
    mode === 'merge'
      ? toEnable === 0 && missing.length === 0
      : toEnable === 0 && toDisable === 0 && missing.length === 0

  return {
    items,
    tasks,
    toEnable,
    toDisable,
    missing,
    unchanged,
    extraEnabledCount,
    currentEnabledCount,
    match
  }
}
