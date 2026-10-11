/**
 * 向游戏派发按键前的准入判定。
 *
 * 抽成纯函数是因为按键发出去就收不回来。历史 bug：游戏进程不存在时，
 * ReloadHelper 找不到游戏窗口便降级为"盲发全局按键"，落到当时的前台窗口上——
 * 而那个窗口正是悬浮窗，它自己又监听了 F10 热刷新，于是自己发、自己收，
 * 每轮约百毫秒无限自激。
 */

/** 一次刷新派发后，多长时间内忽略再次的用户刷新，避免吞掉自己的按键回声（毫秒） */
export const KEY_ECHO_GUARD_MS = 450

export type KeyDispatchVerdict = 'dispatch' | 'no_game' | 'game_not_running' | 'echo_suppressed'

export interface KeyDispatchInput {
  /** 是否配置了游戏可执行文件路径；无路径则连进程是否在运行都无从判断 */
  hasGamePath: boolean
  /** 游戏进程当前是否在运行 */
  gameRunning: boolean
  /** 是否启用按键回声守卫（仅"热刷新"这类无参派发需要，见下） */
  applyEchoGuard: boolean
  /** 距离上一次派发过去了多少毫秒 */
  msSinceLastDispatch: number
  echoGuardMs?: number
}

/**
 * 注意回声守卫只对"无参热刷新"启用：多档位切换会在一百毫秒内连发同一个按键，
 * 若对它生效会把正常的连按全部丢掉。
 */
export function evaluateKeyDispatch(input: KeyDispatchInput): KeyDispatchVerdict {
  if (!input.hasGamePath) return 'no_game'
  if (!input.gameRunning) return 'game_not_running'
  if (input.applyEchoGuard && input.msSinceLastDispatch < (input.echoGuardMs ?? KEY_ECHO_GUARD_MS)) {
    return 'echo_suppressed'
  }
  return 'dispatch'
}

/**
 * d3dx.ini 的 check_foreground_window 决定 3DMigoto 是否只在前台处理按键：
 * 为 1 时必须让 ReloadHelper 抢占游戏前台，否则按键被丢弃；为 0 时全局击键即可生效。
 * 后者走免抢前台的派发路径，从悬浮窗调值时指针焦点不会被夺走。
 */
export function parseRequiresForegroundInput(d3dxIniContent: string): boolean {
  const m = /^[ \t]*check_foreground_window[ \t]*=[ \t]*(\d+)/im.exec(d3dxIniContent || '')
  if (!m) return true
  return m[1] !== '0'
}

/** 渲染层传回的进程名只允许是裸文件名，不能带路径层级 */
export function sanitizeProcessName(raw: string): string {
  const name = String(raw || '').trim()
  if (!name || /[\\/]/.test(name)) return ''
  return name
}
