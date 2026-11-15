import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import type { ModPersistInfo, ModPersistVariable } from './types'

export interface PersistHotkeyTarget {
  namespace: string
  variable: string
  value: string
  keys: string[]
}

export interface PersistHotkeyManifest {
  manifestHash: string
  targets: PersistHotkeyTarget[]
  hotkeyCount: number
  fallbackCount: number
}

export interface PersistHotkeyPrepareFilesResult extends PersistHotkeyManifest {
  changed: boolean
}

const FUNCTION_KEYS = Array.from({ length: 12 }, (_, index) => `VK_F${index + 13}`)

const FUNCTION_KEY_TRIPLES: string[][] = []
for (let first = 0; first < FUNCTION_KEYS.length - 2; first++) {
  for (let second = first + 1; second < FUNCTION_KEYS.length - 1; second++) {
    for (let third = second + 1; third < FUNCTION_KEYS.length; third++) {
      FUNCTION_KEY_TRIPLES.push([
        FUNCTION_KEYS[first],
        FUNCTION_KEYS[second],
        FUNCTION_KEYS[third]
      ])
    }
  }
}

// 不使用 Ctrl/Alt 等修饰键：作者菜单就绑定 Ctrl+Alt，修饰键前缀会误触其它快捷键。
// 所有隐藏通道都使用等长三键组合，避免一个组合成为另一个组合的前缀。
export const PERSIST_HOTKEY_SLOTS: string[][] = FUNCTION_KEY_TRIPLES.slice(0, 96)

const SINGLE_NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/

function sha12(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12)
}

function normalizePath(value: string): string {
  return path.resolve(value).replace(/\\/g, '/').toLowerCase()
}

function normalizeNamespace(value: string): string {
  return String(value || '')
    .replace(/[\\/]+/g, '\\')
    .replace(/^\\+|\\+$/g, '')
}

function isSafeNamespace(value: string): boolean {
  return !!value && !/[\r\n;#=[\]"'$]/.test(value)
}

function canonicalValue(value: string): string | null {
  const trimmed = String(value || '').trim()
  if (!SINGLE_NUMBER.test(trimmed)) return null
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) return null
  return Object.is(numeric, -0) ? '0' : String(numeric)
}

function discreteValues(variable: ModPersistVariable): string[] {
  if (!variable.supported) return []
  if (!/^[A-Za-z0-9_]+$/.test(variable.name)) return []
  if (!isSafeNamespace(normalizeNamespace(variable.namespace))) return []
  if (variable.inputKind === 'number') return []

  const rawValues =
    variable.allowedValues && variable.allowedValues.length > 0
      ? variable.allowedValues
      : variable.inputKind === 'binary'
        ? ['0', '1']
        : []
  if (rawValues.length === 0) return []

  const values: string[] = []
  const seen = new Set<string>()
  for (const raw of rawValues) {
    const value = canonicalValue(raw)
    if (value === null) return []
    if (seen.has(value)) continue
    seen.add(value)
    values.push(value)
  }
  return values
}

function targetIdentity(namespace: string, variable: string, value: string): string {
  return `${namespace}\\${variable}\\${value}`.toLowerCase()
}

/**
 * 生成稳定、无重复的内部热键清单。
 *
 * 只有可枚举的离散值能静态映射；任意数值仍由 F10 兜底。
 */
export function buildPersistHotkeyManifest(info: ModPersistInfo): PersistHotkeyManifest {
  const targets: PersistHotkeyTarget[] = []
  const seenTargets = new Set<string>()
  let nextSlot = 0
  let fallbackCount = 0

  for (const variable of info.variables) {
    const namespace = normalizeNamespace(variable.namespace)
    const values = discreteValues(variable)
    if (values.length === 0) continue

    const pending = values.filter(
      (value) => !seenTargets.has(targetIdentity(namespace, variable.name, value))
    )
    if (pending.length === 0) continue

    // 一个变量要么全部值都走即时通道，要么整体回退，避免同一控件行为不一致。
    if (PERSIST_HOTKEY_SLOTS.length - nextSlot < pending.length) {
      fallbackCount += pending.length
      continue
    }

    for (const value of pending) {
      const identity = targetIdentity(namespace, variable.name, value)
      seenTargets.add(identity)
      targets.push({
        namespace,
        variable: variable.name,
        value,
        keys: [...PERSIST_HOTKEY_SLOTS[nextSlot]]
      })
      nextSlot++
    }
  }

  return {
    manifestHash: sha12(JSON.stringify(targets)),
    targets,
    hotkeyCount: targets.length,
    fallbackCount
  }
}

function writeFileAtomic(filePath: string, content: string) {
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, content, 'utf8')
  try {
    fs.renameSync(tempPath, filePath)
  } catch {
    try {
      fs.unlinkSync(filePath)
    } catch (_) {}
    fs.renameSync(tempPath, filePath)
  }
}

export class PersistHotkeyBridge {
  private activeModPath = ''
  private activeManifestHash = ''
  private ready = false
  private lastWrittenManifestHash = ''
  private targetsByKey = new Map<string, string[]>()

