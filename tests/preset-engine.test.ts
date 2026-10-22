import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ConfigStore } from '../src/core/config-store'
import { ModEngine } from '../src/core/mod-engine'
import { PresetEngine } from '../src/core/preset-engine'

interface Harness {
  root: string
  cfgDir: string
  modsDir: string
  store: ConfigStore
  modEngine: ModEngine
  presetEngine: PresetEngine
}

const GAME_ID = 'zzz'
const tmpRoots: string[] = []

function createHarness(options: { createModsDir?: boolean } = {}): Harness {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-preset-engine-'))
  tmpRoots.push(root)
  const cfgDir = path.join(root, 'cfg')
  const modsDir = path.join(root, 'Mods')
  fs.mkdirSync(cfgDir, { recursive: true })
  if (options.createModsDir !== false) {
    fs.mkdirSync(modsDir, { recursive: true })
  }

  const store = new ConfigStore(cfgDir)
  const modEngine = new ModEngine(modsDir, false)
  const presetEngine = new PresetEngine(store, modEngine)
  return { root, cfgDir, modsDir, store, modEngine, presetEngine }
}

function addMod(modsDir: string, characterName: string, name: string, enabled = true): void {
  const folderName = enabled ? name : `DISABLED_${name}`
  fs.mkdirSync(path.join(modsDir, characterName, folderName), { recursive: true })
}

function setModEnabled(modsDir: string, characterName: string, name: string, enabled: boolean): void {
  const charDir = path.join(modsDir, characterName)
  const from = path.join(charDir, enabled ? `DISABLED_${name}` : name)
  const to = path.join(charDir, enabled ? name : `DISABLED_${name}`)
  fs.renameSync(from, to)
}

function isModEnabled(modsDir: string, characterName: string, name: string): boolean {
  return fs.existsSync(path.join(modsDir, characterName, name))
}

function findPreset(store: ConfigStore, presetId: string) {
  return store.getPresets().presetsByGame[GAME_ID].presets.find((preset) => preset.id === presetId)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let harness: Harness

beforeEach(() => {
  harness = createHarness()
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of tmpRoots.splice(0)) {
    try {
      fs.rmSync(root, { recursive: true, force: true })
    } catch (_) {
      // 临时目录清理失败不影响用例结论
    }
  }
})

describe('PresetEngine.createPresetFromCurrent', () => {
  it('快照只收录当前已启用项，并把新方案设为激活', async () => {
    addMod(harness.modsDir, '安比', 'A', true)
    addMod(harness.modsDir, '安比', 'B', false)
    addMod(harness.modsDir, '妮可', 'C', true)

    const res = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '  主力方案  ', '  深渊配置  ')

    expect(res.success).toBe(true)
    expect(res.error).toBeUndefined()
    const preset = res.preset!
    expect(preset.name).toBe('主力方案')
    expect(preset.description).toBe('深渊配置')
    expect(preset.mods).toHaveLength(2)
    expect(preset.mods).toContainEqual({ characterName: '安比', modName: 'A', enabled: true })
    expect(preset.mods).toContainEqual({ characterName: '妮可', modName: 'C', enabled: true })
    expect(preset.mods.some((ref) => ref.modName === 'B')).toBe(false)

    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBe(preset.id)
    const persisted = harness.store.getPresets().presetsByGame[GAME_ID]
    expect(persisted.presets).toHaveLength(1)
    expect(persisted.activePresetId).toBe(preset.id)
    // 快照只读，不应改动磁盘上的启用状态
    expect(isModEnabled(harness.modsDir, '安比', 'A')).toBe(true)
    expect(isModEnabled(harness.modsDir, '安比', 'B')).toBe(false)
  })

  it('非法名称/描述返回中文错误且不落盘', async () => {
    const empty = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '   ')
    expect(empty.success).toBe(false)
    expect(empty.error).toContain('方案名称不能为空')

    const tooLong = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '方'.repeat(61))
    expect(tooLong.success).toBe(false)
    expect(tooLong.error).toContain('60')

    const longDesc = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '合法名称', '描'.repeat(201))
    expect(longDesc.success).toBe(false)
    expect(longDesc.error).toContain('200')

    expect(harness.presetEngine.getGamePresets(GAME_ID)).toHaveLength(0)
  })

  it('同游戏内重名创建被拒，改名后即可用旧名称创建', async () => {
    const first = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '主力阵容')
    expect(first.success).toBe(true)

    const duplicate = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '  主力阵容  ')
    expect(duplicate.success).toBe(false)
    expect(duplicate.error).toContain('已存在同名方案「主力阵容」')
    expect(harness.presetEngine.getGamePresets(GAME_ID)).toHaveLength(1)
    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBe(first.preset!.id)

    // 重名判定大小写不敏感
    expect((await harness.presetEngine.createPresetFromCurrent(GAME_ID, 'Alpha')).success).toBe(true)
    const caseDuplicate = await harness.presetEngine.createPresetFromCurrent(GAME_ID, ' alpha ')
    expect(caseDuplicate.success).toBe(false)

    // 原方案改名让出名称后，同名创建才能成功
    const renamed = harness.presetEngine.updatePreset(GAME_ID, first.preset!.id, { name: '备用阵容' })
    expect(renamed.success).toBe(true)
    const recreated = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '主力阵容')
    expect(recreated.success).toBe(true)
    expect(harness.presetEngine.getGamePresets(GAME_ID)).toHaveLength(3)
  })
})

