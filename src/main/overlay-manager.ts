import { BrowserWindow, screen, ipcMain } from 'electron'
import path from 'path'

export class OverlayManager {
  private window: BrowserWindow | null = null
  private preloadPath: string
  private isDevelopment: boolean

  constructor(preloadPath: string, isDevelopment: boolean) {
    this.preloadPath = preloadPath
    this.isDevelopment = isDevelopment
  }

  public getWindow(): BrowserWindow | null {
    return this.window
  }

  public createOverlayWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) || screen.getPrimaryDisplay()
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.bounds
    const overlayWidth = Math.max(540, Math.round(screenWidth * 0.3))
    const overlayHeight = Math.round(screenHeight * 0.75)

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

  public toggleOverlay() {
    if (!this.window || this.window.isDestroyed()) {
      this.createOverlayWindow()
    }

    if (this.window) {
      if (this.window.isVisible()) {
        this.window.hide()
      } else {
        // 重新同步到屏幕右上角（宽30%，高75%）
        const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) || screen.getPrimaryDisplay()
        const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.bounds
        const overlayWidth = Math.max(540, Math.round(screenWidth * 0.3))
        const overlayHeight = Math.round(screenHeight * 0.75)
        this.window.setBounds({
          x: displayX + screenWidth - overlayWidth,
          y: displayY,
          width: overlayWidth,
          height: overlayHeight
        })
        this.window.setAlwaysOnTop(true, 'screen-saver')
        this.window.show()
        this.window.focus()
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
      this.window.show()
      this.window.focus()
    }
  }
}
