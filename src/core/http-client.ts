/**
 * 全局网络实现注入点。
 *
 * 为什么不让 core 直接 import electron：
 * 1. core 层要在 vitest 里脱离 Electron 运行，直接依赖 electron 会让整批单测跑不起来；
 * 2. Node 自带的 fetch（undici）不读 Windows 系统代理、只走 HTTP/1.1，
 *    而 Electron 主进程的 net.fetch 走 Chromium 网络栈——自动跟随系统代理/PAC、
 *    支持 HTTP/2 多路复用与连接复用、自动协商 br/zstd。
 *    国内大量用户靠 Clash/v2ray 的「系统代理」模式上网，换成 net.fetch 后
 *    他们的市场请求才会自动走代理，不需要额外的设置项。
 *
 * 因此 main 在 app ready 后注入 net.fetch；单测与脱离 Electron 的场景继续用全局 fetch。
 */

export type FetchLike = (input: string, init?: any) => Promise<Response>

let injectedFetch: FetchLike | null = null

export function setHttpFetch(fetchImpl: FetchLike | null): void {
  injectedFetch = fetchImpl
}

/**
 * 取当前可用的 fetch 实现。
 *
 * 为什么兜底要走一层箭头函数而不是直接返回 globalThis.fetch 的引用：
 * 单测用 vi.stubGlobal('fetch', …) 替换全局实现，模块加载时就固化引用会取到真实网络。
 */
export function getHttpFetch(): FetchLike {
  if (injectedFetch) return injectedFetch
  return (input: string, init?: any) => (globalThis.fetch as FetchLike)(input, init)
}
