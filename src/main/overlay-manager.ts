import { BrowserWindow, screen, ipcMain } from 'electron'
import path from 'path'
import { GameFocusService } from './game-focus-service'

export class OverlayManager {
  private window: BrowserWindow | null = null
  private preloadPath: string
  private isDevelopment: boolean

  private currentScale: number = 1.0
  private onlyShowInGame: boolean = true
  private suspendedByGameFocusLoss: boolean = false
  private gameFocusService: GameFocusService | null = null
  private toastTimer: NodeJS.Timeout | null = null

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

  public setGameFocusService(service: GameFocusService) {
    this.gameFocusService = service
    this.gameFocusService.on('focus-change', (info) => {
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

  private handleFocusChange(info: { isGame: boolean; isSelf: boolean; process: string }) {
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
        sandbox: false,
        webSecurity: false
      }
    })

    // 设置极高置顶级别，覆盖无边框全屏游戏窗口
    this.window.setAlwaysOnTop(true, 'screen-saver')
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    if (this.isDevelopment) {
      this.window.loadURL('http://localhost:5173/#/overlay')
    } else {
      const htmlPath = path.join(__dirname, '../renderer/index.html')
      this.window.loadURL(`file://${htmlPath}#/overlay`)
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
        // 尝试呼出：检查是否启用了“仅在游戏界面显示”
        if (this.onlyShowInGame && this.gameFocusService) {
          const fg = await this.gameFocusService.getForegroundProcess()
          if (!fg.isGame && !fg.isSelf) {
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
      this.window.webContents.send('overlay:toast', message)

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

      // 重新同步到屏幕右上角（按当前窗口缩放比例）
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) || screen.getPrimaryDisplay()
      const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.bounds
      const baseWidth = Math.max(540, Math.round(screenWidth * 0.3))
      const baseHeight = Math.round(screenHeight * 0.75)
      const overlayWidth = Math.round(baseWidth * this.currentScale)
      const overlayHeight = Math.round(baseHeight * this.currentScale)
      this.window.setBounds({
        x: displayX + screenWidth - overlayWidth,
        y: displayY,
        width: overlayWidth,
        height: overlayHeight
      })
      this.window.setIgnoreMouseEvents(false)
      this.window.setAlwaysOnTop(true, 'screen-saver')
      this.window.show()
      this.window.focus()
    }
  }
}

