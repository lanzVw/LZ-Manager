import { BrowserWindow, screen, ipcMain, shell } from 'electron'
import { pathToFileURL } from 'url'
import path from 'path'
import { GameFocusService, ForegroundInfo } from './game-focus-service'
import { GameConfig } from '../core/types'

export class OverlayManager {
  private window: BrowserWindow | null = null
  private preloadPath: string
  private isDevelopment: boolean

  private currentScale: number = 1.0
  private onlyShowInGame: boolean = true
  private pinned: boolean = true
  private lastBounds: Electron.Rectangle | null = null
  private suspendedByGameFocusLoss: boolean = false
  private gameFocusService: GameFocusService | null = null
  private toastTimer: NodeJS.Timeout | null = null
  private onAutoSwitchGame?: (game: GameConfig) => void

  constructor(preloadPath: string, isDevelopment: boolean) {
    this.preloadPath = preloadPath
    this.isDevelopment = isDevelopment
  }

  public getWindow(): BrowserWindow | null {
    return this.window
  }

  public getScale(): number {
    return this.currentScale
  }

  public setOnAutoSwitchGame(callback: (game: GameConfig) => void) {
    this.onAutoSwitchGame = callback
  }

  public setGameFocusService(service: GameFocusService) {
    this.gameFocusService = service
    this.gameFocusService.on('focus-change', (info: ForegroundInfo) => {
      this.handleFocusChange(info)
    })
  }

  public setOnlyShowInGame(enabled: boolean) {
    this.onlyShowInGame = enabled
    if (!enabled && this.suspendedByGameFocusLoss) {
      this.suspendedByGameFocusLoss = false
    }
  }

  public getOnlyShowInGame(): boolean {
    return this.onlyShowInGame
  }

  /** 📌 用户置顶开关：解除后悬浮窗不再是全局置顶，可被其他窗口遮挡 */
  public setPinned(pinned: boolean) {
    this.pinned = pinned
    if (this.window && !this.window.isDestroyed()) {
      this.window.setAlwaysOnTop(pinned, pinned ? 'screen-saver' : 'floating')
      this.window.setVisibleOnAllWorkspaces(pinned, { visibleOnFullScreen: pinned })
    }
  }

  public getPinned(): boolean {
    return this.pinned
  }

