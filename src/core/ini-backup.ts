import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export const QAQM_INI_BACKUP_MARKER = '.qaqm-inibak-'
export const QAQM_INI_BACKUP_PATTERN = /\.qaqm-inibak-(\d{8}-\d{6}(?:-(?:\d{2}|\d{3}-[0-9a-f]{6}))?(?:-\d{2})?)$/i
export const WUWA_INDEPENDENT_BACKUP_PATTERN = /^(.*)_(\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}(?:\.\d{3})?)\.BAK$/i
export const WUWA_INDEPENDENT_STAMP_PREFIX = 'wuwa-independent:'

export interface ParsedFixBackupFileName {
  format: 'qaqm' | 'wuwa-independent'
  stamp: string
  groupKey: string
  timestamp: string
  sortKey: string
  originalName: string
}

export interface ParsedFixBackup extends ParsedFixBackupFileName {
  backupPath: string
  originalPath: string
  relativePath: string
}

export interface IniBackupGroup {
  stamp: string
  format: 'qaqm' | 'wuwa-independent'
  sortKey: string
  label: string
  fileCount: number
}

export interface IniBackupRestoreResult {
  success: boolean
  restoreSucceeded: boolean
  cleanupAttempted: boolean
  cleanupSucceeded: boolean
  snapshotDeleted: boolean
  cleanupFailed: boolean
  snapshotFileCount: number
  restoredCount: number
  removedBackupCount: number
  backupFormat?: string
  errors: string[]
  cleanupErrors: string[]
  error?: string
}

export function normalizeComparablePath(targetPath: string): string {
  if (!targetPath || typeof targetPath !== 'string') return ''
  const trimmed = targetPath.trim()
  if (!trimmed) return ''
  try {
    const resolved = path.resolve(trimmed)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  } catch (_) {
    return ''
  }
}

export function isPathInsideDirectory(targetPath: string, parentDir: string): boolean {
  const normalizedTarget = normalizeComparablePath(targetPath)
  const normalizedParent = normalizeComparablePath(parentDir)
  if (!normalizedTarget || !normalizedParent) return false
  if (normalizedTarget === normalizedParent) return true
  const relativePath = path.relative(normalizedParent, normalizedTarget)
  return (
    !!relativePath &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  )
}

export function qaqmStampSortKey(stamp: string): string {
  const match = String(stamp || '').match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(.*)$/i)
  if (!match) return String(stamp || '')
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}-${match[5]}-${match[6]}${match[7]}`
}

export function formatQaqmBackupStamp(stamp: string): string {
  const match = String(stamp || '').match(
    /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-(\d{2})|-(\d{3})-[0-9a-f]{6})?(?:-\d{2})?$/i
  )
  if (!match) return String(stamp || '未知时间')
  const base = `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`
  if (match[8]) return `${base}.${match[8]}`
  if (match[7]) return `${base} · 第 ${Number(match[7]) + 1} 次`
  return base
}

export function parseFixBackupFileName(
  fileName: string,
  { includeWuwaIndependent = false }: { includeWuwaIndependent?: boolean } = {}
): ParsedFixBackupFileName | null {
  const name = String(fileName || '')
  const qaqmMatch = name.match(QAQM_INI_BACKUP_PATTERN)
  if (qaqmMatch) {
    return {
      format: 'qaqm',
      stamp: qaqmMatch[1],
      groupKey: qaqmMatch[1],
      timestamp: qaqmMatch[1],
      sortKey: qaqmStampSortKey(qaqmMatch[1]),
      originalName: name.replace(QAQM_INI_BACKUP_PATTERN, '')
    }
  }
  if (!includeWuwaIndependent) return null
  const independentMatch = name.match(WUWA_INDEPENDENT_BACKUP_PATTERN)
  if (!independentMatch || !independentMatch[1]) return null
  const timestamp = independentMatch[2]
  const groupKey = timestamp.slice(0, 16)
  return {
    format: 'wuwa-independent',
    stamp: `${WUWA_INDEPENDENT_STAMP_PREFIX}${groupKey}`,
    groupKey,
    timestamp,
    sortKey: timestamp,
    originalName: independentMatch[1]
  }
}

export function formatFixBackupLabel(backup: {
  format?: string
  stamp?: string
  groupKey?: string
}): string {
  if (backup?.format === 'wuwa-independent') {
    const match = String(backup.groupKey || '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})$/)
    if (match) return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]} · 独立修复器`
  }
  return formatQaqmBackupStamp(backup?.stamp || '')
}

