import fs from 'fs'
import path from 'path'

export interface ResourceCollision {
  hash: string
  type: 'texture' | 'shader' | 'index_buffer' | 'vertex_buffer' | 'override'
  sectionA: string
  sectionB: string
  modA: string
  modB: string
  fileA: string
  fileB: string
}

export interface ModConflictSummary {
  hasConflict: boolean
  modName: string
  characterName: string
  conflictingMods: string[]
  collisions: ResourceCollision[]
}

export interface CharacterConflictReport {
  characterName: string
  totalEnabledMods: number
  hasConflict: boolean
  conflictsByMod: Record<string, ModConflictSummary>
  allCollisions: ResourceCollision[]
}

interface ParsedHashItem {
  hash: string
  type: 'texture' | 'shader' | 'index_buffer' | 'vertex_buffer' | 'override'
  section: string
  iniFile: string
  modName: string
}

export class ConflictDetector {
  private modFolderPath: string

  constructor(modFolderPath: string) {
    this.modFolderPath = modFolderPath
  }

  public setModFolderPath(p: string) {
    this.modFolderPath = p
  }

  /**
   * 解析单个 INI 文件，提取所有 Hash 定义
   */
  public parseIniHashes(iniPath: string, modName: string): ParsedHashItem[] {
    const items: ParsedHashItem[] = []
    if (!fs.existsSync(iniPath)) return items

    try {
      const content = fs.readFileSync(iniPath, 'utf8')
      const lines = content.split(/\r?\n/)

      let currentSection = ''
      let isOverrideSection = false

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) {
          continue
        }

        // Section header: [TextureOverride...] or [ShaderOverride...]
        const secMatch = trimmed.match(/^\[([^\]]+)\]/)
        if (secMatch) {
          currentSection = secMatch[1].trim()
          const lower = currentSection.toLowerCase()
          isOverrideSection =
            lower.startsWith('textureoverride') ||
            lower.startsWith('shaderoverride') ||
            lower.startsWith('resource') ||
            lower.startsWith('commandlist')
          continue
        }

        // Hash extraction
        const kvMatch = trimmed.match(/^([a-zA-Z0-9_\-]+)\s*=\s*(.+)$/)
        if (kvMatch) {
          const key = kvMatch[1].toLowerCase()
          const rawVal = kvMatch[2].split(/[;#]/)[0].trim() // 去除注释

          // 1. hash = 12345678
          if (key === 'hash' && /^[0-9a-fA-F]{6,16}$/.test(rawVal)) {
            const hashVal = rawVal.toLowerCase()
            const type = currentSection.toLowerCase().startsWith('shaderoverride') ? 'shader' : 'texture'
            items.push({
              hash: hashVal,
              type,
              section: currentSection || 'global',
              iniFile: path.basename(iniPath),
              modName
            })
          }
          // 2. ib = 12345678 (Index Buffer)
          else if (key === 'ib' && /^[0-9a-fA-F]{6,16}$/.test(rawVal)) {
            items.push({
              hash: `ib:${rawVal.toLowerCase()}`,
              type: 'index_buffer',
              section: currentSection || 'global',
              iniFile: path.basename(iniPath),
              modName
            })
          }
          // 3. vb = 12345678 (Vertex Buffer)
          else if (key === 'vb' && /^[0-9a-fA-F]{6,16}$/.test(rawVal)) {
            items.push({
              hash: `vb:${rawVal.toLowerCase()}`,
              type: 'vertex_buffer',
              section: currentSection || 'global',
              iniFile: path.basename(iniPath),
              modName
            })
          }
        }
      }
    } catch (err) {
      console.warn(`Error parsing INI ${iniPath}:`, err)
    }

