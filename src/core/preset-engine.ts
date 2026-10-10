import { ConfigStore } from './config-store'
import { ModEngine } from './mod-engine'
import { Preset, PresetModRef } from './types'
import crypto from 'crypto'

export class PresetEngine {
  private configStore: ConfigStore
  private modEngine: ModEngine

  constructor(configStore: ConfigStore, modEngine: ModEngine) {
    this.configStore = configStore
    this.modEngine = modEngine
  }

  public getGamePresets(gameId: string): Preset[] {
    const data = this.configStore.getPresets()
    return data.presetsByGame[gameId]?.presets || []
  }

  public getActivePresetId(gameId: string): string | null {
    const data = this.configStore.getPresets()
    return data.presetsByGame[gameId]?.activePresetId || null
  }

  /**
   * 将当前所有已启用的 Mod 拍快照，保存为新预设
   */
  public async createPresetFromCurrent(gameId: string, name: string, description: string = ''): Promise<Preset> {
    const currentMods = await this.modEngine.scanMods()
    const activeModRefs: PresetModRef[] = []

    for (const [charName, mods] of Object.entries(currentMods)) {
      for (const mod of mods) {
        if (mod.enabled) {
          activeModRefs.push({
            characterName: charName,
            modName: mod.name,
            enabled: true
          })
        }
      }
    }

    const newPreset: Preset = {
      id: crypto.randomUUID(),
      name,
      description,
      mods: activeModRefs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const data = this.configStore.getPresets()
    if (!data.presetsByGame[gameId]) {
      data.presetsByGame[gameId] = { presets: [], activePresetId: null }
    }

    data.presetsByGame[gameId].presets.push(newPreset)
    data.presetsByGame[gameId].activePresetId = newPreset.id
    this.configStore.savePresets()

    return newPreset
  }

  /**
   * 应用指定预设方案
   */
  public async applyPreset(gameId: string, presetId: string): Promise<{ success: boolean; applied: number; failed?: Array<{ characterName: string; modName: string; error?: string }>; message?: string }> {
    const data = this.configStore.getPresets()
    const presets = data.presetsByGame[gameId]?.presets || []
    const target = presets.find(p => p.id === presetId)
    if (!target) {
      return { success: false, applied: 0 }
    }

    // 先获取当前所有 Mod，将不在预设中激活的同角色 Mod 先停用，再激活预设中的 Mod
    const allMods = await this.modEngine.scanMods()
    const presetModMap = new Set(target.mods.filter(m => m.enabled).map(m => `${m.characterName}::${m.modName}`))

    const tasks: PresetModRef[] = []

    for (const [charName, mods] of Object.entries(allMods)) {
      for (const mod of mods) {
        const key = `${charName}::${mod.name}`
        const shouldBeEnabled = presetModMap.has(key)
        if (mod.enabled !== shouldBeEnabled) {
          tasks.push({
            characterName: charName,
            modName: mod.name,
            enabled: shouldBeEnabled
          })
        }
      }
    }

    const res = await this.modEngine.applyPresetMods(tasks)
    // 仅在全部切换成功时记录 activePresetId，避免"一半失败仍显示预设已生效"
    if (res.success && res.failed.length === 0) {
      data.presetsByGame[gameId].activePresetId = presetId
      this.configStore.savePresets()
    }

    return {
      success: res.success,
      applied: res.applied,
      failed: res.failed,
      message: res.failed.length > 0
        ? `预设部分生效：${res.applied} 项成功，${res.failed.length} 项失败（如 ${res.failed[0].modName}${res.failed[0].error ? ': ' + res.failed[0].error : ''}）`
        : undefined
    }
  }

  public deletePreset(gameId: string, presetId: string): boolean {
    const data = this.configStore.getPresets()
    if (!data.presetsByGame[gameId]) return false

    const list = data.presetsByGame[gameId].presets
    const filtered = list.filter(p => p.id !== presetId)
    if (filtered.length === list.length) return false

    data.presetsByGame[gameId].presets = filtered
    if (data.presetsByGame[gameId].activePresetId === presetId) {
      data.presetsByGame[gameId].activePresetId = null
    }
    this.configStore.savePresets()
    return true
  }
}
