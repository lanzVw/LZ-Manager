import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { ModItem, ModDetailedInfo, AppearanceSection, BaseModInfo, BaseModStatus, BaseModDependent, BaseModDisableGuard, ShaderCacheState, ShaderCacheStats, D3dxCacheRules, SetShaderCacheResult, ClearShaderCacheResult, ToggleModResult, ToggleModSiblingRename } from './types'
import { PersistBridgeManager } from './persist-bridge'
import { normalizeCharacterName } from './characters-data'
import { readTextAuto, writeTextWithEncoding } from './text-encoding'
import { parseIniNamespace, parseShaderCacheValue, parseD3dxCacheRules, containsNamespaceReference, evaluateBaseModHealth } from './base-mod'
import { getHttpFetch } from './http-client'

/** 内容哈希，用于市场截图去重（同一张图可能既在根目录又出现在市场接口里） */
function hashBuffer(buf: Buffer): string {
  return crypto.createHash('sha1').update(buf).digest('hex')
}

/** 是否为 2 的幂（纹理贴图的典型尺寸：256 / 512 / 1024 / 2048 / 4096） */
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

/**
 * 只读文件头解析图片尺寸，不解码像素，开销很小
 *
 * 支持 PNG 与 JPEG；其它格式返回 null，调用方自行决定如何兜底。
 */
function readImageSize(filePath: string): { width: number; height: number } | null {
  try {
    const fd = fs.openSync(filePath, 'r')
    try {
      const head = Buffer.alloc(32 * 1024)
      const read = fs.readSync(fd, head, 0, head.length, 0)
      const buf = head.subarray(0, read)
      // PNG: 8 字节签名 + IHDR
      if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
      }
      // JPEG: 逐段找 SOFn
      if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
        let off = 2
        while (off + 9 < buf.length) {
          if (buf[off] !== 0xff) {
            off++
            continue
          }
          const marker = buf[off + 1]
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) }
          }
          const segLen = buf.readUInt16BE(off + 2)
          if (segLen < 2) break
          off += 2 + segLen
        }
      }
    } finally {
      fs.closeSync(fd)
    }
  } catch (_) {}
  return null
}

/**
 * 判断一张图片是否「其实是纹理贴图」，不该出现在预览图列表里
 *
 * 早期只按文件名黑名单（normalmap / lightmap / ...）过滤，实际文件常叫
 * Normal.jpg、Material.jpg、Light.jpg，一个都匹配不上，于是红紫灰的贴图
 * 被当成预览图铺满详情页。
 *
 * 黑名单无法穷举，因此补一条内容特征：纹理贴图几乎都是正方形、边长 ≥1024、
 * 且边长为 2 的幂。实测本机 45 张根目录图片，这条规则准确区分了
 * 4096×4096 / 1024×1024 的贴图与最大 2559px 的正常截图，
 * 而 775×775、1291×1291 这类正方形截图不会被误判（不是 2 的幂）。
 */
function looksLikeTexture(filePath: string, fileName: string): boolean {
  const lower = fileName.toLowerCase()
  if (
    lower.includes('normalmap') ||
    lower.includes('lightmap') ||
    lower.includes('font_atlas') ||
    lower.includes('shadowmap') ||
    lower.includes('materialmap')
  ) {
    return true
  }
  const dim = readImageSize(filePath)
  if (!dim) return false
  const { width, height } = dim
  return width === height && width >= 1024 && isPowerOfTwo(width)
}

/**
 * 市场图片统一存放的子目录名。
 * 与 gamebanana-service.ts 的 IMAGES_DIR_NAME 必须保持一致。
 */
const IMAGES_DIR_NAME = '.lz_images'

