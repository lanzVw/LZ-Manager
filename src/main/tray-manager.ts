import { app, Tray, Menu, BrowserWindow, nativeImage, Notification } from 'electron'
import path from 'path'
import fs from 'fs'

export interface TrayCallbacks {
  onToggleOverlay: () => void
  onReloadModsF10: () => void
  onLaunchGame: () => void
  getCloseAction?: () => 'quit' | 'minimize_to_tray'
}

export class TrayManager {
  private tray: Tray | null = null
  private mainWindow: BrowserWindow | null = null
  private callbacks: TrayCallbacks
  private isQuitting: boolean = false
  private notifiedOnce: boolean = false

  constructor(mainWindow: BrowserWindow, callbacks: TrayCallbacks) {
    this.mainWindow = mainWindow
    this.callbacks = callbacks
    this.initTray(callbacks)
    this.setupWindowInterception()
  }

  private initTray(callbacks: TrayCallbacks) {
    const icoPath = (app && app.isPackaged)
      ? path.join(process.resourcesPath, 'icons/tray.ico')
      : path.join(__dirname, '../../resources/icons/tray.ico')
    const pngPath = (app && app.isPackaged)
      ? path.join(process.resourcesPath, 'icons/icon.png')
      : path.join(__dirname, '../../resources/icons/icon.png')

    let trayIcon: any
    if (process.platform === 'win32' && fs.existsSync(icoPath)) {
      // Windows 上原生 .ico 包含 16/24/32/48/256 多尺寸，系统自动按 DPI 缩放渲染最清晰画质
      trayIcon = icoPath
    } else if (fs.existsSync(pngPath)) {
      trayIcon = nativeImage.createFromPath(pngPath).resize({ width: 16, height: 16 })
    } else {
      trayIcon = pngPath
    }

    this.tray = new Tray(trayIcon)
    this.tray.setToolTip('LZ Manager - 3DMigoto Mod 管理器 (Ctrl+F 悬浮窗)')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '🖥️ 显示 LZ Manager 主界面',
        click: () => this.showMainWindow()
      },
      {
        label: '✨ 切换游戏内悬浮窗 (Ctrl+F)',
        click: () => callbacks.onToggleOverlay()
      },
      {
        label: '⚡ 重新加载 Mod (F10)',
        click: () => callbacks.onReloadModsF10()
      },
      {
        label: '🎮 启动当前游戏',
        click: () => callbacks.onLaunchGame()
      },
      { type: 'separator' },
      {
        label: '❌ 彻底退出程序',
        click: () => {
          this.isQuitting = true
          app.quit()
        }
      }
    ])

    this.tray.setContextMenu(contextMenu)

    // 双击托盘图标唤出主界面
    this.tray.on('double-click', () => {
      this.showMainWindow()
    })

    // 单击托盘图标在 Windows 上唤出主界面
    this.tray.on('click', () => {
      this.showMainWindow()
    })
  }

  private setupWindowInterception() {
    if (!this.mainWindow) return

    this.mainWindow.on('close', (event) => {
      if (this.isQuitting) return

      const action = this.callbacks.getCloseAction ? this.callbacks.getCloseAction() : 'quit'
      if (action === 'minimize_to_tray') {
        event.preventDefault()
        this.mainWindow?.hide()
        this.notifyHiddenToTray()
      } else {
        // 默认彻底退出程序：直接解除拦截并执行 app.quit()
        this.isQuitting = true
        app.quit()
      }
    })
  }

  public notifyHiddenToTray() {
    if (this.tray && process.platform === 'win32') {
      try {
        this.tray.displayBalloon({
          title: 'LZ Manager 已收起至系统托盘',
          content: '主界面已收起，按 Ctrl+F 随时在游戏中唤出悬浮窗。右键托盘图标可恢复主界面或彻底退出。'
        })
        return
      } catch (_) {}
    }

    if (Notification.isSupported()) {
      new Notification({
        title: 'LZ Manager 已收起至系统托盘',
        body: '主界面已收起，按 Ctrl+F 随时在游戏中唤出悬浮窗。'
      }).show()
    }
  }

  public showMainWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore()
      }
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  public setQuitting(val: boolean) {
    this.isQuitting = val
  }

  public destroy() {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
