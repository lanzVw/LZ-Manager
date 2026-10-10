import { spawn, exec, execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
import { GameConfig } from './types'

export class GameLauncher {
  private binariesDir: string

  constructor(binariesDir: string) {
    this.binariesDir = binariesDir
  }

  /**
   * 触发 3DMigoto 游戏内重载 (按 F10)
   */
  public triggerReloadF10(targetProcName?: string): Promise<boolean> {
    return new Promise((resolve) => {
      // 1. 优先使用专属重载辅助程序 ReloadHelper.exe (精确定位游戏 HWND、发送 PostMessage 与底层 Input 击键)
      const reloadHelperExe = path.join(this.binariesDir, 'ReloadHelper.exe')
      if (fs.existsSync(reloadHelperExe)) {
        const args = targetProcName ? [targetProcName] : []
        try {
          execFile(reloadHelperExe, args, { windowsHide: true, timeout: 2000 }, (err, stdout) => {
            if (!err) {
              // ReloadHelper 成功即已发送 F10（源码自带 PostMessage+keybd_event），
              // 不再调用 triggerQaqmF10 全局补发，否则 F10 双发等于两次 reload
              console.log('[GameLauncher] ReloadHelper succeeded:', stdout?.trim())
              return resolve(true)
            }
            console.warn('[GameLauncher] ReloadHelper failed, falling back:', err)
            this.triggerQaqmF10().then(resolve)
          })
          return
        } catch (_) {}
      }

      this.triggerQaqmF10().then(resolve)
    })
  }

  /**
   * 触发 Mod 专属自定义快捷键组合 (通过 ReloadHelper + QaqmKeyHelper + press_hotkey.ps1 组合调度)
   */
  public triggerHotkey(keys: string[], targetProcName?: string): Promise<boolean> {
    if (!keys || keys.length === 0) return Promise.resolve(false)

    // 过滤掉无法自动调度的鼠标与手柄按键
    const cleanKeys = keys.filter((k) => !k.includes('🎮') && !k.includes('鼠标') && !k.includes('Button'))
    if (cleanKeys.length === 0) return Promise.resolve(false)

    return new Promise((resolve) => {
      // 1. 将按键转换为标准 VK 字符串
      const vkTokens = cleanKeys.map((k) => this.normalizeToVkToken(k)).filter(Boolean) as Array<{ vkCode: number; codeStr: string }>
      if (vkTokens.length === 0) return resolve(false)

      const vkCommaList = vkTokens.map((t) => t.codeStr).join(',')

      // 2. 构造 QAQMAN 兼容的 Base64 Payload
      const payload = {
        pressed: vkTokens.map((t) => ({ code: t.codeStr, device: 'keyboard' }))
      }
      const hotkeyBase64 = Buffer.from(JSON.stringify(payload), 'utf-8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

      // 3. 优先使用专属 ReloadHelper.exe (精确定位游戏 HWND、置顶并发送击键)
      const reloadHelperExe = path.join(this.binariesDir, 'ReloadHelper.exe')
      if (fs.existsSync(reloadHelperExe)) {
        const args = ['--keys', vkCommaList]
        if (targetProcName) args.push(targetProcName)

        try {
          execFile(reloadHelperExe, args, { windowsHide: true, timeout: 2000 }, (err, stdout) => {
            if (!err) {
              // ReloadHelper 成功即已按 vkCommaList 发送击键（PostMessage+keybd_event），
              // 再全局补发一次会让 toggle 类热键状态回退
              console.log('[GameLauncher] ReloadHelper hotkey succeeded:', stdout?.trim())
              return resolve(true)
            }
            console.warn('[GameLauncher] ReloadHelper hotkey failed, falling back:', err)
            this.triggerQaqmHotkey(hotkeyBase64).then(resolve)
          })
          return
        } catch (_) {}
      }

      this.triggerQaqmHotkey(hotkeyBase64).then(resolve)
    })
  }

  /**
   * 调用 QaqmKeyHelper 发送官方模式 hotkey 指令，并降级至 press_hotkey.ps1
   */
  private triggerQaqmHotkey(hotkeyBase64: string): Promise<boolean> {
    return new Promise((resolve) => {
      const helperExe = path.join(this.binariesDir, 'QaqmKeyHelper.exe')
      if (fs.existsSync(helperExe)) {
        try {
          const child = spawn(helperExe, ['hotkey', hotkeyBase64], {
            detached: true,
            stdio: 'ignore'
          })
          child.unref()
          return resolve(true)
        } catch (err) {
          console.error('[GameLauncher] QaqmKeyHelper hotkey failed:', err)
        }
      }

      const scriptPath = path.join(this.binariesDir, 'press_hotkey.ps1')
      if (fs.existsSync(scriptPath)) {
        try {
          const child = spawn('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            scriptPath,
            hotkeyBase64
          ], {
            detached: true,
            stdio: 'ignore'
          })
          child.unref()
          return resolve(true)
        } catch (err) {
          console.error('[GameLauncher] press_hotkey.ps1 failed:', err)
        }
      }

      resolve(false)
    })
  }

  /**
   * 标准化按键名称为 Windows Virtual Key 标识
   */
  private normalizeToVkToken(k: string): { vkCode: number; codeStr: string } | null {
    const clean = k.trim().replace(/^[~!@#]/, '')
    const upper = clean.toUpperCase()

    if (upper.startsWith('VK_')) {
      const name = upper
      const code = this.getVkCodeFromName(name)
      if (code !== null) return { vkCode: code, codeStr: name }
    }

    switch (upper) {
      case 'CTRL':
      case 'CONTROL':
      case 'LCTRL':
        return { vkCode: 0x11, codeStr: 'VK_CONTROL' }
      case 'RCTRL':
      case 'R-CTRL':
        return { vkCode: 0xA3, codeStr: 'VK_RCONTROL' }
      case 'ALT':
      case 'MENU':
      case 'LALT':
        return { vkCode: 0x12, codeStr: 'VK_MENU' }
      case 'RALT':
      case 'R-ALT':
        return { vkCode: 0xA5, codeStr: 'VK_RMENU' }
      case 'SHIFT':
      case 'LSHIFT':
      case 'L-SHIFT':
        return { vkCode: 0x10, codeStr: 'VK_SHIFT' }
      case 'R-SHIFT':
      case 'RSHIFT':
        return { vkCode: 0xA1, codeStr: 'VK_RSHIFT' }
      case '↑':
      case 'UP':
        return { vkCode: 0x26, codeStr: 'VK_UP' }
      case '↓':
      case 'DOWN':
        return { vkCode: 0x28, codeStr: 'VK_DOWN' }
      case '←':
      case 'LEFT':
        return { vkCode: 0x25, codeStr: 'VK_LEFT' }
      case '→':
      case 'RIGHT':
        return { vkCode: 0x27, codeStr: 'VK_RIGHT' }
      case 'SPACE':
        return { vkCode: 0x20, codeStr: 'VK_SPACE' }
      case 'ENTER':
      case 'RETURN':
        return { vkCode: 0x0D, codeStr: 'VK_RETURN' }
      case 'ESC':
      case 'ESCAPE':
        return { vkCode: 0x1B, codeStr: 'VK_ESCAPE' }
      case 'TAB':
        return { vkCode: 0x09, codeStr: 'VK_TAB' }
      case 'BACKSPACE':
      case 'BACK':
        return { vkCode: 0x08, codeStr: 'VK_BACK' }
      case 'CAPS':
      case 'CAPITAL':
        return { vkCode: 0x14, codeStr: 'VK_CAPITAL' }
      case 'PAGEUP':
      case 'PRIOR':
        return { vkCode: 0x21, codeStr: 'VK_PRIOR' }
      case 'PAGEDOWN':
      case 'NEXT':
        return { vkCode: 0x22, codeStr: 'VK_NEXT' }
      case 'HOME':
        return { vkCode: 0x24, codeStr: 'VK_HOME' }
      case 'END':
        return { vkCode: 0x23, codeStr: 'VK_END' }
      case 'INSERT':
        return { vkCode: 0x2D, codeStr: 'VK_INSERT' }
      case 'DELETE':
      case 'DEL':
        return { vkCode: 0x2E, codeStr: 'VK_DELETE' }
    }

    const fMatch = upper.match(/^F([1-9]|1[0-9]|2[0-4])$/)
    if (fMatch) {
      const fNum = parseInt(fMatch[1], 10)
      return { vkCode: 0x6F + fNum, codeStr: `VK_F${fNum}` }
    }

    if (upper.length === 1 && upper >= 'A' && upper <= 'Z') {
      return { vkCode: upper.charCodeAt(0), codeStr: `VK_${upper}` }
    }

    if (upper.length === 1 && upper >= '0' && upper <= '9') {
      return { vkCode: upper.charCodeAt(0), codeStr: `VK_${upper}` }
    }

    return null
  }

  private getVkCodeFromName(name: string): number | null {
    const s = name.toUpperCase()
    if (s.startsWith('VK_')) {
      const rest = s.substring(3)
      if (rest.length === 1 && rest >= 'A' && rest <= 'Z') return rest.charCodeAt(0)
      if (rest.length === 1 && rest >= '0' && rest <= '9') return rest.charCodeAt(0)
      if (rest.startsWith('F')) {
        const fn = parseInt(rest.substring(1), 10)
        if (fn >= 1 && fn <= 24) return 0x6F + fn
      }
    }
    const map: Record<string, number> = {
      VK_CONTROL: 0x11,
      VK_LCONTROL: 0xA2,
      VK_RCONTROL: 0xA3,
      VK_MENU: 0x12,
      VK_LMENU: 0xA4,
      VK_RMENU: 0xA5,
      VK_SHIFT: 0x10,
      VK_LSHIFT: 0xA0,
      VK_RSHIFT: 0xA1,
      VK_UP: 0x26,
      VK_DOWN: 0x28,
      VK_LEFT: 0x25,
      VK_RIGHT: 0x27,
      VK_SPACE: 0x20,
      VK_RETURN: 0x0D,
      VK_ESCAPE: 0x1B,
      VK_TAB: 0x09,
      VK_BACK: 0x08,
      VK_PRIOR: 0x21,
      VK_NEXT: 0x22,
      VK_HOME: 0x24,
      VK_END: 0x23,
      VK_INSERT: 0x2D,
      VK_DELETE: 0x2E,
      VK_CAPITAL: 0x14
    }
    return map[s] || null
  }

  /**
   * 调用 QaqmKeyHelper 发送官方模式 f10 指令
   */
  private triggerQaqmF10(): Promise<boolean> {
    return new Promise((resolve) => {
      const helperExe = path.join(this.binariesDir, 'QaqmKeyHelper.exe')
      if (fs.existsSync(helperExe)) {
        try {
          // 正确参数为 'f10' (非虚拟键码 '121')
          const child = spawn(helperExe, ['f10'], {
            detached: true,
            stdio: 'ignore'
          })
          child.unref()
          return resolve(true)
        } catch (err) {
          console.error('[GameLauncher] QaqmKeyHelper failed:', err)
        }
      }

      // Fallback: PowerShell key send
      const psCommand = `powershell -NoProfile -Command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('{F10}')"`
      exec(psCommand, (err) => {
        if (err) {
          console.warn('[GameLauncher] Fallback F10 trigger error:', err)
          resolve(false)
        } else {
          resolve(true)
        }
      })
    })
  }

  /**
   * 通过 Windows start 命令拉起程序 (借由系统 Shell 调度，自动支持管理员提权弹窗与工作路径隔离)
   */
  private launchViaStart(
    exePath: string,
    workingDir: string,
    args: string[] = []
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const argString = args.length
        ? ` ${args.map((a) => (String(a).includes(' ') ? `"${String(a).replace(/"/g, '\\"')}"` : a)).join(' ')}`
        : ''
      const cmd = `start "" /D "${workingDir}" "${exePath}"${argString}`
      console.log(`[GameLauncher] Executing via Windows Shell: ${cmd}`)

      exec(cmd, { windowsHide: true }, (err, _stdout, stderr) => {
        if (err) {
          const errMsg = stderr?.trim() || err.message
          console.error('[GameLauncher] launchViaStart failed:', errMsg)
          resolve({ success: false, error: errMsg })
        } else {
          resolve({ success: true })
        }
      })
    })
  }

  /**
   * 使用管理员权限提权启动 (支持 elevate.exe 与 PowerShell RunAs 双重降级容灾)
   */
  private launchElevated(
    exePath: string,
    workingDir: string,
    args: string[] = []
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      let settled = false
      const settle = (result: { success: boolean; error?: string }) => {
        if (!settled) {
          settled = true
          resolve(result)
        }
      }

      const elevateExe = path.join(this.binariesDir, 'elevate.exe')
      if (fs.existsSync(elevateExe)) {
        try {
          const elevateArgs = [exePath, ...args]
          const child = spawn(elevateExe, elevateArgs, {
            cwd: workingDir,
            detached: true,
            stdio: 'ignore'
          })
          child.on('error', (err) => {
            console.warn('[GameLauncher] elevate.exe error, falling back to powershell:', err)
            this.launchViaPowerShellRunAs(exePath, workingDir, args).then(settle)
          })
          // 快速非零退出（UAC 被拒绝 / 提权失败）视为失败并走 PS RunAs 兜底；
          // 宽限期内未退出说明提权流程正常进行（elevate 可能等待目标进程），视为成功
          child.on('exit', (code) => {
            if (code !== 0 && !settled) {
              console.warn(`[GameLauncher] elevate.exe exited with code ${code}, falling back to powershell`)
              this.launchViaPowerShellRunAs(exePath, workingDir, args).then(settle)
            }
          })
          child.unref()
          setTimeout(() => settle({ success: true }), 1200)
          return
        } catch (err) {
          console.warn('[GameLauncher] elevate.exe spawn failed, falling back:', err)
        }
      }

      this.launchViaPowerShellRunAs(exePath, workingDir, args).then(settle)
    })
  }

  /**
   * PowerShell Start-Process -Verb RunAs 终极管理员提权兜底
   */
  private launchViaPowerShellRunAs(
    exePath: string,
    workingDir: string,
    args: string[] = []
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const escapePs = (s: string) => String(s).replace(/'/g, "''")
      const argList = args.length ? `-ArgumentList @(${args.map((a) => `'${escapePs(a)}'`).join(',')}) ` : ''
      const wd = workingDir ? `-WorkingDirectory '${escapePs(workingDir)}' ` : ''
      const script = `Start-Process -FilePath '${escapePs(exePath)}' ${wd}${argList}-Verb RunAs`
      const encoded = Buffer.from(script, 'utf16le').toString('base64')
      exec(
        `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
        { windowsHide: true },
        (err, _stdout, stderr) => {
          if (err) {
            const msg = stderr?.trim() || err.message || 'PowerShell 提权启动失败'
            console.error('[GameLauncher] PowerShell RunAs failed:', msg)
            resolve({ success: false, error: msg })
          } else {
            resolve({ success: true })
          }
        }
      )
    })
  }

  /**
   * 启动指定游戏 (按游戏专属启动模式调起，自动串联 XXMI/3DMigoto 加载器与提权)
   */
  public async launchGame(game: GameConfig, asAdmin: boolean = false): Promise<{ success: boolean; error?: string }> {
    if (!game) {
      return { success: false, error: '未选择任何游戏' }
    }

    // 确定启动模式
    let mode = (game.launchMode || '').toUpperCase()
    if (!mode) {
      if (game.id === 'zzz') mode = 'ZZMI'
      else if (game.id === 'endfield') mode = 'EFMI'
      else if (game.id === 'wuwa') mode = 'WWMI'
      else if (game.id === 'genshin') mode = 'GIMI'
      else if (game.id === 'wuthering-waves') mode = 'WWMI'
      else if (game.id === 'honkai-star-rail') mode = 'SRMI'
      else if (game.modLoaderPath) mode = 'XXMI'
      else mode = 'VANILLA'
    }

    const customArgs = (game.launchArgs || '').trim()
    const customArgsList = customArgs ? customArgs.split(/\s+/).filter(Boolean) : []

    // 统一的启动入口：管理员模式优先走提权（失败再降级 start），普通模式反之
    const startOrElevate = async (exe: string, dir: string, args: string[]) => {
      if (asAdmin) {
        const elevated = await this.launchElevated(exe, dir, args)
        if (elevated.success) return elevated
        return this.launchViaStart(exe, dir, args)
      }
      const started = await this.launchViaStart(exe, dir, args)
      if (started.success) return started
      return this.launchElevated(exe, dir, args)
    }

    // 1. XXMI 专属注入模式 (ZZMI / EFMI / WWMI / SRMI)
    if (['ZZMI', 'EFMI', 'WWMI', 'SRMI'].includes(mode)) {
      if (game.modLoaderPath && fs.existsSync(game.modLoaderPath)) {
        const loaderDir = path.dirname(game.modLoaderPath)
        const args = ['--nogui', '--xxmi', mode, ...customArgsList]
        console.log(`[GameLauncher] 正在以 ${mode} 模式调起加载器:`, game.modLoaderPath, args)
        return startOrElevate(game.modLoaderPath, loaderDir, args)
      } else {
        // 若未配置加载器但配置了游戏本体路径，降级直接启动游戏
        if (game.gamePath && fs.existsSync(game.gamePath)) {
          console.warn(`[GameLauncher] 未检测到 ${mode} 加载器，回退至原生游戏直接启动:`, game.gamePath)
          const gameDir = path.dirname(game.gamePath)
          return startOrElevate(game.gamePath, gameDir, customArgsList)
        }
        return {
          success: false,
          error: `未找到 ${mode} 对应的 XXMI Launcher 加载器路径，请在「设置」中指定加载器路径`
        }
      }
    }

    // 2. 通用 XXMI / GIMI 模式
    if (mode === 'XXMI' || mode === 'GIMI') {
      if (game.modLoaderPath && fs.existsSync(game.modLoaderPath)) {
        const loaderDir = path.dirname(game.modLoaderPath)
        return startOrElevate(game.modLoaderPath, loaderDir, customArgsList)
      }
      if (game.gamePath && fs.existsSync(game.gamePath)) {
        const gameDir = path.dirname(game.gamePath)
        return startOrElevate(game.gamePath, gameDir, customArgsList)
      }
      return { success: false, error: '未配置 XXMI 加载器或游戏路径' }
    }

    // 3. 异环 NEMI 模式
    if (mode === 'NEMI') {
      if (game.modLoaderPath && fs.existsSync(game.modLoaderPath)) {
        const loaderDir = path.dirname(game.modLoaderPath)
        const loaderRes = await startOrElevate(game.modLoaderPath, loaderDir, [])
        // loader 启动失败时不再继续拉起游戏本体，避免产生裸启动的游戏
        if (!loaderRes.success) return loaderRes
      }
      if (game.gamePath && fs.existsSync(game.gamePath)) {
        const gameDir = path.dirname(game.gamePath)
        return startOrElevate(game.gamePath, gameDir, customArgsList)
      }
      return { success: false, error: '未配置异环游戏路径' }
    }

    // 4. 原版直接启动 (VANILLA)
    if (game.gamePath && fs.existsSync(game.gamePath)) {
      const gameDir = path.dirname(game.gamePath)
      return startOrElevate(game.gamePath, gameDir, customArgsList)
    }

    return {
      success: false,
      error: '未配置有效的游戏路径，请前往「设置」配置游戏可执行文件路径'
    }
  }

  /**
   * 单独调起 XXMI/3DMigoto 独立图形界面
   */
  public async launchLoader(game: GameConfig): Promise<{ success: boolean; error?: string }> {
    if (!game || !game.modLoaderPath) {
      return { success: false, error: '未配置 XXMI/加载器路径' }
    }
    if (!fs.existsSync(game.modLoaderPath)) {
      return { success: false, error: `加载器文件不存在: ${game.modLoaderPath}` }
    }
    const loaderDir = path.dirname(game.modLoaderPath)
    const res = await this.launchViaStart(game.modLoaderPath, loaderDir, [])
    if (res.success) return res
    return this.launchElevated(game.modLoaderPath, loaderDir, [])
  }

  /**
   * 通用可执行文件启动 (向后兼容)
   */
  public async launchExecutable(
    exePath: string,
    asAdmin: boolean = false,
    args: string[] = []
  ): Promise<{ success: boolean; error?: string }> {
    if (!exePath) {
      return { success: false, error: '未指定可执行文件路径' }
    }
    const resolved = path.resolve(exePath)
    if (!fs.existsSync(resolved)) {
      return { success: false, error: `可执行文件不存在: ${resolved}` }
    }
    const workingDir = path.dirname(resolved)
    if (asAdmin) {
      return this.launchElevated(resolved, workingDir, args)
    }
    const res = await this.launchViaStart(resolved, workingDir, args)
    if (res.success) return res
    return this.launchElevated(resolved, workingDir, args)
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