  public prepareFiles(envRoot: string, info: ModPersistInfo): PersistHotkeyPrepareFilesResult {
    const manifest = buildPersistHotkeyManifest(info)
    const qaqmDir = path.join(envRoot, 'qaqm')
    const hotkeysRoot = path.join(qaqmDir, 'hotkeys')
    const indexPath = path.join(qaqmDir, 'qaqm_live_keys.ini')
    const manifestDir = path.join(hotkeysRoot, manifest.manifestHash)

    if (!fs.existsSync(qaqmDir)) fs.mkdirSync(qaqmDir, { recursive: true })
    if (!fs.existsSync(hotkeysRoot)) fs.mkdirSync(hotkeysRoot, { recursive: true })

    const indexContent = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : ''
    const indexMatchesManifest =
      fs.existsSync(indexPath) &&
      (manifest.targets.length === 0
        ? !indexContent.includes('include = hotkeys\\')
        : indexContent.includes(`hotkeys\\${manifest.manifestHash}\\`))
    const expectedFileCount = new Set(manifest.targets.map((target) => target.namespace)).size
    const manifestFilesExist =
      manifest.targets.length === 0 ||
      (fs.existsSync(manifestDir) &&
        fs.readdirSync(manifestDir).filter((name) => name.toLowerCase().endsWith('.ini')).length ===
          expectedFileCount)
    const unchanged =
      this.lastWrittenManifestHash === manifest.manifestHash &&
      indexMatchesManifest &&
      manifestFilesExist

    if (unchanged) {
      return { ...manifest, changed: false }
    }

    const indexLines = ['; QAQM live hotkey index (generated)']

    if (manifest.targets.length > 0) {
      if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true })
      const groups = new Map<string, PersistHotkeyTarget[]>()
      for (const target of manifest.targets) {
        if (!groups.has(target.namespace)) groups.set(target.namespace, [])
        groups.get(target.namespace)!.push(target)
      }

      let groupIndex = 0
      for (const [namespace, targets] of groups) {
        const fileName = `${groupIndex}_${sha12(namespace)}.ini`
        const lines = [
          '; QAQM live hotkeys (generated)',
          `namespace = ${namespace}`,
          ''
        ]
        for (const target of targets) {
          const sectionId = sha12(
            `${target.namespace}|${target.variable}|${target.value}|${target.keys.join(' ')}`
          )
          lines.push(
            `[KeyQAQMLive_${groupIndex}_${sectionId}]`,
            `key = ${target.keys.join(' ')}`,
            `$${target.variable} = ${target.value}`,
            ''
          )
        }
        writeFileAtomic(path.join(manifestDir, fileName), lines.join('\n'))
        indexLines.push(
          '',
          `[IncludeQAQMLive${groupIndex}]`,
          `include = hotkeys\\${manifest.manifestHash}\\${fileName}`
        )
        groupIndex++
      }
    }

    writeFileAtomic(indexPath, indexLines.join('\n') + '\n')

    for (const entry of fs.readdirSync(hotkeysRoot, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        entry.name === manifest.manifestHash ||
        !/^[a-f0-9]{12}$/i.test(entry.name)
      ) {
        continue
      }
      try {
        fs.rmSync(path.join(hotkeysRoot, entry.name), { recursive: true, force: true })
      } catch (_) {}
    }

    this.lastWrittenManifestHash = manifest.manifestHash
    return { ...manifest, changed: true }
  }

  public activate(modFullPath: string, manifest: PersistHotkeyManifest) {
    this.activeModPath = normalizePath(modFullPath)
    this.activeManifestHash = manifest.manifestHash
    this.ready = manifest.hotkeyCount > 0
    this.targetsByKey = new Map(
      manifest.targets.map((target) => [
        targetIdentity(target.namespace, target.variable, target.value),
        [...target.keys]
      ])
    )
  }

  public isActive(modFullPath: string, manifestHash: string): boolean {
    return (
      this.ready &&
      this.activeManifestHash === manifestHash &&
      this.activeModPath === normalizePath(modFullPath)
    )
  }

  public resolve(
    modFullPath: string,
    namespace: string,
    variableName: string,
    value: string
  ): string[] | null {
    if (!this.ready || this.activeModPath !== normalizePath(modFullPath)) return null
    const normalizedNamespace = normalizeNamespace(namespace)
    const normalizedVariable = String(variableName || '').replace(/^\$/, '').trim()
    const normalizedValue = canonicalValue(value)
    if (!isSafeNamespace(normalizedNamespace) || !normalizedVariable || normalizedValue === null) {
      return null
    }
    return this.targetsByKey.get(
      targetIdentity(normalizedNamespace, normalizedVariable, normalizedValue)
    ) || null
  }

  public reset() {
    this.activeModPath = ''
    this.activeManifestHash = ''
    this.ready = false
    this.lastWrittenManifestHash = ''
    this.targetsByKey.clear()
  }
}

export interface PersistHotkeyRouteDeps {
  dispatchHotkey: (keys: string[]) => Promise<{ success: boolean; reason?: string }>
  waitForRelease: () => Promise<void>
}

export interface PersistHotkeyRouteResult {
  applied: boolean
  reason?: string
}

export async function tryApplyPreparedPersistHotkey(
  bridge: PersistHotkeyBridge,
  modFullPath: string,
  namespace: string | undefined,
  variableName: string,
  value: string,
  preferHotkeyBridge: boolean,
  deps: PersistHotkeyRouteDeps
): Promise<PersistHotkeyRouteResult> {
  if (!preferHotkeyBridge) return { applied: false, reason: 'not_requested' }
  if (!namespace) return { applied: false, reason: 'not_mapped' }

  const keys = bridge.resolve(modFullPath, namespace, variableName, value)
  if (!keys) return { applied: false, reason: 'not_mapped' }

  const dispatched = await deps.dispatchHotkey(keys)
  if (!dispatched.success) {
    return { applied: false, reason: dispatched.reason || 'dispatch_failed' }
  }
  await deps.waitForRelease()
  return { applied: true }
}