describe('PresetEngine.applyPreset', () => {
  it('replace 严格还原：启用方案内、停用方案外，并写入 activePresetId/lastAppliedAt', async () => {
    addMod(harness.modsDir, '安比', 'A', true)
    addMod(harness.modsDir, '安比', 'B', false)
    addMod(harness.modsDir, '妮可', 'C', true)
    addMod(harness.modsDir, '妮可', 'D', false)

    const created = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '替换模式')
    const presetId = created.preset!.id

    // 把磁盘状态改成与方案完全相反
    setModEnabled(harness.modsDir, '安比', 'A', false)
    setModEnabled(harness.modsDir, '安比', 'B', true)
    setModEnabled(harness.modsDir, '妮可', 'C', false)
    setModEnabled(harness.modsDir, '妮可', 'D', true)
    harness.store.getPresets().presetsByGame[GAME_ID].activePresetId = null
    harness.store.savePresets()

    const res = await harness.presetEngine.applyPreset(GAME_ID, presetId)

    expect(res.success).toBe(true)
    expect(res.applied).toBe(4)
    expect(res.enabled).toBe(2)
    expect(res.disabled).toBe(2)
    expect(res.failed).toEqual([])
    expect(res.missing).toEqual([])
    expect(res.mode).toBe('replace')

    expect(isModEnabled(harness.modsDir, '安比', 'A')).toBe(true)
    expect(isModEnabled(harness.modsDir, '安比', 'B')).toBe(false)
    expect(isModEnabled(harness.modsDir, '妮可', 'C')).toBe(true)
    expect(isModEnabled(harness.modsDir, '妮可', 'D')).toBe(false)

    const stored = findPreset(harness.store, presetId)!
    expect(stored.lastAppliedAt).toBeTruthy()
    expect(Number.isNaN(Date.parse(stored.lastAppliedAt!))).toBe(false)
    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBe(presetId)
  })

  it('merge 只叠加启用，保留方案外 Mod，且不写 activePresetId', async () => {
    addMod(harness.modsDir, '安比', 'A', true)
    addMod(harness.modsDir, '安比', 'B', false)
    addMod(harness.modsDir, '妮可', 'C', true)
    addMod(harness.modsDir, '妮可', 'D', false)

    const created = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '合并模式')
    const presetId = created.preset!.id
    // 快照后：方案内的 A 被停用，方案外的 D 被启用
    setModEnabled(harness.modsDir, '安比', 'A', false)
    setModEnabled(harness.modsDir, '妮可', 'D', true)
    harness.store.getPresets().presetsByGame[GAME_ID].activePresetId = null
    harness.store.savePresets()

    const res = await harness.presetEngine.applyPreset(GAME_ID, presetId, { mode: 'merge' })

    expect(res.success).toBe(true)
    expect(res.mode).toBe('merge')
    expect(res.applied).toBe(1)
    expect(res.enabled).toBe(1)
    expect(res.disabled).toBe(0)

    expect(isModEnabled(harness.modsDir, '安比', 'A')).toBe(true)
    expect(isModEnabled(harness.modsDir, '妮可', 'C')).toBe(true)
    // 方案外已启用项必须保留
    expect(isModEnabled(harness.modsDir, '妮可', 'D')).toBe(true)
    // 方案外停用项也不能被 merge 顺手启用
    expect(isModEnabled(harness.modsDir, '安比', 'B')).toBe(false)

    expect(findPreset(harness.store, presetId)!.lastAppliedAt).toBeTruthy()
    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBeNull()
  })

  it('方案含已删除引用时不算完整应用，不写 lastAppliedAt/activePresetId', async () => {
    addMod(harness.modsDir, '安比', 'A', true)
    addMod(harness.modsDir, '安比', 'B', true)
    const created = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '含已删除引用')
    const presetId = created.preset!.id
    harness.store.getPresets().presetsByGame[GAME_ID].activePresetId = null
    harness.store.savePresets()

    fs.rmSync(path.join(harness.modsDir, '安比', 'B'), { recursive: true, force: true })

    const res = await harness.presetEngine.applyPreset(GAME_ID, presetId)

    // missing 只跳过、不算失败，但方案没有完整还原，不能标记为已生效
    expect(res.success).toBe(true)
    expect(res.failed).toEqual([])
    expect(res.missing).toHaveLength(1)
    expect(res.missing[0].modName).toBe('B')
    expect(findPreset(harness.store, presetId)!.lastAppliedAt).toBeUndefined()
    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBeNull()
  })

  it('部分失败时不写 lastAppliedAt/activePresetId，并返回中文提示', async () => {
    addMod(harness.modsDir, '安比', 'A', true)
    const created = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '会失败的方案')
    const presetId = created.preset!.id
    harness.store.getPresets().presetsByGame[GAME_ID].activePresetId = null
    harness.store.savePresets()

    vi.spyOn(harness.modEngine, 'applyPresetMods').mockResolvedValue({
      success: false,
      applied: 1,
      enabled: 1,
      disabled: 0,
      failed: [{ characterName: '安比', modName: 'A', error: '更名失败 (文件可能被游戏占用)' }]
    })

    const res = await harness.presetEngine.applyPreset(GAME_ID, presetId)

    expect(res.success).toBe(false)
    expect(res.applied).toBe(1)
    expect(res.failed).toHaveLength(1)
    expect(res.message).toContain('方案部分生效：1 项成功，1 项失败')
    expect(res.message).toContain('A: 更名失败')

    const stored = findPreset(harness.store, presetId)!
    expect(stored.lastAppliedAt).toBeUndefined()
    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBeNull()
  })

  it('应用期间方案被删除时不再回写 activePresetId/lastAppliedAt', async () => {
    addMod(harness.modsDir, '安比', 'A', true)
    const created = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '应用中被删')
    const presetId = created.preset!.id
    harness.store.getPresets().presetsByGame[GAME_ID].activePresetId = null
    harness.store.savePresets()

    vi.spyOn(harness.modEngine, 'applyPresetMods').mockImplementation(async (tasks) => {
      // 模拟应用执行期间另一条 IPC 删掉了方案
      harness.presetEngine.deletePreset(GAME_ID, presetId)
      return {
        success: true,
        applied: tasks.length,
        enabled: tasks.filter((task) => task.enabled).length,
        disabled: tasks.filter((task) => !task.enabled).length,
        failed: []
      }
    })

    const res = await harness.presetEngine.applyPreset(GAME_ID, presetId)

    expect(res.success).toBe(true)
    expect(harness.presetEngine.getGamePresets(GAME_ID)).toHaveLength(0)
    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBeNull()

    const raw = JSON.parse(fs.readFileSync(path.join(harness.cfgDir, 'presets.json'), 'utf8'))
    expect(raw.presetsByGame[GAME_ID].presets).toHaveLength(0)
    expect(raw.presetsByGame[GAME_ID].activePresetId ?? null).toBeNull()
  })

  it('Mod 根目录不存在时返回中文错误且不写应用时间', async () => {
    const missingRootHarness = createHarness({ createModsDir: false })
    const created = await missingRootHarness.presetEngine.createPresetFromCurrent(GAME_ID, '空方案')
    expect(created.success).toBe(true)

    const res = await missingRootHarness.presetEngine.applyPreset(GAME_ID, created.preset!.id)

    expect(res.success).toBe(false)
    expect(res.message).toContain('Mod 根目录未配置或不存在')
    expect(res.mode).toBe('replace')
    expect(res.applied).toBe(0)
    expect(findPreset(missingRootHarness.store, created.preset!.id)!.lastAppliedAt).toBeUndefined()
  })

  it('方案不存在时返回结构化错误而不是抛异常', async () => {
    const res = await harness.presetEngine.applyPreset(GAME_ID, 'not-exists', { mode: 'merge' })

    expect(res.success).toBe(false)
    expect(res.mode).toBe('merge')
    expect(res.applied).toBe(0)
    expect(res.failed).toEqual([])
    expect(res.message).toContain('方案不存在')
  })
})