export function normalizedOriginalPath(filePath: string): string {
  const value = String(filePath || '')
  return process.platform === 'win32' ? value.toLowerCase() : value
}

export function buildFixBackupRestorePlan(
  backups: ParsedFixBackup[],
  selectedStamp: string
): {
  format: 'qaqm' | 'wuwa-independent'
  restoreBackups: ParsedFixBackup[]
  cleanupBackups: ParsedFixBackup[]
} | null {
  const selected = backups.filter((backup) => backup.stamp === selectedStamp)
  if (selected.length === 0) return null
  const format = selected[0].format
  if (format !== 'wuwa-independent') {
    return { format, restoreBackups: selected, cleanupBackups: selected }
  }
  const targetGroupKey = selected[0].groupKey
  const cleanupBackups = backups.filter(
    (backup) => backup.format === format && backup.groupKey >= targetGroupKey
  )
  const earliestByFile = new Map<string, ParsedFixBackup>()
  for (const backup of cleanupBackups) {
    const key = normalizedOriginalPath(backup.originalPath)
    const current = earliestByFile.get(key)
    if (!current || backup.timestamp < current.timestamp) earliestByFile.set(key, backup)
  }
  return {
    format,
    restoreBackups: Array.from(earliestByFile.values()),
    cleanupBackups
  }
}