    return items
  }

  /**
   * 递归查找目录下的所有 .ini 文件
   */
  private findIniFiles(dir: string): string[] {
    const list: string[] = []
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          list.push(...this.findIniFiles(full))
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.ini')) {
          list.push(full)
        }
      }
    } catch (_) {}
    return list
  }

  /**
   * 针对指定角色目录下的所有已启用 Mod 进行冲突检测
   */
  public detectCharacterConflicts(characterName: string): CharacterConflictReport {
    const charPath = path.join(this.modFolderPath, characterName)
    const report: CharacterConflictReport = {
      characterName,
      totalEnabledMods: 0,
      hasConflict: false,
      conflictsByMod: {},
      allCollisions: []
    }

    if (!fs.existsSync(charPath)) {
      return report
    }

    // 收集所有已启用的 Mod 目录
    const enabledModNames: string[] = []
    try {
      const entries = fs.readdirSync(charPath, { withFileTypes: true })
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('DISABLED_') && !e.name.startsWith('.')) {
          enabledModNames.push(e.name)
        }
      }
    } catch (_) {
      return report
    }

    report.totalEnabledMods = enabledModNames.length
    if (enabledModNames.length <= 1) {
      // 只有一个启用 Mod，天然不存在同角色冲突
      return report
    }

    // 提取每个启用 Mod 的 Hash
    const modHashes: Record<string, ParsedHashItem[]> = {}
    const hashIndex: Map<string, ParsedHashItem[]> = new Map()

    for (const modName of enabledModNames) {
      const modDir = path.join(charPath, modName)
      const iniFiles = this.findIniFiles(modDir)
      const allItems: ParsedHashItem[] = []

      for (const iniPath of iniFiles) {
        const items = this.parseIniHashes(iniPath, modName)
        allItems.push(...items)
      }

      modHashes[modName] = allItems

      for (const item of allItems) {
        const existing = hashIndex.get(item.hash) || []
        existing.push(item)
        hashIndex.set(item.hash, existing)
      }
    }

    // 找出所有存在跨 Mod 重叠的 Hash
    const collisions: ResourceCollision[] = []
    const conflictedModsSet = new Set<string>()

    for (const [hash, items] of hashIndex.entries()) {
      // 聚合按 Mod 分组
      const modsMap = new Map<string, ParsedHashItem>()
      for (const it of items) {
        if (!modsMap.has(it.modName)) {
          modsMap.set(it.modName, it)
        }
      }

      if (modsMap.size > 1) {
        const modEntries = Array.from(modsMap.entries())
        for (let i = 0; i < modEntries.length; i++) {
          for (let j = i + 1; j < modEntries.length; j++) {
            const [modA, itemA] = modEntries[i]
            const [modB, itemB] = modEntries[j]
            conflictedModsSet.add(modA)
            conflictedModsSet.add(modB)

            collisions.push({
              hash,
              type: itemA.type,
              sectionA: itemA.section,
              sectionB: itemB.section,
              modA,
              modB,
              fileA: itemA.iniFile,
              fileB: itemB.iniFile
            })
          }
        }
      }
    }

    // 构建按 Mod 分组的摘要
    const conflictsByMod: Record<string, ModConflictSummary> = {}
    for (const modName of enabledModNames) {
      const modCollisions = collisions.filter(c => c.modA === modName || c.modB === modName)
      const otherMods = Array.from(
        new Set(
          modCollisions.map(c => (c.modA === modName ? c.modB : c.modA))
        )
      )

      conflictsByMod[modName] = {
        hasConflict: modCollisions.length > 0,
        modName,
        characterName,
        conflictingMods: otherMods,
        collisions: modCollisions
      }
    }

    report.hasConflict = collisions.length > 0
    report.allCollisions = collisions
    report.conflictsByMod = conflictsByMod

    return report
  }

  /**
   * 扫描全游戏所有角色的冲突报告
   */
  public detectAllConflicts(): Record<string, CharacterConflictReport> {
    const allReports: Record<string, CharacterConflictReport> = {}
    if (!this.modFolderPath || !fs.existsSync(this.modFolderPath)) {
      return allReports
    }

    try {
      const charDirs = fs.readdirSync(this.modFolderPath, { withFileTypes: true })
      for (const c of charDirs) {
        if (c.isDirectory() && !c.name.startsWith('.') && c.name !== 'System Volume Information') {
          const rep = this.detectCharacterConflicts(c.name)
          if (rep.totalEnabledMods > 0) {
            allReports[c.name] = rep
          }
        }
      }
    } catch (err) {
      console.error('Error scanning all conflicts:', err)
    }

    return allReports
  }
}
