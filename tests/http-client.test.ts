import { describe, it, expect, afterEach, vi } from 'vitest'
import { setHttpFetch, getHttpFetch } from '../src/core/http-client'

/**
 * 回归来源：市场在直连网络下加载慢、且完全不跟随 Windows 系统代理。
 * 根因是 core 层直接用 Node 全局 fetch（undici）：不读系统代理、只走 HTTP/1.1。
 * 改为主进程注入 Electron net.fetch 后，这两个能力才生效。
 *
 * 这里只锁住注入契约，避免后续重构把注入点绕过、悄悄退回 undici。
 */

afterEach(() => {
  setHttpFetch(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('http-client 注入点', () => {
  it('未注入时回退到全局 fetch，且每次调用都重新取值', async () => {
    const first = vi.fn(async () => new Response('a'))
    vi.stubGlobal('fetch', first)
    await getHttpFetch()('https://example.com/1')
    expect(first).toHaveBeenCalledTimes(1)

    // 为什么必须重新取值：单测用 vi.stubGlobal 换实现，模块加载时固化引用会取到真实网络
    const second = vi.fn(async () => new Response('b'))
    vi.stubGlobal('fetch', second)
    const res = await getHttpFetch()('https://example.com/2')
    expect(second).toHaveBeenCalledTimes(1)
    expect(await res.text()).toBe('b')
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('注入后优先使用注入实现，不再触碰全局 fetch', async () => {
    const globalFetch = vi.fn(async () => new Response('global'))
    vi.stubGlobal('fetch', globalFetch)

    const injected = vi.fn(async () => new Response('injected'))
    setHttpFetch(injected)

    const res = await getHttpFetch()('https://example.com/x', { method: 'GET' })
    expect(await res.text()).toBe('injected')
    expect(injected).toHaveBeenCalledWith('https://example.com/x', { method: 'GET' })
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('传 null 可以撤销注入，回到全局 fetch', async () => {
    const injected = vi.fn(async () => new Response('injected'))
    setHttpFetch(injected)
    setHttpFetch(null)

    const globalFetch = vi.fn(async () => new Response('global'))
    vi.stubGlobal('fetch', globalFetch)

    const res = await getHttpFetch()('https://example.com/y')
    expect(await res.text()).toBe('global')
    expect(injected).not.toHaveBeenCalled()
  })
})
