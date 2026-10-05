import fs from 'fs'
import path from 'path'
import { ModItem, ModDetailedInfo } from './types'
import { PersistBridgeManager } from './persist-bridge'
import { normalizeCharacterName } from './characters-data'

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
   * 扫描 Mod 根目录，返回按角色分组的所有 Mod 数据
   */
  public scanMods(): Record<string, ModItem[]> {
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

        const charPath = path.join(this.modFolderPath, charName)
        const modsList: ModItem[] = []

        try {
          const modDirs = fs.readdirSync(charPath, { withFileTypes: true })
          for (const mDirent of modDirs) {
            if (!mDirent.isDirectory()) continue
            const folderName = mDirent.name
            if (folderName.startsWith('.')) continue

            const isEnabled = !folderName.startsWith('DISABLED_')
            const rawName = isEnabled ? folderName : folderName.substring('DISABLED_'.length)
            const fullModPath = path.join(charPath, folderName)

            // 查找预览封面
            const { coverPath, previewImages, hasIni } = this.inspectModFolder(fullModPath)
            let mtime = 0
            try {
              mtime = fs.statSync(fullModPath).mtimeMs
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
              mtime
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
    if (!this.modFolderPath || !fs.existsSync(this.modFolderPath)) {
      return result
    }

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
      'gbicon.png',
      'icon.png'
    ]

    // QAQM 系统全局资源池路径候选
    const qaqmCandidates = [
      path.resolve(process.cwd(), '../QAQManagerV4/resources/images'),
      path.resolve(__dirname, '../../../QAQManagerV4/resources/images'),
      path.resolve(__dirname, '../../QAQManagerV4/resources/images'),
      'F:/XXMI/QAQMAN/QAQManagerV4/resources/images',
      path.join(process.resourcesPath || '', 'images')
    ]
    let foundQaqmBase = ''
    for (const q of qaqmCandidates) {
      if (fs.existsSync(q)) {
        foundQaqmBase = q
        break
      }
    }

    try {
      const charDirs = fs.readdirSync(this.modFolderPath, { withFileTypes: true })
      for (const charDirent of charDirs) {
        if (!charDirent.isDirectory()) continue
        const charName = charDirent.name
        if (charName.startsWith('.') || charName === 'System Volume Information') continue

        const canonicalName = normalizeCharacterName(charName, gameId)
        const charPath = path.join(this.modFolderPath, charName)
        let avatarPath: string | null = null

        // 1. 优先从角色本目录下匹配缩略图文件
        for (const ext of exts) {
          const p = path.join(charPath, ext)
          if (fs.existsSync(p)) {
            avatarPath = p
            break
          }
        }

        // 2. 从 QAQM 系统资源池检索（同时尝试规范名与原始名）
        if (!avatarPath && foundQaqmBase && gameId) {
          const gameFolders = [gameId, gameId.toLowerCase()]
          if (gameId === 'zzz' || gameId === '19567') gameFolders.push('zzz')
          if (gameId === 'genshin' || gameId === '8552') gameFolders.push('genshin-impact', 'genshin')
          if (gameId === 'hsr' || gameId === '18366') gameFolders.push('honkai-star-rail')
          if (gameId === 'wuwa' || gameId === '20357') gameFolders.push('wuthering-waves', 'wuwa')
          if (gameId === 'endfield' || gameId === '21842') gameFolders.push('endfield')

          const candidateNames = Array.from(new Set([canonicalName, charName]))
          for (const gf of gameFolders) {
            for (const cn of candidateNames) {
              const qCharDir = path.join(foundQaqmBase, gf, cn)
              if (fs.existsSync(qCharDir)) {
                for (const ext of exts) {
                  const qp = path.join(qCharDir, ext)
                  if (fs.existsSync(qp)) {
                    avatarPath = qp
                    break
                  }
                }
              }
              if (avatarPath) break
            }
            if (avatarPath) break
          }
        }

        // 3. Fallback: 从角色所属的子 Mod 目录中提取封面
        if (!avatarPath) {
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
        }

        if (avatarPath) {
          result[canonicalName] = avatarPath
          result[charName] = avatarPath
        }
      }
    } catch (err) {
      console.error('Error scanning character avatars:', err)
    }

    // 4. 补充 QAQM 全局官方角色图鉴头像（覆盖尚未在本地建文件夹但已在官方图鉴的角色）
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
              const canonicalName = normalizeCharacterName(rawName, gameId)
              if (!result[canonicalName] || !result[rawName]) {
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
        }
      } catch (_) {}
    }

    return result
  }

  /**
   * 将指定图片设为角色缩略图/封面
   */
  public async setCharacterAvatar(characterName: string, sourceImagePath: string): Promise<{ success: boolean; avatarPath?: string; error?: string }> {
    const charPath = path.join(this.modFolderPath, characterName)
    if (!fs.existsSync(charPath)) {
      return { success: false, error: `角色目录不存在: ${charPath}` }
    }
    const targetFile = path.join(charPath, '_cover.png')
    try {
      fs.copyFileSync(sourceImagePath, targetFile)
      return { success: true, avatarPath: targetFile }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  /**
   * 从 Data URL 保存角色缩略图/封面
   */
  public async saveCharacterAvatarFromData(characterName: string, dataUrl: string): Promise<{ success: boolean; avatarPath?: string; error?: string }> {
    const charPath = path.join(this.modFolderPath, characterName)
    if (!fs.existsSync(charPath)) {
      return { success: false, error: `角色目录不存在: ${charPath}` }
    }
    const targetFile = path.join(charPath, '_cover.png')
    try {
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      fs.writeFileSync(targetFile, buffer)
      return { success: true, avatarPath: targetFile }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  /**
   * 切换单个 Mod 启用/停用状态
   * 如果开启角色单选互斥 (Option A) 且当前操作为启用，则自动将同角色的其他 Mod 全部置为停用
   */
  public async toggleMod(characterName: string, modRawName: string, enable: boolean): Promise<{ success: boolean; error?: string }> {
    const charPath = path.join(this.modFolderPath, characterName)
    if (!fs.existsSync(charPath)) {
      return { success: false, error: `角色目录不存在: ${charPath}` }
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

    // 正在停用 Mod：快照保留当前设定数值
    if (!enable && this.persistBridgeEnabled && this.persistBridgeManager && this.envRoot) {
      try {
        this.persistBridgeManager.syncModPersistOnToggle(this.envRoot, this.modFolderPath, srcPath, false)
        if (this.persistBridgeCacheSize > 0) {
          this.persistBridgeManager.pruneCache(this.envRoot, this.persistBridgeCacheSize)
        }
      } catch (pErr) {
        console.warn('Persist bridge snapshot error on disable:', pErr)
      }
    }

    // 如果是开启并且单选互斥，先停用其他已启用的 Mod
    if (enable && this.isOptionAExclusive) {
      try {
        const entries = fs.readdirSync(charPath, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const fName = entry.name
          if (!fName.startsWith('DISABLED_') && fName !== enabledFolderName && fName !== disabledFolderName) {
            // 将正在启用的同角色其他 Mod 更名为 DISABLED_
            const oldPath = path.join(charPath, fName)
            const newPath = path.join(charPath, `DISABLED_${fName}`)
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

    // 执行当前 Mod 重命名
    try {
      fs.renameSync(srcPath, dstPath)

      // 启用成功后，恢复 Persist Bridge 状态与 d3dx_user.ini
      if (enable && this.persistBridgeEnabled && this.persistBridgeManager && this.envRoot) {
        try {
          this.persistBridgeManager.ensureEnvironment(this.envRoot)
          this.persistBridgeManager.syncModPersistOnToggle(this.envRoot, this.modFolderPath, dstPath, true)
        } catch (pErr) {
          console.warn('Persist bridge restore error on enable:', pErr)
        }
      }

      return { success: true }
    } catch (renameErr: any) {
      return { success: false, error: `更名失败 (文件可能被游戏占用): ${renameErr.message}` }
    }
  }

  /**
   * 批量应用预设 (批量启用/停用指定 Mod)
   */
  public async applyPresetMods(targetMods: { characterName: string; modName: string; enabled: boolean }[]): Promise<{ success: boolean; applied: number }> {
    let count = 0
    for (const item of targetMods) {
      const res = await this.toggleMod(item.characterName, item.modName, item.enabled)
      if (res.success) count++
    }
    return { success: true, applied: count }
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
            const isTexture = lower.includes('normalmap') || lower.includes('lightmap') || lower.includes('font_atlas') || lower.includes('shadowmap')
            if (!isTexture) {
              const abs = path.join(folderPath, f.name)
              previewImages.push(abs)
              if (!coverPath) {
                if (lower.includes('preview') || lower.includes('cover') || lower.includes('thumb')) {
                  coverPath = abs
                }
              }
            }
          }
        }
      }
      if (!coverPath && previewImages.length > 0) {
        coverPath = previewImages[0]
      }
    } catch (_) {}

    return { coverPath, previewImages, hasIni }
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
                const isTexture = lower.includes('normalmap') || lower.includes('lightmap') || lower.includes('font_atlas') || lower.includes('shadowmap')
                if (!isTexture) {
                  const isCover = lower.includes('preview') || lower.includes('cover') || lower.includes('thumb')
                  images.push({ path: full, name: entry.name, isCover })
                  if (isCover && !coverPath) {
                    coverPath = full
                  }
                }
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    scanDir(modFullPath)

    if (!coverPath && images.length > 0) {
      coverPath = images[0].path
      images[0].isCover = true
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
      metadata: {
        author: metadata.author || '',
        version: metadata.version || 'Version 1.0',
        description: metadata.description || '',
        checkTime: metadata.checkTime || new Date(mtime || Date.now()).toLocaleDateString(),
        lastUpdated: metadata.lastUpdated || new Date(mtime || Date.now()).toLocaleDateString(),
        ...metadata
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
      const merged = { ...current, ...metadata, updatedAt: new Date().toISOString() }
      fs.writeFileSync(metaPath, JSON.stringify(merged, null, 2), 'utf8')
      return true
    } catch (err) {
      console.error('Failed to save mod.json:', err)
      return false
    }
  }

  /**
   * 设置指定图片为封面
   */
  public setAsCoverImage(modFullPath: string, imagePath: string): boolean {
    if (!fs.existsSync(modFullPath) || !fs.existsSync(imagePath)) return false
    try {
      const ext = path.extname(imagePath)
      const targetPath = path.join(modFullPath, `preview${ext}`)
      if (imagePath !== targetPath) {
        fs.copyFileSync(imagePath, targetPath)
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
    if (!fs.existsSync(imagePath)) return false
    try {
      fs.unlinkSync(imagePath)
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
    if (!fs.existsSync(iniPath)) return ''
    try {
      return fs.readFileSync(iniPath, 'utf8')
    } catch (_) {
      return ''
    }
  }

  /**
   * 写入 INI 文件文本
   */
  public saveIniFile(iniPath: string, content: string): boolean {
    try {
      fs.writeFileSync(iniPath, content, 'utf8')
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
    if (!fs.existsSync(modFullPath)) {
      return { success: false, error: 'Mod 目录不存在' }
    }

    try {
      const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
      const base64Data = matches ? matches[2] : dataUrl
      const buffer = Buffer.from(base64Data, 'base64')

      const previewPngPath = path.join(modFullPath, 'preview.png')
      const backupPath = path.join(modFullPath, 'preview.png.lz_bak')

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
    if (!fs.existsSync(modFullPath)) return false
    return fs.existsSync(path.join(modFullPath, 'preview.png.lz_bak'))
  }

  /**
   * 恢复上一个版本的封面备份
   */
  public rollbackCover(modFullPath: string): { success: boolean; error?: string } {
    if (!fs.existsSync(modFullPath)) return { success: false, error: 'Mod 目录不存在' }
    const backupPath = path.join(modFullPath, 'preview.png.lz_bak')
    const previewPngPath = path.join(modFullPath, 'preview.png')

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
}

