import type { ModInstallTarget } from '../../core/types'

// 市场安装命中的本地副本集合（existing 为启用优先的那份，duplicates 为其余同源副本）
export interface GameBananaInstalledTarget {
  existing: ModInstallTarget
  duplicates: ModInstallTarget[]
}

/**
 * GameBanana 文件名带随机后缀，重传必然改名，因此安装时写入 mod.json 的 version
 * 就是「这一份文件」的稳定身份；比较时大小写与首尾空格不敏感，与 evaluateUpdate 保持一致。
 */
export const normalizeGameBananaVersion = (value?: string | null): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

export const collectInstalledVersions = (
  target?: GameBananaInstalledTarget | null
): ReadonlySet<string> => {
  const versions = new Set<string>()
  if (!target?.existing) return versions
  for (const copy of [target.existing, ...(Array.isArray(target.duplicates) ? target.duplicates : [])]) {
    const version = normalizeGameBananaVersion(copy?.version)
    if (version) versions.add(version)
  }
  return versions
}

// installedVersions 必须是 collectInstalledVersions 产出的归一集合（小写、去空格）
export const isGameBananaFileInstalled = (
  fileName: string | null | undefined,
  installedVersions: ReadonlySet<string>
): boolean => {
  const normalized = normalizeGameBananaVersion(fileName)
  return normalized !== '' && installedVersions.has(normalized)
}

// 找到「该文件名对应的那一份本地副本」；可能不是 existing（多副本且版本不同）
export const findInstalledCopyByVersion = (
  target: GameBananaInstalledTarget | null | undefined,
  fileName?: string | null
): ModInstallTarget | null => {
  const normalized = normalizeGameBananaVersion(fileName)
  if (!normalized || !target?.existing) return null
  const copies = [target.existing, ...(Array.isArray(target.duplicates) ? target.duplicates : [])]
  return copies.find((copy) => normalizeGameBananaVersion(copy?.version) === normalized) || null
}

/**
 * 覆盖安装的落点由 modId 决定，角色只影响「预检失效时的新建落点」；
 * 从本地目录反推角色，避免点「已安装」时再弹一次角色选择器。
 */
export const characterNameFromInstallTarget = (
  target?: ModInstallTarget | null
): string | null => {
  const fullPath = typeof target?.fullPath === 'string' ? target.fullPath.trim() : ''
  if (!fullPath) return null
  const parts = fullPath.split(/[\\/]+/).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 2] : null
}

/**
 * 安装前预检 / 抽屉打开时的已安装态查询：旧版 preload 没有该方法或主进程异常时
 * 一律返回 null，让调用方静默按「未安装」处理，绝不因为预检失败挡住安装。
 */
export const inspectInstalledTarget = async (
  modId?: number | string | null
): Promise<GameBananaInstalledTarget | null> => {
  const id = Number(modId)
  if (!Number.isInteger(id) || id <= 0) return null
  try {
    // 旧版 preload 没有这个方法，typeof 守卫让降级路径不依赖类型声明
    const api = window.flairx as any
    if (!api || typeof api.inspectInstalledGameBananaMod !== 'function') return null
    const res = await api.inspectInstalledGameBananaMod(id)
    const existing: ModInstallTarget | null = res?.existing || null
    if (!existing) return null
    return {
      existing,
      duplicates: Array.isArray(res?.duplicates) ? res.duplicates : []
    }
  } catch (err: any) {
    console.warn('[GameBanana] 预检本地同源 Mod 失败，按普通安装继续:', err?.message || err)
    return null
  }
}
