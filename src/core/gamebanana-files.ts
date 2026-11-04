/**
 * GameBanana 多文件 Mod 的主文件判定。
 *
 * 同一个 Mod 页面可能同时挂着主文件、实验版、汉化修复工具、示例包和演示包。
 * 更新检测与「最新发布」标记都只能围绕主文件做，不能简单取 files[0]：
 * 作者后补一个工具包后，files[0] 会变成工具，本地明明是最新主文件也会被误报更新。
 */

export interface GameBananaFileLike {
  fileName?: string | null
  description?: string | null
  dateAdded?: number | null
  isArchived?: boolean | null
}

const MAIN_FILE_PATTERN = /\bmain\s*(file|mod|download)\b/i
const AUXILIARY_FILE_PATTERN =
  /(tool|fixer|example|demo|experimental|test|sample|showcase|template|converter|patch)/i

/** 版本号归一：去 v 前缀、去「版」、去首尾空白、小写 */
export function normalizeVersionToken(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/^[vV]/, '')
    .replace(/版$/, '')
    .trim()
    .toLowerCase()
}

/** "2.8 | 4.6E4" -> ["2.8", "4.6e4"]；作者常把主文件与实验版写在同一字段 */
export function splitVersionTokens(value: unknown): string[] {
  return String(value || '')
    .split(/[|/,;]+|\s+/)
    .map(normalizeVersionToken)
    .filter(Boolean)
}

/** 本地版本命中线上版本的任意 token 即视为同一版本 */
export function versionsMatch(localVersion: string, remoteVersion: string): boolean {
  const local = normalizeVersionToken(localVersion)
  if (!local) return false
  return splitVersionTokens(remoteVersion).some((token) => token === local)
}

/** 组合版本串里的第一个 token 通常对应主文件（如 "2.8 | 4.6E4" 的 2.8） */
export function mainVersionToken(value: unknown): string {
  return splitVersionTokens(value)[0] || ''
}

/** 描述里明确写 Main File 的才是主文件 */
export function isMainGameBananaFile(file: GameBananaFileLike | null | undefined): boolean {
  if (!file) return false
  return MAIN_FILE_PATTERN.test(String(file.description || ''))
}

/**
 * 选主文件：
 * 1. 优先描述含 "Main File" 的文件；有多份时取发布时间最新的一份（作者重传会留下旧主文件）
 * 2. 没有明确标记时，排除工具/示例/演示/实验性文件，取剩余文件里最新的一份
 * 3. 仍然没有时退回全部文件里最新的一份
 */
export function pickMainGameBananaFile<T extends GameBananaFileLike>(
  files: T[] | null | undefined
): T | null {
  const list = Array.isArray(files) ? files.filter(Boolean) : []
  if (list.length === 0) return null

  const active = list.filter((file) => !file.isArchived)
  const pool = active.length > 0 ? active : list

  const newest = (items: T[]): T =>
    items.reduce((best, file) => ((file.dateAdded || 0) > (best.dateAdded || 0) ? file : best), items[0])

  const mainFiles = pool.filter(isMainGameBananaFile)
  if (mainFiles.length > 0) return newest(mainFiles)

  const plainFiles = pool.filter(
    (file) => !AUXILIARY_FILE_PATTERN.test(`${file.description || ''} ${file.fileName || ''}`)
  )
  return newest(plainFiles.length > 0 ? plainFiles : pool)
}
