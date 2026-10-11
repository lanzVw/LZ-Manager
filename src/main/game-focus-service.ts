import { EventEmitter } from 'events'
import { spawn, ChildProcess, execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
import { GameConfig } from '../core/types'

// 游戏 ID 别名归一化映射
const GAME_ID_MAP: Record<string, string> = {
  zzz: 'zzz',
  'zenless-zone-zero': 'zzz',
  zenlesszonezero: 'zzz',

  endfield: 'endfield',
  'arknights-endfield': 'endfield',
  arknightsendfield: 'endfield',

  'wuthering-waves': 'wuthering-waves',
  wutheringwaves: 'wuthering-waves',
  wuwa: 'wuthering-waves',

  'neverness-to-everness': 'neverness-to-everness',
  nevernesstoeverness: 'neverness-to-everness',
  nte: 'neverness-to-everness',
  htgame: 'neverness-to-everness',

  'honkai-star-rail': 'honkai-star-rail',
  honkaistarrail: 'honkai-star-rail',
  starrail: 'honkai-star-rail',
  hsr: 'honkai-star-rail',

  genshin: 'genshin',
  'genshin-impact': 'genshin',
  genshinimpact: 'genshin',
  gi: 'genshin',
  gimi: 'genshin',

  honkai3: 'honkai3',
  'honkai-impact-3rd': 'honkai3',
  hi3: 'honkai3'
}

// 官方主流受支持游戏的标准主程序进程名清单
const KNOWN_GAME_PROCESSES: Record<string, string[]> = {
  zzz: ['ZenlessZoneZero.exe', 'ZZZ.exe', 'ZenlessZoneZero_Data.exe'],
  endfield: ['Endfield.exe', 'EndfieldGame.exe'],
  'wuthering-waves': ['Client-Win64-Shipping.exe', 'Wuthering Waves.exe', 'WutheringWaves.exe'],
  'neverness-to-everness': ['NTELauncher.exe', 'HTGame.exe', 'HTGame-Win64-Shipping.exe', 'NevernessToEverness.exe'],
  'honkai-star-rail': ['StarRail.exe', 'StarRailBase.exe'],
  genshin: ['YuanShen.exe', 'GenshinImpact.exe'],
  honkai3: ['BH3.exe']
}

// 游戏窗口标题关键词（用于辅助窗口匹配）
const KNOWN_GAME_TITLES: Record<string, string[]> = {
  zzz: ['绝区零', 'ZenlessZoneZero', 'Zenless Zone Zero'],
  endfield: ['明日方舟：终末地', '明日方舟终末地', '终末地', 'Endfield'],
  'wuthering-waves': ['鸣潮', 'Wuthering Waves', 'WutheringWaves'],
  'neverness-to-everness': ['异环', 'Neverness to Everness', 'NevernessToEverness'],
  'honkai-star-rail': ['崩坏：星穹铁道', '崩坏星穹铁道', '星穹铁道', 'Star Rail'],
  genshin: ['原神', 'Genshin Impact'],
  honkai3: ['崩坏3', 'Honkai Impact 3rd']
}

export interface ForegroundInfo {
  process: string
  title: string
  pid: number
  isGame: boolean
  isSelf: boolean
  matchedGame: GameConfig | null
}

export class GameFocusService extends EventEmitter {
  private helperExePath: string
  private watchProcess: ChildProcess | null = null
  private isWatching: boolean = false
  private stopping: boolean = false
  private restartAttempts: number = 0
  private restartTimer: NodeJS.Timeout | null = null
  private static MAX_RESTART_ATTEMPTS = 5
  private activeGame: GameConfig | null = null
  private games: GameConfig[] = []
  private lastForegroundInfo: ForegroundInfo = {
    process: '',
    title: '',
    pid: 0,
    isGame: false,
    isSelf: false,
    matchedGame: null
  }

  constructor(binariesDir: string) {
    super()
    this.helperExePath = path.join(binariesDir, 'GameFocusHelper.exe')
  }

  public setGames(games: GameConfig[]) {
    this.games = Array.isArray(games) ? games : []
  }

  public setActiveGame(game: GameConfig | null) {
    this.activeGame = game
  }

  public getCanonicalGameKey(id: string): string {
    if (!id) return ''
    const lower = id.toLowerCase().trim()
    return GAME_ID_MAP[lower] || lower
  }

  /**
   * 智能匹配当前进程及窗口标题对应的具体游戏配置
   */
  public findMatchingGame(processName: string, title?: string): GameConfig | null {
    if (!processName && !title) return null
    const procLower = (processName || '').toLowerCase().trim()
    const titleLower = (title || '').toLowerCase().trim()

    // 1. 最高优先级：直接精确匹配已配置游戏中的 gamePath 目标执行文件名
    for (const game of this.games) {
      if (game.gamePath) {
        const configuredExe = path.basename(game.gamePath).toLowerCase().trim()
        if (configuredExe && (procLower === configuredExe || procLower === `${configuredExe}.exe`)) {
          return game
        }
      }
    }

    // 2. 次高优先级：根据已配置游戏的 id 或规范化别名，匹配 KNOWN_GAME_PROCESSES
    if (procLower) {
      for (const game of this.games) {
        const canonicalKey = this.getCanonicalGameKey(game.id)
        if (canonicalKey && KNOWN_GAME_PROCESSES[canonicalKey]) {
          const procs = KNOWN_GAME_PROCESSES[canonicalKey]
          if (procs.some((p) => p.toLowerCase() === procLower)) {
            return game
          }
        }
      }
    }

    // 3. 第三优先级：通过窗口标题 (Title) 与游戏名称 / 关键字匹配
    if (titleLower) {
      for (const game of this.games) {
        const nameLower = (game.name || '').toLowerCase()
        const shortNameLower = (game.shortName || '').toLowerCase()
        if (nameLower && titleLower.includes(nameLower)) return game
        if (shortNameLower && shortNameLower.length >= 2 && titleLower.includes(shortNameLower)) return game

        const canonicalKey = this.getCanonicalGameKey(game.id)
        if (canonicalKey && KNOWN_GAME_TITLES[canonicalKey]) {
          if (KNOWN_GAME_TITLES[canonicalKey].some((t) => titleLower.includes(t.toLowerCase()))) {
            return game
          }
        }
      }
    }

    // 4. 第四优先级：若进程名命中了已知官方进程，但 games 配置项中的 id 稍有出入，通过别名匹配
    if (procLower) {
      for (const [key, procs] of Object.entries(KNOWN_GAME_PROCESSES)) {
        if (procs.some((p) => p.toLowerCase() === procLower)) {
          const matched = this.games.find((g) => this.getCanonicalGameKey(g.id) === key)
          if (matched) return matched
        }
      }
    }

    return null
  }

  /**
   * 判断进程名是否属于任何已知游戏
   */
  public isAnyKnownGame(processName: string): boolean {
    if (!processName) return false
    const nameLower = processName.toLowerCase().trim()
    for (const list of Object.values(KNOWN_GAME_PROCESSES)) {
      if (list.some((k) => k.toLowerCase() === nameLower)) {
        return true
      }
    }
    return false
  }

  /**
   * 列出判断"该游戏是否正在运行"时值得检查的进程名。
   * 配置里的 gamePath 对 XXMI 系游戏常常不是真正运行的进程（如鸣潮实际是
   * Client-Win64-Shipping.exe），只看它会把"正在运行"误判为"未运行"，
   * 进而吞掉本该发出的按键。
   */
  public getCandidateProcessNames(game: GameConfig | null): string[] {
    const names = new Set<string>()
    if (game) {
      if (game.gamePath) names.add(path.basename(game.gamePath))
      const canonicalKey = this.getCanonicalGameKey(game.id)
      for (const p of KNOWN_GAME_PROCESSES[canonicalKey] || []) names.add(p)
    }
    if (this.activeGame && this.activeGame.id !== game?.id) {
      const activeKey = this.getCanonicalGameKey(this.activeGame.id)
      for (const p of KNOWN_GAME_PROCESSES[activeKey] || []) names.add(p)
    }
    return Array.from(names).filter(Boolean)
  }

  /**
   * 判断指定进程是否是当前游戏（或任意已知游戏）
   */
  public isTargetGameProcess(processName: string, game?: GameConfig | null): boolean {
    if (!processName) return false
    const nameLower = processName.toLowerCase().trim()
    const targetGame = game || this.activeGame

    if (targetGame) {
      if (targetGame.gamePath) {
        const configuredExe = path.basename(targetGame.gamePath).toLowerCase().trim()
        if (configuredExe && (nameLower === configuredExe || nameLower === `${configuredExe}.exe`)) {
          return true
        }
      }
      const canonicalKey = this.getCanonicalGameKey(targetGame.id)
      if (canonicalKey && KNOWN_GAME_PROCESSES[canonicalKey]) {
        if (KNOWN_GAME_PROCESSES[canonicalKey].some((k) => k.toLowerCase() === nameLower)) {
          return true
        }
      }
    }

    const matched = this.findMatchingGame(processName)
    if (matched) return true

    return this.isAnyKnownGame(processName)
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
          isSelf: false,
          matchedGame: this.activeGame
        })
      }

      execFile(this.helperExePath, [], { windowsHide: true, timeout: 1000 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve({
            process: '',
            title: '',
            pid: 0,
            isGame: true,
            isSelf: false,
            matchedGame: this.activeGame
          })
        }

        try {
          const parsed = JSON.parse(stdout.trim())
          const procName = parsed.process || ''
          const title = parsed.title || ''
          const pid = parsed.pid || 0
          const isSelf = this.isSelfProcess(pid, procName)

          let matchedGame: GameConfig | null = null
          let isGame = false

          if (!isSelf && (procName || title)) {
            matchedGame = this.findMatchingGame(procName, title)
            isGame = !!matchedGame || this.isTargetGameProcess(procName)
          }

          if (matchedGame && (!this.activeGame || this.activeGame.id !== matchedGame.id)) {
            this.activeGame = matchedGame
            this.emit('game-change', matchedGame)
          }

          const info: ForegroundInfo = {
            process: procName,
            title,
            pid,
            isGame,
            isSelf,
            matchedGame
          }
          this.lastForegroundInfo = info
          resolve(info)
        } catch (_) {
          resolve({
            process: '',
            title: '',
            pid: 0,
            isGame: true,
            isSelf: false,
            matchedGame: this.activeGame
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

      // GameFocusHelper 未设置 Console.OutputEncoding，中文窗口标题按 ANSI/GBK(936) 写出，
      // 强行按 UTF-8 解码会产生 U+FFFD 导致标题匹配永远失败。这里按行缓存原始字节，
      // UTF-8 出现乱码时回退 GBK 解码。
      let buffer = Buffer.alloc(0)
      let gbkDecoder: TextDecoder | null = null
      try { gbkDecoder = new TextDecoder('gbk') } catch (_) { gbkDecoder = null }

      this.watchProcess.stdout?.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk])
        const lines: Buffer[] = []
        let nlIndex = buffer.indexOf(0x0a)
        while (nlIndex !== -1) {
          let line = buffer.subarray(0, nlIndex)
          if (line.length > 0 && line[line.length - 1] === 0x0d) line = line.subarray(0, line.length - 1)
          lines.push(line)
          buffer = buffer.subarray(nlIndex + 1)
          nlIndex = buffer.indexOf(0x0a)
        }

        for (const lineBuf of lines) {
          let trimmed = lineBuf.toString('utf8').trim()
          if (gbkDecoder && trimmed.startsWith('{') && trimmed.includes('\uFFFD')) {
            try {
              const gbkText = gbkDecoder.decode(lineBuf).trim()
              if (gbkText && !gbkText.includes('\uFFFD')) trimmed = gbkText
            } catch (_) {}
          }
          if (!trimmed || !trimmed.startsWith('{')) continue

          try {
            const parsed = JSON.parse(trimmed)
            const procName = parsed.process || ''
            const title = parsed.title || ''
            const pid = parsed.pid || 0
            const isSelf = this.isSelfProcess(pid, procName)

            let matchedGame: GameConfig | null = null
            let isGame = false

            if (!isSelf && (procName || title)) {
              matchedGame = this.findMatchingGame(procName, title)
              isGame = !!matchedGame || this.isTargetGameProcess(procName)
            }

            if (matchedGame && (!this.activeGame || this.activeGame.id !== matchedGame.id)) {
              this.activeGame = matchedGame
              this.emit('game-change', matchedGame)
            }

            const info: ForegroundInfo = {
              process: procName,
              title,
              pid,
              isGame,
              isSelf,
              matchedGame
            }

            this.lastForegroundInfo = info
            this.emit('focus-change', info)
          } catch (parseErr) {
            console.warn('[GameFocusService] Failed to parse helper output line:', parseErr)
          }
        }
      })

      this.watchProcess.on('error', (err) => {
        console.warn('[GameFocusService] watch process error:', err)
      })

      this.watchProcess.on('exit', () => {
        this.isWatching = false
        this.watchProcess = null
        this.scheduleRestart()
      })
    } catch (err) {
      console.warn('[GameFocusService] Failed to start watch:', err)
      this.isWatching = false
    }
  }

  /** helper 意外退出后带退避自动重启（上限内），保证前台跟随自愈 */
  private scheduleRestart() {
    if (this.stopping || this.restartTimer) return
    if (this.restartAttempts >= GameFocusService.MAX_RESTART_ATTEMPTS) {
      console.warn('[GameFocusService] helper keeps exiting, giving up after max attempts')
      return
    }
    const delay = Math.min(1000 * Math.pow(2, this.restartAttempts), 15000)
    this.restartAttempts++
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (!this.stopping && !this.isWatching) {
        console.log(`[GameFocusService] restarting watch (attempt ${this.restartAttempts})`)
        this.startWatch()
      }
    }, delay)
  }

  public stopWatch() {
    this.stopping = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
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
