import fs from 'fs'
import crypto from 'crypto'
import { ConfigStore } from './config-store'
import { ModEngine } from './mod-engine'
import { planPresetApply } from './preset-plan'
import type {
  GamePresets,
  Preset,
  PresetApplyMode,
  PresetApplyResult,
  PresetModRef,
  PresetMutationResult,
  PresetPruneResult,
  PresetsData
} from './types'

const MAX_PRESET_NAME_LENGTH = 60
const MAX_PRESET_DESCRIPTION_LENGTH = 200

const presetRefKey = (characterName: string, modName: string): string =>
  `${characterName}::${modName}`

export class PresetEngine {
  private configStore: ConfigStore
  private modEngine: ModEngine

  constructor(configStore: ConfigStore, modEngine: ModEngine) {
    this.configStore = configStore
    this.modEngine = modEngine
  }

  public getGamePresets(gameId: string): Preset[] {
    const entry = this.configStore.getPresets().presetsByGame?.[gameId]
    return entry && Array.isArray(entry.presets) ? entry.presets : []
  }

  public getActivePresetId(gameId: string): string | null {
    const entry = this.configStore.getPresets().presetsByGame?.[gameId]
    return entry?.activePresetId || null
  }

  /**
   * 预设只记录"启用项"：停用状态由"不在列表里"隐式表达，
   * 否则用户新装一个 Mod 后会被旧方案的停用名单误伤。
   */
  private async snapshotEnabledMods(): Promise<PresetModRef[]> {
    const currentMods = await this.modEngine.scanMods()
    const refs: PresetModRef[] = []
    for (const [characterName, mods] of Object.entries(currentMods || {})) {
      for (const mod of mods || []) {
        if (!mod || !mod.enabled || typeof mod.name !== 'string') continue
        refs.push({ characterName, modName: mod.name, enabled: true })
      }
    }
    return refs
  }

  private normalizeName(raw: unknown): string {
    return typeof raw === 'string' ? raw.trim() : ''
  }

  private validateName(name: string): string | null {
    if (name.length === 0) return '方案名称不能为空'
    if (name.length > MAX_PRESET_NAME_LENGTH) {
      return `方案名称不能超过 ${MAX_PRESET_NAME_LENGTH} 个字符`
    }
    return null
  }

  private normalizeDescription(raw: unknown): { description: string; error?: string } {
    const description = typeof raw === 'string' ? raw.trim() : ''
    if (description.length > MAX_PRESET_DESCRIPTION_LENGTH) {
      return { description, error: `方案描述不能超过 ${MAX_PRESET_DESCRIPTION_LENGTH} 个字符` }
    }
    return { description }
  }

  /** 重名判定排除自身，用户把方案改成同名（含大小写变体）必须允许，否则无法保存其它字段 */
  private isNameTaken(presets: Preset[] | undefined, name: string, selfId?: string): boolean {
    if (!Array.isArray(presets)) return false
    const lower = name.toLowerCase()
    return presets.some(
      (preset) =>
        preset &&
        preset.id !== selfId &&
        typeof preset.name === 'string' &&
        preset.name.trim().toLowerCase() === lower
    )
  }

  private getGameEntry(data: PresetsData, gameId: string): GamePresets | null {
    const entry = data.presetsByGame?.[gameId]
    return entry && typeof entry === 'object' ? entry : null
  }

  /** presets.json 可能被旧版本或手工编辑破坏结构，读路径统一兜底，避免坏数据直接抛到 IPC */
  private ensureGameEntry(data: PresetsData, gameId: string): GamePresets {
    if (!data.presetsByGame || typeof data.presetsByGame !== 'object') {
      data.presetsByGame = {}
    }
    const entry = data.presetsByGame[gameId]
    if (!entry || typeof entry !== 'object') {
      data.presetsByGame[gameId] = { presets: [], activePresetId: null }
    } else if (!Array.isArray(data.presetsByGame[gameId].presets)) {
      data.presetsByGame[gameId].presets = []
    }
    return data.presetsByGame[gameId]
  }

  private findPreset(data: PresetsData, gameId: string, presetId: string): Preset | null {
    const entry = this.getGameEntry(data, gameId)
    if (!entry || !Array.isArray(entry.presets)) return null
    return entry.presets.find((preset) => preset && preset.id === presetId) || null
  }

  private emptyApplyResult(mode: PresetApplyMode, message?: string): PresetApplyResult {
    return {
      success: false,
      applied: 0,
      enabled: 0,
      disabled: 0,
      failed: [],
      missing: [],
      mode,
      message
    }
  }

