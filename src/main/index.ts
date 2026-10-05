import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu } from 'electron'
import path from 'path'
import { ConfigStore } from '../core/config-store'
import { ModEngine } from '../core/mod-engine'
import { PresetEngine } from '../core/preset-engine'
import { GameLauncher } from '../core/game-launcher'
import { getCharactersForGame } from '../core/characters-data'
import { searchMods, getModDetails, installMod } from '../core/gamebanana-service'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// 单实例锁 - 彻底解决多开报错，已启动时直接唤醒并置顶窗口
if (app) {
  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      }
    })
  }
}

// 核心引擎初始化
const configStore = new ConfigStore()
const activeGame = configStore.getActiveGame()
const modEngine = new ModEngine(
  activeGame ? activeGame.modFolderPath : '',
  configStore.getConfig().enableOptionAExclusive ?? true
)
const presetEngine = new PresetEngine(configStore, modEngine)

const binariesDir = (app && app.isPackaged)
  ? path.join(process.resourcesPath, 'binaries')
  : path.join(__dirname, '../../resources/binaries')
const gameLauncher = new GameLauncher(binariesDir)

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    backgroundColor: '#030712',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      webSecurity: false // 允许加载本地 Mod 封面图片 file:///
    }
  })

  // 开发环境加载 Vite dev server，生产环境加载静态文件
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 全局快捷键注册 (Ctrl+F 唤起/隐藏主窗口与 F10 触发)
function registerHotkeys() {
  const hotkey = configStore.getConfig().overlayHotkey || 'CommandOrControl+F'
  try {
    globalShortcut.register(hotkey, () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide()
        } else {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    })
  } catch (err) {
    console.warn('Failed to register global hotkey:', err)
  }
}

// 注册 IPC 通信路由
function setupIpc() {
  // Config
  ipcMain.handle('config:get', () => configStore.getConfig())
  ipcMain.handle('config:setActiveGame', (_, gameId: string) => {
    configStore.setActiveGame(gameId)
    const g = configStore.getActiveGame()
    if (g) {
      modEngine.setModFolderPath(g.modFolderPath)
    }
    return { success: true }
  })
  ipcMain.handle('config:updateGame', (_, gameId: string, patch: any) => {
    configStore.updateGameConfig(gameId, patch)
    const g = configStore.getActiveGame()
    if (g && g.id === gameId) {
      modEngine.setModFolderPath(g.modFolderPath)
    }
    return { success: true }
  })

  // Mods
  ipcMain.handle('mods:scan', () => {
    const g = configStore.getActiveGame()
    if (!g) return {}
    modEngine.setModFolderPath(g.modFolderPath)
    return modEngine.scanMods()
  })

  ipcMain.handle('mods:toggle', async (_, charName: string, modName: string, enabled: boolean) => {
    const res = await modEngine.toggleMod(charName, modName, enabled)
    // 切换成功后自动触发 F10 游戏内热刷新
    if (res.success) {
      gameLauncher.triggerReloadF10().catch(() => {})
    }
    return res
  })

  // Presets
  ipcMain.handle('presets:get', () => {
    const g = configStore.getActiveGame()
    if (!g) return { presets: [], activePresetId: null }
    return {
      presets: presetEngine.getGamePresets(g.id),
      activePresetId: presetEngine.getActivePresetId(g.id)
    }
  })

  ipcMain.handle('presets:create', (_, name: string, description?: string) => {
    const g = configStore.getActiveGame()
    if (!g) throw new Error('No active game')
    const preset = presetEngine.createPresetFromCurrent(g.id, name, description)
    return preset
  })

  ipcMain.handle('presets:apply', async (_, presetId: string) => {
    const g = configStore.getActiveGame()
    if (!g) return { success: false, applied: 0 }
    const res = await presetEngine.applyPreset(g.id, presetId)
    if (res.success) {
      gameLauncher.triggerReloadF10().catch(() => {})
    }
    return res
  })

  ipcMain.handle('presets:delete', (_, presetId: string) => {
    const g = configStore.getActiveGame()
    if (!g) return false
    return presetEngine.deletePreset(g.id, presetId)
  })

  // Launcher & F10
  ipcMain.handle('game:launch', async (_, asAdmin: boolean) => {
    const g = configStore.getActiveGame()
    if (!g || !g.gamePath) return { success: false, error: '未配置游戏启动路径' }
    return gameLauncher.launchExecutable(g.gamePath, asAdmin)
  })

  ipcMain.handle('game:launchLoader', async () => {
    const g = configStore.getActiveGame()
    if (!g || !g.modLoaderPath) return { success: false, error: '未配置 XXMI/加载器路径' }
    return gameLauncher.launchExecutable(g.modLoaderPath, true)
  })

  ipcMain.handle('game:reloadModsF10', async () => {
    return gameLauncher.triggerReloadF10()
  })

  // GameBanana
  ipcMain.handle('gamebanana:getCharacters', (_, gameId: string) => {
    return getCharactersForGame(gameId)
  })

  ipcMain.handle('gamebanana:search', async (_, params: any) => {
    return searchMods(params)
  })

  ipcMain.handle('gamebanana:details', async (_, params: any) => {
    return getModDetails(params)
  })

  ipcMain.handle('gamebanana:install', async (event, params: any) => {
    const g = configStore.getActiveGame()
    const targetParentDir = params.targetParentDir || (g ? g.modFolderPath : '')
    return installMod({
      ...params,
      targetParentDir,
      onProgress: (p: any) => {
        event.sender.send('gamebanana:installProgress', p)
      }
    })
  })

  // Window Controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
}

if (app) {
  app.whenReady().then(() => {
    setupIpc()
    createMainWindow()
    registerHotkeys()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}

export {
  ConfigStore,
  ModEngine,
  PresetEngine,
  GameLauncher
}
