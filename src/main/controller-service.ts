import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'

export class ControllerService extends EventEmitter {
  private helperProcess: ChildProcess | null = null
  private scriptPath: string
  private isRunning: boolean = false
  private restartAttempts: number = 0
  private restartTimer: NodeJS.Timeout | null = null
  private static MAX_RESTART_ATTEMPTS = 5

  constructor(binariesDir: string) {
    super()
    this.scriptPath = path.join(binariesDir, 'xinput_helper.ps1')
  }

  public start() {
    if (this.isRunning || !fs.existsSync(this.scriptPath)) {
      return
    }

    try {
      this.helperProcess = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-WindowStyle',
          'Hidden',
          '-File',
          this.scriptPath
        ],
        {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore']
        }
      )

      this.isRunning = true

      let buffer = ''
      this.helperProcess.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('{')) continue

          try {
            const data = JSON.parse(trimmed)
            if (data.event === 'combo') {
              this.emit('toggle', data)
            }
          } catch (_) {}
        }
      })

      // spawn 失败（权限/被杀软拦截）必须感知，否则手柄功能静默失效
      this.helperProcess.on('error', (err) => {
        console.warn('[ControllerService] helper process error:', err)
      })

      this.helperProcess.on('exit', () => {
        this.isRunning = false
        this.helperProcess = null
        this.scheduleRestart()
      })
    } catch (err) {
      console.warn('Failed to start ControllerService:', err)
      this.isRunning = false
    }
  }

  /** helper 意外退出后带退避自动重启（上限内），保证手柄热键自愈 */
  private scheduleRestart() {
    if (this.restartTimer) return
    if (this.restartAttempts >= ControllerService.MAX_RESTART_ATTEMPTS) {
      console.warn('[ControllerService] helper keeps exiting, giving up after max attempts')
      return
    }
    const delay = Math.min(1000 * Math.pow(2, this.restartAttempts), 15000)
    this.restartAttempts++
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (!this.isRunning) {
        console.log(`[ControllerService] restarting helper (attempt ${this.restartAttempts})`)
        this.start()
      }
    }, delay)
  }

  public stop() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.restartAttempts = 0
    if (this.helperProcess) {
      try {
        this.helperProcess.kill()
      } catch (_) {}
      this.helperProcess = null
    }
    this.isRunning = false
  }
}
