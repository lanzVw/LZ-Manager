import { app, Tray, Menu, BrowserWindow, nativeImage, Notification } from 'electron'
import path from 'path'

export interface TrayCallbacks {
  onToggleOverlay: () => void
  onReloadModsF10: () => void
  onLaunchGame: () => void
}

export class TrayManager {
  private tray: Tray | null = null
  private mainWindow: BrowserWindow | null = null
  private isQuitting: boolean = false
  private notifiedOnce: boolean = false

  constructor(mainWindow: BrowserWindow, callbacks: TrayCallbacks) {
    this.mainWindow = mainWindow
    this.initTray(callbacks)
    this.setupWindowInterception()
  }

  private initTray(callbacks: TrayCallbacks) {
    const iconPath = (app && app.isPackaged)
      ? path.join(process.resourcesPath, 'icons/tray.png')
      : path.join(__dirname, '../../resources/icons/tray.png')

    const icon = nativeImage.createFromPath(iconPath)
    this.tray = new Tray(icon)
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
      if (!this.isQuitting) {
        event.preventDefault()
        this.mainWindow?.hide()

        // 仅在首次最小化到托盘时发出轻量提示
        if (!this.notifiedOnce) {
          this.notifiedOnce = true
          if (Notification.isSupported()) {
            new Notification({
              title: 'LZ Manager',
              body: '已最小化至系统托盘，按 Ctrl+F 或手柄按键可随时在游戏中唤出悬浮窗。'
            }).show()
          }
        }
      }
    })
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
