import { app, Tray, Menu, BrowserWindow, nativeImage, Notification, MenuItemConstructorOptions } from 'electron'
import path from 'path'
import fs from 'fs'

export interface TrayCallbacks {
  onToggleOverlay: () => void
  onReloadModsF10: () => void
  onLaunchGame: () => void
  getActiveGame?: () => { id: string; name: string; shortName?: string } | null
  getAllGames?: () => Array<{ id: string; name: string; shortName?: string; hidden?: boolean }>
  onSwitchGame?: (gameId: string) => void
  onOpenSettings?: () => void
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
    this.initTray()
    this.setupWindowInterception()
  }

  private initTray() {
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
    this.updateContextMenu()

    // 双击托盘图标唤出主界面
    this.tray.on('double-click', () => {
      this.showMainWindow()
    })

    // 单击托盘图标在 Windows 上唤出主界面
    this.tray.on('click', () => {
      this.showMainWindow()
    })

    // 右键呼出菜单前刷新上下文与游戏列表状态
    this.tray.on('right-click', () => {
      this.updateContextMenu()
    })
  }

  public updateContextMenu() {
    if (!this.tray || this.tray.isDestroyed()) return

    const activeGame = this.callbacks.getActiveGame ? this.callbacks.getActiveGame() : null
    const allGames = (this.callbacks.getAllGames ? this.callbacks.getAllGames() : []).filter((g) => !g.hidden)

    const gameLabel = activeGame ? (activeGame.shortName || activeGame.name) : ''
    const tooltip = gameLabel
      ? `LZ Manager · ${gameLabel} (Ctrl+F 悬浮窗)`
      : 'LZ Manager · 3DMigoto Mod 管理器'
    this.tray.setToolTip(tooltip)

    const gameSubmenu: MenuItemConstructorOptions[] = allGames.map((g) => ({
      label: g.shortName || g.name,
      type: 'radio' as const,
      checked: activeGame ? activeGame.id === g.id : false,
      click: () => {
        if (activeGame?.id !== g.id) {
          this.callbacks.onSwitchGame?.(g.id)
          this.updateContextMenu()
        }
      }
    }))

    const template: MenuItemConstructorOptions[] = [
      // 1. 软件标识与当前激活游戏（CDS 优雅副标风格，置顶只读提示）
      {
        label: gameLabel ? `LZ Manager · ${gameLabel}` : 'LZ Manager',
        enabled: false
      },
      { type: 'separator' },

      // 2. 主视窗与游戏悬浮窗
      {
        label: '打开主界面',
        click: () => this.showMainWindow()
      },
      {
        label: '游戏内悬浮窗',
        accelerator: 'Ctrl+F',
        registerAccelerator: false,
        click: () => this.callbacks.onToggleOverlay()
      },
      { type: 'separator' },

      // 3. 运行环境与 Mod 控制
      {
        label: gameLabel ? `启动游戏 (${gameLabel})` : '启动游戏',
        click: () => this.callbacks.onLaunchGame()
      },
      {
        label: '重载 Mod 效果',
        accelerator: 'F10',
        registerAccelerator: false,
        click: () => this.callbacks.onReloadModsF10()
      }
    ]

    // 4. 关联游戏多选切换（若有已配置的游戏）
    if (gameSubmenu.length > 0) {
      template.push({
        label: '切换游戏',
        submenu: gameSubmenu
      })
    }

    template.push(
      { type: 'separator' },
      // 5. 系统设置与选项
      {
        label: '系统设置...',
        click: () => {
          this.showMainWindow()
          this.callbacks.onOpenSettings?.()
        }
      },
      { type: 'separator' },
      // 6. 退出程序
      {
        label: '退出 LZ Manager',
        click: () => {
          this.isQuitting = true
          app.quit()
        }
      }
    )

    const contextMenu = Menu.buildFromTemplate(template)
    this.tray.setContextMenu(contextMenu)
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
          title: 'LZ Manager',
          content: '应用已最小化至系统托盘，按 Ctrl+F 随时在游戏中唤出悬浮窗。'
        })
        return
      } catch (_) {}
    }

    if (Notification.isSupported()) {
      new Notification({
        title: 'LZ Manager',
        body: '应用已最小化至系统托盘，按 Ctrl+F 随时在游戏中唤出悬浮窗。'
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
