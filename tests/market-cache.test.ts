import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildDetailCacheKey,
  buildSearchCacheKey,
  clearMarketCache,
  dedupeMarketRequest,
  isMarketCacheFresh,
  readMarketCache,
  writeMarketCache
} from '../src/renderer/utils/marketCache'

beforeEach(() => {
  clearMarketCache()
})

describe('市场 SWR 缓存：读写与新鲜度', () => {
  it('写入后能读回原始数据和时间戳', () => {
    writeMarketCache('k', { records: [1, 2] }, 1000)
    const entry = readMarketCache<{ records: number[] }>('k')
    expect(entry?.data).toEqual({ records: [1, 2] })
    expect(entry?.at).toBe(1000)
  })

  it('未命中返回 undefined', () => {
    expect(readMarketCache('missing')).toBeUndefined()
  })

  it('新鲜度按 maxAge 判定，边界值视为新鲜', () => {
    expect(isMarketCacheFresh({ at: 1000 }, 60_000, 61_000)).toBe(true)
    expect(isMarketCacheFresh({ at: 1000 }, 60_000, 61_001)).toBe(false)
    expect(isMarketCacheFresh(undefined, 60_000, 1000)).toBe(false)
  })

  it('超过 120 条时淘汰最久未使用的条目', () => {
    for (let i = 0; i < 121; i++) writeMarketCache(`key-${i}`, i, i)
    expect(readMarketCache('key-0')).toBeUndefined()
    expect(readMarketCache('key-1')).toBeDefined()
    expect(readMarketCache('key-120')).toBeDefined()
  })

  it('读取会把条目移到队尾，避免热数据被淘汰', () => {
    for (let i = 0; i < 120; i++) writeMarketCache(`key-${i}`, i, i)
    // 读取 key-0 使其变热，再写入一条触发淘汰
    expect(readMarketCache('key-0')).toBeDefined()
    writeMarketCache('key-new', 999, 999)
    expect(readMarketCache('key-0')).toBeDefined()
    // 真正最旧的 key-1 被淘汰
    expect(readMarketCache('key-1')).toBeUndefined()
  })
})

describe('市场 SWR 缓存：并发去重', () => {
  it('同一 key 的并发请求只执行一次，两个调用拿到同一结果', async () => {
    const fetcher = vi.fn(async () => ({ ok: 1 }))
    const [a, b] = await Promise.all([
      dedupeMarketRequest('same', fetcher),
      dedupeMarketRequest('same', fetcher)
    ])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(a).toEqual({ ok: 1 })
    expect(b).toEqual({ ok: 1 })
  })

  it('不同 key 互不影响', async () => {
    const f1 = vi.fn(async () => 'a')
    const f2 = vi.fn(async () => 'b')
    const [a, b] = await Promise.all([
      dedupeMarketRequest('k1', f1),
      dedupeMarketRequest('k2', f2)
    ])
    expect(a).toBe('a')
    expect(b).toBe('b')
    expect(f1).toHaveBeenCalledTimes(1)
    expect(f2).toHaveBeenCalledTimes(1)
  })

  it('请求结束后清空在途记录，下次调用重新回源', async () => {
    const fetcher = vi.fn(async () => 'v')
    await dedupeMarketRequest('once', fetcher)
    await dedupeMarketRequest('once', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('请求失败后同样清空在途记录，不会永久复用失败 Promise', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok')
    await expect(dedupeMarketRequest('fail-once', fetcher)).rejects.toThrow('boom')
    await expect(dedupeMarketRequest('fail-once', fetcher)).resolves.toBe('ok')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('市场 SWR 缓存：键构造', () => {
  it('搜索键对每个影响结果的字段敏感', () => {
    const base = {
      gameId: 'genshin',
      characterGbCatId: null,
      searchQuery: '',
      sort: 'Generic_Newest',
      page: 1,
      perPage: 30
    }
    expect(buildSearchCacheKey(base)).toBe(buildSearchCacheKey({ ...base }))
    expect(buildSearchCacheKey(base)).not.toBe(buildSearchCacheKey({ ...base, page: 2 }))
    expect(buildSearchCacheKey(base)).not.toBe(buildSearchCacheKey({ ...base, sort: 'Generic_MostLiked' }))
    expect(buildSearchCacheKey(base)).not.toBe(
      buildSearchCacheKey({ ...base, characterGbCatId: 30579 })
    )
  })

  it('详情键兼容 itemId / modId 两种写法', () => {
    expect(buildDetailCacheKey({ itemType: 'Mod', modId: 123, gameId: 'zzz' })).toBe(
      buildDetailCacheKey({ itemType: 'Mod', itemId: 123, gameId: 'zzz' })
    )
    expect(buildDetailCacheKey({ itemId: 123, gameId: 'zzz' })).not.toBe(
      buildDetailCacheKey({ itemId: 124, gameId: 'zzz' })
    )
  })
})
