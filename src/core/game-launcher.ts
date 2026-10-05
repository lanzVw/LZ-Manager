import { spawn, exec } from 'child_process'
import path from 'path'
import fs from 'fs'

export class GameLauncher {
  private binariesDir: string

  constructor(binariesDir: string) {
    this.binariesDir = binariesDir
  }

  /**
   * 触发 3DMigoto 游戏内重载 (按 F10)
   */
  public triggerReloadF10(): Promise<boolean> {
    return new Promise((resolve) => {
      const helperExe = path.join(this.binariesDir, 'QaqmKeyHelper.exe')
      if (fs.existsSync(helperExe)) {
        try {
          const child = spawn(helperExe, ['121'], { // 121 is VK_F10
            detached: true,
            stdio: 'ignore'
          })
          child.unref()
          return resolve(true)
        } catch (err) {
          console.error('QaqmKeyHelper failed:', err)
        }
      }

      // Fallback: PowerShell key send
      const psCommand = `powershell -NoProfile -Command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('{F10}')"`
      exec(psCommand, (err) => {
        if (err) {
          console.warn('Fallback F10 trigger error:', err)
          resolve(false)
        } else {
          resolve(true)
        }
      })
    })
  }

  /**
   * 启动游戏或 XXMI Loader
   */
  public launchExecutable(exePath: string, asAdmin: boolean = false): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!exePath || !fs.existsSync(exePath)) {
        return resolve({ success: false, error: `可执行文件不存在: ${exePath}` })
      }

      try {
        const workingDir = path.dirname(exePath)
        if (asAdmin) {
          const elevateExe = path.join(this.binariesDir, 'elevate.exe')
          if (fs.existsSync(elevateExe)) {
            const child = spawn(elevateExe, ['-wait', exePath], {
              cwd: workingDir,
              detached: true,
              stdio: 'ignore'
            })
            child.unref()
            return resolve({ success: true })
          }
        }

        const child = spawn(exePath, [], {
          cwd: workingDir,
          detached: true,
          stdio: 'ignore'
        })
        child.unref()
        resolve({ success: true })
      } catch (err: any) {
        resolve({ success: false, error: err.message })
      }
    })
  }

  /**
   * 检查常见游戏进程是否正在运行
   */
  public isGameRunning(gameExeName: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!gameExeName) return resolve(false)
      const baseName = path.basename(gameExeName)
      exec(`tasklist /FI "IMAGENAME eq ${baseName}" /NH`, (err, stdout) => {
        if (err || !stdout) return resolve(false)
        resolve(stdout.toLowerCase().includes(baseName.toLowerCase()))
      })
    })
  }
}
