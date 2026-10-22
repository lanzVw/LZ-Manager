import fs from 'fs'
import path from 'path'
import { ModItem, ModDetailedInfo, AppearanceSection } from './types'
import { PersistBridgeManager } from './persist-bridge'
import { normalizeCharacterName } from './characters-data'
import { readTextAuto, writeTextWithEncoding } from './text-encoding'

export class ModEngine {
  private modFolderPath: string
  private isOptionAExclusive: boolean
  private persistBridgeManager: PersistBridgeManager | null = null
  private envRoot: string = ''
  private persistBridgeEnabled: boolean = true
  private persistBridgeCacheSize: number = 12

  constructor(modFolderPath: string, isOptionAExclusive: boolean = true) {
    this.modFolderPath = modFolderPath
    this.isOptionAExclusive = isOptionAExclusive
  }

  public setModFolderPath(p: string) {
    this.modFolderPath = p
  }

  public setOptionAExclusive(val: boolean) {
    this.isOptionAExclusive = val
  }

  public setPersistBridge(manager: PersistBridgeManager, envRoot: string, enabled: boolean = true, cacheSize: number = 12) {
    this.persistBridgeManager = manager
    this.envRoot = envRoot
    this.persistBridgeEnabled = enabled
    this.persistBridgeCacheSize = cacheSize
  }

  public setPersistBridgeEnabled(enabled: boolean) {
    this.persistBridgeEnabled = enabled
  }

  public setPersistBridgeCacheSize(size: number) {
    this.persistBridgeCacheSize = size
  }

  public getPersistBridgeManager(): PersistBridgeManager | null {
    return this.persistBridgeManager
  }

  public getEnvRoot(): string {
    return this.envRoot
  }

  /**
   * 路径守卫：解析目标路径并断言其位于当前 Mod 根目录之内。
   * 返回规范化后的绝对路径；越界/等于根目录本身/未配置根目录时返回 null。
   * 所有接受外部路径参数的文件操作（读/写/删/复制）都必须先经过这里，
   * 否则被注入的渲染进程可借 IPC 读写删用户盘上任意文件。
   */
  private resolveInsideModRoot(targetPath: string): string | null {
    try {
      if (!this.modFolderPath) return null
      const root = path.resolve(this.modFolderPath)
      const resolved = path.resolve(String(targetPath || ''))
      const rel = path.relative(root, resolved)
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
      return resolved
    } catch (_) {
      return null
    }
  }