describe('PresetEngine.updatePreset', () => {
  it('校验空名/超长/描述上限，并拒绝同游戏内大小写不敏感的重名', async () => {
    const alpha = await harness.presetEngine.createPresetFromCurrent(GAME_ID, 'Alpha')
    const beta = await harness.presetEngine.createPresetFromCurrent(GAME_ID, 'Beta')
    const alphaId = alpha.preset!.id
    const betaId = beta.preset!.id

    expect(harness.presetEngine.updatePreset(GAME_ID, betaId, { name: '   ' }).success).toBe(false)
    expect(harness.presetEngine.updatePreset(GAME_ID, betaId, { name: 'x'.repeat(61) }).success).toBe(false)
    expect(harness.presetEngine.updatePreset(GAME_ID, betaId, { description: 'd'.repeat(201) }).success).toBe(false)

    const duplicate = harness.presetEngine.updatePreset(GAME_ID, betaId, { name: 'alpha' })
    expect(duplicate.success).toBe(false)
    expect(duplicate.error).toContain('已存在同名方案')

    // 排除自身：允许把名称改成自己的大小写变体
    const selfSame = harness.presetEngine.updatePreset(GAME_ID, alphaId, { name: ' alpha ' })
    expect(selfSame.success).toBe(true)
    expect(selfSame.preset!.name).toBe('alpha')

    const missing = harness.presetEngine.updatePreset(GAME_ID, 'not-exists', { name: 'X' })
    expect(missing.success).toBe(false)
    expect(missing.error).toContain('方案不存在')
  })

  it('更新名称/描述并刷新 updatedAt', async () => {
    const created = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '旧名称', '旧描述')
    const presetId = created.preset!.id
    const oldUpdatedAt = created.preset!.updatedAt
    await wait(5)

    const res = harness.presetEngine.updatePreset(GAME_ID, presetId, {
      name: '  新名称  ',
      description: '  新描述  '
    })

    expect(res.success).toBe(true)
    expect(res.preset!.name).toBe('新名称')
    expect(res.preset!.description).toBe('新描述')
    expect(Date.parse(res.preset!.updatedAt)).toBeGreaterThan(Date.parse(oldUpdatedAt))
    expect(findPreset(harness.store, presetId)!.name).toBe('新名称')
  })
})

