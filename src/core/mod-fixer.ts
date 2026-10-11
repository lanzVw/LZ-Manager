import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import {
  WuwaRulesManifest,
  validateWuwaRulesManifest,
  readWuwaRulesFile,
  applyWuwaFixRulesToDirectory,
  WuwaFixDirectoryStats,
  cleanString
} from './wuwa-fix-engine'
import {
  createIniBackupStamp,
  copyIniBackupBesideFile,
  createIniBackupSnapshotForDirectory,
  summarizeIniBackupSnapshot,
  isPathInsideDirectory,
  normalizeComparablePath
} from './ini-backup'
import { resolve7zaPath, resolveUnrarPath } from './gamebanana-service'

const execFileAsync = promisify(execFile)

export const WUWA_FIX_GAME_ID = 'wuthering-waves'
export const WUWA_FIX_RULE_RELATIVE_PATH = path.join('fix', 'wuwa', 'rules.json')
export const WUWA_FIX_RULE_UPDATE_URLS = [
  'https://raw.githubusercontent.com/peterdua/QAQmod-Client/main/resources/fix/wuwa/rules.json',
  'https://cdn.jsdelivr.net/gh/peterdua/QAQmod-Client@main/resources/fix/wuwa/rules.json'
]
export const WUWA_FIX_RULE_MAX_BYTES = 512 * 1024
export const WUWA_FIX_AUTO_UPDATE_INTERVAL_MS = 30 * 60 * 1000
export const WUWA_INDEPENDENT_CONFIG_NAME = 'config.json'
export const WUWA_INDEPENDENT_CONFIG_VERSION = '3.5.1'
export const WUWA_INDEPENDENT_CONFIG_SHA256 =
  '134c957519223c7d55148e3c7465792f4b1b18aec74e1f9625a2baea9dbb56d2'
export const MANAGED_FIXER_MANIFEST_NAME = 'active-fixer.json'
export const MANAGED_FIXER_RUNTIME_DIR = 'runtimes'
export const MANAGED_FIXER_MAX_FILES = 10000
export const MANAGED_FIXER_MAX_BYTES = 1024 * 1024 * 1024

export const FIX_EXE_BY_GAME: Record<string, string> = {
  endfield: path.join('终末地', '终末地v1.2.2(可修复1.0-1.2mod）.exe'),
  zzz: path.join('绝区零', 'QAQ_ZZZ_3.0_FixTool.exe'),
  wuwa: path.join('鸣潮', 'Wuwa_Mod_Fixer_v3.5.1.exe'),
  'wuthering-waves': path.join('鸣潮', 'Wuwa_Mod_Fixer_v3.5.1.exe')
}

export interface ManagedFixerManifest {
  schemaVersion: number
  gameId: string
  executable: string
  runtimeRoot: string
  originalName: string
  sha256: string
  configVersion?: string
  configSha256?: string
  installedAt: string
  fileCount: number
  totalBytes: number
}

export interface ResolvedManagedFixer {
  manifestPath: string
  manifest: ManagedFixerManifest
  exePath: string
  runtimeDir: string
  sha256: string
  originalName: string
}

export interface FixStatusResult {
  engine: string
  gameId: string
  ruleSource?: string
  ruleVersion?: string
  ruleRevision?: number
  gameVersion?: string
  externalExePath?: string | null
  externalExeName?: string
  externalExeSha256?: string
  externalExeManaged?: boolean
  exePath?: string | null
  exeSha256?: string
  exeManaged?: boolean
  error?: string
  [key: string]: any
}

export function hashFileSha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

export function isSameResolvedPath(left: string, right: string): boolean {
  if (!left || !right) return false
  try {
    const resolvedLeft = path.resolve(left)
    const resolvedRight = path.resolve(right)
    return process.platform === 'win32'
      ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
      : resolvedLeft === resolvedRight
  } catch (_) {
    return false
  }
}

export function shouldPreBackupBeforeFix(exePath: string): boolean {
  return !String(path.basename(exePath || '')).toLowerCase().includes('qaq_zzz_3.0_fixtool')
}