export function createIniBackupStamp(): string {
  const now = new Date()
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(
    2,
    '0'
  )}${String(now.getSeconds()).padStart(2, '0')}`
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0')
  return `${timestamp}-${milliseconds}-${crypto.randomBytes(3).toString('hex')}`
}

export function isIniBackupLikeFile(fileName: string): boolean {
  const name = String(fileName || '')
  return (
    name.includes(QAQM_INI_BACKUP_MARKER) ||
    name.endsWith('.qaqm-persistbak') ||
    name.startsWith('DISABLED_BACKUP_') ||
    name.startsWith('DISABLED ')
  )
}

export function copyIniBackupBesideFile(iniPath: string, stamp: string): string {
  let backupPath = `${iniPath}${QAQM_INI_BACKUP_MARKER}${stamp}`
  let suffix = 1
  while (fs.existsSync(backupPath)) {
    backupPath = `${iniPath}${QAQM_INI_BACKUP_MARKER}${stamp}-${String(suffix).padStart(2, '0')}`
    suffix++
  }
  fs.copyFileSync(iniPath, backupPath)
  return backupPath
}

export function createIniBackupSnapshotForDirectory(rootDir: string): {
  stamp: string
  count: number
  errors: string[]
  backupPaths: string[]
} {
  const stamp = createIniBackupStamp()
  let count = 0
  const errors: string[] = []
  const backupPaths: string[] = []
  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (error: any) {
      errors.push(`${dir}: ${error?.message || error}`)
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      if (!entry.name.toLowerCase().endsWith('.ini')) continue
      if (isIniBackupLikeFile(entry.name)) continue
      try {
        backupPaths.push(copyIniBackupBesideFile(fullPath, stamp))
        count++
      } catch (error: any) {
        errors.push(`${fullPath}: ${error?.message || error}`)
      }
    }
  }
  walk(rootDir)
  return { stamp, count, errors, backupPaths }
}

export function summarizeIniBackupSnapshot(
  snapshot: { stamp: string; count: number; errors: string[]; backupPaths?: string[] } | null
): { stamp: string; count: number; errors: string[] } | null {
  if (!snapshot) return null
  const { backupPaths: _backupPaths, ...summary } = snapshot
  return summary
}

export function collectFixBackupFilesForMod(
  modDir: string,
  { includeWuwaIndependent = false }: { includeWuwaIndependent?: boolean } = {}
): { backups: ParsedFixBackup[]; errors: string[] } {
  const backups: ParsedFixBackup[] = []
  const errors: string[] = []

  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (error: any) {
      const relativeDir = path.relative(modDir, dir).replace(/\\/g, '/') || '.'
      errors.push(`${relativeDir}: ${error?.message || error}`)
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      const parsed = parseFixBackupFileName(entry.name, { includeWuwaIndependent })
      if (!parsed) continue
      const originalPath = path.join(dir, parsed.originalName)
      if (!isPathInsideDirectory(originalPath, modDir) || !isPathInsideDirectory(fullPath, modDir)) {
        continue
      }
      backups.push({
        ...parsed,
        backupPath: fullPath,
        originalPath,
        relativePath: path.relative(modDir, originalPath).replace(/\\/g, '/')
      })
    }
  }

  walk(modDir)
  return { backups, errors }
}

export function listIniBackupsForMod(
  modDir: string,
  { includeWuwaIndependent = false }: { includeWuwaIndependent?: boolean } = {}
): IniBackupGroup[] {
  if (!modDir || !fs.existsSync(modDir)) return []
  const scan = collectFixBackupFilesForMod(modDir, { includeWuwaIndependent })
  if (scan.errors.length > 0) {
    throw new Error(`读取备份目录失败：${scan.errors.slice(0, 3).join('；')}`)
  }
  const grouped = new Map<string, IniBackupGroup>()
  for (const backup of scan.backups) {
    if (!grouped.has(backup.stamp)) {
      grouped.set(backup.stamp, {
        stamp: backup.stamp,
        format: backup.format,
        sortKey: backup.sortKey,
        label: formatFixBackupLabel(backup),
        fileCount: 0
      })
    }
    grouped.get(backup.stamp)!.fileCount++
  }
  return Array.from(grouped.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey))
}

export function restoreIniBackupForMod(
  modDir: string,
  stamp: string,
  { includeWuwaIndependent = false }: { includeWuwaIndependent?: boolean } = {}
): IniBackupRestoreResult {
  const selectedStamp = String(stamp || '')
  if (!modDir || !fs.existsSync(modDir)) {
    throw new Error(`Mod 目录不存在: ${modDir || '空'}`)
  }
  const scan = collectFixBackupFilesForMod(modDir, { includeWuwaIndependent })
  if (scan.errors.length > 0) {
    throw new Error(`备份扫描不完整，未执行回滚：${scan.errors.slice(0, 3).join('；')}`)
  }
  const plan = buildFixBackupRestorePlan(scan.backups, selectedStamp)
  if (!plan) throw new Error('没有找到这个日期的修复备份')

  const backups = plan.restoreBackups
  const cleanupBackups = plan.cleanupBackups
  let restoredCount = 0
  const errors: string[] = []

  for (const backup of backups) {
    try {
      fs.copyFileSync(backup.backupPath, backup.originalPath)
      restoredCount++
    } catch (error: any) {
      errors.push(`${backup.relativePath}: ${error?.message || error}`)
    }
  }

  if (errors.length > 0) {
    console.warn(
      `[ini-backup] Restore failed stamp=${selectedStamp} restored=${restoredCount}/${backups.length}; backups preserved`
    )
    return {
      success: false,
      restoreSucceeded: false,
      cleanupAttempted: false,
      cleanupSucceeded: false,
      snapshotDeleted: false,
      cleanupFailed: false,
      snapshotFileCount: backups.length,
      restoredCount,
      removedBackupCount: 0,
      errors,
      cleanupErrors: [],
      backupFormat: plan.format,
      error: `回滚未完成：${errors.length} 个文件恢复失败，相关备份已保留`
    }
  }

  const cleanupErrors: string[] = []
  let removedBackupCount = 0
  for (const backup of cleanupBackups) {
    try {
      fs.unlinkSync(backup.backupPath)
      removedBackupCount++
    } catch (error: any) {
      cleanupErrors.push(`${backup.relativePath}: ${error?.message || error}`)
    }
  }

  const cleanupSucceeded = cleanupErrors.length === 0
  if (!cleanupSucceeded) {
    console.warn(
      `[ini-backup] Restore completed but cleanup failed stamp=${selectedStamp} removed=${removedBackupCount}/${cleanupBackups.length}`
    )
  }

  return {
    success: cleanupSucceeded,
    restoreSucceeded: true,
    cleanupAttempted: true,
    cleanupSucceeded,
    snapshotDeleted: cleanupSucceeded,
    cleanupFailed: !cleanupSucceeded,
    snapshotFileCount: backups.length,
    restoredCount,
    removedBackupCount,
    backupFormat: plan.format,
    errors: [],
    cleanupErrors,
    error: cleanupSucceeded ? '' : `回滚已完成，但 ${cleanupErrors.length} 个所选备份文件删除失败`
  }
}

export class IniBackupService {
  public listBackups(
    modDir: string,
    options?: { includeWuwaIndependent?: boolean }
  ): IniBackupGroup[] {
    return listIniBackupsForMod(modDir, options)
  }

  public restoreBackup(
    modDir: string,
    stamp: string,
    options?: { includeWuwaIndependent?: boolean }
  ): IniBackupRestoreResult {
    return restoreIniBackupForMod(modDir, stamp, options)
  }

  public createSnapshot(rootDir: string) {
    return createIniBackupSnapshotForDirectory(rootDir)
  }
}