describe('PresetEngine.duplicatePreset', () => {
  it('复制 mods/description，名称自动避让重名，且不改变 activePresetId', async () => {
    addMod(harness.modsDir, '安比', 'A', true)
    const created = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '阵容', '说明')
    const sourceId = created.preset!.id
    harness.store.getPresets().presetsByGame[GAME_ID].activePresetId = null
    harness.store.savePresets()

    const first = harness.presetEngine.duplicatePreset(GAME_ID, sourceId)
    expect(first.success).toBe(true)
    expect(first.preset!.id).not.toBe(sourceId)
    expect(first.preset!.name).toBe('阵容 副本')
    expect(first.preset!.description).toBe('说明')
    expect(first.preset!.mods).toEqual([{ characterName: '安比', modName: 'A', enabled: true }])

    const second = harness.presetEngine.duplicatePreset(GAME_ID, sourceId)
    expect(second.preset!.name).toBe('阵容 副本 2')

    const third = harness.presetEngine.duplicatePreset(GAME_ID, sourceId)
    expect(third.preset!.name).toBe('阵容 副本 3')

    expect(harness.presetEngine.getGamePresets(GAME_ID)).toHaveLength(4)
    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBeNull()

    const missing = harness.presetEngine.duplicatePreset(GAME_ID, 'not-exists')
    expect(missing.success).toBe(false)
    expect(missing.error).toContain('方案不存在')
  })
})

