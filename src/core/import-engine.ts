import path from 'path'
import fs from 'fs'
import { getCharactersForGame, normalizeCharacterName } from './characters-data'
import { resolve7zaPath, resolveUnrarPath, verifyArchiveMagic, identifyModRoot, assertNoLinksInDir } from './gamebanana-service'
import { autoTranslateModConfig } from './mod-translator'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface ArchiveInspectionResult {
  valid: boolean
  error?: string
  format?: string
  suggestedCharName: string
  suggestedModName: string
  fileCount: number
  hasIni: boolean
  availableCharacters: { id: string; name: string }[]
}

export class ImportEngine {
  /**
   * 预检本地压缩包，自动识别格式并预测目标角色
   */
  public async inspectArchive(archivePath: string, gameId: string): Promise<ArchiveInspectionResult> {
    if (!fs.existsSync(archivePath)) {
      return {
        valid: false,
        error: '文件不存在',
        suggestedCharName: '',
        suggestedModName: '',
        fileCount: 0,
        hasIni: false,
        availableCharacters: []
      }
    }

    const chars = getCharactersForGame(gameId)
    const availableCharacters = chars.filter(c => c.id !== 'all').map(c => ({ id: c.id, name: c.name }))

    // 1. 校验魔数
    const magic = verifyArchiveMagic(archivePath)
    if (!magic.valid) {
      return {
        valid: false,
        error: magic.error || '不是合法的 ZIP/7Z/RAR 压缩包',
        suggestedCharName: '',
        suggestedModName: '',
        fileCount: 0,
        hasIni: false,
        availableCharacters
      }
    }

    // 2. 列出内部文件
    const entries: string[] = []
    let hasIni = false
    let unrarMissing = false

    try {
      if (magic.format === 'rar') {
        const unrar = resolveUnrarPath()
        if (unrar) {
          const res = await execFileAsync(unrar, ['vb', archivePath], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
          const lines = res.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
          entries.push(...lines)
        } else {
          unrarMissing = true
        }
      } else {
        const bin7z = resolve7zaPath()
        const res = await execFileAsync(bin7z, ['l', '-slt', archivePath], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
        const lines = res.stdout.split(/\r?\n/)
        for (const line of lines) {
          if (line.startsWith('Path = ')) {
            const p = line.substring('Path = '.length).trim()
            if (p) entries.push(p)
          }
        }
      }
    } catch (e: any) {
      console.warn('Archive pre-inspection error:', e.message)
    }

    for (const e of entries) {
      if (e.toLowerCase().endsWith('.ini')) {
        hasIni = true
        break
      }
    }

    // RAR 包但解压工具缺失：明确报错，而不是返回 valid:true + fileCount:0 误导用户
    if (unrarMissing) {
      return {
        valid: false,
        error: '未找到 UnRAR.exe 解压工具，无法解析 RAR 压缩包',
        suggestedCharName: '',
        suggestedModName: '',
        fileCount: 0,
        hasIni: false,
        availableCharacters
      }
    }

    // 3. 智能预测所属角色
    const baseName = path.basename(archivePath, path.extname(archivePath))
    const suggestedModName = this.sanitizeModName(baseName)
    const suggestedCharName = this.predictCharacter(baseName, entries, chars)

    return {
      valid: true,
      format: magic.format,
      suggestedCharName,
      suggestedModName,
      fileCount: entries.length,
      hasIni,
      availableCharacters
    }
  }

  /**
   * 解包并正式导入 Mod
   */
  public async importArchive(params: {
    archivePath: string
    targetCharName: string
    modName: string
    enableImmediately: boolean
    modFolderPath: string
  }): Promise<{ success: boolean; modPath?: string; error?: string }> {
    const { archivePath, targetCharName, modName, enableImmediately, modFolderPath } = params

    if (!fs.existsSync(archivePath)) {
      return { success: false, error: '压缩包不存在' }
    }
    if (!modFolderPath || !fs.existsSync(modFolderPath)) {
      return { success: false, error: `Mod 存放根目录不存在: ${modFolderPath}` }
    }

    // 路径安全消毒：targetCharName / modName 由渲染层传入，禁止包含路径分隔符、
    // 盘符、控制字符或前导相对路径片段（如 ..\..\），否则可逃出 Mod 根目录任意落盘
    const sanitizeSegment = (raw: string): string =>
      String(raw || '')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
        .replace(/^\.+/, '')
        .trim()

    const safeCharName = sanitizeSegment(targetCharName) || '其他'
    const safeModName = sanitizeSegment(modName)
    if (!safeModName) {
      return { success: false, error: 'Mod 名称无效' }
    }

    const canonicalChar = normalizeCharacterName(safeCharName)
    const charDir = path.join(modFolderPath, canonicalChar)
    if (!fs.existsSync(charDir)) {
      try {
        fs.mkdirSync(charDir, { recursive: true })
      } catch (err: any) {
        return { success: false, error: `创建角色目录失败: ${err.message}` }
      }
    }

    const finalFolderName = enableImmediately ? safeModName : `DISABLED_${safeModName}`
    let targetModDir = path.join(charDir, finalFolderName)

    // 双保险：最终目标必须仍在 Mod 根目录之内
    const modRootResolved = path.resolve(modFolderPath)
    if (!path.resolve(targetModDir).startsWith(modRootResolved + path.sep)) {
      return { success: false, error: '非法目标路径：超出 Mod 根目录范围' }
    }

    // 重名防覆盖检测
    if (fs.existsSync(targetModDir)) {
      let counter = 2
      while (fs.existsSync(path.join(charDir, `${finalFolderName}_${counter}`))) {
        counter++
      }
      targetModDir = path.join(charDir, `${finalFolderName}_${counter}`)
    }

    // 临时解压暂存目录
    const stagingDir = path.join(charDir, `.staging_${Date.now()}`)
    try {
      fs.mkdirSync(stagingDir, { recursive: true })

      const magic = verifyArchiveMagic(archivePath)
      if (magic.format === 'rar') {
        const unrar = resolveUnrarPath()
        if (!unrar) throw new Error('未找到 UnRAR.exe 解压工具')
        // UnRAR 文档要求：目标目录参数必须以路径分隔符结尾，否则会被当作文件掩码
        await execFileAsync(unrar, ['x', '-y', archivePath, stagingDir + path.sep], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
      } else {
        const bin7z = resolve7zaPath()
        await execFileAsync(bin7z, ['x', '-y', `-o${stagingDir}`, archivePath], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
      }

      // 校验解压产物非空（防止损坏压缩包或解压参数错误时产生"导入成功"的空目录）
      const stagingEntries = fs.existsSync(stagingDir) ? fs.readdirSync(stagingDir) : []
      if (stagingEntries.length === 0) {
        throw new Error('压缩包解压结果为空（压缩包可能损坏）')
      }

      // 文件系统级链接兜底检查（RAR 预检覆盖不到的 symlink/junction 在此拦截）
      assertNoLinksInDir(stagingDir)

      // 定位真实 Mod 根目录 (防止双层嵌套)
      const actualRoot = identifyModRoot(stagingDir)

      // 移动到目标目录
      fs.renameSync(actualRoot, targetModDir)

      // 清理暂存目录
      if (fs.existsSync(stagingDir)) {
        try { fs.rmSync(stagingDir, { recursive: true, force: true }) } catch (_) {}
      }

      // 自动分析并翻译配置说明与按键，写入 mod.json
      autoTranslateModConfig(targetModDir).catch(e => {
        console.warn('[ImportEngine] 自动翻译 Mod 配置说明失败:', e?.message)
      })

      return { success: true, modPath: targetModDir }
    } catch (err: any) {
      if (fs.existsSync(stagingDir)) {
        try { fs.rmSync(stagingDir, { recursive: true, force: true }) } catch (_) {}
      }
      return { success: false, error: `解压导入失败: ${err.message}` }
    }
  }

  private predictCharacter(baseName: string, entries: string[], chars: any[]): string {
    const haystacks = [baseName.toLowerCase(), ...entries.slice(0, 30).map(e => e.toLowerCase())]
    const combined = haystacks.join(' ')

    for (const c of chars) {
      if (c.id === 'all') continue
      // 中文名匹配
      if (c.name && combined.includes(c.name.toLowerCase())) {
        return c.name
      }
      // 英文名匹配 (如 "remielle", "evelyn", "jane")
      if (c.enName && c.enName.length > 2 && combined.includes(c.enName.toLowerCase())) {
        return c.name
      }
    }

    // 如果未命中，默认返回第一个角色或"功能"
    const fallback = chars.find(c => c.name === '功能') || chars.find(c => c.id !== 'all')
    return fallback ? fallback.name : '其他'
  }

  private sanitizeModName(name: string): string {
    return name
      .replace(/^DISABLED_/i, '')
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim() || 'ImportedMod'
  }
}
