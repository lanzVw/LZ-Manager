import { describe, it, expect } from 'vitest'
import {
  evaluateKeyDispatch,
  parseRequiresForegroundInput,
  sanitizeProcessName,
  KEY_ECHO_GUARD_MS,
  type KeyDispatchInput
} from '../src/core/hotkey-dispatch'

const base: KeyDispatchInput = {
  hasGamePath: true,
  gameRunning: true,
  applyEchoGuard: true,
  msSinceLastDispatch: Number.POSITIVE_INFINITY
}

describe('evaluateKeyDispatch', () => {
  it('正常情形放行', () => {
    expect(evaluateKeyDispatch(base)).toBe('dispatch')
  })

  it('游戏未运行时不放行，避免盲发的全局按键落到任意前台窗口', () => {
    expect(evaluateKeyDispatch({ ...base, gameRunning: false })).toBe('game_not_running')
  })

  it('未配置游戏路径时不放行', () => {
    expect(evaluateKeyDispatch({ ...base, hasGamePath: false })).toBe('no_game')
  })

  it('热刷新落在上一次派发的回声窗口内时被抑制（断掉自激回环）', () => {
    expect(evaluateKeyDispatch({ ...base, msSinceLastDispatch: KEY_ECHO_GUARD_MS - 1 })).toBe('echo_suppressed')
    expect(evaluateKeyDispatch({ ...base, msSinceLastDispatch: 0 })).toBe('echo_suppressed')
  })

  it('超过回声窗口后热刷新恢复', () => {
    expect(evaluateKeyDispatch({ ...base, msSinceLastDispatch: KEY_ECHO_GUARD_MS })).toBe('dispatch')
  })

  it('走循环切换的连按不受回声窗口影响（applyEchoGuard=false）', () => {
    expect(evaluateKeyDispatch({ ...base, applyEchoGuard: false, msSinceLastDispatch: 0 })).toBe('dispatch')
  })

  it('未运行游戏优先于回声抑制返回，便于调用方区分提示文案', () => {
    expect(
      evaluateKeyDispatch({ ...base, gameRunning: false, msSinceLastDispatch: 0, applyEchoGuard: true })
    ).toBe('game_not_running')
  })
})

describe('parseRequiresForegroundInput', () => {
  it('check_foreground_window = 0 时不必抢前台', () => {
    expect(parseRequiresForegroundInput('[System]\ncheck_foreground_window = 0\n')).toBe(false)
  })

  it('等号两侧无空格同样识别', () => {
    expect(parseRequiresForegroundInput('check_foreground_window=0')).toBe(false)
  })

  it('= 1 时需要抢前台', () => {
    expect(parseRequiresForegroundInput('check_foreground_window = 1')).toBe(true)
  })

  it('注释中的同名字样不参与匹配', () => {
    const ini = '; Only enable key input processing when the game is in the foreground:\ncheck_foreground_window = 0\n'
    expect(parseRequiresForegroundInput(ini)).toBe(false)
  })

  it('缺少该配置时保守认为需要抢前台', () => {
    expect(parseRequiresForegroundInput('[System]\nhunting = 0\n')).toBe(true)
    expect(parseRequiresForegroundInput('')).toBe(true)
  })
})

describe('sanitizeProcessName', () => {
  it('接受裸文件名', () => {
    expect(sanitizeProcessName('ZenlessZoneZero.exe')).toBe('ZenlessZoneZero.exe')
  })

  it('拒绝带路径层级的输入', () => {
    expect(sanitizeProcessName('..\\..\\Windows\\System32\\cmd.exe')).toBe('')
    expect(sanitizeProcessName('C:/Windows/notepad.exe')).toBe('')
  })

  it('拒绝空值', () => {
    expect(sanitizeProcessName('')).toBe('')
    expect(sanitizeProcessName('   ')).toBe('')
  })
})
