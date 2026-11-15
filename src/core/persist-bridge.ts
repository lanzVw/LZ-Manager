import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { translateTerm } from './mod-translator'
import { readTextAuto, writeTextWithEncoding } from './text-encoding'
import { parseIniNamespace } from './base-mod'
import { collectPersistValueHints, inferPersistValueOptions } from './persist-values'
import type { ModPersistValueKind, ModPersistValueSource } from './types'

export interface ModPersistVariable {
  name: string
  canonicalName: string
  namespace: string
  bridgeHash?: string
  supported: boolean
  supportError?: string
  defaultValue: string
  currentValue: string
  allowedValues?: string[]
  inputKind?: ModPersistValueKind
  min?: number
  max?: number
  step?: number
  valueSource?: ModPersistValueSource
  keybind?: string
  iniFile: string
  alias?: string
  valueLabels?: Record<string, string>
}

export interface ModPersistInfo {
  hasPersist: boolean
  hash: string
  namespace: string
  stateFileName: string
  variables: ModPersistVariable[]
}

export interface PersistBridgeDescriptor {
  hash: string
  canonicalRelativePath: string
  stateFileName: string
  namespace: string
}

export interface PersistLiveApplyAssignment {
  name: string
  value: string
}

export interface PersistLiveApplyGroup {
  namespace: string
  assignments: PersistLiveApplyAssignment[]
}

export interface PersistLiveApply {
  groups: PersistLiveApplyGroup[]
}

export interface PersistVariableUpdateResult {
  success: boolean
  error?: string
  liveApply?: PersistLiveApply
}

export interface PersistResetResult {
  success: boolean
  resetCount: number
  error?: string
  liveApply?: PersistLiveApply
}

export class PersistBridgeManager {
  private configStorePath: string

  constructor() {
    const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library/Application Support') : '')
    this.configStorePath = path.join(appData, 'QAQManager')
    // 注：mod-persist-state.json 机制此前是完整死代码（读取后从未使用、saveState 从未被调用），
    // 已移除；Mod 数值的持久化完全依赖 qaqm/cache 下的 state 文件与 d3dx_user.ini
  }

  /**
   * 规范化路径，剔除 DISABLED_ 前缀生成稳定的 canonical 相对路径
   */
  public normalizePersistRelativePath(val: string): string {
    return String(val || '')
      .replace(/\/+/g, '\\')
      .split('\\')
      .filter(Boolean)
      .map((seg) => seg.replace(/^DISABLED_/i, ''))
      .join('\\')
  }

  /**
   * 生成与原版 QAQManager 100% 兼容的 SHA1-12 构架描述符
   */
  public buildDescriptor(modsRoot: string, iniPath: string): PersistBridgeDescriptor {
    const rel = path.relative(modsRoot, iniPath)
    const canonicalRelativePath = this.normalizePersistRelativePath(rel)
    const hash = crypto
      .createHash('sha1')
      .update(canonicalRelativePath.toLowerCase())
      .digest('hex')
      .slice(0, 12)

    return {
      hash,
      canonicalRelativePath,
      stateFileName: `qaqm_state_${hash}.ini`,
      namespace: `QAQM\\Persist\\Bridge_${hash}`
    }
  }

  /**
   * 格式化按键绑定提示
   */
  public formatKeybind(rawKey: string): string {
    if (!rawKey) return ''
    return rawKey
      .replace(/NO_MODIFIERS\s*/gi, '')
      .replace(/no_ctrl\s*/gi, '')
      .replace(/no_alt\s*/gi, '')
      .replace(/no_shift\s*/gi, '')
      .replace(/vk_ALT/gi, 'Alt')
      .replace(/vk_CTRL/gi, 'Ctrl')
      .replace(/vk_SHIFT/gi, 'Shift')
      .replace(/VK_RIGHT/gi, '→')
      .replace(/VK_LEFT/gi, '←')
      .replace(/VK_UP/gi, '↑')
      .replace(/VK_DOWN/gi, '↓')
      .trim()
      .replace(/\s+/g, ' + ')
  }

