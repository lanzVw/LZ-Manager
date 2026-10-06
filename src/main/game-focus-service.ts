import { EventEmitter } from 'events'
import { spawn, ChildProcess, execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
import { GameConfig } from '../core/types'

// 官方主流受支持游戏的标准主程序进程名清单
const KNOWN_GAME_PROCESSES: Record<string, string[]> = {
  zzz: ['ZenlessZoneZero.exe', 'ZZZ.exe', 'ZenlessZoneZero_Data.exe'],
  endfield: ['Endfield.exe', 'EndfieldGame.exe'],
  wuwa: ['Client-Win64-Shipping.exe', 'Wuthering Waves.exe', 'WutheringWaves.exe'],
  genshin: ['YuanShen.exe', 'GenshinImpact.exe'],
  starrail: ['StarRail.exe'],
  honkai3: ['BH3.exe']
}

export interface ForegroundInfo {
  process: string
  title: string
  pid: number
  isGame: boolean
  isSelf: boolean
}

export class GameFocusService extends EventEmitter {
  private helperExePath: string
  private watchProcess: ChildProcess | null = null
  private isWatching: boolean = false
  private activeGame: GameConfig | null = null
  private lastForegroundInfo: ForegroundInfo = {
    process: '',
    title: '',
    pid: 0,
    isGame: false,
    isSelf: false
  }

  constructor(binariesDir: string) {
    super()
    this.helperExePath = path.join(binariesDir, 'GameFocusHelper.exe')
  }

  public setActiveGame(game: GameConfig | null) {
    this.activeGame = game
  }

  /**
   * 判断指定进程是否是当前游戏（或任意已知游戏）
   */
  public isTargetGameProcess(processName: string, game?: GameConfig | null): boolean {
    if (!processName) return false
    const nameLower = processName.toLowerCase()
    const targetGame = game || this.activeGame

    // 1. 优先匹配当前配置的 gamePath
    if (targetGame && targetGame.gamePath) {
      const configuredExe = path.basename(targetGame.gamePath).toLowerCase()
      if (configuredExe && (nameLower === configuredExe || nameLower === `${configuredExe}.exe`)) {
        return true
      }
    }

    // 2. 匹配当前游戏对应的内置官方执行文件名
    if (targetGame && targetGame.id && KNOWN_GAME_PROCESSES[targetGame.id]) {
      const knownList = KNOWN_GAME_PROCESSES[targetGame.id]
      if (knownList.some((k) => k.toLowerCase() === nameLower)) {
        return true
      }
    }

    // 3. 宽松模式：若当前游戏未匹配到，比对全部受支持的游戏主程序列表
    for (const list of Object.values(KNOWN_GAME_PROCESSES)) {
      if (list.some((k) => k.toLowerCase() === nameLower)) {
        return true
      }
    }

    return false
  }

  /**
   * 判断是否是本应用自身（主窗口、悬浮窗）
   */
  public isSelfProcess(pid: number, processName: string): boolean {
    if (pid && pid === process.pid) return true
    if (!processName) return false
    const n = processName.toLowerCase()
    return n.includes('electron') || n.includes('lz-manager') || n.includes('lz manager') || n.includes('qaqmanager')
  }

  /**
   * 单次同步获取当前系统前台窗口信息
   */
  public async getForegroundProcess(): Promise<ForegroundInfo> {
    return new Promise((resolve) => {
      if (!fs.existsSync(this.helperExePath)) {
        return resolve({
          process: '',
          title: '',
          pid: 0,
          isGame: true, // 降级兜底：无 helper 时不阻断
          isSelf: false
        })
      }

      execFile(this.helperExePath, [], { windowsHide: true, timeout: 1000 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve({
            process: '',
            title: '',
            pid: 0,
            isGame: true,
            isSelf: false
          })
        }

        try {
          const parsed = JSON.parse(stdout.trim())
          const procName = parsed.process || ''
          const pid = parsed.pid || 0
          const isGame = this.isTargetGameProcess(procName)
          const isSelf = this.isSelfProcess(pid, procName)

          const info: ForegroundInfo = {
            process: procName,
            title: parsed.title || '',
            pid,
            isGame,
            isSelf
          }
          this.lastForegroundInfo = info
          resolve(info)
        } catch (_) {
          resolve({
            process: '',
            title: '',
            pid: 0,
            isGame: true,
            isSelf: false
          })
        }
      })
    })
  }

  /**
   * 启动前台窗口持续监听（低开销事件流驱动）
   */
  public startWatch() {
    if (this.isWatching || !fs.existsSync(this.helperExePath)) {
      return
    }

    try {
      this.watchProcess = spawn(this.helperExePath, ['--watch'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      })

      this.isWatching = true

      let buffer = ''
      this.watchProcess.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('{')) continue

          try {
            const parsed = JSON.parse(trimmed)
            const procName = parsed.process || ''
            const pid = parsed.pid || 0
            const isGame = this.isTargetGameProcess(procName)
            const isSelf = this.isSelfProcess(pid, procName)

            const info: ForegroundInfo = {
              process: procName,
              title: parsed.title || '',
              pid,
              isGame,
              isSelf
            }

            this.lastForegroundInfo = info
            this.emit('focus-change', info)
          } catch (_) {}
        }
      })

      this.watchProcess.on('exit', () => {
        this.isWatching = false
        this.watchProcess = null
      })
    } catch (err) {
      console.warn('[GameFocusService] Failed to start watch:', err)
      this.isWatching = false
    }
  }

  public stopWatch() {
    if (this.watchProcess) {
      try {
        this.watchProcess.kill()
      } catch (_) {}
      this.watchProcess = null
    }
    this.isWatching = false
  }

  public getLastInfo(): ForegroundInfo {
    return this.lastForegroundInfo
  }
}
