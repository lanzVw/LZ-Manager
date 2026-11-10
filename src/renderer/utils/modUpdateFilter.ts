import { samePath } from './mods-patch'

export type ModsUpdatesMap = Record<string, any>

/**
 * 更新检查结果只存在内存里，而「可更新」筛选标记会被 App 快照跨页面保留。
 * 结果缺失时必须认为筛选失效，否则列表会永久为空，且按钮随计数归零一起消失、无从关闭。
 */
export function resolveUpdateFilter(updateFilterOnly: boolean, updatesCount: number): boolean {
  return Boolean(updateFilterOnly) && updatesCount > 0
}

/** 安装/更新成功后剔除对应记录；按路径归一比较，避免斜杠方向与 Windows 大小写不一致时漏删 */
export function omitUpdateEntry(
  updatesMap: ModsUpdatesMap,
  fullPath?: string | null
): ModsUpdatesMap {
  if (!updatesMap || !fullPath) return updatesMap
  const key = Object.keys(updatesMap).find((k) => samePath(k, fullPath))
  if (!key) return updatesMap
  const next = { ...updatesMap }
  delete next[key]
  return next
}
