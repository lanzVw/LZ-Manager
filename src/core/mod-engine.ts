import fs from 'fs'
import path from 'path'
import { ModItem } from './types'

export class ModEngine {
  private modFolderPath: string
  private isOptionAExclusive: boolean

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

        if (modsList.length > 0) {
          result[charName] = modsList
        }
      }
    } catch (err) {
      console.error('Error scanning mod folder root:', err)
    }

    return result
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
        return { success: true }
      }
      return { success: false, error: `源目录不存在: ${srcPath}` }
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
      }
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
}
