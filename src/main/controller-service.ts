import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'

export class ControllerService extends EventEmitter {
  private helperProcess: ChildProcess | null = null
  private scriptPath: string
  private isRunning: boolean = false

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

      this.helperProcess.on('exit', () => {
        this.isRunning = false
        this.helperProcess = null
      })
    } catch (err) {
      console.warn('Failed to start ControllerService:', err)
      this.isRunning = false
    }
  }

  public stop() {
    if (this.helperProcess) {
      try {
        this.helperProcess.kill()
      } catch (_) {}
      this.helperProcess = null
    }
    this.isRunning = false
  }
}
