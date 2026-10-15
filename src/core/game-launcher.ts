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
    return this.triggerHotkey(['VK_F10'], targetProcName)
  }

  /**
   * 触发 Mod 专属自定义快捷键组合 (对齐原版 QAQMAN：直接调用 QaqmKeyHelper.exe 发送系统级 keybd_event)
   */
  public triggerHotkey(
    keys: string[],
    _targetProcName?: string
  ): Promise<boolean> {
    if (!keys || keys.length === 0) return Promise.resolve(false)

    // 过滤掉无法自动调度的鼠标与手柄按键
    const cleanKeys = keys.filter((k) => !k.includes('🎮') && !k.includes('鼠标') && !k.includes('Button'))
    if (cleanKeys.length === 0) return Promise.resolve(false)

    // 1. 将按键转换为标准 VK 字符串
    const vkTokens = cleanKeys.map((k) => this.normalizeToVkToken(k)).filter(Boolean) as Array<{ vkCode: number; codeStr: string }>
    if (vkTokens.length === 0) return Promise.resolve(false)

    // 2. 构造与原版 QAQMAN 官方结构 100% 对齐的 Base64url Payload
    const modifierSet = new Set(['VK_CONTROL', 'VK_SHIFT', 'VK_MENU', 'VK_LWIN', 'VK_RWIN'])
    const pressedTokens = vkTokens.map((t) => ({
      code: t.codeStr,
      display: t.codeStr.replace(/^VK_/, ''),
      device: 'keyboard',
      isModifier: modifierSet.has(t.codeStr),
      commandToken: t.codeStr.replace(/^VK_/, '')
    }))
    const displayKeys = vkTokens.map((t) => t.codeStr.replace(/^VK_/, ''))
    const payload = {
      original: cleanKeys.join(' '),
      pressed: pressedTokens,
      released: [],
      displayKeys,
      commandKeys: displayKeys,
      devices: ['keyboard'],
      canAutoApply: true
    }
    const hotkeyBase64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url')

    // 3. 直接通过原版 QaqmKeyHelper 发送击键（基于系统级 keybd_event，无需跨进程找 HWND）
    return this.triggerQaqmHotkey(hotkeyBase64)
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

      // Fallback 1: press_f10.ps1 (系统级 keybd_event)
      const f10Script = path.join(this.binariesDir, 'press_f10.ps1')
      if (fs.existsSync(f10Script)) {
        try {
          const child = spawn('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            f10Script
          ], {
            detached: true,
            stdio: 'ignore'
          })
          child.unref()
          return resolve(true)
        } catch (err) {
          console.warn('[GameLauncher] press_f10.ps1 error:', err)
        }
      }

      // Fallback 2: PowerShell key send
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
   * 从加载器所在目录向上逐级查找 XXMI Launcher Config.json 配置文件
   */
  public findXxmiConfigPath(modLoaderPath: string): string | null {
    try {
      let currentDir = path.dirname(path.resolve(modLoaderPath))
      while (true) {
        const candidate = path.join(currentDir, 'XXMI Launcher Config.json')
        if (fs.existsSync(candidate)) {
          return candidate
        }
        const parent = path.dirname(currentDir)
        if (parent === currentDir) break
        currentDir = parent
      }
    } catch {
      // 路径解析异常时安全返回空
    }
    return null
  }

  /**
   * 解析官方启动器路径，优先使用显式配置，其次根据游戏本体路径按标准目录结构向上推导
   */
  public resolveOfficialLauncherPath(game: GameConfig): string {
    if (game.officialLauncherPath && fs.existsSync(game.officialLauncherPath)) {
      return game.officialLauncherPath
    }
    if (!game.gamePath) return ''

    const gameDir = path.dirname(game.gamePath)
    const parentDir = path.dirname(gameDir)
    const grandParentDir = path.dirname(parentDir)

    // 适配官方启动器两级 (Launcher/Game/exe) 与三级标准结构 (Launcher/games/Game/exe)
    const candidates = [
      path.join(grandParentDir, 'Launcher.exe'),
      path.join(parentDir, 'Launcher.exe'),
      path.join(gameDir, 'Launcher.exe'),
      path.join(grandParentDir, 'Gryphline Launcher.exe'),
      path.join(parentDir, 'Gryphline Launcher.exe')
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }

    return ''
  }

  /**
   * 确保 XXMI 配置中对应 importer 的启动模式为 MANUAL 并设置充足超时，
   * 适配游戏启动器强校验下的手动挂起监听注入机制
   */
  public ensureXxmiManualMode(modLoaderPath: string, importerId: string): void {
    try {
      const configPath = this.findXxmiConfigPath(modLoaderPath)
      if (!configPath) return

      const raw = fs.readFileSync(configPath, 'utf8')
      const data = JSON.parse(raw)
      let modified = false

      const importer = data?.Importers?.[importerId]?.Importer
      if (importer && typeof importer === 'object') {
        if ('game_launch' in importer && importer.game_launch !== 'MANUAL') {
          importer.game_launch = 'MANUAL'
          modified = true
        }
        if (typeof importer.start_timeout === 'number' && importer.start_timeout < 60) {
          importer.start_timeout = 60
          modified = true
        }
      }

      if (data?.Launcher && typeof data.Launcher === 'object') {
        if (typeof data.Launcher.start_timeout === 'number' && data.Launcher.start_timeout < 60) {
          data.Launcher.start_timeout = 60
          modified = true
        }
      }

      if (modified) {
        // 原子写入配置文件，避免进程中断损坏配置
        const tmpPath = `${configPath}.${Date.now()}.tmp`
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 4), 'utf8')
        try {
          if (fs.existsSync(configPath)) {
            fs.copyFileSync(configPath, `${configPath}.bak`)
          }
          fs.renameSync(tmpPath, configPath)
        } catch (renameErr) {
          try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch { /* ignore */ }
          throw renameErr
        }
      }
    } catch (err) {
      console.warn('[GameLauncher] ensureXxmiManualMode failed:', err)
    }
  }

  /**
   * 启动指定游戏 (按游戏专属启动模式调起，自动串联 XXMI/3DMigoto 加载器与提权)
   */
  public async launchGame(game: GameConfig, asAdmin: boolean = false): Promise<{ success: boolean; error?: string; message?: string }> {
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

    // 双向兜底：如果 mode 为 EFMI 且游戏为 endfield，若检测到官方启动器存在，自动走官方启动器联动流程
    // 避免老配置尚未切换时，点击开始游戏未拉起官方启动器导致 Mod 无法生效
    if (game.id === 'endfield' && mode === 'EFMI') {
      const officialCandidate = this.resolveOfficialLauncherPath(game)
      if (officialCandidate) {
        mode = 'EFMI_OFFICIAL'
      }
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

    // 1. EFMI 官方启动器联动模式 (终末地 1.6+ 官方启动器强校验注入解法)
    if (mode === 'EFMI_OFFICIAL') {
      if (game.modLoaderPath && fs.existsSync(game.modLoaderPath)) {
        this.ensureXxmiManualMode(game.modLoaderPath, 'EFMI')
        const loaderDir = path.dirname(game.modLoaderPath)
        const args = ['--nogui', '--xxmi', 'EFMI', ...customArgsList]
        console.log(`[GameLauncher] 正在以 EFMI_OFFICIAL 模式调起加载器:`, game.modLoaderPath, args)
        const loaderRes = await startOrElevate(game.modLoaderPath, loaderDir, args)
        if (!loaderRes.success) {
          return loaderRes
        }

        const officialExe = this.resolveOfficialLauncherPath(game)
        if (officialExe) {
          // 等待加载器初始化完成挂起并开始监听目标进程
          await new Promise((resolve) => setTimeout(resolve, 800))
          // 鹰角启动器等官方启动器带有 requireAdministrator 清单，必须通过提权拉起以避免被 Windows 静默拦截
          await this.launchElevated(officialExe, path.dirname(officialExe), [])
          return {
            success: true,
            message: 'EFMI 注入监听已就绪，已唤起官方启动器。请在官方启动器中确认勾选「以 DirectX 11 启动」并点击「开始游戏」。'
          }
        }

        return {
          success: true,
          message: 'EFMI 注入监听已就绪。未检测到官方启动器路径，请手动打开鹰角启动器并勾选「以 DirectX 11 启动」开始游戏。'
        }
      } else {
        return {
          success: false,
          error: '未找到 EFMI 对应的 XXMI Launcher 加载器路径，请在「设置」中指定加载器路径'
        }
      }
    }

    // 2. XXMI 专属注入模式 (ZZMI / EFMI / WWMI / SRMI)
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
   * 检查游戏进程是否正在运行。
   * 接受多个候选进程名并在一次 tasklist 调用内匹配：XXMI 系游戏真正运行的进程名
   * 常常与配置的 gamePath 不同（如鸣潮是 Client-Win64-Shipping.exe），
   * 逐个名字起一次 tasklist 会明显拖慢按键派发。
   */
  public isGameRunning(gameExeName: string | string[]): Promise<boolean> {
    const candidates = (Array.isArray(gameExeName) ? gameExeName : [gameExeName])
      .map((n) => path.basename(String(n || '')))
      .filter(Boolean)
      .map((n) => n.toLowerCase())
    if (candidates.length === 0) return Promise.resolve(false)

    return new Promise((resolve) => {
      // 不加 /FI 过滤列出全部进程：进程多时输出可能超过默认 1MB，需放宽 maxBuffer
      exec('tasklist /NH', { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        if (err || !stdout) return resolve(false)
        const lower = stdout.toLowerCase()
        resolve(candidates.some((name) => lower.includes(name)))
      })
    })
  }
}