/** 旧版补全目录，仅用于懒迁移 */
const LEGACY_PREVIEW_DIR = '.lz_previews'

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
            let explicitBaseMod = false

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
                if (metaData?.baseMod === true) {
                  explicitBaseMod = true
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

            const baseInfo = this.detectBaseMod(fullModPath, explicitBaseMod)

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
              brokenReason,
              isBaseMod: Boolean(baseInfo),
              baseModNamespace: baseInfo?.namespace || undefined
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
  public async toggleMod(characterName: string, modRawName: string, enable: boolean): Promise<ToggleModResult> {
    // characterName 仅允许作为单级目录名使用（防路径穿越）
    const safeCharName = this.sanitizeSegment(characterName)
    const charPath = this.resolveInsideModRoot(path.join(this.modFolderPath, safeCharName))
    if (!charPath || !fs.existsSync(charPath)) {
      return { success: false, error: `角色目录不存在: ${charPath || characterName}` }
    }

    // modRawName 同样只允许单级目录名；sanitizeSegment 不拒绝 ".."，
    // 因此 src/dst 还必须再过一次 resolveInsideModRoot（否则 ".." 会逃出角色目录）
    const safeModName = this.sanitizeSegment(modRawName)
    if (!safeModName) {
      return { success: false, error: 'Mod 名称无效' }
    }

    const enabledFolderName = safeModName
    const disabledFolderName = `DISABLED_${safeModName}`

    const srcName = enable ? disabledFolderName : enabledFolderName
    const dstName = enable ? enabledFolderName : disabledFolderName

    const srcPath = this.resolveInsideModRoot(path.join(charPath, srcName))
    const dstPath = this.resolveInsideModRoot(path.join(charPath, dstName))
    if (!srcPath || !dstPath) {
      return { success: false, error: 'Mod 路径越界' }
    }

    if (!fs.existsSync(srcPath)) {
      // 检查是否已经在目标状态
      if (fs.existsSync(dstPath)) {
        if (enable && this.persistBridgeEnabled && this.persistBridgeManager && this.envRoot) {
          try {
            this.persistBridgeManager.ensureEnvironment(this.envRoot)
            this.persistBridgeManager.syncModPersistOnToggle(this.envRoot, this.modFolderPath, dstPath, true)
          } catch (_) {}
        }
        return { success: true, newFullPath: dstPath }
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
    const disabledSiblings: ToggleModSiblingRename[] = []
    if (enable && this.isOptionAExclusive) {
      try {
        const entries = fs.readdirSync(charPath, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const fName = entry.name
          if (!fName.startsWith('DISABLED_') && fName !== enabledFolderName && fName !== disabledFolderName) {
            const oldPath = path.join(charPath, fName)
            const newPath = path.join(charPath, `DISABLED_${fName}`)
            // 基底 Mod 不能被单选互斥静默关掉：它会连坐所有依赖其 namespace 的角色 Mod
            if (this.detectBaseMod(oldPath)) {
              console.warn(`Skip disabling base mod ${fName}: other mods may depend on it`)
              continue
            }
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
              // 只有真正改名成功才回报给渲染层；跳过的分支不能把仍在启用的 Mod 标成停用
              disabledSiblings.push({ name: fName, oldFullPath: oldPath, newFullPath: newPath })
            } catch (muteErr) {
              console.warn(`Failed to disable conflicting mod ${fName}:`, muteErr)
            }
          }
        }
      } catch (exErr) {
        console.warn('Option A exclusivity scan error:', exErr)
      }
    }

    return {
      success: true,
      newFullPath: dstPath,
      disabledSiblings: disabledSiblings.length > 0 ? disabledSiblings : undefined
    }
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
   * 重命名 Mod 目录
   *
   * 名称即目录名（列表与详情都直接读文件夹名），所以「重命名」必然是改磁盘目录。
   * 首次重命名时把原目录名记进 mod.json 的 originalName，供「还原为作者原名」使用；
   * 后续再改不会覆盖它，否则还原点会一路漂移，永远回不到作者原名。
   *
   * DISABLED_ 前缀表示停用状态，重命名时必须原样保留，否则会意外启用 Mod。
   */
  public renameMod(
    modFullPath: string,
    newName: string
  ): { success: boolean; newPath?: string; error?: string } {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    if (!safeModDir || !fs.existsSync(safeModDir)) {
      return { success: false, error: 'Mod 目录不存在' }
    }

    const trimmed = (newName || '').trim()
    if (!trimmed) return { success: false, error: '名称不能为空' }
    // 目录名不能含路径分隔符与 Windows 非法字符，否则 rename 会失败或跳出角色目录
    if (/[\\/:*?"<>|]/.test(trimmed)) {
      return { success: false, error: '名称不能包含 \\ / : * ? " < > |' }
    }
    if (trimmed === '.' || trimmed === '..') {
      return { success: false, error: '名称无效' }
    }
    // 与启用状态前缀冲突会造成 toggle 误判，直接禁止
    if (/^DISABLED_/i.test(trimmed)) {
      return { success: false, error: '名称不能以 DISABLED_ 开头' }
    }
    if (trimmed.length > 120) {
      return { success: false, error: '名称过长（最多 120 个字符）' }
    }

    const parentDir = path.dirname(safeModDir)
    const currentFolderName = path.basename(safeModDir)
    const wasDisabled = currentFolderName.startsWith('DISABLED_')
    const currentRawName = wasDisabled ? currentFolderName.substring('DISABLED_'.length) : currentFolderName

    if (trimmed === currentRawName) {
      return { success: true, newPath: safeModDir }
    }

    const targetFolderName = wasDisabled ? `DISABLED_${trimmed}` : trimmed
    const targetPath = path.join(parentDir, targetFolderName)
    if (fs.existsSync(targetPath)) {
      return { success: false, error: `已存在同名 Mod: ${trimmed}` }
    }

    // 先记录原名再改名：改名成功但写元数据失败会留下「无法还原」的状态，
    // 反过来（先写后改名失败）只是多一条无害的 originalName
    try {
      const metaPath = path.join(safeModDir, 'mod.json')
      let meta: any = {}
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) || {}
        } catch (_) {
          meta = {}
        }
      }
      if (!meta.originalName) {
        meta.originalName = currentRawName
      }
      // 用户主动改名后，name 跟随目录名，避免详情页标题与目录名不一致
      meta.name = trimmed
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')
    } catch (err: any) {
      return { success: false, error: `写入元数据失败: ${err.message}` }
    }

    try {
      fs.renameSync(safeModDir, targetPath)
    } catch (renameErr: any) {
      return { success: false, error: `重命名失败 (目录可能被游戏或其他程序占用): ${renameErr.message}` }
    }

    return { success: true, newPath: targetPath }
  }

  /**
   * 读取记录的作者原名（未重命名过则返回空串）
   */
  public readOriginalName(modFullPath: string): string {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    if (!safeModDir) return ''
    try {
      const metaPath = path.join(safeModDir, 'mod.json')
      if (!fs.existsSync(metaPath)) return ''
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      return typeof meta?.originalName === 'string' ? meta.originalName : ''
    } catch (_) {
      return ''
    }
  }

  /**
   * 还原为作者原名（取 mod.json 的 originalName）
   */
  public restoreOriginalModName(modFullPath: string): { success: boolean; newPath?: string; restoredName?: string; error?: string } {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    if (!safeModDir || !fs.existsSync(safeModDir)) {
      return { success: false, error: 'Mod 目录不存在' }
    }
    let originalName = ''
    try {
      const metaPath = path.join(safeModDir, 'mod.json')
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        originalName = typeof meta?.originalName === 'string' ? meta.originalName : ''
      }
    } catch (_) {}
    if (!originalName) {
      return { success: false, error: '没有记录作者原名（该 Mod 从未被重命名）' }
    }
    const res = this.renameMod(safeModDir, originalName)
    if (!res.success) return { success: false, error: res.error }
    return { success: true, newPath: res.newPath, restoredName: originalName }
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
            const abs = path.join(folderPath, f.name)
            if (!looksLikeTexture(abs, f.name)) {
              previewImages.push(abs)
            }
          }
        }
      }

      // 市场图片在 .lz_images/ 子目录，必须一并纳入候选，
      // 否则封面指针指向子目录时这里找不到，列表卡片会显示「无预览图」
      const imgDir = path.join(folderPath, IMAGES_DIR_NAME)
      try {
        if (fs.existsSync(imgDir)) {
          for (const n of fs.readdirSync(imgDir)) {
            if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(n)) {
              previewImages.push(path.join(imgDir, n))
            }
          }
        }
      } catch (_) {}

      // 1) mod.json 的 coverImage 指针优先，保持与详情页封面一致
      try {
        const metaPath = path.join(folderPath, 'mod.json')
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
          if (typeof meta.coverImage === 'string' && meta.coverImage) {
            const wanted = path.join(folderPath, meta.coverImage.split('/').join(path.sep))
            const hit = previewImages.find((p) => path.resolve(p) === path.resolve(wanted))
            if (hit) coverPath = hit
          }
        }
      } catch (_) {}

      // 2) 没有显式指定时按文件名优先级自动选
      if (!coverPath) {
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
            // .lz_images 由 getMarketPreviews 单独读取并追加到末尾，
            // 这里跳过以免重复，也避免点号目录排到前面抢走封面
            if (entry.name === IMAGES_DIR_NAME) continue
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
                if (!looksLikeTexture(full, entry.name)) {
                  images.push({ path: full, name: entry.name, isCover: false })
                }
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    scanDir(modFullPath)

    // 市场图片单独放在 .lz_images/，排在用户自己的图片之后，
    // 这样既能看到全部图片，又不会抢掉 Mod 自带的封面
    const marketPreviews = this.getMarketPreviews(modFullPath)
    for (const p of marketPreviews) {
      images.push({ path: p, name: path.basename(p), isCover: false })
    }

    // mod.json 要先读：封面指针 coverImage 存在里面
    let metadata: any = {}
    const metaPath = path.join(modFullPath, 'mod.json')
    if (fs.existsSync(metaPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      } catch (_) {}
    }

    // 基底 Mod 识别：显式标记已在 metadata 里，传进去避免二次读 mod.json
    const baseModInfo = this.detectBaseMod(modFullPath, metadata?.baseMod === true) || undefined

    // 1) 用户显式指定的封面优先（mod.json 的 coverImage 相对路径）
    if (typeof metadata.coverImage === 'string' && metadata.coverImage) {
      const wanted = path.join(modFullPath, metadata.coverImage.split('/').join(path.sep))
      const hit = images.find((img) => path.resolve(img.path) === path.resolve(wanted))
      // 图片可能已被用户删除，此时静默回落到自动选取
      if (hit) coverPath = hit.path
    }

    // 2) 没有显式指定时按文件名优先级自动选
    if (!coverPath) {
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
    }

    if (!coverPath && images.length > 0) {
      coverPath = images[0].path
    }

    for (const img of images) {
      img.isCover = img.path === coverPath
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
      persistInfo,
      baseModInfo
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
   * 把指定图片设为 Mod 封面
   *
   * 历史包袱：最早是复制成 preview.png（会永久覆盖原图），后来改成复制成 _cover.<ext>
   * （不覆盖了，但磁盘上多一份副本，且会作为一张"图片"混进列表）。
   *
   * 现在只记指针：mod.json 的 coverImage 存图片相对路径，不产生任何新文件。
   * 换封面 / 取消封面都只改一个字符串，图片资产本身永远不被改写或复制。
   */
  public setAsCoverImage(modFullPath: string, imagePath: string): boolean {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    const safeSource = this.resolveInsideModRoot(imagePath)
    if (!safeModDir || !safeSource || !fs.existsSync(safeModDir) || !fs.existsSync(safeSource)) return false
    try {
      const rel = path.relative(safeModDir, safeSource).split(path.sep).join('/')
      if (!this.saveModMetadata(safeModDir, { coverImage: rel })) return false
      // 清掉旧实现留下的 _cover.* 副本，避免它作为第 N 张图混在列表里
      this.removeLegacyCoverCopies(safeModDir)
      return true
    } catch (err) {
      console.error('Failed to set cover image:', err)
      return false
    }
  }

  /**
   * 移除自定义封面，恢复到按优先级自动选取
   */
  public clearCoverImage(modFullPath: string): boolean {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    if (!safeModDir || !fs.existsSync(safeModDir)) return false
    try {
      const metaPath = path.join(safeModDir, 'mod.json')
      if (fs.existsSync(metaPath)) {
        let current: any = {}
        try {
          current = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        } catch (_) {}
        if (current.coverImage) {
          delete current.coverImage
          fs.writeFileSync(metaPath, JSON.stringify(current, null, 2), 'utf8')
        }
      }
      this.removeLegacyCoverCopies(safeModDir)
      return true
    } catch (err) {
      console.error('Failed to clear cover image:', err)
      return false
    }
  }

  /** 清理旧实现遗留的 _cover.* 副本，返回是否删过 */
  private removeLegacyCoverCopies(modDir: string): boolean {
    let removed = false
    try {
      for (const f of fs.readdirSync(modDir)) {
        if (/^_cover\.(png|jpe?g|webp)$/i.test(f)) {
          fs.unlinkSync(path.join(modDir, f))
          removed = true
        }
      }
    } catch (_) {}
    return removed
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
   * 保存 Base64 裁剪图片为 Mod 封面
   *
   * 裁剪结果是一张「新生成的图」，不是对既有截图的改写，因此必须落到独立文件。
   * 早期实现写的是 preview.png，会覆盖市场首图——与「设为封面」同一个坑。
   * 现在统一写 _cover.png 并把指针记进 mod.json，原图始终保持原样。
   */
  public saveCoverFromDataUrl(modFullPath: string, dataUrl: string): { success: boolean; coverPath?: string; error?: string } {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    if (!safeModDir || !fs.existsSync(safeModDir)) {
      return { success: false, error: 'Mod 目录不存在' }
    }

    try {
      const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
      if (!matches || !matches[1].startsWith('image/')) {
        return { success: false, error: '无效的图片数据' }
      }
      const buffer = Buffer.from(matches[2], 'base64')

      const coverPath = path.join(safeModDir, '_cover.png')
      fs.writeFileSync(coverPath, buffer)
      this.saveModMetadata(safeModDir, { coverImage: '_cover.png' })

      return { success: true, coverPath }
    } catch (err: any) {
      console.error('Failed to save cover from dataUrl:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 检查是否存在封面备份（旧版裁剪封面遗留的 preview.png.lz_bak）
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
   * 把旧结构（图片散落在 Mod 根目录）迁移到统一的 .lz_images/
   *
   * 懒迁移：不在启动时批量动用户目录，只在用户主动触发「补全市场截图」时整理一次。
   * 只搬「明显是市场预览图」的文件（preview.* / _cover.* / 旧的 .lz_previews/*），
   * Mod 自带的其它图片一律不动，避免误伤。
   */
  private migrateLegacyImages(modDir: string): { moved: number; coverRel: string } {
    const imgDir = path.join(modDir, IMAGES_DIR_NAME)
    let moved = 0
    let coverRel = ''

    const moveIn = (srcPath: string, targetName: string): string | null => {
      try {
        fs.mkdirSync(imgDir, { recursive: true })
        const dest = path.join(imgDir, targetName)
        if (fs.existsSync(dest)) return `${IMAGES_DIR_NAME}/${targetName}`
        fs.renameSync(srcPath, dest)
        moved++
        return `${IMAGES_DIR_NAME}/${targetName}`
      } catch (_) {
        return null
      }
    }

    // 1. 旧版补全目录 .lz_previews/*
    const legacyDir = path.join(modDir, LEGACY_PREVIEW_DIR)
    if (fs.existsSync(legacyDir)) {
      try {
        for (const n of fs.readdirSync(legacyDir)) {
          if (!/\.(png|jpe?g|webp|gif|bmp)$/i.test(n)) continue
          moveIn(path.join(legacyDir, n), n)
        }
        fs.rmdirSync(legacyDir)
      } catch (_) {}
    }

    // 2. 根目录的 preview.* / _cover.*（旧安装与旧「设为封面」的产物）
    try {
      const rootFiles = fs.readdirSync(modDir)
      const legacyPatterns = [/^preview\.(png|jpe?g|webp)$/i, /^_cover\.(png|jpe?g|webp)$/i]
      let seq = 0
      for (const n of rootFiles) {
        if (!legacyPatterns.some((p) => p.test(n))) continue
        const isPreview = /^preview\./i.test(n)
        seq++
        const targetName = isPreview ? `legacy_${String(seq).padStart(2, '0')}${path.extname(n).toLowerCase()}` : n
        const rel = moveIn(path.join(modDir, n), targetName)
        // 原 preview.* 是旧封面，迁移后作为默认封面指针
        if (rel && isPreview && !coverRel) coverRel = rel
      }
    } catch (_) {}

    if (coverRel) {
      try {
        this.saveModMetadata(modDir, { coverImage: coverRel })
      } catch (_) {}
    }
    return { moved, coverRel }
  }

  /**
   * 保存市场截图到 Mod 目录下的 .lz_images/
   *
   * 为什么放子目录而不是直接铺在 Mod 根目录：
   * inspectModFolder / getModDetails 会把根目录里所有非贴图图片都当成预览图，
   * 直接铺开会让用户自定义的封面被一堆市场截图挤掉；独立子目录便于整体清理，
   * 也不会被 Mod 的 ini 误引用。
   *
   * 触发时会先做一次懒迁移，把旧结构（根目录 preview.png、旧 .lz_previews/）
   * 归位到 .lz_images/，之后所有图片只有一个来源。
   *
   * 去重按内容哈希：兼容市场接口返回重复 URL，也避免与已迁移的图重复。
   */
  public async saveMarketPreviews(
    modFullPath: string,
    imageUrls: string[]
  ): Promise<{ success: boolean; saved: number; failed: number; skipped: number; moved: number; dir?: string; error?: string }> {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    if (!safeModDir || !fs.existsSync(safeModDir)) {
      return { success: false, saved: 0, failed: 0, skipped: 0, moved: 0, error: 'Mod 目录不存在' }
    }
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return { success: false, saved: 0, failed: 0, skipped: 0, moved: 0, error: '没有可下载的截图' }
    }

    const imgDir = path.join(safeModDir, IMAGES_DIR_NAME)

    // 先整理旧结构，再以整理后的目录内容参与去重
    const { moved } = this.migrateLegacyImages(safeModDir)

    // 记下「当前封面是哪张图的内容」——重建后文件名会变，
    // 只有按内容哈希才能找回同一张图，否则用户选的封面会指向别的图。
    const coverRelBefore = this.readCoverPointer(safeModDir)
    let coverHashBefore = ''
    let coverBufBefore: Buffer | null = null
    if (coverRelBefore) {
      const coverAbs = path.join(safeModDir, coverRelBefore.split('/').join(path.sep))
      try {
        if (fs.existsSync(coverAbs)) {
          coverBufBefore = fs.readFileSync(coverAbs)
          coverHashBefore = hashBuffer(coverBufBefore)
        }
      } catch (_) {}
    }

    // 先全部下载到内存，再统一落盘：避免中途失败时把旧图清空后留下残缺状态
    const collected: { name: string; buf: Buffer }[] = []
    const seenHashes = new Set<string>()
    let failed = 0
    let skipped = 0
    for (const url of imageUrls) {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        failed++
        continue
      }
      try {
        const res = await getHttpFetch()(url)
        if (!res.ok) {
          failed++
          continue
        }
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 32) {
          failed++
          continue
        }
        const h = hashBuffer(buf)
        // 只对本轮下载结果去重（同一 URL 重复出现 / 市场返回重复图）
        if (seenHashes.has(h)) {
          skipped++
          continue
        }
        seenHashes.add(h)
        collected.push({ name: `market_${String(collected.length + 1).padStart(2, '0')}.png`, buf })
      } catch (_) {
        failed++
      }
    }

    if (collected.length === 0) {
      return {
        success: false,
        saved: 0,
        failed,
        skipped,
        moved,
        error: failed > 0 ? '截图下载失败' : '没有更多截图'
      }
    }

    // 安装阶段写的是 image_*.png，补全写的是 market_*.png，两套命名混在一起时
    // 按文件名排序会让缩略图顺序与市场顺序不一致（image_02 会排在 market_01 前面）。
    // 这里整批重建为 market_*，让「文件序号 == 市场顺序」始终成立。
    let coverRestoreName = ''
    try {
      fs.mkdirSync(imgDir, { recursive: true })
      for (const n of fs.readdirSync(imgDir)) {
        if (/^(market_|image_|legacy_)/i.test(n)) {
          try {
            fs.unlinkSync(path.join(imgDir, n))
          } catch (_) {}
        }
      }
      for (const item of collected) {
        fs.writeFileSync(path.join(imgDir, item.name), item.buf)
      }
      // 用户原来的封面若不在市场返回的图里（如旧版 preview.png、已下架的截图），
      // 整批重建会把它删掉。这里按内容补写一份，避免用户的封面凭空消失。
      if (coverBufBefore && coverHashBefore && !collected.some((c) => hashBuffer(c.buf) === coverHashBefore)) {
        coverRestoreName = `_cover${path.extname(coverRelBefore) || '.png'}`
        fs.writeFileSync(path.join(imgDir, coverRestoreName), coverBufBefore)
      }
    } catch (err: any) {
      return { success: false, saved: 0, failed, skipped, moved, error: `写入截图失败: ${err.message}` }
    }

    // 封面按内容找回：文件名已重排，只有哈希能确定是同一张图。
    // 找不到（用户原来选的那张已下架）就回落到第一张，避免指向不存在的文件。
    let restoredCover = ''
    if (coverHashBefore) {
      const hit = collected.find((c) => hashBuffer(c.buf) === coverHashBefore)
      if (hit) restoredCover = `${IMAGES_DIR_NAME}/${hit.name}`
    }
    if (!restoredCover && coverRestoreName) {
      restoredCover = `${IMAGES_DIR_NAME}/${coverRestoreName}`
    }
    if (!restoredCover && collected.length > 0) {
      restoredCover = `${IMAGES_DIR_NAME}/${collected[0].name}`
    }
    if (restoredCover) {
      this.saveModMetadata(safeModDir, { coverImage: restoredCover })
    } else {
      this.ensureCoverPointer(safeModDir)
    }

    return { success: true, saved: collected.length, failed, skipped, moved, dir: imgDir }
  }

  /**
   * 读取 mod.json 的 coverImage 指针（相对路径，未校验文件是否存在）
   */
  private readCoverPointer(modDir: string): string {
    try {
      const metaPath = path.join(modDir, 'mod.json')
      if (!fs.existsSync(metaPath)) return ''
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      return typeof meta?.coverImage === 'string' ? meta.coverImage : ''
    } catch (_) {
      return ''
    }
  }

  /**
   * 若 mod.json 没有有效的 coverImage，则按现有图片补一个
   *
   * 只在不覆盖用户已选封面的前提下写入，属于状态收敛而非改写用户选择。
   */
  private ensureCoverPointer(modDir: string): string {
    try {
      const metaPath = path.join(modDir, 'mod.json')
      let meta: any = {}
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) || {}
        } catch (_) {
          meta = {}
        }
      }
      // 已有指针且文件还在，尊重用户选择
      if (typeof meta.coverImage === 'string' && meta.coverImage) {
        const existing = path.join(modDir, meta.coverImage.split('/').join(path.sep))
        if (fs.existsSync(existing)) return meta.coverImage
      }
      const first = this.getMarketPreviews(modDir)[0]
      if (!first) return ''
      const rel = path.relative(modDir, first).split(path.sep).join('/')
      this.saveModMetadata(modDir, { coverImage: rel })
      return rel
    } catch (_) {
      return ''
    }
  }

  /**
   * 读取 Mod 目录下 .lz_images/ 里的全部图片路径（按文件名排序保证顺序稳定）
   */
  public getMarketPreviews(modFullPath: string): string[] {
    const safeModDir = this.resolveInsideModRoot(modFullPath)
    if (!safeModDir) return []
    const imgDir = path.join(safeModDir, IMAGES_DIR_NAME)
    try {
      if (!fs.existsSync(imgDir)) return []
      const names = fs
        .readdirSync(imgDir)
        .filter((n) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(n))
      // 不能直接用字母序：image_* 会整批排在 market_* 前面，
      // 于是缩略图顺序与市场顺序错位（image_02 跑到 market_01 之前）。
      // 这里按「前缀优先级 + 序号」排：封面置顶，market 其次，image 兼容旧数据，其余垫底。
      const rank = (n: string): number => {
        if (/^_cover\./i.test(n)) return 0
        if (/^market_/i.test(n)) return 1
        if (/^image_/i.test(n)) return 2
        if (/^legacy_/i.test(n)) return 3
        return 4
      }
      const seqOf = (n: string): number => {
        const m = n.match(/(\d+)/)
        return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
      }
      names.sort((a, b) => {
        const ra = rank(a)
        const rb = rank(b)
        if (ra !== rb) return ra - rb
        const sa = seqOf(a)
        const sb = seqOf(b)
        if (sa !== sb) return sa - sb
        return a.localeCompare(b)
      })
      return names.map((n) => path.join(imgDir, n))
    } catch (_) {
      return []
    }
  }

  // ---------------------------------------------------------------------------
  // 基底 Mod / 着色器缓存
  // ---------------------------------------------------------------------------

  /** 与 resolveInsideModRoot 同级的通用目录守卫（缓存目录在 Mods 根之外） */
  private resolveInsideDirectory(rootDir: string, targetPath: string): string | null {
    try {
      if (!rootDir) return null
      const root = path.resolve(rootDir)
      const resolved = path.resolve(String(targetPath || ''))
      const rel = path.relative(root, resolved)
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
      return resolved
    } catch (_) {
      return null
    }
  }

  /** 解析已存在路径的 realpath；路径不存在时解析父目录再拼回 basename */
  private realpathOrParent(targetPath: string): string | null {
    try {
      if (fs.existsSync(targetPath)) return fs.realpathSync.native(targetPath)
      const parent = path.dirname(targetPath)
      if (!fs.existsSync(parent)) return null
      return path.join(fs.realpathSync.native(parent), path.basename(targetPath))
    } catch (_) {
      return null
    }
  }

  /**
   * 解析 d3dx.ini 的 cache_directory 并做包含校验。
   * 缓存目录在 envRoot 之外时拒绝；同时拒绝会误删用户数据的目录名
   * （cache 是 Persist Bridge 的状态目录，Mods/ShaderFixes/Core/qaqm 同理）。
   */
  private resolveCacheDirectory(envRoot: string, cacheDirectory: string): string | null {
    try {
      if (!envRoot || !cacheDirectory) return null
      const rootReal = fs.existsSync(envRoot) ? fs.realpathSync.native(envRoot) : path.resolve(envRoot)
      const rawTarget = path.isAbsolute(cacheDirectory)
        ? cacheDirectory
        : path.resolve(rootReal, cacheDirectory)
      const targetReal = this.realpathOrParent(rawTarget)
      if (!targetReal) return null

      const rel = path.relative(rootReal, targetReal)
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null

      const base = path.basename(targetReal).toLowerCase()
      if (['mods', 'shaderfixes', 'core', 'qaqm', 'cache', 'resources'].includes(base)) return null

      // 目标不能是 Mod 根目录本身或它的祖先
      if (this.modFolderPath) {
        const modRoot = path.resolve(this.modFolderPath)
        const relToTarget = path.relative(targetReal, modRoot)
        if (!relToTarget || (!relToTarget.startsWith('..') && !path.isAbsolute(relToTarget))) return null
      }

      if (fs.existsSync(targetReal) && !fs.statSync(targetReal).isDirectory()) return null
      return targetReal
    } catch (_) {
      return null
    }
  }

  /** 读取 Mod 根目录下 ShaderCacheSettings.ini 的启用状态 */
  public getShaderCacheState(modDir: string): ShaderCacheState {
    const empty: ShaderCacheState = {
      installed: false,
      active: false,
      value: null,
      activePath: null,
      templatePath: null
    }
    const safeDir = this.resolveInsideModRoot(modDir)
    if (!safeDir) return empty

    const activePath = path.join(safeDir, 'ShaderCacheSettings.ini')
    const templatePath = path.join(safeDir, 'DISABLED', 'ShaderCacheSettings.ini')
    const hasActive = fs.existsSync(activePath)
    const hasTemplate = fs.existsSync(templatePath)

    let value: string | null = null
    if (hasActive) {
      try {
        value = parseShaderCacheValue(readTextAuto(activePath).content)
      } catch (_) {}
    }

    return {
      installed: hasActive,
      active: hasActive && value === '1',
      value,
      activePath: hasActive ? activePath : null,
      templatePath: hasTemplate ? templatePath : null
    }
  }

  /**
   * 从 Mod 根目录的 ini 中解析 namespace。
   *
   * 必须按文件大小从大到小读：RabbitFX 根目录同时有 RabbitFX.ini（60 KB，
   * namespace = RabbitFX）和 deltaTime.ini（485 B，namespace = time），
   * 按文件名排序会错误地选中 time，导致依赖扫描完全失效。
   */
  private readModNamespace(modDir: string): string {
    try {
      const candidates = fs
        .readdirSync(modDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.ini'))
        .map((entry) => {
          const fullPath = path.join(modDir, entry.name)
          let size = 0
          try {
            size = fs.statSync(fullPath).size
          } catch (_) {}
          return { fullPath, size }
        })
        .filter((item) => item.size > 0 && item.size <= 4 * 1024 * 1024)
        .sort((a, b) => b.size - a.size)
        .slice(0, 10)

      for (const item of candidates) {
        try {
          const namespace = parseIniNamespace(readTextAuto(item.fullPath).content)
          if (namespace) return namespace
        } catch (_) {}
      }
    } catch (_) {}
    return ''
  }

  /**
   * 识别基底 Mod。
   * 判据：存在 ShaderCacheSettings.ini（根目录或 DISABLED/）且能解析出 namespace；
   * mod.json 的 baseMod === true 可作为手动兜底。
   * explicitBaseMod 传入 false/true 表示调用方已读过 mod.json，避免重复读盘。
   */
  public detectBaseMod(modDir: string, explicitBaseMod?: boolean): BaseModInfo | null {
    const safeDir = this.resolveInsideModRoot(modDir)
    if (!safeDir || !fs.existsSync(safeDir)) return null

    const shaderCache = this.getShaderCacheState(safeDir)
    let explicit = explicitBaseMod === true
    if (explicitBaseMod === undefined) {
      try {
        const metaPath = path.join(safeDir, 'mod.json')
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
          explicit = meta?.baseMod === true
        }
      } catch (_) {}
    }

    if (!explicit && !shaderCache.activePath && !shaderCache.templatePath) return null

    const namespace = this.readModNamespace(safeDir)
    if (!explicit && !namespace) return null

    return { isBaseMod: true, namespace, explicit, shaderCache }
  }

  /**
   * 开关着色器缓存：在 Mod 根目录与 DISABLED/ 模板之间复制/移除文件。
   * 永远保留 DISABLED/ 模板；模板缺失时停用会把根目录文件移回去，避免删掉唯一副本。
   */
  public setShaderCacheEnabled(modFullPath: string, enabled: boolean): SetShaderCacheResult {
    const safeDir = this.resolveInsideModRoot(modFullPath)
    if (!safeDir || !fs.existsSync(safeDir)) {
      return { success: false, error: 'Mod 目录不存在' }
    }

    const activePath = path.join(safeDir, 'ShaderCacheSettings.ini')
    const templatePath = path.join(safeDir, 'DISABLED', 'ShaderCacheSettings.ini')
    const state = this.getShaderCacheState(safeDir)

    try {
      if (enabled) {
        if (state.installed && state.value === '1') {
          return { success: true, state }
        }
        if (!fs.existsSync(templatePath)) {
          return { success: false, error: '未找到 ShaderCacheSettings.ini 模板（DISABLED 目录）' }
        }
        // 覆盖写入：处理「根目录文件存在但 cache_shaders 不是 1」的残留状态
        fs.mkdirSync(path.dirname(activePath), { recursive: true })
        fs.copyFileSync(templatePath, activePath)
        return { success: true, state: this.getShaderCacheState(safeDir) }
      }

      if (!fs.existsSync(activePath)) {
        return { success: true, state }
      }
      if (fs.existsSync(templatePath)) {
        fs.unlinkSync(activePath)
      } else {
        fs.mkdirSync(path.dirname(templatePath), { recursive: true })
        fs.renameSync(activePath, templatePath)
      }
      return { success: true, state: this.getShaderCacheState(safeDir) }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) }
    }
  }

  /** 读取 envRoot/d3dx.ini 中与 Mod 扫描、着色器缓存相关的规则 */
  public getD3dxCacheRules(envRoot?: string): D3dxCacheRules {
    const root = String(envRoot || this.envRoot || '').trim()
    const d3dxIniPath = root ? path.join(root, 'd3dx.ini') : ''
    const defaults: D3dxCacheRules = {
      d3dxIniPath,
      exists: false,
      includeRecursiveMods: false,
      excludesDisabled: false,
      cacheDirectory: 'ShaderCache',
      cacheDirectoryConfigured: false,
      globalCacheShaders: null
    }
    if (!d3dxIniPath || !fs.existsSync(d3dxIniPath)) return defaults

    try {
      const parsed = parseD3dxCacheRules(readTextAuto(d3dxIniPath).content)
      return {
        d3dxIniPath,
        exists: true,
        includeRecursiveMods: parsed.includeRecursive.some((v) => /^mods[\\/]?$/i.test(v.trim())),
        excludesDisabled: parsed.excludeRecursive.some((v) => /^disabled/i.test(v.trim())),
        cacheDirectory: parsed.cacheDirectory?.trim() || 'ShaderCache',
        cacheDirectoryConfigured: Boolean(parsed.cacheDirectory?.trim()),
        globalCacheShaders: parsed.cacheShaders
      }
    } catch (_) {
      return { ...defaults, exists: true }
    }
  }

  /** 统计 ShaderCache 目录的文件数 / 体积 / 最近写入时间 */
  public getShaderCacheInfo(envRoot?: string): ShaderCacheStats {
    const root = String(envRoot || this.envRoot || '').trim()
    const rules = this.getD3dxCacheRules(root)
    const cacheDir = root ? this.resolveCacheDirectory(root, rules.cacheDirectory) : null
    const empty: ShaderCacheStats = {
      path: '',
      exists: false,
      fileCount: 0,
      totalBytes: 0,
      lastModified: 0
    }

    if (!cacheDir) {
      return {
        ...empty,
        error: root ? `缓存目录不在允许范围内: ${rules.cacheDirectory}` : '未配置游戏运行环境目录'
      }
    }
    if (!fs.existsSync(cacheDir)) return { ...empty, path: cacheDir }

    let fileCount = 0
    let totalBytes = 0
    let lastModified = 0
    const stack: string[] = [cacheDir]

    while (stack.length > 0) {
      const dir = stack.pop()!
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch (_) {
        continue
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
          stack.push(fullPath)
          continue
        }
        if (!entry.isFile()) continue
        try {
          const stat = fs.statSync(fullPath)
          fileCount++
          totalBytes += stat.size
          if (stat.mtimeMs > lastModified) lastModified = stat.mtimeMs
        } catch (_) {}
      }
    }

    return { path: cacheDir, exists: true, fileCount, totalBytes, lastModified }
  }

  /** 清空 ShaderCache 目录内容（保留目录本身） */
  public clearShaderCache(envRoot?: string): ClearShaderCacheResult {
    const root = String(envRoot || this.envRoot || '').trim()
    const rules = this.getD3dxCacheRules(root)
    const cacheDir = root ? this.resolveCacheDirectory(root, rules.cacheDirectory) : null

    if (!cacheDir) {
      return {
        success: false,
        deletedCount: 0,
        failedCount: 0,
        errors: [],
        error: root ? '缓存目录不在允许范围内' : '未配置游戏运行环境目录'
      }
    }
    if (!fs.existsSync(cacheDir)) {
      return { success: true, deletedCount: 0, failedCount: 0, errors: [] }
    }

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(cacheDir, { withFileTypes: true })
    } catch (err: any) {
      return {
        success: false,
        deletedCount: 0,
        failedCount: 0,
        errors: [],
        error: err?.message || String(err)
      }
    }

    let deletedCount = 0
    let failedCount = 0
    const errors: string[] = []
    for (const entry of entries) {
      const fullPath = path.join(cacheDir, entry.name)
      try {
        fs.rmSync(fullPath, { recursive: true, force: true })
        deletedCount++
      } catch (err: any) {
        failedCount++
        if (errors.length < 5) errors.push(`${entry.name}: ${err?.message || err}`)
      }
    }

    return { success: failedCount === 0, deletedCount, failedCount, errors }
  }

  /** 有界收集 ini 文件；跳过隐藏目录、DISABLED* 子目录与符号链接 */
  private collectIniFilesBounded(
    rootDir: string,
    options: { maxFiles: number; maxDepth: number; maxFileBytes: number }
  ): { files: Array<{ fullPath: string; relativePath: string; size: number }>; truncated: boolean } {
    const files: Array<{ fullPath: string; relativePath: string; size: number }> = []
    let truncated = false
    const stack: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }]

    while (stack.length > 0) {
      if (files.length >= options.maxFiles) {
        truncated = true
        break
      }
      const { dir, depth } = stack.pop()!
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch (_) {
        continue
      }

      for (const entry of entries) {
        if (files.length >= options.maxFiles) {
          truncated = true
          break
        }
        if (entry.name.startsWith('.')) continue
        const fullPath = path.join(dir, entry.name)

        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
          if (entry.name.toLowerCase().startsWith('disabled')) continue
          if (depth + 1 > options.maxDepth) {
            truncated = true
            continue
          }
          stack.push({ dir: fullPath, depth: depth + 1 })
          continue
        }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.ini')) continue

        try {
          const size = fs.statSync(fullPath).size
          if (size > options.maxFileBytes) {
            truncated = true
            continue
          }
          files.push({ fullPath, relativePath: path.relative(rootDir, fullPath), size })
        } catch (_) {
          continue
        }
      }
    }

    return { files, truncated }
  }

  /**
   * 扫描整个 Mod 库，找出引用指定 namespace 的 Mod。
   * 依赖判定走 `containsNamespaceReference`，只认带路径分隔符的引用；
   * 读取前先用原始字节预过滤，避免为每个 ini 做完整解码。
   */
  public scanBaseModLibrary(
    namespace: string,
    baseModPath: string
  ): { dependents: BaseModDependent[]; duplicates: string[]; scannedMods: number; truncated: boolean } {
    const result = {
      dependents: [] as BaseModDependent[],
      duplicates: [] as string[],
      scannedMods: 0,
      truncated: false
    }
    const ns = String(namespace || '').trim()
    if (!ns || !this.modFolderPath || !fs.existsSync(this.modFolderPath)) return result

    const nsLower = ns.toLowerCase()
    const baseResolved = path.resolve(baseModPath)
    const MAX_TOTAL_FILES = 20000
    const MAX_TOTAL_BYTES = 256 * 1024 * 1024
    const MAX_FILES_PER_MOD = 500
    const MAX_FILE_BYTES = 8 * 1024 * 1024
    const MAX_DEPTH = 8
    let totalFiles = 0
    let totalBytes = 0

    try {
      const charDirs = fs.readdirSync(this.modFolderPath, { withFileTypes: true })
      outer: for (const charDirent of charDirs) {
        if (!charDirent.isDirectory()) continue
        const charName = charDirent.name
        if (charName.startsWith('.') || charName === 'System Volume Information') continue
        if (totalFiles >= MAX_TOTAL_FILES || totalBytes >= MAX_TOTAL_BYTES) {
          result.truncated = true
          break outer
        }

        const charPath = path.join(this.modFolderPath, charName)
        let modDirs: fs.Dirent[]
        try {
          modDirs = fs.readdirSync(charPath, { withFileTypes: true })
        } catch (_) {
          continue
        }

        for (const modDirent of modDirs) {
          if (!modDirent.isDirectory()) continue
          const folderName = modDirent.name
          if (folderName.startsWith('.')) continue
          if (totalFiles >= MAX_TOTAL_FILES || totalBytes >= MAX_TOTAL_BYTES) {
            result.truncated = true
            break outer
          }

          const modDir = path.join(charPath, folderName)
          if (path.resolve(modDir) === baseResolved) continue
          result.scannedMods++

          // 同 namespace 的另一份基底 Mod 视为重复安装，不再当依赖扫描
          const baseInfo = this.detectBaseMod(modDir)
          if (baseInfo?.namespace && baseInfo.namespace.toLowerCase() === nsLower) {
            result.duplicates.push(modDir)
            continue
          }

          const collected = this.collectIniFilesBounded(modDir, {
            maxFiles: MAX_FILES_PER_MOD,
            maxDepth: MAX_DEPTH,
            maxFileBytes: MAX_FILE_BYTES
          })
          if (collected.truncated) result.truncated = true

          const matchedFiles: string[] = []
          for (const file of collected.files) {
            if (totalFiles >= MAX_TOTAL_FILES || totalBytes >= MAX_TOTAL_BYTES) {
              result.truncated = true
              break
            }
            totalFiles++
            totalBytes += file.size

            let raw: Buffer
            try {
              raw = fs.readFileSync(file.fullPath)
            } catch (_) {
              continue
            }
            // ASCII 内容在 UTF-8 / GBK 下字节一致；UTF-16LE 单独看一遍
            const latin = raw.toString('latin1').toLowerCase()
            const utf16 = raw.toString('utf16le').toLowerCase()
            if (!latin.includes(nsLower) && !utf16.includes(nsLower)) continue

            let content: string
            try {
              content = readTextAuto(file.fullPath).content
            } catch (_) {
              continue
            }
            if (!containsNamespaceReference(content, ns)) continue
            if (matchedFiles.length < 10) matchedFiles.push(file.relativePath)
          }

          if (matchedFiles.length > 0) {
            let rawName = folderName
            while (rawName.startsWith('DISABLED_')) {
              rawName = rawName.slice('DISABLED_'.length)
            }
            result.dependents.push({
              fullPath: modDir,
              characterName: charName,
              modName: rawName || folderName,
              folderName,
              enabled: !folderName.startsWith('DISABLED_'),
              matchedFiles
            })
          }
        }
      }
    } catch (err) {
      console.warn('[ModEngine] scanBaseModLibrary failed:', err)
    }

    return result
  }

  /** 停用基底 Mod 前的守卫：只在启用态路径存在时才需要确认 */
  public getBaseModDisableGuard(characterName: string, modRawName: string): BaseModDisableGuard | null {
    const safeCharName = this.sanitizeSegment(characterName)
    const safeModName = this.sanitizeSegment(modRawName)
    if (!safeCharName || !safeModName) return null

    const charPath = this.resolveInsideModRoot(path.join(this.modFolderPath, safeCharName))
    const modPath = charPath ? this.resolveInsideModRoot(path.join(charPath, safeModName)) : null
    if (!modPath || !fs.existsSync(modPath)) return null

    const info = this.detectBaseMod(modPath)
    if (!info) return null

    if (!info.namespace) {
      return {
        namespace: '',
        enabledDependents: [],
        scanTruncated: false,
        needsConfirm: true,
        reason: 'namespace-missing'
      }
    }

    const scan = this.scanBaseModLibrary(info.namespace, modPath)
    const enabledDependents = scan.dependents.filter((d) => d.enabled)
    return {
      namespace: info.namespace,
      enabledDependents,
      scanTruncated: scan.truncated,
      needsConfirm: enabledDependents.length > 0 || scan.truncated,
      reason: enabledDependents.length > 0 ? 'dependents' : scan.truncated ? 'scan-truncated' : undefined
    }
  }

  /** 基底 Mod 详情页所需的完整状态 */
  public getBaseModStatus(modFullPath: string, envRoot?: string): BaseModStatus | null {
    const info = this.detectBaseMod(modFullPath)
    const safeDir = this.resolveInsideModRoot(modFullPath)
    if (!info || !safeDir) return null

    const scan = info.namespace
      ? this.scanBaseModLibrary(info.namespace, safeDir)
      : { dependents: [] as BaseModDependent[], duplicates: [] as string[], scannedMods: 0, truncated: false }

    const enabled = !path.basename(safeDir).startsWith('DISABLED_')
    const cacheStats = this.getShaderCacheInfo(envRoot)
    const d3dx = this.getD3dxCacheRules(envRoot)
    const health = evaluateBaseModHealth({
      namespace: info.namespace,
      explicit: info.explicit,
      enabled,
      shaderCache: info.shaderCache,
      cacheStats,
      d3dx,
      dependents: scan.dependents,
      duplicates: scan.duplicates,
      scanTruncated: scan.truncated
    })

    return {
      modFullPath: safeDir,
      namespace: info.namespace,
      explicit: info.explicit,
      enabled,
      shaderCache: info.shaderCache,
      cacheStats,
      d3dx,
      dependents: scan.dependents,
      scanTruncated: scan.truncated,
      duplicates: scan.duplicates,
      health
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