  /**
   * 确保游戏环境已注入 QAQ Includer 与 Persist Bridge
   */
  public ensureEnvironment(envRoot: string, syncActiveMods = true): boolean {
    if (!envRoot || !fs.existsSync(envRoot)) return false
    try {
      const qaqmDir = path.join(envRoot, 'qaqm')
      const cacheDir = path.join(qaqmDir, 'cache')
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true })
      }

      const includerPath = path.join(qaqmDir, 'qaqm_includer.ini')
      const targetIncluder = [
        '[IncludeKeypress]',
        'include = qaqm_keypress.ini',
        '',
        '[IncludePersistBridgeActive]',
        'include = qaqm_persist_active.ini',
        '',
        '[IncludePersistApply]',
        'include = qaqm_persist_apply.ini',
        '',
        '[IncludeLiveKeys]',
        'include = qaqm_live_keys.ini',
        ''
      ].join('\n')

      let includerContent = fs.existsSync(includerPath)
        ? fs.readFileSync(includerPath, 'utf8')
        : ''
      const originalIncluder = includerContent
      includerContent = includerContent
        .replace(/include\s*=\s*qaqm\\qaqm_keypress\.ini/gi, 'include = qaqm_keypress.ini')
        .replace(/include\s*=\s*qaqm\\qaqm_persist_active\.ini/gi, 'include = qaqm_persist_active.ini')
        .replace(/include\s*=\s*qaqm\\qaqm_persist_apply\.ini/gi, 'include = qaqm_persist_apply.ini')
        .replace(/include\s*=\s*qaqm\\qaqm_live_keys\.ini/gi, 'include = qaqm_live_keys.ini')

      const requiredIncludes = [
        ['IncludeKeypress', 'qaqm_keypress.ini'],
        ['IncludePersistBridgeActive', 'qaqm_persist_active.ini'],
        ['IncludePersistApply', 'qaqm_persist_apply.ini'],
        ['IncludeLiveKeys', 'qaqm_live_keys.ini']
      ] as const
      for (const [section, includeFile] of requiredIncludes) {
        if (new RegExp(`include\\s*=\\s*${includeFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(includerContent)) {
          continue
        }
        includerContent = includerContent.trimEnd()
        includerContent += `${includerContent ? '\n\n' : ''}[${section}]\ninclude = ${includeFile}\n`
      }

      if (!fs.existsSync(includerPath) || includerContent !== originalIncluder) {
        fs.writeFileSync(includerPath, includerContent || targetIncluder, 'utf8')
      }

      // qaqm_includer.ini 引用的 keypress 文件必须存在并写入 check_foreground_window = 0，
      // 允许 3DMigoto 在悬浮窗处于前台时接收后台模拟按键与 F10 刷新（对齐原版 setBackgroundKeypressEnabled）
      const keypressPath = path.join(qaqmDir, 'qaqm_keypress.ini')
      const targetKeypress = '[System]\ncheck_foreground_window = 0\n'
      if (!fs.existsSync(keypressPath)) {
        fs.writeFileSync(keypressPath, targetKeypress, 'utf8')
      } else {
        const currentKeypress = fs.readFileSync(keypressPath, 'utf8')
        if (!/check_foreground_window\s*=\s*0/i.test(currentKeypress)) {
          fs.writeFileSync(keypressPath, targetKeypress, 'utf8')
        }
      }

      const activeIniPath = path.join(qaqmDir, 'qaqm_persist_active.ini')
      if (!fs.existsSync(activeIniPath)) {
        fs.writeFileSync(activeIniPath, '', 'utf8')
      } else {
        const activeContent = fs.readFileSync(activeIniPath, 'utf8')
        if (/include\s*=\s*qaqm\\cache\\/i.test(activeContent)) {
          const normalized = activeContent.replace(/include\s*=\s*qaqm\\cache\\/gi, 'include = cache\\')
          fs.writeFileSync(activeIniPath, normalized, 'utf8')
        }
      }

      const applyIndexPath = path.join(qaqmDir, 'qaqm_persist_apply.ini')
      const applyDir = path.join(qaqmDir, 'qaqm_persist_apply')
      if (!fs.existsSync(applyDir)) {
        fs.mkdirSync(applyDir, { recursive: true })
      }
      if (!fs.existsSync(applyIndexPath)) {
        fs.writeFileSync(applyIndexPath, '; QAQM persist apply index (generated)\n', 'utf8')
      }

      const liveKeysDir = path.join(qaqmDir, 'hotkeys')
      const liveKeysIndexPath = path.join(qaqmDir, 'qaqm_live_keys.ini')
      if (!fs.existsSync(liveKeysDir)) {
        fs.mkdirSync(liveKeysDir, { recursive: true })
      }
      if (!fs.existsSync(liveKeysIndexPath)) {
        fs.writeFileSync(liveKeysIndexPath, '; QAQM live hotkey index (generated)\n', 'utf8')
      }

      // 检查 d3dx.ini 是否已包含 qaqm_includer.ini
      const d3dxPath = path.join(envRoot, 'd3dx.ini')
      if (fs.existsSync(d3dxPath)) {
        // d3dx.ini 是用户核心自定义文件，常见 GBK 编码——按原编码读改写，utf8 覆盖会永久乱码
        const { content: original, encoding } = readTextAuto(d3dxPath)
        if (!original.toLowerCase().includes('qaqm_includer.ini')) {
          let content = original
          if (/\[Include\]/i.test(content)) {
            content = content.replace(/\[Include\]/i, '[Include]\ninclude = qaqm\\qaqm_includer.ini')
          } else {
            content = content.trim() + '\n\n[Include]\ninclude = qaqm\\qaqm_includer.ini\n'
          }
          writeTextWithEncoding(d3dxPath, content, encoding)
        }
      }

      // 自动自愈同步当前处于启用状态的 Mod 持久化桥接（对齐原版 QAQ rebuildActivePersistBridgeIncludes）
      const modsRoot = path.join(envRoot, 'Mods')
      if (syncActiveMods && fs.existsSync(modsRoot)) {
        this.syncAllActiveMods(envRoot, modsRoot)
      }

      return true
    } catch (err) {
      console.warn('Failed to ensure persist bridge environment:', err)
      return false
    }
  }

  /**
   * 解析 d3dx_user.ini 中的 [Constants] 键值表
   */
  public readD3dxUserConstants(d3dxUserPath: string): { prefixLines: string[]; constantsMap: Map<string, { key: string; value: string }>; suffixLines: string[] } {
    const defaultPrefixLines = [
      '; AUTOMATICALLY GENERATED FILE - DO NOT EDIT',
      ';',
      '; 3DMigoto will overwrite this file whenever any persistent settings are',
      '; altered by hot key or command list. Tag global variables with the "persist"',
      '; keyword to save them in this file. Use the post keyword in the [Constants]',
      '; command list if you need to do any intialisation after this file is loaded.',
      ';'
    ]

    if (!d3dxUserPath || !fs.existsSync(d3dxUserPath)) {
      return { prefixLines: defaultPrefixLines, constantsMap: new Map(), suffixLines: [] }
    }

    try {
      const lines = fs.readFileSync(d3dxUserPath, 'utf8').split(/\r?\n/)
      const prefixLines: string[] = []
      const suffixLines: string[] = []
      const constantsMap = new Map<string, { key: string; value: string }>()
      let sawConstants = false
      let inConstants = false

      for (const line of lines) {
        const trimmed = line.trim()
        if (/^\[Constants\]$/i.test(trimmed)) {
          sawConstants = true
          inConstants = true
          continue
        }
        if (inConstants && /^\[[^\]]+\]$/.test(trimmed)) {
          inConstants = false
          suffixLines.push(line)
          continue
        }
        if (!sawConstants) {
          prefixLines.push(line)
          continue
        }
        if (inConstants) {
          if (!trimmed || trimmed.startsWith(';')) continue
          const m = line.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/)
          if (!m) continue
          const rawKey = m[1].trim()
          const rawValue = m[2].trim()
          constantsMap.set(rawKey.toLowerCase(), { key: rawKey, value: rawValue })
          continue
        }
        suffixLines.push(line)
      }

      return {
        prefixLines: prefixLines.length > 0 ? prefixLines : defaultPrefixLines,
        constantsMap,
        suffixLines
      }
    } catch (_) {
      return { prefixLines: defaultPrefixLines, constantsMap: new Map(), suffixLines: [] }
    }
  }

  /**
   * 安全原子写入 d3dx_user.ini
   */
  public writeD3dxUserConstants(
    d3dxUserPath: string,
    constantsMap: Map<string, { key: string; value: string }>,
    prefixLines: string[] = [],
    suffixLines: string[] = []
  ) {
    try {
      const lines: string[] = []
      if (prefixLines.length > 0) lines.push(...prefixLines)
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('')
      lines.push('[Constants]')

      for (const entry of constantsMap.values()) {
        lines.push(`${entry.key} = ${entry.value}`)
      }

      if (suffixLines.length > 0) {
        if (lines[lines.length - 1] !== '') lines.push('')
        lines.push(...suffixLines)
      }

      const tempPath = `${d3dxUserPath}.tmp`
      fs.writeFileSync(tempPath, lines.join('\n') + '\n', 'utf8')
      // Windows 下 rename 自带 REPLACE_EXISTING 语义，可直接原子替换已存在目标。
      // 切勿先 unlink 再 rename：游戏运行中 3DMigoto 可能正占用原文件，
      // unlink 成功而 rename 失败会导致全部 persist 变量一次性丢失。
      try {
        fs.renameSync(tempPath, d3dxUserPath)
      } catch (renameErr) {
        // 保留 .tmp 供恢复，并把错误抛给调用方（由 IPC 返回失败，而不是静默丢失数据）
        console.error('Failed to rename d3dx_user.ini (原文件未动，.tmp 已保留):', renameErr)
        throw renameErr
      }
    } catch (err) {
      console.error('Failed to write d3dx_user.ini:', err)
      throw err
    }
  }

  private setD3dxUserConstant(
    constantsMap: Map<string, { key: string; value: string }>,
    qualifiedKey: string,
    value: string
  ) {
    const canonical = qualifiedKey.replace(/^\\+/, '')
    constantsMap.delete(canonical.replace(/^\$\\/, '$').toLowerCase())
    constantsMap.set(canonical.toLowerCase(), { key: canonical, value })
  }

  private isSafeNamespace(namespace: string): boolean {
    return !!namespace && !/[\r\n;#=[\]"'$]/.test(namespace)
  }

  /**
   * 解析 Mod 内所有的可设定数值与按键定义
   */
  public getModPersistInfo(modFullPath: string, modsRoot: string, envRoot: string): ModPersistInfo {
    const result: ModPersistInfo = {
      hasPersist: false,
      hash: '',
      namespace: '',
      stateFileName: '',
      variables: []
    }

    if (!envRoot || !modsRoot || !fs.existsSync(modFullPath)) return result

    // 递归找到所有 .ini 文件
    const findInis = (dir: string): string[] => {
      const list: string[] = []
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const e of entries) {
          const full = path.join(dir, e.name)
          if (e.isDirectory()) list.push(...findInis(full))
          else if (e.isFile() && e.name.toLowerCase().endsWith('.ini')) list.push(full)
        }
      } catch (_) {}
      return list
    }

    const iniFiles = findInis(modFullPath)
    if (iniFiles.length === 0) return result

    const d3dxUserPath = path.join(envRoot, 'd3dx_user.ini')
    const { constantsMap } = fs.existsSync(d3dxUserPath)
      ? this.readD3dxUserConstants(d3dxUserPath)
      : { constantsMap: new Map() }

    const seenVars = new Set<string>()
    const bridgeStateCache = new Map<string, Map<string, { name: string; value: string }>>()

    for (const iniPath of iniFiles) {
      try {
        const { content } = readTextAuto(iniPath)
        const lines = content.split(/\r?\n/)
        const valueHints = collectPersistValueHints(lines)
        let desc = this.buildDescriptor(modsRoot, iniPath)
        const explicitNamespace = (parseIniNamespace(content) || '').replace(/[\\/]+/g, '\\').replace(/^\\+|\\+$/g, '')
        const relativeIniPath = this.normalizePersistRelativePath(path.relative(modsRoot, iniPath))
        // include_recursive = Mods 时，3DMigoto 的默认 namespace 是
        // “Mods\<相对路径>\<文件名>.ini”，不是相对 Mods 目录的裸路径。
        const actualNamespace = explicitNamespace || `Mods\\${relativeIniPath}`
        const bridgeVariableNamespaces = new Map<string, string>()
        const bridgeRefRe = /\$[\\/]*QAQM[\\/]+Persist[\\/]+Bridge_([a-f0-9]{12})[\\/]+([A-Za-z0-9_]+)/gi
        let bridgeRefM: RegExpExecArray | null
        while ((bridgeRefM = bridgeRefRe.exec(content))) {
          const hash = bridgeRefM[1].toLowerCase()
          bridgeVariableNamespaces.set(bridgeRefM[2].toLowerCase(), `QAQM\\Persist\\Bridge_${hash}`)
          if (!bridgeStateCache.has(hash)) {
            bridgeStateCache.set(hash, this.readBridgeStateDefaults(envRoot, hash))
          }
        }

        // 提取按键与选项信息 [KeySwap...] 或 [Key...]
        const keySwapMap: Record<string, { keybind?: string; allowedValues?: string[] }> = {}
        let currentSection = ''
        let currentKey = ''

        for (const line of lines) {
          const trimmed = line.trim()
          const secM = trimmed.match(/^\[([^\]]+)\]/)
          if (secM) {
            currentSection = secM[1]
            currentKey = ''
            continue
          }
          const lowerSec = currentSection.toLowerCase()
          if (lowerSec.includes('key') || lowerSec.includes('swap') || lowerSec.includes('toggle')) {
            const keyM = trimmed.match(/^key\s*=\s*(.+)$/i)
            if (keyM) currentKey = keyM[1].trim()

            // 匹配标准变量 $var = 0, 1 或桥接变量 $\QAQM\Persist\Bridge_...\var = 0, 1
            const varCycleM = trimmed.match(/^\$(?:[a-zA-Z0-9_\\.]*\\)?([a-zA-Z0-9_]+)\s*=\s*([0-9a-zA-Z_,.\s+-]+)$/)
            if (varCycleM) {
              const vName = varCycleM[1].toLowerCase()
              const vals = varCycleM[2].split(',').map((s) => s.trim()).filter(Boolean)
              keySwapMap[vName] = { keybind: this.formatKeybind(currentKey), allowedValues: vals }
            }
          }
        }

        // 只从原始文件和原始备份提取声明，旧版合成 namespace 状态不代表 Mod 实际变量
        let persistLines = [...lines]
        const bakFilePath = `${iniPath}.qaqm-persistbak`
        if (fs.existsSync(bakFilePath)) {
          try {
            const { content: bakContent } = readTextAuto(bakFilePath)
            persistLines.push(...bakContent.split(/\r?\n/))
          } catch (_) {}
        }

        // 提取 global persist / persist global 变量声明（不同 Mod 作者写法不一致）
        for (const line of persistLines) {
          const persistM = line.match(/^\s*(?:global\s+persist|persist\s+global)\s+\$([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/i)
          if (!persistM) continue

          const varName = persistM[1]
          const normName = varName.toLowerCase()
          const bridgeNamespace = bridgeVariableNamespaces.get(normName)
          const bridgeHash = bridgeNamespace ? this.getBridgeHash(bridgeNamespace) : null
          const variableNamespace = bridgeNamespace || actualNamespace
          const qualifiedKey = `$\\${variableNamespace}\\${varName}`.toLowerCase()
          const variableId = qualifiedKey
          if (seenVars.has(variableId)) continue
          seenVars.add(variableId)

          const defaultValue = persistM[2].split(/[;#]/)[0].trim()
          let currentValue = defaultValue

          // 持久化值优先读 d3dx_user；旧桥接 Mod 再从 QAQM state 文件补默认值
          const keyWithoutLeadingSlash = `$${variableNamespace}\\${varName}`.toLowerCase()
          if (constantsMap.has(qualifiedKey)) {
            currentValue = constantsMap.get(qualifiedKey)!.value
          } else if (constantsMap.has(keyWithoutLeadingSlash)) {
            currentValue = constantsMap.get(keyWithoutLeadingSlash)!.value
          } else if (bridgeHash) {
            const stateVars = bridgeStateCache.get(bridgeHash)
            const stateVar = stateVars?.get(normName)
            if (stateVar) currentValue = stateVar.value
          }

          const swapInfo = keySwapMap[normName] || {}
          const isSupported = this.isSafeNamespace(variableNamespace)
          const inferred = inferPersistValueOptions(
            swapInfo.allowedValues,
            defaultValue,
            currentValue,
            valueHints.get(normName)
          )

          result.variables.push({
            name: varName,
            canonicalName: normName,
            namespace: variableNamespace,
            bridgeHash: bridgeHash || undefined,
            supported: isSupported,
            supportError: isSupported
              ? undefined
              : (!variableNamespace ? '无法解析此变量所属的 3DMigoto namespace' : 'namespace 包含非法字符'),
            defaultValue,
            currentValue,
            allowedValues: inferred.allowedValues,
            inputKind: inferred.kind,
            min: inferred.min,
            max: inferred.max,
            step: inferred.step,
            valueSource: inferred.source,
            keybind: swapInfo.keybind,
            iniFile: path.basename(iniPath)
          })

          if (!result.hash) {
            result.hash = bridgeHash || desc.hash
            result.namespace = variableNamespace || desc.namespace
            result.stateFileName = bridgeHash ? `qaqm_state_${bridgeHash}.ini` : desc.stateFileName
          }
        }

        // 旧版桥接 Mod 即使缺少 .qaqm-persistbak，也应从 state 文件恢复可调控变量
        const bridgeHashesInFile = new Set(
          [...bridgeVariableNamespaces.values()]
            .map((ns) => this.getBridgeHash(ns))
            .filter((hash): hash is string => !!hash)
        )
        for (const [hash, stateVars] of bridgeStateCache) {
          if (!bridgeHashesInFile.has(hash)) continue
          for (const [normName, stateVar] of stateVars) {
            const namespace = `QAQM\\Persist\\Bridge_${hash}`
            const qualifiedKey = `$\\${namespace}\\${normName}`.toLowerCase()
            if (seenVars.has(qualifiedKey)) continue
            seenVars.add(qualifiedKey)
            const swapInfo = keySwapMap[normName] || {}
            const isSupported = this.isSafeNamespace(namespace)
            const inferred = inferPersistValueOptions(
              swapInfo.allowedValues,
              stateVar.value,
              constantsMap.get(qualifiedKey)?.value || stateVar.value,
              valueHints.get(normName)
            )
            result.variables.push({
              name: stateVar.name,
              canonicalName: normName,
              namespace,
              bridgeHash: hash,
              supported: isSupported,
              supportError: isSupported ? undefined : 'namespace 包含非法字符',
              defaultValue: stateVar.value,
              currentValue: constantsMap.get(qualifiedKey)?.value || stateVar.value,
              allowedValues: inferred.allowedValues,
              inputKind: inferred.kind,
              min: inferred.min,
              max: inferred.max,
              step: inferred.step,
              valueSource: inferred.source,
              keybind: swapInfo.keybind,
              iniFile: path.basename(iniPath)
            })
            if (!result.hash) {
              result.hash = hash
              result.namespace = namespace
              result.stateFileName = `qaqm_state_${hash}.ini`
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to inspect ini for persist: ${iniPath}`, err)
      }
    }

    result.hasPersist = result.variables.length > 0

    // 智能注入中文别名与预设选项标签
    let modMeta: any = {}
    try {
      const metaPath = path.join(modFullPath, 'mod.json')
      if (fs.existsSync(metaPath)) {
        modMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      }
    } catch (_) {}

    const vAliases = modMeta.variableAliases || {}
    const vLabels = modMeta.valueLabels || {}

    for (const v of result.variables) {
      v.alias = vAliases[v.name] || vAliases[v.canonicalName] || translateTerm(v.name)
      if (vLabels[v.name] || vLabels[v.canonicalName]) {
        v.valueLabels = vLabels[v.name] || vLabels[v.canonicalName]
      }
    }

    return result
  }

  private getBridgeHash(namespace: string): string | null {
    const match = String(namespace || '').match(/(?:^|\\)QAQM\\Persist\\Bridge_([a-f0-9]{12})(?:\\|$)/i)
    return match ? match[1].toLowerCase() : null
  }

  private readBridgeStateDefaults(
    envRoot: string,
    bridgeHash: string
  ): Map<string, { name: string; value: string }> {
    const values = new Map<string, { name: string; value: string }>()
    const statePath = path.join(envRoot, 'qaqm', 'cache', `qaqm_state_${bridgeHash}.ini`)
    if (!fs.existsSync(statePath)) return values

    try {
      const { content } = readTextAuto(statePath)
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:global\s+persist|persist\s+global)\s+\$([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/i)
        if (!match) continue
        values.set(match[1].toLowerCase(), {
          name: match[1],
          value: match[2].split(/[;#]/)[0].trim()
        })
      }
    } catch (_) {}
    return values
  }

  private addIncludeToActiveFile(activeIniPath: string, stateFileName: string) {
    let content = fs.existsSync(activeIniPath) ? fs.readFileSync(activeIniPath, 'utf8') : ''
    const secName = `IncludePersistBridge_${stateFileName.replace(/\.ini$/i, '')}`
    const targetInclude = `include = cache\\${stateFileName}`

    const secRegex = new RegExp(`\\[${secName}\\][\\r\\n]+include\\s*=[^\\r\\n]*`, 'i')
    if (secRegex.test(content)) {
      const normalized = content.replace(secRegex, `[${secName}]\n${targetInclude}`)
      if (normalized !== content) fs.writeFileSync(activeIniPath, normalized, 'utf8')
      return
    }

    const block = `[${secName}]\n${targetInclude}\n`
    content = content.trimEnd()
    content += `${content ? '\n\n' : ''}${block}`
    fs.writeFileSync(activeIniPath, content, 'utf8')
  }

  private writeBridgeStateFiles(envRoot: string, variables: ModPersistVariable[]) {
    const groups = new Map<string, Map<string, ModPersistVariable>>()
    for (const variable of variables) {
      const bridgeHash = variable.bridgeHash || this.getBridgeHash(variable.namespace)
      if (!bridgeHash || !variable.supported) continue
      if (!groups.has(bridgeHash)) groups.set(bridgeHash, new Map())
      groups.get(bridgeHash)!.set(variable.canonicalName, variable)
    }

    const cacheDir = path.join(envRoot, 'qaqm', 'cache')
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
    const activeIniPath = path.join(envRoot, 'qaqm', 'qaqm_persist_active.ini')

    for (const [bridgeHash, group] of groups) {
      const stateFileName = `qaqm_state_${bridgeHash}.ini`
      const statePath = path.join(cacheDir, stateFileName)
      const stateContent = [
        `namespace = QAQM\\Persist\\Bridge_${bridgeHash}`,
        '',
        '[Constants]',
        ...[...group.values()].map((variable) => `global persist $${variable.name} = ${variable.currentValue}`),
        ''
      ].join('\n')
      const existing = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : ''
      if (existing !== stateContent) fs.writeFileSync(statePath, stateContent, 'utf8')
      this.addIncludeToActiveFile(activeIniPath, stateFileName)
    }
  }

  private buildLiveApply(
    entries: Array<{ namespace: string; name: string; value: string }>
  ): PersistLiveApply | undefined {
    const groups = new Map<string, Map<string, string>>()
    for (const entry of entries) {
      if (!this.isSafeNamespace(entry.namespace)) continue
      if (!/^[A-Za-z0-9_]+$/.test(entry.name)) continue
      if (!this.isSafeLiveValue(entry.value)) continue
      if (!groups.has(entry.namespace)) groups.set(entry.namespace, new Map())
      groups.get(entry.namespace)!.set(entry.name, entry.value.trim())
    }
    if (groups.size === 0) return undefined
    return {
      groups: [...groups.entries()].map(([namespace, assignments]) => ({
        namespace,
        assignments: [...assignments.entries()].map(([name, value]) => ({ name, value }))
      }))
    }
  }

  private isSafeLiveValue(value: string): boolean {
    const number = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?'
    return new RegExp(`^${number}(?:\\s*,\\s*${number})*$`).test(String(value || '').trim())
  }

  public writeLiveApply(
    envRoot: string,
    liveApply: PersistLiveApply | undefined
  ): { success: boolean; error?: string } {
    try {
      if (!envRoot || !fs.existsSync(envRoot)) return { success: false, error: '游戏运行环境不存在' }
      const qaqmDir = path.join(envRoot, 'qaqm')
      const applyDir = path.join(qaqmDir, 'qaqm_persist_apply')
      const indexPath = path.join(qaqmDir, 'qaqm_persist_apply.ini')
      if (!fs.existsSync(applyDir)) fs.mkdirSync(applyDir, { recursive: true })

      for (const name of fs.readdirSync(applyDir)) {
        if (/^\d+\.ini$/i.test(name)) {
          try { fs.unlinkSync(path.join(applyDir, name)) } catch (_) {}
        }
      }

      const groups = liveApply?.groups || []
      const indexLines = ['; QAQM persist apply index (generated)']
      groups.forEach((group, index) => {
        const fileName = `${index}.ini`
        if (!this.isSafeNamespace(group.namespace)) {
          throw new Error(`namespace 包含非法字符: ${group.namespace}`)
        }
        // F10 先 SavePersistentSettings 再 LoadConfigFile；
        // post 会在 d3dx_user.ini 加载后执行，才能覆盖刚被旧内存值覆盖的持久化值。
        const content = [
          '; QAQM persist apply target (generated)',
          `namespace = ${group.namespace}`,
          '',
          '[Constants]',
          ...group.assignments.map((assignment) => `post $${assignment.name} = ${assignment.value}`),
          ''
        ].join('\n')
        fs.writeFileSync(path.join(applyDir, fileName), content, 'utf8')
        indexLines.push('', `[IncludeQAQMApply${index}]`, `include = qaqm_persist_apply\\${fileName}`)
      })
      fs.writeFileSync(indexPath, indexLines.join('\n') + '\n', 'utf8')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  public clearLiveApply(envRoot: string) {
    if (!envRoot) return
    try {
      this.writeLiveApply(envRoot, undefined)
    } catch (_) {}
  }

  /**
   * 在启用/停用 Mod 时自动同步并恢复 Persist 状态
   */
  public syncModPersistOnToggle(
    envRoot: string,
    modsRoot: string,
    modFullPath: string,
    enabling: boolean
  ): boolean {
    if (!envRoot || !fs.existsSync(envRoot)) return false
    const d3dxUserPath = path.join(envRoot, 'd3dx_user.ini')
    const { prefixLines, constantsMap, suffixLines } = fs.existsSync(d3dxUserPath)
      ? this.readD3dxUserConstants(d3dxUserPath)
      : { prefixLines: [], constantsMap: new Map(), suffixLines: [] }

    const info = this.getModPersistInfo(modFullPath, modsRoot, envRoot)
    if (!info.hasPersist) return false

    if (enabling) {
      // 1. 将该 Mod 的持久化值写回 d3dx_user.ini
      for (const v of info.variables) {
        if (!v.supported) continue
        const qualifiedKey = `$\\${v.namespace}\\${v.name}`
        this.setD3dxUserConstant(constantsMap, qualifiedKey, v.currentValue)
      }
      this.writeD3dxUserConstants(d3dxUserPath, constantsMap, prefixLines, suffixLines)
      this.writeBridgeStateFiles(envRoot, info.variables)
      return true
    } else {
      // 停用前把桥接变量当前值固化到 state 文件，重新启用时仍可加载
      this.writeBridgeStateFiles(envRoot, info.variables)
      return true
    }
  }

  /**
   * 从 qaqm_persist_active.ini 移除 stateFile
   */
  private removeIncludeFromActiveFile(activeIniPath: string, stateFileName: string) {
    if (!fs.existsSync(activeIniPath)) return
    const content = fs.readFileSync(activeIniPath, 'utf8')
    const secName = `IncludePersistBridge_${stateFileName.replace(/\.ini$/i, '')}`
    if (!content.includes(secName)) return

    const lines = content.split(/\r?\n/)
    const nextLines: string[] = []
    let skipping = false

    for (const line of lines) {
      if (line.includes(`[${secName}]`)) {
        skipping = true
        continue
      }
      if (skipping && line.startsWith('[')) {
        skipping = false
      }
      if (!skipping) {
        nextLines.push(line)
      }
    }

    fs.writeFileSync(activeIniPath, nextLines.join('\n').trim() + '\n', 'utf8')
  }

  /**
   * 限制缓存文件数量，超出上限时淘汰最旧的缓存文件
   */
  public pruneCache(envRoot: string, maxCacheSize: number = 15) {
    if (maxCacheSize <= 0) return
    const cacheDir = path.join(envRoot, 'qaqm', 'cache')
    if (!fs.existsSync(cacheDir)) return
    try {
      const files = fs.readdirSync(cacheDir)
        .filter(f => f.toLowerCase().startsWith('qaqm_state_') && f.toLowerCase().endsWith('.ini'))
        .map(f => {
          const fullPath = path.join(cacheDir, f)
          let mtime = 0
          try { mtime = fs.statSync(fullPath).mtimeMs } catch (_) {}
          return { name: f, fullPath, mtime }
        })
      if (files.length > maxCacheSize) {
        files.sort((a, b) => a.mtime - b.mtime)
        const toDelete = files.slice(0, files.length - maxCacheSize)
        for (const item of toDelete) {
          try {
            fs.unlinkSync(item.fullPath)
            this.removeIncludeFromActiveFile(path.join(envRoot, 'qaqm', 'qaqm_persist_active.ini'), item.name)
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  /**
   * 直接修改单个 Mod 变量数值并持久化
   */
  public updateModVariable(
    envRoot: string,
    modsRoot: string,
    modFullPath: string,
    variableName: string,
    newValue: string,
    targetNamespace?: string
  ): PersistVariableUpdateResult {
    try {
      if (!envRoot || !modsRoot || !modFullPath) {
        return { success: false, error: '游戏运行环境或 Mod 路径无效' }
      }
      const info = this.getModPersistInfo(modFullPath, modsRoot, envRoot)
      if (!info.hasPersist) {
        return { success: false, error: '此 Mod 未检测到可持久化变量' }
      }

      const d3dxUserPath = path.join(envRoot, 'd3dx_user.ini')
      const { prefixLines, constantsMap, suffixLines } = fs.existsSync(d3dxUserPath)
        ? this.readD3dxUserConstants(d3dxUserPath)
        : { prefixLines: [], constantsMap: new Map(), suffixLines: [] }

      // 1. 更新 d3dx_user.ini
      const cleanVarName = String(variableName || '').replace(/^\$/, '')
      let matches = info.variables.filter((item) => item.name.toLowerCase() === cleanVarName.toLowerCase())
      if (targetNamespace) {
        const normNs = targetNamespace.replace(/[\\/]+/g, '\\').replace(/^\\+|\\+$/g, '').toLowerCase()
        matches = matches.filter((item) => item.namespace.toLowerCase() === normNs)
      }
      if (matches.length === 0) return { success: false, error: '指定变量不属于此 Mod' }
      if (matches.length > 1) return { success: false, error: '此 Mod 存在同名但不同 namespace 的变量，无法安全确定目标' }
      const variable = matches[0]
      if (!variable.supported) return { success: false, error: variable.supportError || '此变量的 namespace 无法安全解析' }
      if (!/^[A-Za-z0-9_]+$/.test(cleanVarName) || !newValue.trim() || /[\r\n;#[\]=\\]/.test(newValue)) {
        return { success: false, error: '变量名或设定值无效' }
      }
      const qualifiedKey = `$\\${variable.namespace}\\${variable.name}`
      const nextValue = newValue.trim()
      this.setD3dxUserConstant(constantsMap, qualifiedKey, nextValue)
      this.writeD3dxUserConstants(d3dxUserPath, constantsMap, prefixLines, suffixLines)
      const updatedVariables = info.variables.map((item) =>
        item.name === variable.name && item.namespace === variable.namespace
          ? { ...item, currentValue: nextValue }
          : item
      )
      this.writeBridgeStateFiles(envRoot, updatedVariables)

      return {
        success: true,
        liveApply: this.buildLiveApply([
          { namespace: variable.namespace, name: variable.name, value: nextValue }
        ])
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  /**
   * 重置 Mod 所有变量为默认初始值
   */
  public resetModVariables(
    envRoot: string,
    modsRoot: string,
    modFullPath: string
  ): PersistResetResult {
    try {
      if (!envRoot || !modsRoot || !modFullPath) {
        return { success: false, resetCount: 0, error: '游戏运行环境或 Mod 路径无效' }
      }
      const info = this.getModPersistInfo(modFullPath, modsRoot, envRoot)
      if (!info.hasPersist) return { success: true, resetCount: 0 }

      const d3dxUserPath = path.join(envRoot, 'd3dx_user.ini')
      const { prefixLines, constantsMap, suffixLines } = fs.existsSync(d3dxUserPath)
        ? this.readD3dxUserConstants(d3dxUserPath)
        : { prefixLines: [], constantsMap: new Map(), suffixLines: [] }

      const resetVariables = info.variables.map((v) =>
        v.supported ? { ...v, currentValue: v.defaultValue } : v
      )
      for (const v of resetVariables) {
        if (!v.supported) continue
        const qualifiedKey = `$\\${v.namespace}\\${v.name}`
        this.setD3dxUserConstant(constantsMap, qualifiedKey, v.defaultValue)
      }
      this.writeD3dxUserConstants(d3dxUserPath, constantsMap, prefixLines, suffixLines)
      this.writeBridgeStateFiles(envRoot, resetVariables)

      return {
        success: true,
        resetCount: info.variables.filter((v) => v.supported).length,
        liveApply: this.buildLiveApply(
          resetVariables
            .filter((v) => v.supported)
            .map((v) => ({ namespace: v.namespace, name: v.name, value: v.defaultValue }))
        )
      }
    } catch (err: any) {
      return { success: false, resetCount: 0, error: err.message }
    }
  }

  /**
   * 扫描并同步当前所有启用 Mod 的持久化桥接配置（对齐 QAQMAN rebuildActivePersistBridgeIncludes 自愈体系）
   */
  public syncAllActiveMods(envRoot: string, modsRoot: string) {
    if (!envRoot || !modsRoot || !fs.existsSync(modsRoot)) return
    const d3dxUserPath = path.join(envRoot, 'd3dx_user.ini')
    const { prefixLines, constantsMap, suffixLines } = fs.existsSync(d3dxUserPath)
      ? this.readD3dxUserConstants(d3dxUserPath)
      : { prefixLines: [], constantsMap: new Map(), suffixLines: [] }

    try {
      const charDirs = fs.readdirSync(modsRoot, { withFileTypes: true }).filter((d) => d.isDirectory())
      for (const cd of charDirs) {
        const charPath = path.join(modsRoot, cd.name)
        const modDirs = fs.readdirSync(charPath, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('DISABLED_'))
        for (const md of modDirs) {
          const modPath = path.join(charPath, md.name)
          const info = this.getModPersistInfo(modPath, modsRoot, envRoot)
          if (info.hasPersist) {
            this.writeBridgeStateFiles(envRoot, info.variables)
            for (const v of info.variables) {
              const qualifiedKey = `$\\${v.namespace}\\${v.name}`
              if (v.supported && !constantsMap.has(qualifiedKey.toLowerCase())) {
                this.setD3dxUserConstant(constantsMap, qualifiedKey, v.currentValue)
              }
            }
          }
        }
      }
      this.writeD3dxUserConstants(d3dxUserPath, constantsMap, prefixLines, suffixLines)
    } catch (err) {
      console.warn('syncAllActiveMods error:', err)
    }
  }

  /**
   * 清空 Persist Bridge 缓存文件
   */
  public clearCache(envRoot: string): { success: boolean; deletedCount: number; error?: string } {
    try {
      const cacheDir = path.join(envRoot, 'qaqm', 'cache')
      let deletedCount = 0

      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir)
        for (const f of files) {
          if (f.toLowerCase().startsWith('qaqm_state_') && f.toLowerCase().endsWith('.ini')) {
            try {
              fs.unlinkSync(path.join(cacheDir, f))
              deletedCount++
            } catch (_) {}
          }
        }
      }

      const activeIniPath = path.join(envRoot, 'qaqm', 'qaqm_persist_active.ini')
      if (fs.existsSync(activeIniPath)) {
        fs.writeFileSync(activeIniPath, '', 'utf8')
      }

      return { success: true, deletedCount }
    } catch (err: any) {
      return { success: false, deletedCount: 0, error: err.message }
    }
  }
}