  private handleFocusChange(info: ForegroundInfo) {
    if (info.matchedGame) {
      this.onAutoSwitchGame?.(info.matchedGame)
    }

    if (!this.onlyShowInGame) return

    if (info.isGame) {
      // 玩家重新切回游戏窗口：若此前悬浮窗曾开启，自动恢复展示
      if (this.suspendedByGameFocusLoss) {
        this.show()
        this.suspendedByGameFocusLoss = false
      }
    } else if (!info.isSelf) {
      // 焦点切到桌面或其他非游戏应用：立即暂隐悬浮窗
      if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
        this.window.hide()
        this.suspendedByGameFocusLoss = true
      }
    }
  }

  public setScale(scale: number) {
    // NaN 会击穿 clamp 并让后续 setBounds 收到 NaN 尺寸抛错
    if (!Number.isFinite(scale)) return
    const validScale = Math.max(0.6, Math.min(1.5, Math.round(scale * 100) / 100))
    this.currentScale = validScale

    if (this.window && !this.window.isDestroyed()) {
      const bounds = this.window.getBounds()
      const display = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay()
      const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.bounds

      const baseWidth = Math.max(540, Math.round(screenWidth * 0.3))
      const baseHeight = Math.round(screenHeight * 0.75)

      const newWidth = Math.round(baseWidth * this.currentScale)
      const newHeight = Math.round(baseHeight * this.currentScale)

      // 缩放窗口时保持右侧和顶部贴靠
      const rightEdge = bounds.x + bounds.width
      const isRightDocked = Math.abs(rightEdge - (displayX + screenWidth)) < 30
      const newX = isRightDocked
        ? displayX + screenWidth - newWidth
        : Math.min(displayX + screenWidth - newWidth, Math.max(displayX, rightEdge - newWidth))
      const newY = Math.min(displayY + screenHeight - newHeight, Math.max(displayY, bounds.y))

      this.window.setBounds({
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight
      })
    }
  }

  public createOverlayWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) || screen.getPrimaryDisplay()
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.bounds
    const baseWidth = Math.max(540, Math.round(screenWidth * 0.3))
    const baseHeight = Math.round(screenHeight * 0.75)
    const overlayWidth = Math.round(baseWidth * this.currentScale)
    const overlayHeight = Math.round(baseHeight * this.currentScale)

    this.window = new BrowserWindow({
      width: overlayWidth,
      height: overlayHeight,
      x: displayX + screenWidth - overlayWidth,
      y: displayY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      resizable: false,
      backgroundColor: '#00000000',
      hasShadow: false,
      webPreferences: {
        preload: this.preloadPath,
        sandbox: true,
        webSecurity: this.isDevelopment
      }
    })

    // 置顶级别（用户可通过 📌 解除），覆盖无边框全屏游戏窗口
    this.window.setAlwaysOnTop(this.pinned, 'screen-saver')
    this.window.setVisibleOnAllWorkspaces(this.pinned, { visibleOnFullScreen: this.pinned })

    // 防护：window.open 一律拒绝（避免新窗口继承 preload），外链交系统浏览器
    this.window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url).catch(() => {})
      }
      return { action: 'deny' }
    })
    // 防护：禁止主文档导航到远程内容
    this.window.webContents.on('will-navigate', (event, url) => {
      const allowed = this.isDevelopment
        ? url.startsWith('http://localhost:5173')
        : url.startsWith('file://')
      if (!allowed) {
        event.preventDefault()
      }
    })

    if (this.isDevelopment) {
      this.window.loadURL('http://localhost:5173/#/overlay')
    } else {
      const htmlPath = path.join(__dirname, '../renderer/index.html')
      this.window.loadURL(pathToFileURL(htmlPath).href + '#/overlay')
    }

    this.window.on('closed', () => {
      this.window = null
    })

    return this.window
  }

  public async toggleOverlay(): Promise<{ success: boolean; reason?: string }> {
    if (!this.window || this.window.isDestroyed()) {
      this.createOverlayWindow()
    }

    if (this.window) {
      if (this.window.isVisible()) {
        this.window.hide()
        this.suspendedByGameFocusLoss = false
        return { success: true }
      } else {
        // 尝试呼出：检查当前前台窗口及匹配游戏
        if (this.gameFocusService) {
          const fg = await this.gameFocusService.getForegroundProcess()
          if (fg.matchedGame) {
            this.onAutoSwitchGame?.(fg.matchedGame)
          }

          if (this.onlyShowInGame && !fg.isGame && !fg.isSelf) {
            // 当前不在游戏内！发送轻量提示，不呼出完整面板
            this.sendToastToOverlay('请在游戏前台界面呼出悬浮窗')
            return { success: false, reason: 'not_in_game' }
          }
        }

        this.show()
        this.suspendedByGameFocusLoss = false
        return { success: true }
      }
    }
    return { success: false }
  }

  public sendToastToOverlay(message: string) {
    if (!this.window || this.window.isDestroyed()) {
      this.createOverlayWindow()
    }

    if (this.window) {
      const win = this.window
      const send = () => {
        if (win.isDestroyed()) return
        win.webContents.send('overlay:toast', message)
      }
      if (win.webContents.isLoading()) {
        // 刚重建的窗口 preload 尚未就绪，直接 send 会丢首条消息；等加载完成（3s 兜底）
        const timer = setTimeout(send, 3000)
        win.webContents.once('did-finish-load', () => {
          clearTimeout(timer)
          send()
        })
      } else {
        send()
      }

      if (!this.window.isVisible()) {
        if (this.toastTimer) {
          clearTimeout(this.toastTimer)
          this.toastTimer = null
        }

        // 仅临时展示 Toast 气泡，忽略鼠标穿透，2 秒后自动隐藏
        this.window.setIgnoreMouseEvents(true, { forward: true })
        this.window.showInactive()

        this.toastTimer = setTimeout(() => {
          if (this.window && !this.window.isDestroyed() && !this.suspendedByGameFocusLoss) {
            this.window.setIgnoreMouseEvents(false)
            this.window.hide()
          }
          this.toastTimer = null
        }, 2200)
      }
    }
  }

  public hide() {
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.window.hide()
    }
  }

  public show() {
    if (!this.window || this.window.isDestroyed()) {
      this.createOverlayWindow()
    }
    if (this.window) {
      if (this.toastTimer) {
        clearTimeout(this.toastTimer)
        this.toastTimer = null
      }

      // 位置记忆：仅在窗口从未泊位（新建）时同步到屏幕右上角；
      // 用户拖动过的位置与显示器不再被每次呼出重置，且使用 workArea 避免覆盖任务栏
      const hasPosition = this.lastBounds !== null
      if (!hasPosition) {
        const display =
          screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) || screen.getPrimaryDisplay()
        const { x: displayX, width: screenWidth } = display.workArea
        const { y: workY, height: workHeight } = display.workArea
        const baseWidth = Math.max(540, Math.round(screenWidth * 0.3))
        const baseHeight = Math.round(workHeight * 0.75)
        const overlayWidth = Math.round(baseWidth * this.currentScale)
        const overlayHeight = Math.round(baseHeight * this.currentScale)
        this.window.setBounds({
          x: displayX + screenWidth - overlayWidth,
          y: workY,
          width: overlayWidth,
          height: overlayHeight
        })
        this.lastBounds = this.window.getBounds()
      }
      this.window.setIgnoreMouseEvents(false)
      this.window.setAlwaysOnTop(this.pinned, this.pinned ? 'screen-saver' : 'floating')
      this.window.show()
      this.window.focus()

      // 通知悬浮窗渲染进程刷新最新前台游戏与模组
      try {
        this.window.webContents.send('overlay:shown')
      } catch (_) {}
    }
  }

  public destroy() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
      this.window = null
    }
  }
}

