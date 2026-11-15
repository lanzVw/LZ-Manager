/**
 * 市场结果 SWR 缓存（渲染进程内存）
 *
 * 为什么放在渲染层而不是主进程：SWR 要求先同步返回旧数据、再后台刷新，
 * 而 ipcRenderer.invoke 一次只回一个值，主进程无法在不新增事件通道的前提下做到
 * 「先旧后新」。渲染层的内存 Map 可与 React 状态直接配合；模块级变量在页面
 * 卸载后仍然存活，因此页签切换回来也能秒开。
 *
 * 作用域仅限本次运行（不落盘）：市场数据变化频率低，但磁盘缓存需要处理
 * 序列化、体积上限、版本失效与损坏恢复，收益不抵复杂度。
 */

export const MARKET_LIST_FRESH_MS = 60_000
export const MARKET_DETAIL_FRESH_MS = 120_000

/** 上限按「列表页 30 条 × 多个筛选组合 + 若干详情」估算，防止长会话无限增长 */
const MAX_ENTRIES = 120

export type MarketCacheEntry<T> = { data: T; at: number }

const store = new Map<string, MarketCacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

function markRecent(key: string, entry: MarketCacheEntry<unknown>): void {
  // Map 迭代顺序即插入顺序，删了再插相当于把该键移到队尾
  store.delete(key)
  store.set(key, entry)
}

export function readMarketCache<T>(key: string): MarketCacheEntry<T> | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  markRecent(key, entry)
  return entry as MarketCacheEntry<T>
}

export function writeMarketCache<T>(key: string, data: T, now = Date.now()): void {
  markRecent(key, { data, at: now })
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    store.delete(oldest)
  }
}

export function isMarketCacheFresh(
  entry: Pick<MarketCacheEntry<unknown>, 'at'> | undefined,
  maxAgeMs: number,
  now = Date.now()
): boolean {
  if (!entry) return false
  return now - entry.at <= maxAgeMs
}

/**
 * 同一 key 的并发请求只发一次：effect 重跑或快速切换筛选时，
 * 后来的调用直接复用前一个 Promise，避免把同一份数据请求两遍。
 */
export function dedupeMarketRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>

  let promise: Promise<T>
  promise = fetcher().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key)
  })
  inflight.set(key, promise)
  return promise
}

export function buildSearchCacheKey(params: {
  gameId?: string | number
  characterGbCatId?: number | string | null
  utilityMode?: boolean
  searchQuery?: string
  sort?: string
  page?: number
  perPage?: number
}): string {
  return JSON.stringify([
    params.gameId ?? '',
    params.utilityMode ?? false,
    params.characterGbCatId ?? null,
    params.searchQuery ?? '',
    params.sort ?? 'default',
    params.page ?? 1,
    params.perPage ?? 20
  ])
}

export function buildDetailCacheKey(params: {
  itemType?: string
  itemId?: number | string
  modId?: number | string
  gameId?: string | number
}): string {
  return JSON.stringify([
    params.itemType ?? 'Mod',
    params.itemId ?? params.modId ?? 0,
    params.gameId ?? ''
  ])
}

/** 仅测试使用：清空数据与在途请求记录 */
export function clearMarketCache(): void {
  store.clear()
  inflight.clear()
}