  /**
   * 将当前所有已启用的 Mod 拍快照，保存为新预设
   */
  public async createPresetFromCurrent(
    gameId: string,
    name: string,
    description: string = ''
  ): Promise<PresetMutationResult> {
    const normalizedName = this.normalizeName(name)
    const nameError = this.validateName(normalizedName)
    if (nameError) return { success: false, error: nameError }

    const normalizedDesc = this.normalizeDescription(description)
    if (normalizedDesc.error) return { success: false, error: normalizedDesc.error }

    // 同名方案在界面上无法区分，创建阶段就拒绝，与改名的重名规则保持一致
    const existingEntry = this.getGameEntry(this.configStore.getPresets(), gameId)
    if (existingEntry && this.isNameTaken(existingEntry.presets, normalizedName)) {
      return { success: false, error: `已存在同名方案「${normalizedName}」` }
    }

    let mods: PresetModRef[]
    try {
      mods = await this.snapshotEnabledMods()
    } catch (err: any) {
      console.error('[preset-engine] snapshot mods failed:', err)
      return { success: false, error: '读取当前 Mod 状态失败' }
    }

    const now = new Date().toISOString()
    const preset: Preset = {
      id: crypto.randomUUID(),
      name: normalizedName,
      description: normalizedDesc.description,
      mods,
      createdAt: now,
      updatedAt: now
    }

    const entry = this.ensureGameEntry(this.configStore.getPresets(), gameId)
    entry.presets.push(preset)
    // 新快照天然等于当前状态，直接标为激活方案，界面无需再点一次"应用"
    entry.activePresetId = preset.id
    this.configStore.savePresets()

    return { success: true, preset }
  }

  /**
   * 修改方案名称/描述；名称是用户可见的标识，必须在引擎层收敛长度与重名
   */
  public updatePreset(
    gameId: string,
    presetId: string,
    patch: Partial<Pick<Preset, 'name' | 'description'>>
  ): PresetMutationResult {
    const data = this.configStore.getPresets()
    const entry = this.getGameEntry(data, gameId)
    const target = entry && Array.isArray(entry.presets)
      ? entry.presets.find((preset) => preset && preset.id === presetId)
      : null
    if (!entry || !target) return { success: false, error: '方案不存在' }

    const changes: Partial<Preset> = {}

    if (patch && patch.name !== undefined) {
      const nextName = this.normalizeName(patch.name)
      const nameError = this.validateName(nextName)
      if (nameError) return { success: false, error: nameError }
      if (this.isNameTaken(entry.presets, nextName, presetId)) {
        return { success: false, error: `已存在同名方案「${nextName}」` }
      }
      changes.name = nextName
    }

    if (patch && patch.description !== undefined) {
      const normalizedDesc = this.normalizeDescription(patch.description)
      if (normalizedDesc.error) return { success: false, error: normalizedDesc.error }
      changes.description = normalizedDesc.description
    }

    Object.assign(target, changes, { updatedAt: new Date().toISOString() })
    this.configStore.savePresets()
    return { success: true, preset: target }
  }

  /**
   * 复制方案；副本名称自动避让重名，且不抢占当前激活状态
   */
  public duplicatePreset(gameId: string, presetId: string): PresetMutationResult {
    const data = this.configStore.getPresets()
    const entry = this.getGameEntry(data, gameId)
    const source = entry && Array.isArray(entry.presets)
      ? entry.presets.find((preset) => preset && preset.id === presetId)
      : null
    if (!entry || !source) return { success: false, error: '方案不存在' }

    const sourceName = typeof source.name === 'string' && source.name.trim()
      ? source.name.trim()
      : '未命名方案'
    let copyName = `${sourceName} 副本`
    let counter = 2
    while (this.isNameTaken(entry.presets, copyName)) {
      copyName = `${sourceName} 副本 ${counter}`
      counter += 1
    }

    const now = new Date().toISOString()
    const copy: Preset = {
      id: crypto.randomUUID(),
      name: copyName,
      description: source.description,
      mods: (Array.isArray(source.mods) ? source.mods : []).map((ref) => ({
        characterName: ref.characterName,
        modName: ref.modName,
        enabled: ref.enabled !== false
      })),
      createdAt: now,
      updatedAt: now
    }

    entry.presets.push(copy)
    this.configStore.savePresets()
    return { success: true, preset: copy }
  }

  /**
   * 用当前启用的 Mod 覆盖方案内容，用于把方案重新对齐到现状
   */
  public async overwriteFromCurrent(gameId: string, presetId: string): Promise<PresetMutationResult> {
    const data = this.configStore.getPresets()
    if (!this.findPreset(data, gameId, presetId)) {
      return { success: false, error: '方案不存在' }
    }

    let mods: PresetModRef[]
    try {
      mods = await this.snapshotEnabledMods()
    } catch (err: any) {
      console.error('[preset-engine] snapshot mods failed:', err)
      return { success: false, error: '读取当前 Mod 状态失败' }
    }

    // 扫描期间方案可能已被删除，写盘前重新查找，避免把 activePresetId 指向不存在的方案
    const freshData = this.configStore.getPresets()
    const entry = this.getGameEntry(freshData, gameId)
    const target = entry && Array.isArray(entry.presets)
      ? entry.presets.find((preset) => preset && preset.id === presetId)
      : null
    if (!entry || !target) return { success: false, error: '方案不存在' }

    target.mods = mods
    target.updatedAt = new Date().toISOString()
    // 快照内容已变，旧的"上次应用时间"不再代表当前快照，必须清空以免界面误报已生效
    target.lastAppliedAt = undefined
    entry.activePresetId = presetId
    this.configStore.savePresets()

    return { success: true, preset: target }
  }