export function assertSafeAppearancePathSegment(value: string, label?: string): string {
  const normalized = String(value || '').trim()
  const windowsStem = normalized.split('.')[0].toUpperCase()
  const isSafe =
    !!normalized &&
    normalized !== '.' &&
    normalized !== '..' &&
    !normalized.includes('\0') &&
    !/[<>:"/\\|?*\x00-\x1F]/.test(normalized) &&
    !/[. ]$/.test(normalized) &&
    !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(windowsStem)
  if (!isSafe) {
    throw new Error(`${label || '名称'}包含不支持的路径字符`)
  }
  return normalized
}

export function getWuwaFixRuleMetadata(manifest: any) {
  const source = manifest?.source && typeof manifest.source === 'object' ? manifest.source : {}
  const mappingCounts =
    source.mappingCounts && typeof source.mappingCounts === 'object' ? source.mappingCounts : {}
  return {
    upstreamProgramVersion: String(source.upstreamProgramVersion || ''),
    upstreamConfigVersion: String(source.upstreamConfigVersion || ''),
    forkProgramVersion: String(source.forkProgramVersion || ''),
    forkConfigVersion: String(source.forkConfigVersion || ''),
    upstreamDirectHashCount: Number(mappingCounts.upstreamDirectHashes || 0),
    forkDirectHashCount: Number(mappingCounts.forkDirectHashes || 0),
    localHiyukiHashCount: Number(mappingCounts.localHiyuki35Hashes || 0),
    combinedHashCount: Number(mappingCounts.combinedDeclaredHashes || 0),
    ambiguousForkHashCount: Number(mappingCounts.ambiguousForkHashesExcluded || 0),
    retiredBaselineHashCount: Number(mappingCounts.retiredBaselineHashes || 0)
  }
}

export class ModFixer {
  private userDataPath: string
  private resourcesPath: string
  private wuwaFixRuleLastCheckAt = 0
  private wuwaFixRuleUpdatePromise: Promise<any> | null = null

  constructor(options?: { userDataPath?: string; resourcesPath?: string }) {
    this.userDataPath =
      options?.userDataPath ||
      path.join(
        process.env.APPDATA ||
          (process.platform === 'darwin'
            ? path.join(process.env.HOME || '', 'Library/Application Support')
            : ''),
        'QAQManager'
      )
    this.resourcesPath =
      options?.resourcesPath ||
      path.resolve(__dirname, '../../resources')
  }

  public normalizeGameId(gameId?: string): string {
    const id = cleanString(gameId).toLowerCase()
    if (id === 'wuthering-waves') return 'wuwa'
    return id || 'wuwa'
  }

  public toInternalGameId(gameId?: string): string {
    const normalized = this.normalizeGameId(gameId)
    if (normalized === 'wuwa') return WUWA_FIX_GAME_ID
    return normalized
  }

  public getWuwaFixRuleCachePath(): string {
    return path.join(this.userDataPath, 'fix', WUWA_FIX_GAME_ID, 'managed', 'rules.json')
  }

  public getBundledWuwaFixRuleCandidates(): string[] {
    return [
      path.join(this.resourcesPath, WUWA_FIX_RULE_RELATIVE_PATH),
      path.join(this.resourcesPath, 'resources', WUWA_FIX_RULE_RELATIVE_PATH),
      path.join(this.resourcesPath, 'wuwa', 'rules.json'),
      path.join(this.resourcesPath, 'resources', 'wuwa', 'rules.json')
    ]
  }

  public loadBestLocalWuwaFixRules(): {
    filePath: string
    source: string
    priority: number
    manifest: WuwaRulesManifest
  } {
    const cachePath = this.getWuwaFixRuleCachePath()
    const candidates = [
      { filePath: cachePath, source: 'cache', priority: 3 },
      { filePath: `${cachePath}.bak`, source: 'cache-backup', priority: 2 },
      ...this.getBundledWuwaFixRuleCandidates().map((filePath) => ({
        filePath,
        source: 'bundled',
        priority: 1
      }))
    ]
    const loaded: Array<{
      filePath: string
      source: string
      priority: number
      manifest: WuwaRulesManifest
    }> = []
    const seen = new Set<string>()
    for (const candidate of candidates) {
      const key = path.resolve(candidate.filePath).toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      try {
        if (!fs.existsSync(candidate.filePath)) continue
        loaded.push({ ...candidate, manifest: readWuwaRulesFile(candidate.filePath) })
      } catch (error: any) {
        console.warn(
          `[mod-fixer] Ignoring invalid local rules ${candidate.filePath}: ${error?.message || error}`
        )
      }
    }
    loaded.sort((left, right) => {
      const revisionDiff = Number(right.manifest.revision || 0) - Number(left.manifest.revision || 0)
      return revisionDiff || right.priority - left.priority
    })
    if (!loaded.length) {
      throw new Error('鸣潮内嵌修复规则缺失或损坏，请重新安装管理器')
    }
    return loaded[0]
  }

  private async fetchWuwaFixRulesFromUrl(url: string): Promise<WuwaRulesManifest> {
    const separator = url.includes('?') ? '&' : '?'
    const requestUrl = `${url}${separator}qaqm_revision_check=${Date.now()}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    try {
      const response = await fetch(requestUrl, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal
      })
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText || ''}`.trim())
      }
      const declaredLength = Number(response.headers?.get?.('content-length') || 0)
      if (declaredLength > WUWA_FIX_RULE_MAX_BYTES) {
        throw new Error('远程规则文件超过大小上限')
      }
      const text = await response.text()
      if (Buffer.byteLength(text, 'utf8') > WUWA_FIX_RULE_MAX_BYTES) {
        throw new Error('远程规则文件超过大小上限')
      }
      return validateWuwaRulesManifest(JSON.parse(text))
    } finally {
      clearTimeout(timeoutId)
    }
  }

  public writeWuwaFixRuleCache(manifest: WuwaRulesManifest): string {
    const cachePath = this.getWuwaFixRuleCachePath()
    const cacheDir = path.dirname(cachePath)
    const tempPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`
    const backupPath = `${cachePath}.bak`
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    try {
      if (fs.existsSync(cachePath)) {
        if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true })
        fs.renameSync(cachePath, backupPath)
      }
      fs.renameSync(tempPath, cachePath)
    } catch (error) {
      try {
        if (!fs.existsSync(cachePath) && fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, cachePath)
        }
      } catch (_) {}
      try {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
      } catch (_) {}
      throw error
    }
    return cachePath
  }

  public async updateWuwaFixRules({ force = false }: { force?: boolean } = {}): Promise<any> {
    if (this.wuwaFixRuleUpdatePromise) return this.wuwaFixRuleUpdatePromise
    const now = Date.now()
    if (!force && now - this.wuwaFixRuleLastCheckAt < WUWA_FIX_AUTO_UPDATE_INTERVAL_MS) {
      const local = this.loadBestLocalWuwaFixRules()
      return {
        success: true,
        checked: false,
        updated: false,
        source: local.source,
        manifest: local.manifest
      }
    }

    this.wuwaFixRuleUpdatePromise = (async () => {
      const local = this.loadBestLocalWuwaFixRules()
      const attempts = await Promise.allSettled(
        WUWA_FIX_RULE_UPDATE_URLS.map(async (url) => ({
          url,
          manifest: await this.fetchWuwaFixRulesFromUrl(url)
        }))
      )
      const available = attempts
        .filter((a): a is PromiseFulfilledResult<{ url: string; manifest: WuwaRulesManifest }> => a.status === 'fulfilled')
        .map((a) => a.value)
        .sort((left, right) => Number(right.manifest.revision || 0) - Number(left.manifest.revision || 0))

      if (!available.length) {
        const errors = attempts
          .map((attempt, index) =>
            attempt.status === 'rejected'
              ? `${WUWA_FIX_RULE_UPDATE_URLS[index]}: ${attempt.reason?.message || attempt.reason}`
              : ''
          )
          .filter(Boolean)
        throw new Error(`联网规则检查失败，已保留本地规则。${errors.slice(0, 2).join('；')}`)
      }

      this.wuwaFixRuleLastCheckAt = Date.now()
      const remote = available[0]
      if (Number(remote.manifest.revision || 0) > Number(local.manifest.revision || 0)) {
        const cachePath = this.writeWuwaFixRuleCache(remote.manifest)
        console.log(
          `[mod-fixer] Rules updated ${local.manifest.revision} -> ${remote.manifest.revision} from ${remote.url}`
        )
        return {
          success: true,
          checked: true,
          updated: true,
          source: 'cache',
          sourceUrl: remote.url,
          cachePath,
          manifest: remote.manifest
        }
      }

      return {
        success: true,
        checked: true,
        updated: false,
        source: local.source,
        sourceUrl: remote.url,
        manifest: local.manifest
      }
    })().finally(() => {
      this.wuwaFixRuleUpdatePromise = null
    })

    return this.wuwaFixRuleUpdatePromise
  }

  public async resolveWuwaFixRulesForRun(): Promise<any> {
    let update: any
    try {
      update = await this.updateWuwaFixRules({ force: false })
    } catch (error: any) {
      console.warn(`[mod-fixer] Auto update failed: ${error?.message || error}`)
      update = {
        success: false,
        checked: true,
        updated: false,
        error: error?.message || String(error)
      }
    }
    const local = this.loadBestLocalWuwaFixRules()
    return { ...local, update }
  }

  public async runWuwaBuiltinFix(workDir: string): Promise<any> {
    const rules = await this.resolveWuwaFixRulesForRun()
    const stamp = createIniBackupStamp()
    const preBackup = { stamp, count: 0, errors: [] as string[] }
    const result = applyWuwaFixRulesToDirectory({
      rootDir: workDir,
      manifest: rules.manifest,
      beforeWrite: (iniPath) => {
        try {
          copyIniBackupBesideFile(iniPath, stamp)
          preBackup.count++
        } catch (error: any) {
          const message = `${iniPath}: ${error?.message || error}`
          preBackup.errors.push(message)
          throw new Error(`创建回滚备份失败: ${error?.message || error}`, { cause: error })
        }
      }
    })
    const stats: WuwaFixDirectoryStats = result.stats
    const success = stats.failedFiles === 0
    console.log(
      `[mod-fixer] Completed wuwa builtin rules=${rules.manifest.toolVersion} revision=${rules.manifest.revision} scanned=${stats.scannedFiles} modified=${stats.modifiedFiles} replacements=${stats.replacementCount} failed=${stats.failedFiles}`
    )
    return {
      success,
      engine: 'builtin-wuwa',
      completed: true,
      workDir,
      ruleSource: rules.source,
      ruleVersion: rules.manifest.toolVersion,
      ruleRevision: rules.manifest.revision,
      gameVersion: rules.manifest.gameVersion,
      ...getWuwaFixRuleMetadata(rules.manifest),
      update: rules.update,
      stats,
      preBackup,
      error: success ? '' : `有 ${stats.failedFiles} 个 ini 修复失败`
    }
  }

  public getManagedFixerUserDir(gameId: string): string {
    const internalId = this.toInternalGameId(gameId)
    const safeGameId = assertSafeAppearancePathSegment(internalId, '游戏 ID')
    return path.join(this.userDataPath, 'fix', safeGameId, 'user')
  }

  public getManagedFixerManifestPath(gameId: string): string {
    return path.join(this.getManagedFixerUserDir(gameId), MANAGED_FIXER_MANIFEST_NAME)
  }

  private promoteManagedFixerFallbackManifest(gameId: string): boolean {
    const manifestPath = this.getManagedFixerManifestPath(gameId)
    const active = this.resolveManagedFixerForGame(gameId)
    if (!active || isSameResolvedPath(active.manifestPath, manifestPath)) return false
    const tempPath = `${manifestPath}.recover-${process.pid}-${Date.now()}`
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
    fs.writeFileSync(tempPath, JSON.stringify(active.manifest, null, 2) + '\n', 'utf8')
    try {
      if (fs.existsSync(manifestPath)) fs.rmSync(manifestPath, { force: true })
      fs.renameSync(tempPath, manifestPath)
      console.log(`[mod-fixer] Promoted valid fallback fixer manifest before update: ${active.manifestPath}`)
      return true
    } catch (error) {
      try {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
      } catch (_) {}
      throw error
    }
  }

  public writeManagedFixerManifest(gameId: string, manifest: ManagedFixerManifest): string {
    const manifestPath = this.getManagedFixerManifestPath(gameId)
    const dirPath = path.dirname(manifestPath)
    const tempPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`
    const backupPath = `${manifestPath}.bak`
    this.promoteManagedFixerFallbackManifest(gameId)
    fs.mkdirSync(dirPath, { recursive: true })
    fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    try {
      if (fs.existsSync(manifestPath)) {
        if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true })
        fs.renameSync(manifestPath, backupPath)
      }
      fs.renameSync(tempPath, manifestPath)
    } catch (error) {
      try {
        if (!fs.existsSync(manifestPath) && fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, manifestPath)
        }
      } catch (_) {}
      try {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
      } catch (_) {}
      throw error
    }
    return manifestPath
  }

  public readManagedFixerManifestCandidates(gameId: string): Array<{
    manifestPath: string
    manifest: ManagedFixerManifest
  }> {
    const candidates: Array<{ manifestPath: string; manifest: ManagedFixerManifest }> = []
    for (const manifestPath of [
      this.getManagedFixerManifestPath(gameId),
      `${this.getManagedFixerManifestPath(gameId)}.bak`
    ]) {
      try {
        if (!fs.existsSync(manifestPath)) continue
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        if (parsed && typeof parsed === 'object' && parsed.schemaVersion === 1) {
          candidates.push({ manifestPath, manifest: parsed })
        }
      } catch (error: any) {
        console.warn(
          `[mod-fixer] Ignoring invalid managed fixer manifest ${manifestPath}: ${error?.message || error}`
        )
      }
    }
    return candidates
  }

  public resolveManagedFixerForGame(gameId: string): ResolvedManagedFixer | null {
    const internalId = this.toInternalGameId(gameId)
    const baseDir = this.getManagedFixerUserDir(gameId)
    for (const loaded of this.readManagedFixerManifestCandidates(gameId)) {
      const relativeExe = String(loaded.manifest.executable || '')
      const exePath = path.resolve(baseDir, relativeExe)
      if (!relativeExe || !isPathInsideDirectory(exePath, baseDir) || !fs.existsSync(exePath)) {
        console.warn(
          `[mod-fixer] Managed fixer manifest points to a missing or unsafe path (${loaded.manifestPath}): ${relativeExe}`
        )
        continue
      }
      let actualSha256: string
      try {
        actualSha256 = hashFileSha256(exePath)
      } catch (_) {
        continue
      }
      const expectedSha256 = String(loaded.manifest.sha256 || '').toLowerCase()
      if (!expectedSha256 || actualSha256.toLowerCase() !== expectedSha256) {
        console.warn(`[mod-fixer] Managed fixer hash mismatch (${loaded.manifestPath}): ${exePath}`)
        continue
      }
      const relativeRuntimeRoot = String(loaded.manifest.runtimeRoot || '')
      const runtimeDir = relativeRuntimeRoot
        ? path.resolve(baseDir, relativeRuntimeRoot)
        : path.dirname(exePath)
      if (!isPathInsideDirectory(runtimeDir, baseDir) || !fs.existsSync(runtimeDir)) {
        console.warn(`[mod-fixer] Managed fixer runtime root is missing or unsafe: ${runtimeDir}`)
        continue
      }
      if (internalId === WUWA_FIX_GAME_ID) {
        const configPath = path.join(runtimeDir, WUWA_INDEPENDENT_CONFIG_NAME)
        const expectedConfigSha256 = String(loaded.manifest.configSha256 || '').toLowerCase()
        try {
          if (
            !expectedConfigSha256 ||
            !fs.existsSync(configPath) ||
            hashFileSha256(configPath).toLowerCase() !== expectedConfigSha256
          ) {
            console.warn(`[mod-fixer] Managed Wuwa fixer config hash mismatch: ${configPath}`)
            continue
          }
          this.inspectWuwaIndependentConfig(configPath, { expectedVersion: '' })
        } catch (error: any) {
          console.warn(`[mod-fixer] Managed Wuwa fixer config is invalid: ${error?.message || error}`)
          continue
        }
      }
      return {
        ...loaded,
        exePath,
        runtimeDir,
        sha256: actualSha256,
        originalName: loaded.manifest.originalName || path.basename(exePath)
      }
    }
    return null
  }

  public resolveFixExePath(gameId: string): string | null {
    const internalId = this.toInternalGameId(gameId)
    const managed = this.resolveManagedFixerForGame(gameId)
    if (managed) {
      console.log(`[mod-fixer] Using managed user fixer: ${managed.exePath} sha256=${managed.sha256}`)
      return managed.exePath
    }
    const overrideDir = path.join(this.userDataPath, 'fix', internalId)
    const userOverride = path.join(overrideDir, '_override.exe')
    try {
      if (fs.existsSync(userOverride)) {
        if (
          internalId === WUWA_FIX_GAME_ID &&
          !fs.existsSync(path.join(overrideDir, WUWA_INDEPENDENT_CONFIG_NAME))
        ) {
          console.warn('[mod-fixer] Ignoring legacy override without config.json')
        } else {
          console.log(`[mod-fixer] Using legacy override: ${userOverride}`)
          return userOverride
        }
      }
    } catch (_) {}

    const rel = FIX_EXE_BY_GAME[internalId] || FIX_EXE_BY_GAME[this.normalizeGameId(gameId)]
    if (!rel) {
      console.warn(`[mod-fixer] No fix exe mapped for gameId: ${gameId}`)
      return null
    }

    const candidates = [
      path.join(this.resourcesPath, 'fix', rel),
      path.join(this.resourcesPath, 'resources', 'fix', rel),
      path.join(this.resourcesPath, rel),
      path.join(path.dirname(this.resourcesPath), 'fix', rel)
    ]
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) {
          console.log(`[mod-fixer] Using bundled: ${c}`)
          return c
        }
      } catch (_) {}
    }

    // 子目录 exe 扫描兜底
    const gameSubDir = rel.split(path.sep)[0] || ''
    if (gameSubDir) {
      const scanDirs = [
        path.join(this.resourcesPath, 'fix', gameSubDir),
        path.join(this.resourcesPath, 'resources', 'fix', gameSubDir),
        path.join(this.resourcesPath, gameSubDir),
        path.join(path.dirname(this.resourcesPath), 'fix', gameSubDir)
      ]
      for (const dir of scanDirs) {
        try {
          if (fs.existsSync(dir)) {
            const exes = fs.readdirSync(dir).filter((f) => f.endsWith('.exe'))
            if (exes.length > 0) {
              const found = path.join(dir, exes[0])
              console.log(`[mod-fixer] Using fallback scan: ${found}`)
              return found
            }
          }
        } catch (_) {}
      }
    }

    console.warn(
      `[mod-fixer] No fix exe found for ${gameId}, candidates checked: ${candidates.join(', ')}`
    )
    return null
  }

  public inspectWuwaIndependentConfig(
    configPath: string,
    { expectedVersion = WUWA_INDEPENDENT_CONFIG_VERSION }: { expectedVersion?: string } = {}
  ): { currentVersion: string; characterCount: number } {
    let config: any
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    } catch (error: any) {
      throw new Error(`独立修复器配置无效：${error?.message || error}`, { cause: error })
    }
    const currentVersion = String(config?.version?.current_version || '').trim()
    if (!currentVersion) {
      throw new Error('独立修复器配置缺少 version.current_version')
    }
    if (expectedVersion && currentVersion !== expectedVersion) {
      throw new Error(
        `独立修复器配置版本错误：需要 ${expectedVersion}，实际 ${currentVersion || '空'}`
      )
    }
    for (const key of ['start_processing', 'process_file_start', 'no_need_fix']) {
      const translation = config?.lang?.[key]?.zh
      if (typeof translation !== 'string' || !translation.trim()) {
        throw new Error(`独立修复器配置缺少中文日志：${key}`)
      }
    }
    const characters = config?.characters
    const characterCount =
      characters && typeof characters === 'object' && !Array.isArray(characters)
        ? Object.keys(characters).length
        : 0
    if (characterCount === 0) throw new Error('独立修复器配置不包含角色修复规则')
    return { currentVersion, characterCount }
  }

  private syncWuwaIndependentRuntimeFile(sourcePath: string, targetPath: string): boolean {
    let shouldCopy = !fs.existsSync(targetPath)
    if (!shouldCopy) {
      const sourceStat = fs.statSync(sourcePath)
      const targetStat = fs.statSync(targetPath)
      shouldCopy =
        sourceStat.size !== targetStat.size || hashFileSha256(sourcePath) !== hashFileSha256(targetPath)
    }
    if (!shouldCopy) return false
    const tempPath = path.join(
      path.dirname(targetPath),
      `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}`
    )
    try {
      fs.copyFileSync(sourcePath, tempPath)
      if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true })
      fs.renameSync(tempPath, targetPath)
      return true
    } catch (error) {
      try {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
      } catch (_) {}
      throw error
    }
  }

  public ensureWuwaIndependentFixer(exePath: string): {
    stableDir: string
    stableExe: string
    stableConfig: string
    configMetadata: { currentVersion: string; characterCount: number }
  } {
    const stableDir = path.join(this.userDataPath, 'fix', WUWA_FIX_GAME_ID, 'independent')
    const stableExe = path.join(stableDir, path.basename(exePath))
    const sourceConfig = path.join(path.dirname(exePath), WUWA_INDEPENDENT_CONFIG_NAME)
    const stableConfig = path.join(stableDir, WUWA_INDEPENDENT_CONFIG_NAME)
    if (!fs.existsSync(sourceConfig)) {
      throw new Error('独立修复器配置缺失，请重新安装或更新管理器')
    }
    const configMetadata = this.inspectWuwaIndependentConfig(sourceConfig)
    const sourceConfigHash = hashFileSha256(sourceConfig)
    if (sourceConfigHash !== WUWA_INDEPENDENT_CONFIG_SHA256) {
      throw new Error('独立修复器配置完整性校验失败，请重新安装或更新管理器')
    }
    fs.mkdirSync(stableDir, { recursive: true })
    try {
      this.syncWuwaIndependentRuntimeFile(exePath, stableExe)
      this.syncWuwaIndependentRuntimeFile(sourceConfig, stableConfig)
    } catch (error: any) {
      throw new Error(`准备独立修复器失败，请先关闭已打开的修复器：${error?.message || error}`, {
        cause: error
      })
    }
    const stableMetadata = this.inspectWuwaIndependentConfig(stableConfig)
    if (hashFileSha256(stableConfig) !== sourceConfigHash) {
      throw new Error('独立修复器运行配置同步失败，请重试')
    }
    console.log(
      `[mod-fixer] Independent runtime ready config=${stableMetadata.currentVersion} characters=${stableMetadata.characterCount}`
    )
    return { stableDir, stableExe, stableConfig, configMetadata }
  }

  public prepareWuwaIndependentFixerRuntime(exePath: string): {
    stableDir: string
    stableExe: string
    stableConfig: string
    configMetadata: { currentVersion: string; characterCount: number }
    managed?: boolean
  } {
    const managed = this.resolveManagedFixerForGame(WUWA_FIX_GAME_ID)
    if (managed && isSameResolvedPath(managed.exePath, exePath)) {
      const runtimeDir = managed.runtimeDir
      const configPath = path.join(runtimeDir, WUWA_INDEPENDENT_CONFIG_NAME)
      const configMetadata = this.inspectWuwaIndependentConfig(configPath, { expectedVersion: '' })
      return {
        stableDir: runtimeDir,
        stableExe: managed.exePath,
        stableConfig: configPath,
        configMetadata,
        managed: true
      }
    }
    return this.ensureWuwaIndependentFixer(exePath)
  }

  private setWuwaIndependentFixerFolder(stableDir: string, workDir: string): void {
    const settingsPath = path.join(stableDir, 'settings.json')
    let settings: any = {}
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) settings = parsed
    } catch (_) {}
    settings.last_folder = workDir
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8')
  }

  public runWuwaIndependentFixer(exePath: string, workDir: string): Promise<any> {
    return new Promise((resolve) => {
      let stable: any
      try {
        stable = this.prepareWuwaIndependentFixerRuntime(exePath)
        this.setWuwaIndependentFixerFolder(stable.stableDir, workDir)
        const legacyTempExe = path.join(workDir, `_qaqm_fix_${path.basename(exePath)}`)
        try {
          if (fs.existsSync(legacyTempExe)) fs.rmSync(legacyTempExe, { force: true })
        } catch (error: any) {
          console.warn(
            `[mod-fixer] Could not remove legacy temporary fixer ${legacyTempExe}: ${error?.message || error}`
          )
        }
      } catch (error: any) {
        return resolve({ success: false, error: error?.message || String(error) })
      }

      let child: any
      try {
        child = spawn(stable.stableExe, [], {
          cwd: stable.stableDir,
          detached: true,
          stdio: 'ignore'
        })
      } catch (error: any) {
        return resolve({
          success: false,
          error: `打开独立修复器失败：${error?.message || error}`
        })
      }

      let settled = false
      child.once('error', (error: any) => {
        if (settled) return
        settled = true
        resolve({
          success: false,
          error: `打开独立修复器失败：${error?.message || error}`
        })
      })
      child.once('spawn', () => {
        if (settled) return
        settled = true
        child.unref()
        resolve({
          success: true,
          workDir,
          preBackup: null,
          backupMode: 'independent-on-change',
          independentExePath: stable.stableExe
        })
      })
    })
  }

  public runFixExe(exePath: string, workDir: string): Promise<any> {
    return new Promise((resolve) => {
      let preBackupSnapshot: any = null
      if (shouldPreBackupBeforeFix(exePath)) {
        preBackupSnapshot = createIniBackupSnapshotForDirectory(workDir)
        if (preBackupSnapshot.errors?.length) {
          console.warn(
            `[mod-fixer] Pre-backup completed with errors: ${preBackupSnapshot.errors.slice(0, 5).join('; ')}`
          )
        }
      }
      const preBackup = summarizeIniBackupSnapshot(preBackupSnapshot)
      const destExe = path.join(workDir, `_qaqm_fix_${path.basename(exePath)}`)
      try {
        fs.copyFileSync(exePath, destExe)
      } catch (e: any) {
        return resolve({ success: false, error: '复制修复程序失败: ' + e.message })
      }
      console.log(`[mod-fixer] Copied to ${destExe}, launching in ${workDir}`)
      const child = spawn('cmd.exe', ['/c', 'start', '', destExe], {
        cwd: workDir,
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
      setTimeout(() => {
        try {
          fs.unlinkSync(destExe)
        } catch (_) {}
      }, 30000)
      resolve({ success: true, workDir, preBackup })
    })
  }

  public runExternalFixerForGame(gameId: string, exePath: string, workDir: string): Promise<any> {
    const internalId = this.toInternalGameId(gameId)
    return internalId === WUWA_FIX_GAME_ID
      ? this.runWuwaIndependentFixer(exePath, workDir)
      : this.runFixExe(exePath, workDir)
  }

  public getStatus(gameId?: string): FixStatusResult {
    const targetGameId = this.normalizeGameId(gameId)
    const internalId = this.toInternalGameId(targetGameId)

    if (internalId === WUWA_FIX_GAME_ID) {
      try {
        const local = this.loadBestLocalWuwaFixRules()
        const externalExePath = this.resolveFixExePath(internalId)
        const managedFixer = this.resolveManagedFixerForGame(internalId)
        return {
          engine: 'builtin-wuwa',
          gameId: targetGameId,
          ruleSource: local.source,
          ruleVersion: local.manifest.toolVersion,
          ruleRevision: local.manifest.revision,
          gameVersion: local.manifest.gameVersion,
          ...getWuwaFixRuleMetadata(local.manifest),
          externalExePath,
          externalExeName: externalExePath ? path.basename(externalExePath) : '',
          externalExeSha256: managedFixer?.sha256 || '',
          externalExeManaged: !!managedFixer
        }
      } catch (error: any) {
        return {
          engine: 'builtin-wuwa',
          gameId: targetGameId,
          error: error?.message || String(error)
        }
      }
    }

    const exePath = this.resolveFixExePath(internalId)
    const managedFixer = this.resolveManagedFixerForGame(internalId)
    return {
      engine: 'external',
      gameId: targetGameId,
      exePath,
      exeName: exePath ? path.basename(exePath) : '',
      exeSha256: managedFixer?.sha256 || '',
      exeManaged: !!managedFixer
    }
  }

  public listFixerExeCandidates(rootDir: string, maxDepth = 5): Array<{ path: string; depth: number }> {
    const candidates: Array<{ path: string; depth: number }> = []
    const visit = (dirPath: string, depth: number) => {
      if (depth > maxDepth) return
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true })
      } catch (_) {
        return
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue
        const entryPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          visit(entryPath, depth + 1)
        } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.exe') {
          candidates.push({ path: entryPath, depth })
        }
      }
    }
    visit(rootDir, 0)
    return candidates
  }

  public chooseFixerExecutable(rootDir: string, sourceName = ''): string {
    const candidates = this.listFixerExeCandidates(rootDir)
    if (!candidates.length) throw new Error('修复器包中没有找到 exe 文件')
    const sourceStem = path.basename(sourceName, path.extname(sourceName)).toLowerCase()
    const scored = candidates.map((candidate) => {
      const stem = path.basename(candidate.path, '.exe').toLowerCase()
      let score = -candidate.depth * 4
      if (/(^|[\s._-])fix(?:er|tool)?(?=$|[\s._-])/i.test(stem) || /修复/.test(stem)) score += 100
      if (/^(unins|uninstall|setup|update|crash)/i.test(stem)) score -= 200
      if (sourceStem && (sourceStem.includes(stem) || stem.includes(sourceStem))) score += 20
      return { ...candidate, score }
    })
    scored.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    if (scored.length > 1 && scored[0].score === scored[1].score) {
      throw new Error('修复器包包含多个 exe，无法确定主程序；请将修复器单独打包后重试')
    }
    return scored[0].path
  }

  public findFixerRuntimeRoot(sourceExe: string, packageRoot: string, gameId: string): string {
    const internalId = this.toInternalGameId(gameId)
    const exeDir = path.dirname(sourceExe)
    if (internalId !== WUWA_FIX_GAME_ID) return exeDir
    const boundary = path.resolve(packageRoot)
    let cursor = path.resolve(exeDir)
    while (isSameResolvedPath(cursor, boundary) || isPathInsideDirectory(cursor, boundary)) {
      const configPath = path.join(cursor, WUWA_INDEPENDENT_CONFIG_NAME)
      if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
        this.inspectWuwaIndependentConfig(configPath, { expectedVersion: '' })
        return cursor
      }
      if (isSameResolvedPath(cursor, boundary)) break
      const parent = path.dirname(cursor)
      if (!parent || parent === cursor) break
      cursor = parent
    }
    throw new Error('鸣潮独立修复器缺少有效的 config.json，未替换当前修复器')
  }

  private copyDirectFixerSidecars(sourceExe: string, targetDir: string): void {
    const sourceDir = path.dirname(sourceExe)
    const knownFiles = new Set(['config.json', 'translations.json', 'language.json', 'lang.json'])
    const knownDirs = new Set(['lang', 'locales'])
    fs.copyFileSync(sourceExe, path.join(targetDir, path.basename(sourceExe)))
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      const lowerName = entry.name.toLowerCase()
      if (entry.isFile() && knownFiles.has(lowerName)) {
        fs.copyFileSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name))
      } else if (entry.isDirectory() && knownDirs.has(lowerName)) {
        fs.cpSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name), {
          recursive: true,
          dereference: false
        })
      }
    }
  }

  private async prepareFixerInstallSource(sourcePath: string): Promise<{
    rootDir: string
    cleanup: (() => void) | null
    sourceName: string
  }> {
    const resolvedSource = path.resolve(sourcePath)
    const stat = fs.statSync(resolvedSource)
    if (stat.isDirectory()) {
      return { rootDir: resolvedSource, cleanup: null, sourceName: path.basename(resolvedSource) }
    }
    const ext = path.extname(resolvedSource).toLowerCase()
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-fixer-install-'))
    try {
      if (ext === '.exe') {
        this.copyDirectFixerSidecars(resolvedSource, tempDir)
      } else if (['.zip', '.rar', '.7z'].includes(ext)) {
        if (ext === '.rar') {
          const unrar = resolveUnrarPath()
          if (!unrar) throw new Error('未找到 UnRAR.exe 解压工具')
          await execFileAsync(unrar, ['x', '-y', resolvedSource, tempDir + path.sep], {
            windowsHide: true,
            maxBuffer: 64 * 1024 * 1024
          })
        } else {
          const bin7z = resolve7zaPath()
          await execFileAsync(bin7z, ['x', '-y', `-o${tempDir}`, resolvedSource], {
            windowsHide: true,
            maxBuffer: 64 * 1024 * 1024
          })
        }
      } else {
        throw new Error('修复器仅支持 exe、文件夹、zip、rar 或 7z')
      }

      const files = fs.readdirSync(tempDir)
      if (!files.length) {
        throw new Error('修复器包解压结果为空')
      }
      return {
        rootDir: tempDir,
        cleanup: () => {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true })
          } catch (_) {}
        },
        sourceName: path.basename(resolvedSource)
      }
    } catch (error) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch (_) {}
      throw error
    }
  }

  private collectFixerRuntimeFiles(
    runtimeRoot: string
  ): { files: Array<{ sourcePath: string; relativePath: string }>; totalBytes: number } {
    const files: Array<{ sourcePath: string; relativePath: string }> = []
    let totalBytes = 0
    const visit = (dirPath: string, relativeDir = '') => {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue
        const relativePath = path.join(relativeDir, entry.name)
        const sourcePath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          visit(sourcePath, relativePath)
          continue
        }
        if (!entry.isFile() || entry.name.toLowerCase() === 'settings.json') continue
        totalBytes += fs.statSync(sourcePath).size
        if (files.length >= MANAGED_FIXER_MAX_FILES || totalBytes > MANAGED_FIXER_MAX_BYTES) {
          throw new Error('修复器运行包的文件数量或总大小超过安全上限')
        }
        files.push({ sourcePath, relativePath })
      }
    }
    visit(runtimeRoot)
    return { files, totalBytes }
  }

  public async installManagedFixerFromSource(
    sourcePath: string,
    requestedGameId?: string
  ): Promise<any> {
    const targetGameId = this.normalizeGameId(requestedGameId)
    const internalId = this.toInternalGameId(targetGameId)
    const prepared = await this.prepareFixerInstallSource(sourcePath)
    let runtimeDir = ''
    let manifestWritten = false

    try {
      const sourceExe = this.chooseFixerExecutable(prepared.rootDir, prepared.sourceName)
      const runtimeRoot = this.findFixerRuntimeRoot(sourceExe, prepared.rootDir, internalId)
      const sourceExeRelativePath = path.relative(runtimeRoot, sourceExe)
      const sourceConfigPath =
        internalId === WUWA_FIX_GAME_ID ? path.join(runtimeRoot, WUWA_INDEPENDENT_CONFIG_NAME) : ''
      const sourceConfigSha256 = sourceConfigPath ? hashFileSha256(sourceConfigPath) : ''
      const { files, totalBytes } = this.collectFixerRuntimeFiles(runtimeRoot)
      const sourceSha256 = hashFileSha256(sourceExe)
      const installId = `${sourceSha256.slice(0, 16)}-${Date.now().toString(36)}`
      const userDir = this.getManagedFixerUserDir(internalId)
      runtimeDir = path.join(userDir, MANAGED_FIXER_RUNTIME_DIR, installId)
      fs.mkdirSync(runtimeDir, { recursive: true })

      for (const file of files) {
        const destination = path.resolve(runtimeDir, file.relativePath)
        if (!isPathInsideDirectory(destination, runtimeDir)) {
          throw new Error(`修复器包包含越界路径: ${file.relativePath}`)
        }
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.copyFileSync(file.sourcePath, destination)
      }

      const copiedExe = path.resolve(runtimeDir, sourceExeRelativePath)
      if (!fs.existsSync(copiedExe) || hashFileSha256(copiedExe) !== sourceSha256) {
        throw new Error('修复器复制后 SHA-256 校验失败')
      }

      let configMetadata: any = null
      let configSha256 = ''
      if (internalId === WUWA_FIX_GAME_ID) {
        const copiedConfig = path.join(runtimeDir, WUWA_INDEPENDENT_CONFIG_NAME)
        configMetadata = this.inspectWuwaIndependentConfig(copiedConfig, { expectedVersion: '' })
        configSha256 = hashFileSha256(copiedConfig)
        if (configSha256 !== sourceConfigSha256) {
          throw new Error('鸣潮独立修复器 config.json 复制后校验失败')
        }
      }

      const relativeExe = path.relative(userDir, copiedExe)
      const manifest: ManagedFixerManifest = {
        schemaVersion: 1,
        gameId: internalId,
        executable: relativeExe,
        runtimeRoot: path.relative(userDir, runtimeDir),
        originalName: path.basename(sourceExe),
        sha256: sourceSha256,
        configVersion: configMetadata?.currentVersion || '',
        configSha256,
        installedAt: new Date().toISOString(),
        fileCount: files.length,
        totalBytes
      }
      this.writeManagedFixerManifest(internalId, manifest)
      manifestWritten = true
      const active = this.resolveManagedFixerForGame(internalId)
      if (!active || !isSameResolvedPath(active.exePath, copiedExe) || active.sha256 !== sourceSha256) {
        throw new Error('修复器已复制，但活动版本解析校验失败')
      }
      console.log(
        `[mod-fixer] Managed fixer installed game=${internalId} exe=${active.exePath} sha256=${active.sha256}`
      )
      return {
        success: true,
        managedInstall: true,
        installContentType: 'fixer',
        targetGameId,
        targetPath: runtimeDir,
        resolvedExePath: active.exePath,
        sha256: active.sha256,
        fileName: active.originalName,
        fileCount: files.length,
        modName: `${targetGameId}独立修复器`
      }
    } catch (error) {
      if (manifestWritten) {
        const manifestPath = this.getManagedFixerManifestPath(internalId)
        const backupPath = `${manifestPath}.bak`
        try {
          if (fs.existsSync(manifestPath)) fs.rmSync(manifestPath, { force: true })
          if (fs.existsSync(backupPath)) fs.renameSync(backupPath, manifestPath)
        } catch (_) {}
      }
      if (runtimeDir) {
        try {
          fs.rmSync(runtimeDir, { recursive: true, force: true })
        } catch (_) {}
      }
      throw error
    } finally {
      prepared.cleanup?.()
    }
  }
}
