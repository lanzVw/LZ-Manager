import type { ModDetailedInfo, ModItem, ToggleModResult } from '../../core/types'

/**
 * 切换 Mod 后只改目录名的 DISABLED_ 前缀，内容与元数据都不变。
 * 这里用纯函数把结果补丁到现有列表，避免每次切换都全量 scanMods。
 */

export interface ModRename {
  oldFullPath: string
  newFullPath: string
  enabled: boolean
}

const normalizePath = (p: string): string => String(p || '').replace(/\//g, '\\').toLowerCase()

const basename = (p: string): string => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || ''

export const samePath = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (!a || !b) return false
  return normalizePath(a) === normalizePath(b)
}

/**
 * 把 oldRoot 前缀替换为 newRoot，保留原路径剩余部分的大小写与分隔符。
 * Windows 路径大小写不敏感，比较时统一小写，但返回时必须保留原文件名。
 */
export const remapPathPrefix = (p: string, oldRoot: string, newRoot: string): string => {
  if (!p || !oldRoot || !newRoot) return p
  const normalizedOld = String(oldRoot).replace(/\//g, '\\').replace(/\\+$/, '')
  const normalizedP = String(p).replace(/\//g, '\\')
  if (!normalizedOld) return p
  if (normalizedP.toLowerCase() === normalizedOld.toLowerCase()) return newRoot

  const prefix = `${normalizedOld}\\`
  if (!normalizedP.toLowerCase().startsWith(prefix.toLowerCase())) return p
  // prefix.length - 1 指向原字符串里的分隔符，连同后缀一起拼接，避免丢掉目录分隔符
  return newRoot.replace(/[\\/]+$/, '') + String(p).slice(prefix.length - 1)
}

/** 乐观更新：跨桶按 fullPath 找目标，不再依赖 raw characterName 与 canonical 桶键一致 */
export const setModEnabledByFullPath = <T extends ModItem>(
  modsData: Record<string, T[]>,
  fullPath: string,
  enabled: boolean
): Record<string, T[]> | null => {
  for (const [bucketKey, items] of Object.entries(modsData)) {
    const index = items.findIndex((item) => samePath(item.fullPath, fullPath))
    if (index === -1) continue
    if (items[index].enabled === enabled) return modsData
    const nextItems = items.slice()
    nextItems[index] = { ...items[index], enabled }
    return { ...modsData, [bucketKey]: nextItems }
  }
  return null
}

/** 拼出本次切换涉及的所有目录改名：目标在前，Option-A 自动停用的兄弟在后 */
export const buildToggleRenames = (
  oldFullPath: string,
  result: Pick<ToggleModResult, 'newFullPath' | 'disabledSiblings'>,
  enabled: boolean
): ModRename[] => {
  const renames: ModRename[] = []
  const seen = new Set<string>()
  const push = (oldPath: string, newPath: string, nextEnabled: boolean) => {
    if (!oldPath || !newPath) return
    const key = normalizePath(oldPath)
    if (seen.has(key)) return
    seen.add(key)
    renames.push({ oldFullPath: oldPath, newFullPath: newPath, enabled: nextEnabled })
  }

  if (result.newFullPath) push(oldFullPath, result.newFullPath, enabled)
  for (const sibling of result.disabledSiblings || []) {
    push(sibling.oldFullPath, sibling.newFullPath, false)
  }
  return renames
}

export const applyRenameToItem = <T extends ModItem>(item: T, rename: ModRename): T => {
  const folderName = basename(rename.newFullPath)
  let name = folderName
  // 与 scanMods 一致：循环剥掉历史半失败留下的 DISABLED_ 双前缀
  while (name.startsWith('DISABLED_')) {
    name = name.slice('DISABLED_'.length)
  }
  if (!name) name = folderName

  return {
    ...item,
    enabled: rename.enabled,
    name,
    folderName,
    fullPath: rename.newFullPath,
    // 封面与预览图都在 Mod 目录内，目录改名后必须同步前缀，否则 file:// 图片会 404
    coverPath: item.coverPath
      ? remapPathPrefix(item.coverPath, rename.oldFullPath, rename.newFullPath)
      : item.coverPath,
    previewImages: item.previewImages.map((p) =>
      remapPathPrefix(p, rename.oldFullPath, rename.newFullPath)
    )
  }
}

/** 未命中任何条目时返回原对象，调用方可用引用相等判断是否需要回退扫描 */
export const applyModRenames = <T extends ModItem>(
  modsData: Record<string, T[]>,
  renames: ModRename[]
): Record<string, T[]> => {
  if (renames.length === 0) return modsData

  const byOldPath = new Map<string, ModRename>()
  for (const rename of renames) byOldPath.set(normalizePath(rename.oldFullPath), rename)

  let changed = false
  const next: Record<string, T[]> = {}
  for (const [bucketKey, items] of Object.entries(modsData)) {
    let bucketChanged = false
    const nextItems = items.map((item) => {
      const rename = byOldPath.get(normalizePath(item.fullPath))
      if (!rename) return item
      bucketChanged = true
      changed = true
      return applyRenameToItem(item, rename)
    })
    next[bucketKey] = bucketChanged ? nextItems : items
  }
  return changed ? next : modsData
}

/** markedMods 以 fullPath 为 key；目录改名后必须把旧 key 迁到新 key 并同步 localStorage */
export const remapMarkedMods = (
  marked: Record<string, boolean>,
  renames: ModRename[]
): Record<string, boolean> => {
  const byOldPath = new Map<string, ModRename>()
  for (const rename of renames) byOldPath.set(normalizePath(rename.oldFullPath), rename)

  let next: Record<string, boolean> | null = null
  for (const [key, value] of Object.entries(marked)) {
    const rename = byOldPath.get(normalizePath(key))
    if (!rename) continue
    if (!next) next = { ...marked }
    delete next[key]
    // 两个旧 key 撞到同一个新 key 时 true 优先
    next[rename.newFullPath] = value || next[rename.newFullPath] === true
  }
  return next || marked
}

/** 详情抽屉里的绝对路径同样要跟随目录改名，否则改持久化数值会写到死路径 */
export const remapModDetailsPaths = (
  details: ModDetailedInfo,
  oldRoot: string,
  newRoot: string
): ModDetailedInfo => {
  const remap = (p: string) => remapPathPrefix(p, oldRoot, newRoot)
  return {
    ...details,
    fullPath: remap(details.fullPath),
    coverPath: details.coverPath ? remap(details.coverPath) : details.coverPath,
    images: details.images.map((img) => ({ ...img, path: remap(img.path) })),
    iniFiles: details.iniFiles.map((ini) => ({ ...ini, fullPath: remap(ini.fullPath) })),
    baseModInfo: details.baseModInfo
      ? {
          ...details.baseModInfo,
          shaderCache: {
            ...details.baseModInfo.shaderCache,
            activePath: details.baseModInfo.shaderCache.activePath
              ? remap(details.baseModInfo.shaderCache.activePath)
              : details.baseModInfo.shaderCache.activePath,
            templatePath: details.baseModInfo.shaderCache.templatePath
              ? remap(details.baseModInfo.shaderCache.templatePath)
              : details.baseModInfo.shaderCache.templatePath
          }
        }
      : details.baseModInfo
  }
}
