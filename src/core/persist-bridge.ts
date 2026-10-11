import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { translateTerm } from './mod-translator'
import { readTextAuto, writeTextWithEncoding } from './text-encoding'

export interface ModPersistVariable {
  name: string
  canonicalName: string
  defaultValue: string
  currentValue: string
  allowedValues?: string[]
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
      .replace(/[\/]+/g, '\\')
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
  public ensureEnvironment(envRoot: string): boolean {
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
        ''
      ].join('\n')

      if (!fs.existsSync(includerPath)) {
        fs.writeFileSync(includerPath, targetIncluder, 'utf8')
      } else {
        let content = fs.readFileSync(includerPath, 'utf8')
        let changed = false
        if (/include\s*=\s*qaqm\\qaqm_keypress\.ini/i.test(content)) {
          content = content.replace(/include\s*=\s*qaqm\\qaqm_keypress\.ini/gi, 'include = qaqm_keypress.ini')
          changed = true
        }
        if (/include\s*=\s*qaqm\\qaqm_persist_active\.ini/i.test(content)) {
          content = content.replace(/include\s*=\s*qaqm\\qaqm_persist_active\.ini/gi, 'include = qaqm_persist_active.ini')
          changed = true
        }
        if (changed) {
          fs.writeFileSync(includerPath, content, 'utf8')
        }
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
      if (fs.existsSync(modsRoot)) {
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

    if (!fs.existsSync(modFullPath)) return result

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

    for (const iniPath of iniFiles) {
      try {
        const content = fs.readFileSync(iniPath, 'utf8')
        const lines = content.split(/\r?\n/)
        let desc = this.buildDescriptor(modsRoot, iniPath)
        // 智能检测 INI 内是否已嵌入 QAQManager 生成的专属 Hash 与 Bridge 命名空间
        const embeddedHashM = content.match(/qaqm_state_([a-f0-9]{12})\.ini/i) || content.match(/Bridge_([a-f0-9]{12})/i)
        if (embeddedHashM) {
          const eh = embeddedHashM[1].toLowerCase()
          desc = {
            hash: eh,
            canonicalRelativePath: desc.canonicalRelativePath,
            stateFileName: `qaqm_state_${eh}.ini`,
            namespace: `QAQM\\Persist\\Bridge_${eh}`
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
            const varCycleM = trimmed.match(/^\$(?:[a-zA-Z0-9_\\.]*\\)?([a-zA-Z0-9_]+)\s*=\s*([0-9a-zA-Z_,\s\-]+)$/)
            if (varCycleM) {
              const vName = varCycleM[1].toLowerCase()
              const vals = varCycleM[2].split(',').map((s) => s.trim()).filter(Boolean)
              keySwapMap[vName] = { keybind: this.formatKeybind(currentKey), allowedValues: vals }
            }
          }
        }

        // 准备全局持久化声明行（若原 INI 已经过 QAQ 桥接转换，则备选读取 state 文件或备份文件）
        let persistLines = [...lines]
        const stateFilePath = path.join(envRoot, 'qaqm', 'cache', desc.stateFileName)
        if (fs.existsSync(stateFilePath)) {
          try {
            const sLines = fs.readFileSync(stateFilePath, 'utf8').split(/\r?\n/)
            persistLines.push(...sLines)
          } catch (_) {}
        }
        const bakFilePath = `${iniPath}.qaqm-persistbak`
        if (fs.existsSync(bakFilePath)) {
          try {
            const bLines = fs.readFileSync(bakFilePath, 'utf8').split(/\r?\n/)
            persistLines.push(...bLines)
          } catch (_) {}
        }

        // 提取 global persist 变量声明
        for (const line of persistLines) {
          const persistM = line.match(/^\s*global\s+persist\s+\$([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/i)
          if (!persistM) continue

          const varName = persistM[1]
          const normName = varName.toLowerCase()
          if (seenVars.has(normName)) continue
          seenVars.add(normName)

          const defaultValue = persistM[2].split(/[;#]/)[0].trim()
          
          // 查询当前持久化值：优先匹配 Bridge 键，其次匹配常规键
          const bridgeKey = `$\\${desc.namespace}\\${varName}`.toLowerCase()
          let currentValue = defaultValue

          // 1. 优先从 d3dx_user.ini 读取
          if (constantsMap.has(bridgeKey)) {
            currentValue = constantsMap.get(bridgeKey)!.value
          } else {
            // 2. 尝试从 qaqm_state_<hash>.ini 读取
            if (fs.existsSync(stateFilePath)) {
              try {
                const stateRaw = fs.readFileSync(stateFilePath, 'utf8')
                for (const sLine of stateRaw.split(/\r?\n/)) {
                  const sm = sLine.match(new RegExp(`^\\s*global\\s+persist\\s+\\$${varName}\\s*=\\s*(.*?)\\s*$`, 'i'))
                  if (sm) {
                    currentValue = sm[1].trim()
                    break
                  }
                }
              } catch (_) {}
            }
          }

          const swapInfo = keySwapMap[normName] || {}

          result.variables.push({
            name: varName,
            canonicalName: normName,
            defaultValue,
            currentValue,
            allowedValues: swapInfo.allowedValues || ['0', '1'],
            keybind: swapInfo.keybind,
            iniFile: path.basename(iniPath)
          })

          if (!result.hash) {
            result.hash = desc.hash
            result.namespace = desc.namespace
            result.stateFileName = desc.stateFileName
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
    const qaqmDir = path.join(envRoot, 'qaqm')
    const cacheDir = path.join(qaqmDir, 'cache')
    const activeIniPath = path.join(qaqmDir, 'qaqm_persist_active.ini')

    if (!fs.existsSync(cacheDir)) {
      try { fs.mkdirSync(cacheDir, { recursive: true }) } catch (_) {}
    }

    const d3dxUserPath = path.join(envRoot, 'd3dx_user.ini')
    const { prefixLines, constantsMap, suffixLines } = fs.existsSync(d3dxUserPath)
      ? this.readD3dxUserConstants(d3dxUserPath)
      : { prefixLines: [], constantsMap: new Map(), suffixLines: [] }

    const info = this.getModPersistInfo(modFullPath, modsRoot, envRoot)
    if (!info.hasPersist || !info.stateFileName) return false

    const stateFilePath = path.join(cacheDir, info.stateFileName)

    if (enabling) {
      // 1. 将该 Mod 的持久化值写回 d3dx_user.ini
      for (const v of info.variables) {
        const bridgeKey = `$\\${info.namespace}\\${v.name}`
        constantsMap.set(bridgeKey.toLowerCase(), { key: bridgeKey, value: v.currentValue })
      }
      this.writeD3dxUserConstants(d3dxUserPath, constantsMap, prefixLines, suffixLines)

      // 2. 写入或更新 qaqm/cache/qaqm_state_<hash>.ini
      const stateContent = [
        `namespace = ${info.namespace}`,
        '',
        '[Constants]',
        ...info.variables.map((v) => `global persist $${v.name} = ${v.currentValue}`),
        ''
      ].join('\n')
      fs.writeFileSync(stateFilePath, stateContent, 'utf8')

      // 3. 将 stateFile 激活包含到 qaqm_persist_active.ini
      this.addIncludeToActiveFile(activeIniPath, info.stateFileName)
      return true
    } else {
      // 正在停用 Mod：从 d3dx_user.ini 截取最新状态并固化在 qaqm/cache 状态文件中
      for (const v of info.variables) {
        const bridgeKey = `$\\${info.namespace}\\${v.name}`.toLowerCase()
        if (constantsMap.has(bridgeKey)) {
          v.currentValue = constantsMap.get(bridgeKey)!.value
        }
      }

      const stateContent = [
        `namespace = ${info.namespace}`,
        '',
        '[Constants]',
        ...info.variables.map((v) => `global persist $${v.name} = ${v.currentValue}`),
        ''
      ].join('\n')
      fs.writeFileSync(stateFilePath, stateContent, 'utf8')

      // 从 active.ini 中移除 include
      // 对齐原版 QAQ 缓存池体系：停用时保持在 active.ini 缓存池内，防止 3DMigoto 热刷新丢弃 d3dx_user.ini 持久化变量；
      // 最大缓存容量与淘汰统一由 pruneCache 控制
      this.addIncludeToActiveFile(activeIniPath, info.stateFileName)
      return true
    }
  }

  /**
   * 将 stateFile 加入 qaqm_persist_active.ini
   */
  private addIncludeToActiveFile(activeIniPath: string, stateFileName: string) {
    let content = fs.existsSync(activeIniPath) ? fs.readFileSync(activeIniPath, 'utf8') : ''
    const secName = `IncludePersistBridge_${stateFileName.replace(/\.ini$/i, '')}`
    const targetInclude = `include = cache\\${stateFileName}`

    if (content.includes(`[${secName}]`)) {
      // 确保包含路径为正确的 cache\，修复可能残留的历史 qaqm\cache\ 错误路径
      const secRegex = new RegExp(`\\[${secName}\\][\\r\\n]+include\\s*=[^\\r\\n]*`, 'i')
      if (secRegex.test(content)) {
        const updated = content.replace(secRegex, `[${secName}]\n${targetInclude}`)
        if (updated !== content) {
          fs.writeFileSync(activeIniPath, updated, 'utf8')
        }
      }
      return
    }

    const block = `[${secName}]\n${targetInclude}\n\n`
    content = content.trim() + (content.trim() ? '\n\n' : '') + block
    fs.writeFileSync(activeIniPath, content, 'utf8')
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
    newValue: string
  ): { success: boolean; error?: string } {
    try {
      const info = this.getModPersistInfo(modFullPath, modsRoot, envRoot)
      if (!info.hasPersist || !info.stateFileName) {
        return { success: false, error: '此 Mod 未检测到可持久化变量' }
      }

      const d3dxUserPath = path.join(envRoot, 'd3dx_user.ini')
      const { prefixLines, constantsMap, suffixLines } = fs.existsSync(d3dxUserPath)
        ? this.readD3dxUserConstants(d3dxUserPath)
        : { prefixLines: [], constantsMap: new Map(), suffixLines: [] }

      // 1. 更新 d3dx_user.ini
      const bridgeKey = `$\\${info.namespace}\\${variableName}`
      constantsMap.set(bridgeKey.toLowerCase(), { key: bridgeKey, value: newValue })
      this.writeD3dxUserConstants(d3dxUserPath, constantsMap, prefixLines, suffixLines)

      // 2. 更新 cache/qaqm_state_<hash>.ini
      const stateFilePath = path.join(envRoot, 'qaqm', 'cache', info.stateFileName)
      const updatedVars = info.variables.map((v) => {
        if (v.name.toLowerCase() === variableName.toLowerCase()) {
          return { ...v, currentValue: newValue }
        }
        return v
      })

      const stateContent = [
        `namespace = ${info.namespace}`,
        '',
        '[Constants]',
        ...updatedVars.map((v) => `global persist $${v.name} = ${v.currentValue}`),
        ''
      ].join('\n')
      fs.writeFileSync(stateFilePath, stateContent, 'utf8')

      // 确保激活包含到 qaqm_persist_active.ini
      this.addIncludeToActiveFile(path.join(envRoot, 'qaqm', 'qaqm_persist_active.ini'), info.stateFileName)

      return { success: true }
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
  ): { success: boolean; resetCount: number; error?: string } {
    try {
      const info = this.getModPersistInfo(modFullPath, modsRoot, envRoot)
      if (!info.hasPersist) return { success: true, resetCount: 0 }

      const d3dxUserPath = path.join(envRoot, 'd3dx_user.ini')
      const { prefixLines, constantsMap, suffixLines } = fs.existsSync(d3dxUserPath)
        ? this.readD3dxUserConstants(d3dxUserPath)
        : { prefixLines: [], constantsMap: new Map(), suffixLines: [] }

      for (const v of info.variables) {
        const bridgeKey = `$\\${info.namespace}\\${v.name}`
        constantsMap.set(bridgeKey.toLowerCase(), { key: bridgeKey, value: v.defaultValue })
      }
      this.writeD3dxUserConstants(d3dxUserPath, constantsMap, prefixLines, suffixLines)

      // 写回 state 文件
      const stateFilePath = path.join(envRoot, 'qaqm', 'cache', info.stateFileName)
      const stateContent = [
        `namespace = ${info.namespace}`,
        '',
        '[Constants]',
        ...info.variables.map((v) => `global persist $${v.name} = ${v.defaultValue}`),
        ''
      ].join('\n')
      fs.writeFileSync(stateFilePath, stateContent, 'utf8')

      // 确保激活包含到 qaqm_persist_active.ini
      this.addIncludeToActiveFile(path.join(envRoot, 'qaqm', 'qaqm_persist_active.ini'), info.stateFileName)

      return { success: true, resetCount: info.variables.length }
    } catch (err: any) {
      return { success: false, resetCount: 0, error: err.message }
    }
  }

  /**
   * 扫描并同步当前所有启用 Mod 的持久化桥接配置（对齐 QAQMAN rebuildActivePersistBridgeIncludes 自愈体系）
   */
  public syncAllActiveMods(envRoot: string, modsRoot: string) {
    if (!envRoot || !modsRoot || !fs.existsSync(modsRoot)) return
    const activeIniPath = path.join(envRoot, 'qaqm', 'qaqm_persist_active.ini')
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
          if (info.hasPersist && info.stateFileName) {
            this.addIncludeToActiveFile(activeIniPath, info.stateFileName)
            for (const v of info.variables) {
              const bridgeKey = `$\\${info.namespace}\\${v.name}`
              if (!constantsMap.has(bridgeKey.toLowerCase())) {
                constantsMap.set(bridgeKey.toLowerCase(), { key: bridgeKey, value: v.currentValue })
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