  /** 字段级消毒：禁止路径分隔符与控制字符，确保只作为单级目录/文件名使用 */
  private sanitizeSegment(raw: string): string {
    return String(raw || '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .trim()
  }

  /** 对外暴露的安全路径守卫包装 */
  public resolvePathInsideModRoot(targetPath: string): string | null {
    return this.resolveInsideModRoot(targetPath)
  }

  /** 对外暴露的单级字段名称消毒包装 */
  public sanitizePathSegment(raw: string): string {
    return this.sanitizeSegment(raw)
  }

  public getModFolderPath(): string {
    return this.modFolderPath
  }

  /**
   * 还原 Mod 目录下的 *.qaqm-persistbak 备份文件为初始 ini 版本
   */
  public restorePersistBakFiles(modDir: string): number {
    const safeDir = this.resolveInsideModRoot(modDir)
    if (!safeDir || !fs.existsSync(safeDir)) return 0
    return restorePersistBakFiles(safeDir)
  }

  /** 让出事件循环，避免大库扫描期间 IPC/窗口消息全部冻结 */
  private yieldToLoop(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve))
  }

  /**
   * 扫描 Mod 根目录，返回按角色分组的所有 Mod 数据
   * 注：异步但内部为分块同步 IO——每扫完一个角色目录让出一次事件循环，
   * 大库（数千 Mod）时主进程不再被单次扫描卡死
   */
  public async scanMods(): Promise<Record<string, ModItem[]>> {
    const result: Record<string, ModItem[]> = {}
    if (!this.modFolderPath || !fs.existsSync(this.modFolderPath)) {
      return result
    }

    try {
      const charDirs = fs.readdirSync(this.modFolderPath, { withFileTypes: true })
      for (const charDirent of charDirs) {
        if (!charDirent.isDirectory()) continue
        const charName = charDirent.name
        // 忽略隐藏或系统文件夹
        if (charName.startsWith('.') || charName === 'System Volume Information') continue
        await this.yieldToLoop()

        const charPath = path.join(this.modFolderPath, charName)
        const modsList: ModItem[] = []

        try {
          const modDirs = fs.readdirSync(charPath, { withFileTypes: true })
          for (const mDirent of modDirs) {
            if (!mDirent.isDirectory()) continue
            const folderName = mDirent.name
            if (folderName.startsWith('.')) continue

            const isEnabled = !folderName.startsWith('DISABLED_')
            // 循环剥离历史半失败可能留下的 DISABLED_DISABLED_ 双前缀
            let rawName = folderName
            while (rawName.startsWith('DISABLED_')) {
              rawName = rawName.substring('DISABLED_'.length)
            }
            if (!rawName) rawName = folderName
            const fullModPath = path.join(charPath, folderName)

            // 查找预览封面
            const { coverPath, previewImages, hasIni } = this.inspectModFolder(fullModPath)
            let mtime = 0
            try {
              mtime = fs.statSync(fullModPath).mtimeMs
            } catch (_) {}

            let appearanceSectionId = 'base'
            let modBroken = false
            let brokenReason: string | undefined = undefined

            try {
              const metaPath = path.join(fullModPath, 'mod.json')
              if (fs.existsSync(metaPath)) {
                const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
                if (metaData?.appearanceSectionId) {
                  appearanceSectionId = metaData.appearanceSectionId
                }
                if (metaData?.modBroken) {
                  modBroken = true
                  brokenReason = metaData.brokenReason || ''
                }
              }
            } catch (_) {}

            try {
              const tagsPath = path.join(fullModPath, 'tags.json')
              if (fs.existsSync(tagsPath)) {
                const tagsData = JSON.parse(fs.readFileSync(tagsPath, 'utf8'))
                if (tagsData?.qaqm?.appearanceSectionId) {
                  appearanceSectionId = tagsData.qaqm.appearanceSectionId
                }
              }
            } catch (_) {}

            modsList.push({
              id: `${charName}::${rawName}`,
              name: rawName,
              folderName,
              characterName: charName,
              enabled: isEnabled,
              coverPath,
              previewImages,
              fullPath: fullModPath,
              hasIni,
              mtime,
              appearanceSectionId,
              modBroken,
              brokenReason
            })
          }
        } catch (err) {
          console.error(`Error reading character dir: ${charPath}`, err)
        }

        // 始终记录角色条目（即使暂无 Mod），支持“显示全部角色/未安装角色”的筛选功能
        result[charName] = modsList
      }
    } catch (err) {
      console.error('Error scanning mod folder root:', err)
    }

    return result
  }

  /**
   * 获取所有角色的缩略图/头像映射表 (以角色缩略图为选项)
   */
  public getCharacterAvatars(gameId?: string): Record<string, string> {
    const result: Record<string, string> = {}

    const exts = [
      '_cover.webp',
      '_cover.png',
      '_cover.jpg',
      'cover.png',
      'cover.webp',
      'cover.jpg',
      'avatar.png',
      'avatar.webp',
      'avatar.jpg',
      'portrait.webp',
      'portrait.png',
      '_portrait.webp',
      '_portrait.png',
      'gbicon.png',
      'icon.png'
    ]

    // QAQM 系统全局资源池路径候选（不再硬编码开发机盘符路径）
    const qaqmCandidates = [
      path.resolve(process.cwd(), '../QAQManagerV4/resources/images'),
      path.resolve(__dirname, '../../../QAQManagerV4/resources/images'),
      path.resolve(__dirname, '../../QAQManagerV4/resources/images'),
      path.resolve(process.cwd(), 'resources/images'),
      path.resolve(process.cwd(), 'LZ Manager/resources/images'),
      path.resolve(__dirname, '../../resources/images'),
      path.resolve(__dirname, '../../../resources/images'),
      path.join(process.resourcesPath || '', 'images')
    ]
    let foundQaqmBase = ''
    for (const q of qaqmCandidates) {
      if (fs.existsSync(q)) {
        foundQaqmBase = q
        break
      }
    }

    // 1. 官方底图层：未安装游戏或未建本地目录时仍需保证图鉴展示完整头像
    if (foundQaqmBase && gameId) {
      try {
        const gameFolders = [gameId, gameId.toLowerCase()]
        if (gameId === 'zzz' || gameId === '19567') gameFolders.push('zzz')
        if (gameId === 'genshin' || gameId === '8552') gameFolders.push('genshin-impact', 'genshin')
        if (gameId === 'hsr' || gameId === '18366') gameFolders.push('honkai-star-rail')
        if (gameId === 'wuwa' || gameId === '20357') gameFolders.push('wuthering-waves', 'wuwa')
        if (gameId === 'endfield' || gameId === '21842') gameFolders.push('endfield')

        for (const gf of gameFolders) {
          const qGameDir = path.join(foundQaqmBase, gf)
          if (fs.existsSync(qGameDir)) {
            const qEntries = fs.readdirSync(qGameDir, { withFileTypes: true })
            for (const qe of qEntries) {
              if (!qe.isDirectory()) continue
              const rawName = qe.name
              if (rawName.startsWith('.') || rawName === 'System Volume Information') continue

              const canonicalName = normalizeCharacterName(rawName, gameId)
              if (result[canonicalName] && result[rawName]) continue

              const qCharDir = path.join(qGameDir, rawName)
              for (const ext of exts) {
                const qp = path.join(qCharDir, ext)
                if (fs.existsSync(qp)) {
                  if (!result[canonicalName]) result[canonicalName] = qp
                  if (!result[rawName]) result[rawName] = qp
                  break
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('[ModEngine] Error loading official character avatars:', err)
      }
    }

    // 2. 本地角色头像层：仅用于「设为角色头像」的用户自定义覆盖，以及官方图缺失时兜底
    // 为什么不再用 Mod 内封面抢占：角色分类头像代表的是「这个角色长什么样」，
    // 官方图才是权威来源；用某个 Mod 的预览图当角色头像会让同一角色随 Mod 启停而变脸。
    // 但用户在详情页点「设为角色头像」写入的 _cover.* 是显式指定，优先级仍高于官方图。
    if (this.modFolderPath && fs.existsSync(this.modFolderPath)) {
      try {
        const charDirs = fs.readdirSync(this.modFolderPath, { withFileTypes: true })
        for (const charDirent of charDirs) {
          if (!charDirent.isDirectory()) continue
          const charName = charDirent.name
          if (charName.startsWith('.') || charName === 'System Volume Information') continue

          const canonicalName = normalizeCharacterName(charName, gameId)
          const charPath = path.join(this.modFolderPath, charName)
          let avatarPath: string | null = null

          // 2.1 角色本目录下的缩略图即用户显式设置的角色头像，始终最高优先级
          for (const ext of exts) {
            const p = path.join(charPath, ext)
            if (fs.existsSync(p)) {
              avatarPath = p
              break
            }
          }

          if (avatarPath) {
            result[canonicalName] = avatarPath
            result[charName] = avatarPath
            continue
          }

          // 2.2 官方图已覆盖该角色时，不再退而使用某个 Mod 的封面
          if (result[canonicalName] || result[charName]) continue

          // 2.3 官方图缺失（如尚未收录的新角色）才用 Mod 封面兜底，避免头像空白
          try {
            const modDirs = fs.readdirSync(charPath, { withFileTypes: true })
            // 先尝试从启用的 mod 中获取
            for (const mDirent of modDirs) {
              if (!mDirent.isDirectory() || mDirent.name.startsWith('.')) continue
              if (!mDirent.name.startsWith('DISABLED_')) {
                const { coverPath } = this.inspectModFolder(path.join(charPath, mDirent.name))
                if (coverPath) {
                  avatarPath = coverPath
                  break
                }
              }
            }
            // 若无已启用 mod 封面，尝试从任意 mod 获取
            if (!avatarPath) {
              for (const mDirent of modDirs) {
                if (!mDirent.isDirectory() || mDirent.name.startsWith('.')) continue
                const { coverPath } = this.inspectModFolder(path.join(charPath, mDirent.name))
                if (coverPath) {
                  avatarPath = coverPath
                  break
                }
              }
            }
          } catch (_) {}

          if (avatarPath) {
            result[canonicalName] = avatarPath
            result[charName] = avatarPath
          }
        }
      } catch (err) {
        console.error('[ModEngine] Error scanning character avatars:', err)
      }
    }

    return result
  }

  /**
   * 切换单个 Mod 启用/停用状态
   * 如果开启角色单选互斥 (Option A) 且当前操作为启用，则自动将同角色的其他 Mod 全部置为停用
   */
  public async toggleMod(characterName: string, modRawName: string, enable: boolean): Promise<{ success: boolean; error?: string }> {
    // characterName 仅允许作为单级目录名使用（防路径穿越）
    const safeCharName = this.sanitizeSegment(characterName)
    const charPath = this.resolveInsideModRoot(path.join(this.modFolderPath, safeCharName))
    if (!charPath || !fs.existsSync(charPath)) {
      return { success: false, error: `角色目录不存在: ${charPath || characterName}` }
    }

    const enabledFolderName = modRawName
    const disabledFolderName = `DISABLED_${modRawName}`

    const srcName = enable ? disabledFolderName : enabledFolderName
    const dstName = enable ? enabledFolderName : disabledFolderName

    const srcPath = path.join(charPath, srcName)
    const dstPath = path.join(charPath, dstName)

    if (!fs.existsSync(srcPath)) {
      // 检查是否已经在目标状态
      if (fs.existsSync(dstPath)) {
        if (enable && this.persistBridgeEnabled && this.persistBridgeManager && this.envRoot) {
          try {
            this.persistBridgeManager.ensureEnvironment(this.envRoot)
            this.persistBridgeManager.syncModPersistOnToggle(this.envRoot, this.modFolderPath, dstPath, true)
          } catch (_) {}
        }
        return { success: true }
      }
      return { success: false, error: `源目录不存在: ${srcPath}` }
    }

    // 先执行当前 Mod 重命名：失败（如目录被游戏占用）时立即返回、不触碰同角色其他 Mod，
    // 避免"其他 Mod 已被禁用而目标未启用"的半失败状态（此前会导致该 Mod 永久无法切换）
    try {
      fs.renameSync(srcPath, dstPath)
    } catch (renameErr: any) {
      return { success: false, error: `更名失败 (文件可能被游戏占用): ${renameErr.message}` }
    }

    // 停用路径：目标已停用后快照保留当前设定数值
    if (!enable && this.persistBridgeEnabled && this.persistBridgeManager && this.envRoot) {
      try {
        this.persistBridgeManager.syncModPersistOnToggle(this.envRoot, this.modFolderPath, dstPath, false)
        if (this.persistBridgeCacheSize > 0) {
          this.persistBridgeManager.pruneCache(this.envRoot, this.persistBridgeCacheSize)
        }
      } catch (pErr) {
        console.warn('Persist bridge snapshot error on disable:', pErr)
      }
    }

    // 启用成功后，恢复 Persist Bridge 状态与 d3dx_user.ini
    if (enable && this.persistBridgeEnabled && this.persistBridgeManager && this.envRoot) {
      try {
        this.persistBridgeManager.ensureEnvironment(this.envRoot)
        this.persistBridgeManager.syncModPersistOnToggle(this.envRoot, this.modFolderPath, dstPath, true)
      } catch (pErr) {
        console.warn('Persist bridge restore error on enable:', pErr)
      }
    }

    // 启用且单选互斥：在目标已成功启用之后再停用其他 Mod（部分失败仅告警，不回滚已完成的启用）
    if (enable && this.isOptionAExclusive) {
      try {
        const entries = fs.readdirSync(charPath, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const fName = entry.name
          if (!fName.startsWith('DISABLED_') && fName !== enabledFolderName && fName !== disabledFolderName) {
            const oldPath = path.join(charPath, fName)
            const newPath = path.join(charPath, `DISABLED_${fName}`)
            // 目标 DISABLED_ 名已存在（历史残留）时跳过，避免 rename 失败或互相覆盖
            if (fs.existsSync(newPath)) {
              console.warn(`Skip disabling conflicting mod ${fName}: target already exists`)
              continue
            }
            if (this.persistBridgeEnabled && this.persistBridgeManager && this.envRoot) {
              try {
                this.persistBridgeManager.syncModPersistOnToggle(this.envRoot, this.modFolderPath, oldPath, false)
              } catch (_) {}
            }
            try {
              fs.renameSync(oldPath, newPath)
            } catch (muteErr) {
              console.warn(`Failed to disable conflicting mod ${fName}:`, muteErr)
            }
          }
        }
      } catch (exErr) {
        console.warn('Option A exclusivity scan error:', exErr)
      }
    }

    return { success: true }
  }

  /**
   * 批量应用预设 (批量启用/停用指定 Mod)
   */
  public async applyPresetMods(targetMods: { characterName: string; modName: string; enabled: boolean }[]): Promise<{ success: boolean; applied: number; enabled: number; disabled: number; failed: Array<{ characterName: string; modName: string; error?: string }> }> {
    let count = 0
    let enabledCount = 0
    let disabledCount = 0
    const failed: Array<{ characterName: string; modName: string; error?: string }> = []
    for (const item of targetMods) {
      const res = await this.toggleMod(item.characterName, item.modName, item.enabled)
      if (res.success) {
        count++
        if (item.enabled) {
          enabledCount++
        } else {
          disabledCount++
        }
      } else {
        failed.push({ characterName: item.characterName, modName: item.modName, error: res.error })
      }
    }
    // 部分失败必须如实上报，不能恒报 success（否则预设会被虚假地标记为已生效）
    return { success: failed.length === 0, applied: count, enabled: enabledCount, disabled: disabledCount, failed }
  }

  /**
   * 将指定 Mod 文件夹完整移动到另一个角色目录下
   */
  public async moveModToCharacter(
    modFullPath: string,
    targetCharacterName: string
  ): Promise<{ success: boolean; newPath?: string; error?: string }> {
    if (!modFullPath || !fs.existsSync(modFullPath)) {
      return { success: false, error: '原模组目录不存在' }
    }

    const cleanCharName = targetCharacterName.trim().replace(/[\\/:*?"<>|]/g, '')
    if (!cleanCharName) {
      return { success: false, error: '目标角色名称无效' }
    }

    if (!this.modFolderPath || !fs.existsSync(this.modFolderPath)) {
      return { success: false, error: '模组根目录未配置或不存在' }
    }

    const modFolderName = path.basename(modFullPath)
    const currentCharDir = path.dirname(modFullPath)
    const currentCharName = path.basename(currentCharDir)

    if (currentCharName.toLowerCase() === cleanCharName.toLowerCase()) {
      return { success: true, newPath: modFullPath }
    }

    const targetCharDir = path.join(this.modFolderPath, cleanCharName)
    try {
      if (!fs.existsSync(targetCharDir)) {
        fs.mkdirSync(targetCharDir, { recursive: true })
      }
    } catch (dirErr: any) {
      return { success: false, error: `创建目标角色目录失败: ${dirErr.message}` }
    }

    let targetModDir = path.join(targetCharDir, modFolderName)
    // 若目标目录已存在同名文件夹，生成避让名称
    if (fs.existsSync(targetModDir)) {
      let counter = 1
      let uniqueName = `${modFolderName}_${counter}`
      while (fs.existsSync(path.join(targetCharDir, uniqueName))) {
        counter++
        uniqueName = `${modFolderName}_${counter}`
      }
      targetModDir = path.join(targetCharDir, uniqueName)
    }

    try {
      fs.renameSync(modFullPath, targetModDir)

      // 同步 PersistBridge 状态
      if (this.persistBridgeEnabled && this.persistBridgeManager && this.envRoot) {
        try {
          this.persistBridgeManager.syncModPersistOnToggle(this.envRoot, this.modFolderPath, targetModDir, true)
        } catch (_) {}
      }

      return { success: true, newPath: targetModDir }
    } catch (moveErr: any) {
      return { success: false, error: `移动文件失败 (可能被游戏或其他进程占用): ${moveErr.message}` }
    }
  }

  private inspectModFolder(folderPath: string): { coverPath: string | null; previewImages: string[]; hasIni: boolean } {
    let coverPath: string | null = null
    const previewImages: string[] = []
    let hasIni = false

    try {
      const files = fs.readdirSync(folderPath, { withFileTypes: true })
      for (const f of files) {
        if (f.isFile()) {
          const lower = f.name.toLowerCase()
          if (lower.endsWith('.ini')) {
            hasIni = true
          }
          if (lower.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/)) {
            const isTexture = lower.includes('normalmap') || lower.includes('lightmap') || lower.includes('font_atlas') || lower.includes('shadowmap') || lower.includes('materialmap')
            if (!isTexture) {
              const abs = path.join(folderPath, f.name)
              previewImages.push(abs)
            }
          }
        }
      }

      // Priority ranking for cover selection:
      const priorityPatterns = [
        /^_cover\.(png|jpg|jpeg|webp)$/i,
        /^cover\.(png|jpg|jpeg|webp)$/i,
        /^preview\.(png|jpg|jpeg|webp)$/i,
        /^preview[-_]?0?1\.(png|jpg|jpeg|webp)$/i,
        /^thumb\.(png|jpg|jpeg|webp)$/i,
        /^preview[-_]/i,
        /cover/i,
        /preview/i,
        /thumb/i
      ]

      for (const pattern of priorityPatterns) {
        const found = previewImages.find((p) => pattern.test(path.basename(p)))
        if (found) {
          coverPath = found
          break
        }
      }

      if (!coverPath && previewImages.length > 0) {
        coverPath = previewImages[0]
      }
    } catch (_) {}

    return { coverPath, previewImages, hasIni }
  }

  private formatTimestamp(val?: string | number | Date | null): string {
    if (!val) return ''
    let d: Date
    if (val instanceof Date) {
      d = val
    } else if (typeof val === 'number') {
      d = val < 10000000000 ? new Date(val * 1000) : new Date(val)
    } else if (typeof val === 'string') {
      const trimmed = val.trim()
      if (!trimmed) return ''
      if (/^\d{10,13}$/.test(trimmed)) {
        const num = Number(trimmed)
        d = num < 10000000000 ? new Date(num * 1000) : new Date(num)
      } else {
        const normalized = trimmed.replace(/(\.\d{3})\d+Z?$/i, '$1Z')
        d = new Date(normalized)
        if (isNaN(d.getTime())) {
          d = new Date(trimmed)
        }
      }
    } else {
      return ''
    }

    if (isNaN(d.getTime())) return String(val)

    const pad = (n: number) => String(n).padStart(2, '0')
    const Y = d.getFullYear()
    const M = pad(d.getMonth() + 1)
    const D = pad(d.getDate())
    const h = pad(d.getHours())
    const m = pad(d.getMinutes())
    const s = pad(d.getSeconds())

    return `${Y}-${M}-${D} ${h}:${m}:${s}`
  }

  /**
   * 获取指定 Mod 完整详情（包括所有图片、ini文件列表、体积、自定义元数据）
   */
  public getModDetails(modFullPath: string) {
    if (!fs.existsSync(modFullPath)) return null

    const folderName = path.basename(modFullPath)
    const charDir = path.dirname(modFullPath)
    const characterName = path.basename(charDir)
    const isEnabled = !folderName.startsWith('DISABLED_')
    const rawName = isEnabled ? folderName : folderName.substring('DISABLED_'.length)

    let totalSize = 0
    let fileCount = 0
    const images: { path: string; name: string; isCover: boolean }[] = []
    const iniFiles: { name: string; fullPath: string; size: number }[] = []
    let coverPath: string | null = null

    const scanDir = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            // .lz_previews 由 getMarketPreviews 单独读取并追加到末尾，
            // 这里跳过以免重复，也避免点号目录排到前面抢走封面
            if (entry.name === '.lz_previews') continue
            scanDir(full)
          } else if (entry.isFile()) {
            fileCount++
            try {
              const stat = fs.statSync(full)
              totalSize += stat.size
              const lower = entry.name.toLowerCase()
              if (lower.endsWith('.ini')) {
                iniFiles.push({ name: entry.name, fullPath: full, size: stat.size })
              }
              if (lower.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/)) {
                const isTexture = lower.includes('normalmap') || lower.includes('lightmap') || lower.includes('font_atlas') || lower.includes('shadowmap') || lower.includes('materialmap')
                if (!isTexture) {
                  images.push({ path: full, name: entry.name, isCover: false })
                }
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    scanDir(modFullPath)

    // 市场补全的截图单独放在 .lz_previews/，排在用户自己的图片之后，
    // 这样既能看到全部截图，又不会抢掉 Mod 自带的封面
    const marketPreviews = this.getMarketPreviews(modFullPath)
    for (const p of marketPreviews) {
      images.push({ path: p, name: path.basename(p), isCover: false })
    }

    const priorityPatterns = [
      /^_cover\.(png|jpg|jpeg|webp)$/i,
      /^cover\.(png|jpg|jpeg|webp)$/i,
      /^preview\.(png|jpg|jpeg|webp)$/i,
      /^preview[-_]?0?1\.(png|jpg|jpeg|webp)$/i,
      /^thumb\.(png|jpg|jpeg|webp)$/i,
      /^preview[-_]/i,
      /cover/i,
      /preview/i,
      /thumb/i
    ]

    for (const pattern of priorityPatterns) {
      const found = images.find((img) => pattern.test(img.name))
      if (found) {
        coverPath = found.path
        break
      }
    }

    if (!coverPath && images.length > 0) {
      coverPath = images[0].path
    }

    for (const img of images) {
      img.isCover = img.path === coverPath
    }

    let metadata: any = {}
    const metaPath = path.join(modFullPath, 'mod.json')
    if (fs.existsSync(metaPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      } catch (_) {}
    }

    let mtime = 0
    let birthtime = 0
    try {
      const folderStat = fs.statSync(modFullPath)
      mtime = folderStat.mtimeMs
      birthtime = folderStat.birthtimeMs
    } catch (_) {}

    let persistInfo = undefined
    if (this.persistBridgeManager && this.envRoot) {
      try {
        persistInfo = this.persistBridgeManager.getModPersistInfo(modFullPath, this.modFolderPath, this.envRoot)
      } catch (pErr) {
        console.warn('Failed to retrieve persist info for mod:', pErr)
      }
    }

    let sourceUrl = metadata.sourceUrl || metadata.url || metadata.profileUrl || metadata.gamebananaUrl || ''
    let modId = metadata.modId || null

    if (!sourceUrl) {
      const gbMatch = folderName.match(/gamebanana[_-](\d+)/i)
      if (gbMatch) {
        modId = parseInt(gbMatch[1], 10)
        sourceUrl = `https://gamebanana.com/mods/${modId}`
      }
    }

    let appearanceSectionId = 'base'
    try {
      const tagsPath = path.join(modFullPath, 'tags.json')
      if (fs.existsSync(tagsPath)) {
        const tagsData = JSON.parse(fs.readFileSync(tagsPath, 'utf8'))
        if (tagsData?.qaqm?.appearanceSectionId) {
          appearanceSectionId = tagsData.qaqm.appearanceSectionId
        }
      }
      if (appearanceSectionId === 'base' && metadata?.appearanceSectionId) {
        appearanceSectionId = metadata.appearanceSectionId
      }
    } catch (_) {}

    const resolvedCheckTime = this.formatTimestamp(metadata.checkTime || metadata.dateChecked || metadata.createdAt || mtime || Date.now())
    const resolvedLastUpdated = this.formatTimestamp(mtime || metadata.lastUpdated || metadata.dateUpdated || metadata.updatedAt || Date.now())

    return {
      id: `${characterName}::${rawName}`,
      name: rawName,
      folderName,
      characterName,
      enabled: isEnabled,
      fullPath: modFullPath,
      images,
      coverPath,
      iniFiles,
      totalSize,
      fileCount,
      mtime,
      birthtime,
      appearanceSectionId,
      metadata: {
        ...metadata,
        author: metadata.author || '',
        version: metadata.version || 'Version 1.0',
        description: metadata.description || '',
        checkTime: resolvedCheckTime,
        lastUpdated: resolvedLastUpdated,
        dateChecked: resolvedCheckTime,
        dateUpdated: resolvedLastUpdated,
        sourceUrl: sourceUrl || '',
        url: sourceUrl || metadata.url || '',
        gamebananaUrl: sourceUrl || metadata.gamebananaUrl || '',
        modId: modId || undefined,
        source: metadata.source || (sourceUrl?.includes('gamebanana.com') ? 'GameBanana' : ''),
        appearanceSectionId
      },
      persistInfo
    }
  }

  /**
   * 保存 Mod 自定义元数据 (author, description 等)
   */
  public saveModMetadata(modFullPath: string, metadata: any): boolean {
    if (!fs.existsSync(modFullPath)) return false
    try {
      const metaPath = path.join(modFullPath, 'mod.json')
      let current: any = {}
      if (fs.existsSync(metaPath)) {
        try {
          current = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        } catch (_) {}
      }
      const finalSourceUrl = metadata.sourceUrl !== undefined ? metadata.sourceUrl : (current.sourceUrl || current.url || '')
      const merged = {
        ...current,
        ...metadata,
        sourceUrl: finalSourceUrl,
        url: finalSourceUrl,
        updatedAt: new Date().toISOString()
      }
      fs.writeFileSync(metaPath, JSON.stringify(merged, null, 2), 'utf8')

      // 若修改了外观分区，同步写回 tags.json 保持与 QAQ 100% 互通
      if (metadata.appearanceSectionId) {
        this.setModAppearanceSection(modFullPath, metadata.appearanceSectionId)
      }

      return true
    } catch (err) {
      console.error('Failed to save mod.json:', err)
      return false
    }
  }

  /**
   * 设置 Mod 的失效/损坏状态 (modBroken)，并同步记录原因与 tags.json
   */
  public setModBrokenStatus(modFullPath: string, isBroken: boolean, reason?: string): boolean {
    if (!fs.existsSync(modFullPath)) return false
    try {
      const metaPath = path.join(modFullPath, 'mod.json')
      let meta: any = {}
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch (_) {}
      }
      meta.modBroken = isBroken
      if (isBroken) {
        meta.brokenReason = reason || meta.brokenReason || ''
        meta.brokenDate = new Date().toISOString()
      } else {
        delete meta.brokenReason
        delete meta.brokenDate
      }
      meta.updatedAt = new Date().toISOString()
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')

      // 同步更新 tags.json 中的 broken 标签
      const tagsPath = path.join(modFullPath, 'tags.json')
      let tagsObj: any = {}
      if (fs.existsSync(tagsPath)) {
        try { tagsObj = JSON.parse(fs.readFileSync(tagsPath, 'utf8')) } catch (_) {}
      }
      let tagsList: any[] = Array.isArray(tagsObj.tags) ? tagsObj.tags : []
      if (isBroken) {
        if (!tagsList.some((t: any) => t.id === 'broken')) {
          tagsList.push({ id: 'broken', name: '已失效', color: '#ef4444' })
        }
      } else {
        tagsList = tagsList.filter((t: any) => t.id !== 'broken')
      }
      tagsObj.tags = tagsList
      fs.writeFileSync(tagsPath, JSON.stringify(tagsObj, null, 2), 'utf8')

      return true
    } catch (err) {
      console.error('Failed to set mod broken status:', err)
      return false
    }
  }

  private skinCatalogCache: Map<string, { catalog: any; catalogDir: string }> = new Map()

  /**
   * 从 catalog.json 加载指定角色的官方时装分区定义
   */
  public getOfficialAppearanceSections(
    characterName: string,
    gameId: string = 'zzz'
  ): AppearanceSection[] {
    if (!characterName) return []

    const scopeId = gameId || 'zzz'
    let cached = this.skinCatalogCache.get(scopeId)
    if (!cached) {
      const scopeDirs = [scopeId]
      if (scopeId === 'wuwa' || scopeId === '20357' || scopeId === 'wuthering-waves') {
        scopeDirs.push('wuwa', 'wuthering-waves')
      }
      if (scopeId === 'honkai-star-rail' || scopeId === 'hsr' || scopeId === '18366') {
        scopeDirs.push('honkai-star-rail', 'hsr')
      }
      if (scopeId === 'zzz' || scopeId === '19567') {
        scopeDirs.push('zzz')
      }
      if (scopeId === 'endfield' || scopeId === '21842') {
        scopeDirs.push('endfield')
      }

      const uniqueScopeDirs = Array.from(new Set(scopeDirs))
      const candidates: string[] = []
      for (const sd of uniqueScopeDirs) {
        candidates.push(
          path.resolve(process.cwd(), 'resources/games', sd, 'character-skins/catalog.json'),
          path.resolve(process.cwd(), 'LZ Manager/resources/games', sd, 'character-skins/catalog.json'),
          path.resolve(__dirname, '../../resources/games', sd, 'character-skins/catalog.json'),
          path.resolve(__dirname, '../../../resources/games', sd, 'character-skins/catalog.json'),
          path.resolve(__dirname, '../resources/games', sd, 'character-skins/catalog.json'),
          path.join(process.resourcesPath || '', 'games', sd, 'character-skins/catalog.json')
        )
      }

      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(cand, 'utf-8'))
            cached = { catalog: parsed, catalogDir: path.dirname(cand) }
            for (const sd of uniqueScopeDirs) {
              this.skinCatalogCache.set(sd, cached)
            }
            break
          } catch (err) {
            console.error(`[ModEngine] Failed to parse skin catalog from ${cand}:`, err)
          }
        }
      }
    }

    if (!cached || !cached.catalog || !Array.isArray(cached.catalog.characters)) {
      return []
    }

    const { catalog, catalogDir } = cached
    const normTarget = normalizeCharacterName(characterName, scopeId).toLowerCase()
    const rawTarget = characterName.trim().toLowerCase()

    const charFound = catalog.characters.find((c: any) => {
      const cNorm = normalizeCharacterName(c.nameZh || '', scopeId).toLowerCase()
      const cZh = String(c.nameZh || '').trim().toLowerCase()
      const cEn = String(c.nameEn || '').trim().toLowerCase()
      const aliases = (Array.isArray(c.aliases) ? c.aliases : []).map((a: string) => String(a || '').trim().toLowerCase())

      return (
        cNorm === normTarget ||
        cZh === rawTarget ||
        cZh === normTarget ||
        cEn === rawTarget ||
        aliases.includes(rawTarget) ||
        aliases.includes(normTarget)
      )
    })

    if (!charFound || !Array.isArray(charFound.skins)) {
      return []
    }

    return charFound.skins.map((s: any) => {
      let coverUrl: string | null = null
      if (s.image) {
        const fullImg = path.isAbsolute(s.image) ? s.image : path.join(catalogDir, s.image)
        if (fs.existsSync(fullImg)) {
          coverUrl = fullImg.replace(/\\/g, '/')
        }
      }

      return {
        id: s.id,
        sectionId: s.sectionId || `skin:${s.id}`,
        name: s.nameZh || s.nameEn || s.id,
        nameZh: s.nameZh || '',
        nameEn: s.nameEn || '',
        kind: 'skin' as const,
        official: true,
        coverUrl
      }
    })
  }

  /**
   * 获取指定角色的完整外观分区列表 (原角色 + 官方时装 + 自定义分区) 以及各分区的 Mod 数量统计
   */
  public async getCharacterAppearanceSections(
    characterName: string,
    gameId?: string,
    customSections: AppearanceSection[] = []
  ): Promise<AppearanceSection[]> {
    const charPath = path.join(this.modFolderPath, characterName)
    let mods: ModItem[] = []
    if (fs.existsSync(charPath)) {
      const all = await this.scanMods()
      mods = all[characterName] || []
    }

    // 1. 默认基础分区：原角色 (优先解析角色立绘或头像作为封面)
    let baseCoverUrl: string | null = null
    const portraitExts = [
      'portrait.webp',
      'portrait.png',
      '_portrait.webp',
      '_portrait.png',
      '_cover.webp',
      '_cover.png',
      '_cover.jpg',
      'cover.png',
      'cover.webp',
      'avatar.png'
    ]
    if (fs.existsSync(charPath)) {
      for (const ext of portraitExts) {
        const p = path.join(charPath, ext)
        if (fs.existsSync(p)) {
          baseCoverUrl = p.replace(/\\/g, '/')
          break
        }
      }
    }
    if (!baseCoverUrl) {
      const charAvatars = this.getCharacterAvatars(gameId || 'zzz')
      const canonicalName = normalizeCharacterName(characterName, gameId || 'zzz')
      const foundAvatar = charAvatars[characterName] || charAvatars[canonicalName]
      if (foundAvatar) {
        baseCoverUrl = foundAvatar.replace(/\\/g, '/')
      }
    }

    const baseSection: AppearanceSection = {
      id: 'base',
      sectionId: 'base',
      name: '原角色',
      nameZh: '原角色',
      nameEn: 'Original',
      kind: 'base',
      official: true,
      coverUrl: baseCoverUrl,
      totalCount: mods.filter(m => !m.appearanceSectionId || m.appearanceSectionId === 'base').length,
      enabledCount: mods.filter(m => (!m.appearanceSectionId || m.appearanceSectionId === 'base') && m.enabled).length
    }

    // 2. 官方时装分区 (从 catalog.json 或 initialized config 读取)
    const officialSkins = this.getOfficialAppearanceSections(characterName, gameId || 'zzz')
    const officialSecIds = new Set(officialSkins.map(s => s.sectionId))

    // 补全可能直接存在于 customSections 中的官方时装项（如从 configStore 传来的官方项）
    for (const c of customSections) {
      if ((c.kind === 'skin' || c.official) && !officialSecIds.has(c.sectionId)) {
        officialSkins.push(c)
        officialSecIds.add(c.sectionId)
      }
    }

    const officialMapped: AppearanceSection[] = officialSkins.map(s => {
      // 若已有 coverUrl 则优先保留，否则查已有配置
      const existingCfg = customSections.find(c => c.sectionId === s.sectionId)
      const finalCoverUrl = s.coverUrl || existingCfg?.coverUrl || null

      return {
        ...s,
        kind: 'skin' as const,
        official: true,
        coverUrl: finalCoverUrl,
        totalCount: mods.filter(m => m.appearanceSectionId === s.sectionId).length,
        enabledCount: mods.filter(m => m.appearanceSectionId === s.sectionId && m.enabled).length
      }
    })

    // 3. 用户自定义外观分区 (排除与官方 sectionId 重合的项)
    const customFiltered = customSections.filter(s => !officialSecIds.has(s.sectionId) && s.kind !== 'skin' && !s.official)
    const customMapped: AppearanceSection[] = customFiltered.map(s => ({
      ...s,
      kind: 'custom' as const,
      official: false,
      totalCount: mods.filter(m => m.appearanceSectionId === s.sectionId).length,
      enabledCount: mods.filter(m => m.appearanceSectionId === s.sectionId && m.enabled).length
    }))

    return [baseSection, ...officialMapped, ...customMapped]
  }

  /**
   * 变更/移动某个 Mod 的外观分区
   * 同时写回 mod.json 和 tags.json 确保 100% 兼容 QAQManager
   */
  public setModAppearanceSection(modFullPath: string, sectionId: string): boolean {
    if (!fs.existsSync(modFullPath)) return false
    try {
      // 1. 写回 mod.json
      const metaPath = path.join(modFullPath, 'mod.json')
      let meta: any = {}
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch (_) {}
      }
      meta.appearanceSectionId = sectionId
      meta.updatedAt = new Date().toISOString()
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')

      // 2. 写回 tags.json (QAQ 格式)
      const tagsPath = path.join(modFullPath, 'tags.json')
      let tagsObj: any = {}
      if (fs.existsSync(tagsPath)) {
        try { tagsObj = JSON.parse(fs.readFileSync(tagsPath, 'utf8')) } catch (_) {}
      }
      if (!tagsObj.qaqm) tagsObj.qaqm = {}
      tagsObj.qaqm.appearanceSectionId = sectionId
      tagsObj.qaqm.appearanceAssignedAt = new Date().toISOString()
      tagsObj.qaqm.classificationSource = 'user'
      fs.writeFileSync(tagsPath, JSON.stringify(tagsObj, null, 2), 'utf8')

      return true
    } catch (err) {
      console.error('Failed to set mod appearance section:', err)
      return false
    }
  }

  /**
   * 当删除某个自定义分区时，自动将该分区下的所有 Mod 优雅回退到 'base' (原角色)
   */
  public resetModsFromDeletedSection(characterName: string, sectionId: string) {
    const charPath = path.join(this.modFolderPath, characterName)
    if (!fs.existsSync(charPath)) return
    try {
      const dirs = fs.readdirSync(charPath, { withFileTypes: true })
      for (const d of dirs) {
        if (!d.isDirectory()) continue
        const full = path.join(charPath, d.name)
        const tagsPath = path.join(full, 'tags.json')
        const metaPath = path.join(full, 'mod.json')
        let matched = false
        if (fs.existsSync(tagsPath)) {
          try {
            const t = JSON.parse(fs.readFileSync(tagsPath, 'utf8'))
            if (t?.qaqm?.appearanceSectionId === sectionId) matched = true
          } catch (_) {}
        }
        if (!matched && fs.existsSync(metaPath)) {
          try {
            const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
            if (m?.appearanceSectionId === sectionId) matched = true
          } catch (_) {}
        }
        if (matched) {
          this.setModAppearanceSection(full, 'base')
        }
      }
    } catch (_) {}
  }

  /**
   * 设置指定图片为封面
   */
  public setAsCoverImage(modFullPath: string, imagePath: string): boolean {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    const safeSource = this.resolveInsideModRoot(imagePath)
    if (!safeModDir || !safeSource || !fs.existsSync(safeModDir) || !fs.existsSync(safeSource)) return false
    try {
      const ext = path.extname(safeSource)
      const targetPath = path.join(safeModDir, `preview${ext}`)
      if (safeSource !== targetPath) {
        fs.copyFileSync(safeSource, targetPath)
      }
      return true
    } catch (err) {
      console.error('Failed to set cover image:', err)
      return false
    }
  }

  /**
   * 删除图片
   */
  public deleteModImage(imagePath: string): boolean {
    const safePath = this.resolveInsideModRoot(imagePath)
    if (!safePath || !fs.existsSync(safePath)) return false
    try {
      fs.unlinkSync(safePath)
      return true
    } catch (err) {
      console.error('Failed to delete image:', err)
      return false
    }
  }

  /**
   * 读取 INI 文件文本
   */
  public readIniFile(iniPath: string): string {
    const safePath = this.resolveInsideModRoot(iniPath)
    // 限定只能读取 Mod 目录内的 .ini 文件（防任意文件读）
    if (!safePath || path.extname(safePath).toLowerCase() !== '.ini') return ''
    if (!fs.existsSync(safePath)) return ''
    try {
      // 自动探测编码（GBK/UTF-16LE 常见），避免中文注释解码成乱码
      return readTextAuto(safePath).content
    } catch (_) {
      return ''
    }
  }

  /**
   * 写入 INI 文件文本
   */
  public saveIniFile(iniPath: string, content: string): boolean {
    const safePath = this.resolveInsideModRoot(iniPath)
    // 限定只能写 Mod 目录内的 .ini 文件（防任意路径写），并限制内容大小
    if (!safePath || path.extname(safePath).toLowerCase() !== '.ini') return false
    if (typeof content !== 'string' || content.length > 10 * 1024 * 1024) return false
    try {
      // 保持原文件编码回写（GBK/UTF-16 文件被 utf8 覆盖会永久乱码）
      const { encoding } = fs.existsSync(safePath) ? readTextAuto(safePath) : { encoding: 'utf8' as const }
      writeTextWithEncoding(safePath, content, encoding)
      return true
    } catch (err) {
      console.error('Failed to save ini file:', err)
      return false
    }
  }

  /**
   * 保存 Base64 裁剪图片为 Mod 封面 (带自动版本备份)
   */
  public saveCoverFromDataUrl(modFullPath: string, dataUrl: string): { success: boolean; coverPath?: string; error?: string } {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    if (!safeModDir || !fs.existsSync(safeModDir)) {
      return { success: false, error: 'Mod 目录不存在' }
    }

    try {
      const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
      // 校验 dataUrl 确实是图片，防止写入损坏的 preview.png
      if (!matches || !matches[1].startsWith('image/')) {
        return { success: false, error: '无效的图片数据' }
      }
      const base64Data = matches[2]
      const buffer = Buffer.from(base64Data, 'base64')

      const previewPngPath = path.join(safeModDir, 'preview.png')
      const backupPath = path.join(safeModDir, 'preview.png.lz_bak')

      // 如果当前已存在封面图片，则创建安全回滚备份
      if (fs.existsSync(previewPngPath)) {
        try {
          fs.copyFileSync(previewPngPath, backupPath)
        } catch (_) {}
      }

      // 写入新封面
      fs.writeFileSync(previewPngPath, buffer)

      return { success: true, coverPath: previewPngPath }
    } catch (err: any) {
      console.error('Failed to save cover from dataUrl:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 检查是否存在封面备份
   */
  public hasCoverBackup(modFullPath: string): boolean {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    if (!safeModDir || !fs.existsSync(safeModDir)) return false
    return fs.existsSync(path.join(safeModDir, 'preview.png.lz_bak'))
  }

  /**
   * 恢复上一个版本的封面备份
   */
  public rollbackCover(modFullPath: string): { success: boolean; error?: string } {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    if (!safeModDir || !fs.existsSync(safeModDir)) return { success: false, error: 'Mod 目录不存在' }
    const backupPath = path.join(safeModDir, 'preview.png.lz_bak')
    const previewPngPath = path.join(safeModDir, 'preview.png')

    if (!fs.existsSync(backupPath)) {
      return { success: false, error: '未找到封面备份文件' }
    }

    try {
      fs.copyFileSync(backupPath, previewPngPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: `回滚失败: ${err.message}` }
    }
  }

  /**
   * 解决 Mod 冲突：保留指定 Mod，并禁用其他指定冲突 Mod
   */
  public async resolveConflicts(
    characterName: string,
    keepModName: string,
    conflictingModNames: string[]
  ): Promise<{ success: boolean; disabledCount: number }> {
    let disabledCount = 0
    // 确保保留项是启用的
    await this.toggleMod(characterName, keepModName, true)

    // 禁用冲突项
    for (const badMod of conflictingModNames) {
      if (badMod !== keepModName) {
        const res = await this.toggleMod(characterName, badMod, false)
        if (res.success) disabledCount++
      }
    }

    return { success: true, disabledCount }
  }

  /**
   * 保存市场补全的截图到 Mod 目录下的 .lz_previews/
   *
   * 为什么放子目录而不是直接铺在 Mod 根目录：
   * inspectModFolder / getModDetails 会把根目录里所有非贴图图片都当成预览图，
   * 直接铺开会让用户自定义的封面被一堆市场截图挤掉；独立子目录便于整体清理，
   * 也不会被 Mod 的 ini 误引用。
   */
  public async saveMarketPreviews(
    modFullPath: string,
    imageUrls: string[]
  ): Promise<{ success: boolean; saved: number; failed: number; dir?: string; error?: string }> {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    if (!safeModDir || !fs.existsSync(safeModDir)) {
      return { success: false, saved: 0, failed: 0, error: 'Mod 目录不存在' }
    }
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return { success: false, saved: 0, failed: 0, error: '没有可下载的截图' }
    }

    const previewDir = path.join(safeModDir, '.lz_previews')
    try {
      fs.mkdirSync(previewDir, { recursive: true })
    } catch (err: any) {
      return { success: false, saved: 0, failed: 0, error: `创建目录失败: ${err.message}` }
    }

    let saved = 0
    let failed = 0
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i]
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        failed++
        continue
      }
      try {
        const res = await fetch(url)
        if (!res.ok) {
          failed++
          continue
        }
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 32) {
          failed++
          continue
        }
        // 用序号命名保证稳定顺序，前缀区分来源便于将来识别
        const fileName = `market_${String(i + 1).padStart(2, '0')}.png`
        fs.writeFileSync(path.join(previewDir, fileName), buf)
        saved++
      } catch (_) {
        failed++
      }
    }

    return { success: saved > 0, saved, failed, dir: previewDir }
  }

  /**
   * 读取 Mod 目录下已补全的市场截图路径列表
   */
  public getMarketPreviews(modFullPath: string): string[] {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    if (!safeModDir) return []
    const previewDir = path.join(safeModDir, '.lz_previews')
    try {
      if (!fs.existsSync(previewDir)) return []
      return fs
        .readdirSync(previewDir)
        .filter((n) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(n))
        .sort()
        .map((n) => path.join(previewDir, n))
    } catch (_) {
      return []
    }
  }
}

/**
 * 递归还原指定目录下的 *.qaqm-persistbak 文件为原文件名
 */
export function restorePersistBakFiles(modDir: string): number {
  let count = 0
  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (_) {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.qaqm-persistbak')) {
        const originalPath = fullPath.slice(0, -'.qaqm-persistbak'.length)
        try {
          if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath)
          fs.renameSync(fullPath, originalPath)
          count++
        } catch (e: any) {
          console.warn(
            `[mod-engine] Failed to restore persist bak: ${fullPath} -> ${originalPath}: ${e?.message || e}`
          )
        }
      }
    }
  }
  walk(modDir)
  return count
}
