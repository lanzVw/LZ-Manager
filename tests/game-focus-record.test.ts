import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import os from 'os'
import { GameFocusService, type ForegroundInfo } from '../src/main/game-focus-service'
import type { GameConfig } from '../src/core/types'

const GAME: GameConfig = {
  id: 'zzz',
  name: '绝区零',
  shortName: 'ZZZ',
  gamePath: 'C:\\Games\\ZZZ\\ZenlessZoneZero.exe',
  modFolderPath: 'C:\\Games\\ZZZ\\Mods',
  modLoaderPath: 'C:\\Games\\ZZZ\\d3dx.ini'
}

const service = () => new GameFocusService(path.join(os.tmpdir(), 'lz-fake-binaries'))

const info = (overrides: Partial<ForegroundInfo> = {}): ForegroundInfo => ({
  process: '',
  title: '',
  pid: 0,
  isGame: false,
  isSelf: false,
  matchedGame: null,
  ...overrides
})

describe('GameFocusService 最近前台游戏记录', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('进程名属于游戏时记录 PID', () => {
    const svc = service()
    svc.observeForeground(
      info({ process: 'ZenlessZoneZero.exe', pid: 4321, isGame: true, matchedGame: GAME })
    )
    expect(svc.getLastGameForeground()).toEqual({
      pid: 4321,
      process: 'ZenlessZoneZero.exe',
      gameId: 'zzz',
      at: Date.now()
    })
  })

  it('官方进程清单里的别名也记录', () => {
    const svc = service()
    svc.observeForeground(info({ process: 'ZZZ.exe', pid: 4321, isGame: true, matchedGame: GAME }))
    expect(svc.getLastGameForeground()?.pid).toBe(4321)
  })

  it('只靠窗口标题命中的进程不记录，避免记到浏览器 PID', () => {
    const svc = service()
    svc.observeForeground(
      info({
        process: 'chrome.exe',
        title: '绝区零 - YouTube',
        pid: 777,
        isGame: true,
        matchedGame: GAME
      })
    )
    expect(svc.getLastGameForeground()).toBeNull()
  })

  it('本应用自身与 pid 0 不记录', () => {
    const svc = service()
    svc.observeForeground(
      info({ process: 'electron.exe', pid: 100, isGame: true, isSelf: true, matchedGame: GAME })
    )
    svc.observeForeground(
      info({ process: 'ZenlessZoneZero.exe', pid: 0, isGame: true, matchedGame: GAME })
    )
    expect(svc.getLastGameForeground()).toBeNull()
  })

  it('游戏切到悬浮窗时刷新时间戳（watcher 只在窗口句柄变化时上报）', () => {
    const svc = service()
    svc.observeForeground(
      info({ process: 'ZenlessZoneZero.exe', pid: 4321, isGame: true, matchedGame: GAME })
    )
    const recordedAt = svc.getLastGameForeground()!.at

    vi.advanceTimersByTime(60_000)
    svc.observeForeground(info({ process: 'electron.exe', pid: 100, isSelf: true }))

    expect(svc.getLastGameForeground()!.at).toBe(recordedAt + 60_000)
    expect(svc.getLastGameForeground()!.pid).toBe(4321)
  })

  it('游戏切到其它应用时同样刷新时间戳', () => {
    const svc = service()
    svc.observeForeground(
      info({ process: 'ZenlessZoneZero.exe', pid: 4321, isGame: true, matchedGame: GAME })
    )
    const recordedAt = svc.getLastGameForeground()!.at

    vi.advanceTimersByTime(30_000)
    svc.observeForeground(info({ process: 'explorer.exe', pid: 9999 }))

    expect(svc.getLastGameForeground()!.at).toBe(recordedAt + 30_000)
  })

  it('换游戏时清空记录，同一个游戏重复 setActiveGame 不清空', () => {
    const svc = service()
    // 真实启动顺序：先确定激活游戏，再启动前台监听
    svc.setActiveGame(GAME)
    svc.observeForeground(
      info({ process: 'ZenlessZoneZero.exe', pid: 4321, isGame: true, matchedGame: GAME })
    )

    svc.setActiveGame(GAME)
    expect(svc.getLastGameForeground()?.pid).toBe(4321)

    svc.setActiveGame({ ...GAME, id: 'wuwa', name: '鸣潮' })
    expect(svc.getLastGameForeground()).toBeNull()
  })

  it('clearLastGameForeground 主动清空', () => {
    const svc = service()
    svc.observeForeground(
      info({ process: 'ZenlessZoneZero.exe', pid: 4321, isGame: true, matchedGame: GAME })
    )
    svc.clearLastGameForeground()
    expect(svc.getLastGameForeground()).toBeNull()
  })
})