describe('PresetEngine.overwriteFromCurrent', () => {
  it('用当前启用项覆盖方案并重新激活，刷新 updatedAt 且清空 lastAppliedAt', async () => {
    addMod(harness.modsDir, '安比', 'A', true)
    addMod(harness.modsDir, '妮可', 'C', true)
    const created = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '旧快照')
    const presetId = created.preset!.id
    const oldUpdatedAt = created.preset!.updatedAt
    // 模拟旧快照此前成功应用过，覆盖后这个时间必须失效
    findPreset(harness.store, presetId)!.lastAppliedAt = new Date().toISOString()
    harness.store.savePresets()
    await wait(5)

    setModEnabled(harness.modsDir, '安比', 'A', false)
    setModEnabled(harness.modsDir, '妮可', 'C', false)
    addMod(harness.modsDir, '安比', 'B', true)
    harness.store.getPresets().presetsByGame[GAME_ID].activePresetId = null
    harness.store.savePresets()

    const res = await harness.presetEngine.overwriteFromCurrent(GAME_ID, presetId)

    expect(res.success).toBe(true)
    expect(res.preset!.mods).toEqual([{ characterName: '安比', modName: 'B', enabled: true }])
    expect(Date.parse(res.preset!.updatedAt)).toBeGreaterThan(Date.parse(oldUpdatedAt))
    expect(res.preset!.lastAppliedAt).toBeUndefined()
    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBe(presetId)

    const missing = await harness.presetEngine.overwriteFromCurrent(GAME_ID, 'not-exists')
    expect(missing.success).toBe(false)
    expect(missing.error).toContain('方案不存在')
  })
})

describe('PresetEngine.pruneMissingRefs', () => {
  it('删除目录后 apply 报告 missing 且不写应用状态，prune 精确移除失效引用且不改 activePresetId', async () => {
    addMod(harness.modsDir, '安比', 'A', true)
    addMod(harness.modsDir, '安比', 'B', true)
    const created = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '含幽灵引用')
    const presetId = created.preset!.id
    expect(created.preset!.mods).toHaveLength(2)
    harness.store.getPresets().presetsByGame[GAME_ID].activePresetId = null
    harness.store.savePresets()

    fs.rmSync(path.join(harness.modsDir, '安比', 'B'), { recursive: true, force: true })

    const applyRes = await harness.presetEngine.applyPreset(GAME_ID, presetId)
    expect(applyRes.success).toBe(true)
    expect(applyRes.applied).toBe(0)
    expect(applyRes.missing).toHaveLength(1)
    expect(applyRes.missing[0].modName).toBe('B')
    // 含缺失引用不算完整应用，不能写入 lastAppliedAt / activePresetId
    expect(findPreset(harness.store, presetId)!.lastAppliedAt).toBeUndefined()
    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBeNull()

    const pruneRes = await harness.presetEngine.pruneMissingRefs(GAME_ID, presetId)
    expect(pruneRes.success).toBe(true)
    expect(pruneRes.removed).toBe(1)
    expect(pruneRes.preset!.mods).toEqual([{ characterName: '安比', modName: 'A', enabled: true }])
    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBeNull()

    const updatedAtBefore = pruneRes.preset!.updatedAt
    await wait(5)
    const again = await harness.presetEngine.pruneMissingRefs(GAME_ID, presetId)
    expect(again.success).toBe(true)
    expect(again.removed).toBe(0)
    expect(again.preset!.updatedAt).toBe(updatedAtBefore)

    const missing = await harness.presetEngine.pruneMissingRefs(GAME_ID, 'not-exists')
    expect(missing.success).toBe(false)
    expect(missing.removed).toBe(0)
    expect(missing.error).toContain('方案不存在')
  })
})

describe('PresetEngine.deletePreset', () => {
  it('删除激活方案清空 activePresetId，删除非激活方案不影响激活状态，且不动磁盘', async () => {
    addMod(harness.modsDir, '安比', 'A', true)
    const first = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '第一套')
    const second = await harness.presetEngine.createPresetFromCurrent(GAME_ID, '第二套')

    expect(harness.presetEngine.deletePreset(GAME_ID, first.preset!.id)).toBe(true)
    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBe(second.preset!.id)
    expect(harness.presetEngine.deletePreset(GAME_ID, first.preset!.id)).toBe(false)
    expect(harness.presetEngine.deletePreset(GAME_ID, 'not-exists')).toBe(false)

    expect(harness.presetEngine.deletePreset(GAME_ID, second.preset!.id)).toBe(true)
    expect(harness.presetEngine.getActivePresetId(GAME_ID)).toBeNull()
    expect(harness.presetEngine.getGamePresets(GAME_ID)).toHaveLength(0)
    // 删除方案只动 presets.json，不允许触碰 Mod 目录
    expect(isModEnabled(harness.modsDir, '安比', 'A')).toBe(true)
  })
})