  /**
   * 清理磁盘上已不存在的引用，避免方案长期携带"幽灵 Mod"导致预检永远不匹配
   */
  public async pruneMissingRefs(gameId: string, presetId: string): Promise<PresetPruneResult> {
    const data = this.configStore.getPresets()
    if (!this.findPreset(data, gameId, presetId)) {
      return { success: false, removed: 0, error: '方案不存在' }
    }

    let currentMods: Record<string, { name: string }[]>
    try {
      currentMods = await this.modEngine.scanMods()
    } catch (err: any) {
      console.error('[preset-engine] scan mods failed:', err)
      return { success: false, removed: 0, error: '读取当前 Mod 状态失败' }
    }

    const freshData = this.configStore.getPresets()
    const entry = this.getGameEntry(freshData, gameId)
    const target = entry && Array.isArray(entry.presets)
      ? entry.presets.find((preset) => preset && preset.id === presetId)
      : null
    if (!entry || !target) return { success: false, removed: 0, error: '方案不存在' }

    const diskKeys = new Set<string>()
    for (const [characterName, mods] of Object.entries(currentMods || {})) {
      for (const mod of mods || []) {
        if (!mod || typeof mod.name !== 'string') continue
        diskKeys.add(presetRefKey(characterName, mod.name))
      }
    }

    const before = Array.isArray(target.mods) ? target.mods : []
    const kept = before.filter(
      (ref) =>
        ref &&
        typeof ref.characterName === 'string' &&
        typeof ref.modName === 'string' &&
        diskKeys.has(presetRefKey(ref.characterName, ref.modName))
    )
    const removed = before.length - kept.length

    // 没有实际删除时不刷新时间戳，否则界面上会误认为方案刚被编辑过
    if (removed > 0) {
      target.mods = kept
      target.updatedAt = new Date().toISOString()
      this.configStore.savePresets()
    }

    return { success: true, removed, preset: target }
  }

  /**
   * 应用指定预设方案
   * replace 严格还原（方案外启用项一律停用），merge 只叠加启用、绝不停用方案外 Mod
   */
  public async applyPreset(
    gameId: string,
    presetId: string,
    options?: { mode?: PresetApplyMode }
  ): Promise<PresetApplyResult> {
    const mode: PresetApplyMode = options && options.mode === 'merge' ? 'merge' : 'replace'

    // 根目录缺失时 scanMods 只会返回空表，若继续执行会把"没有 Mod"误判成方案已完全生效
    const modRoot = String(this.modEngine.getModFolderPath() || '')
    if (!modRoot || !fs.existsSync(modRoot)) {
      return this.emptyApplyResult(mode, 'Mod 根目录未配置或不存在，无法应用方案')
    }

    const target = this.findPreset(this.configStore.getPresets(), gameId, presetId)
    if (!target) return this.emptyApplyResult(mode, '方案不存在')

    try {
      const modsData = await this.modEngine.scanMods()
      // 预检与执行共用同一份计划，保证界面看到的差异和实际切换不会分叉
      const plan = planPresetApply(target, modsData, mode)
      const res = await this.modEngine.applyPresetMods(plan.tasks)

      // 应用期间方案可能被删除：Mod 切换结果照常回报，但不能再把 active/lastApplied 写回已消失的方案
      const freshData = this.configStore.getPresets()
      const freshTarget = this.findPreset(freshData, gameId, presetId)
      // missing 引用意味着方案没有完整还原到目标状态，写 lastAppliedAt/activePresetId 会让界面误报"已生效"
      const fullyApplied = res.failed.length === 0 && plan.missing.length === 0
      if (freshTarget && fullyApplied) {
        freshTarget.lastAppliedAt = new Date().toISOString()
        if (mode === 'replace') {
          this.ensureGameEntry(freshData, gameId).activePresetId = presetId
        }
        this.configStore.savePresets()
      }

      const result: PresetApplyResult = {
        success: res.failed.length === 0,
        applied: res.applied,
        enabled: res.enabled,
        disabled: res.disabled,
        failed: res.failed,
        missing: plan.missing,
        mode
      }

      if (res.failed.length > 0) {
        const first = res.failed[0]
        const reason = first.error ? `: ${first.error}` : ''
        result.message = `方案部分生效：${res.applied} 项成功，${res.failed.length} 项失败（如 ${first.modName}${reason}）`
      }

      return result
    } catch (err: any) {
      console.error('[preset-engine] apply preset failed:', err)
      return this.emptyApplyResult(mode, `应用方案失败: ${err?.message || err}`)
    }
  }

  public deletePreset(gameId: string, presetId: string): boolean {
    const data = this.configStore.getPresets()
    const entry = this.getGameEntry(data, gameId)
    if (!entry || !Array.isArray(entry.presets)) return false

    const list = entry.presets
    const filtered = list.filter((preset) => preset && preset.id !== presetId)
    if (filtered.length === list.length) return false

    entry.presets = filtered
    if (entry.activePresetId === presetId) {
      entry.activePresetId = null
    }
    this.configStore.savePresets()
    return true
  }
}
