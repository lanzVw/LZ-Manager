import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, shell, dialog, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'

// 强制为 Windows 任务栏注册专属 AppUserModelId，彻底解除与默认 electron.exe 图标的关联
if (process.platform === 'win32' && app) {
  app.setAppUserModelId('com.lzmanager.desktop')
}

import { ConfigStore } from '../core/config-store'
import { ModEngine } from '../core/mod-engine'
import { PresetEngine } from '../core/preset-engine'
import { GameLauncher } from '../core/game-launcher'
import { getCharactersForGame, normalizeCharacterName, detectCharacterForMod } from '../core/characters-data'
import { searchMods, getModDetails, installMod } from '../core/gamebanana-service'
import { translateModDetails } from '../core/translate-service'
import { PersistBridgeManager } from '../core/persist-bridge'

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
        mainWindow.setAlwaysOnTop(true)
        mainWindow.focus()
        mainWindow.setAlwaysOnTop(false)
      }
    })
  }
}

process.on('uncaughtException', (err) => {
  console.error('[LZ Main] Uncaught Exception:', err)
})


// 计算指定游戏的 3DMigoto / XXMI 运行环境根目录
function getEnvRootForGame(game: any): string {
  if (!game) return ''
  if (game.modFolderPath) {
    const parent = path.dirname(game.modFolderPath)
    if (fs.existsSync(path.join(parent, 'd3dx.ini')) || fs.existsSync(path.join(parent, 'qaqm'))) {
      return parent
    }
    if (fs.existsSync(path.join(game.modFolderPath, 'd3dx.ini'))) {
      return game.modFolderPath
    }
    return parent
  }
  if (game.modLoaderPath) {
    return path.dirname(game.modLoaderPath)
  }
  return ''
}

// 核心引擎初始化
const configStore = new ConfigStore()
const activeGame = configStore.getActiveGame()
const persistBridgeManager = new PersistBridgeManager()
const modEngine = new ModEngine(
  activeGame ? activeGame.modFolderPath : '',
  configStore.getConfig().enableOptionAExclusive ?? true
)
const initialEnvRoot = getEnvRootForGame(activeGame)
modEngine.setPersistBridge(
  persistBridgeManager,
  initialEnvRoot,
  configStore.getConfig().persistBridgeEnabled ?? true,
  configStore.getConfig().persistBridgeCacheSize ?? 12
)
const presetEngine = new PresetEngine(configStore, modEngine)

import { OverlayManager } from './overlay-manager'
import { ControllerService } from './controller-service'
import { ImportEngine } from '../core/import-engine'
import { ConflictDetector } from '../core/conflict-detector'
import { EnvironmentDeployer } from '../core/environment-deployer'
import { TrayManager } from './tray-manager'

const binariesDir = (app && app.isPackaged)
  ? path.join(process.resourcesPath, 'binaries')
  : path.join(__dirname, '../../resources/binaries')
const gameLauncher = new GameLauncher(binariesDir)
const importEngine = new ImportEngine()
const conflictDetector = new ConflictDetector(activeGame ? activeGame.modFolderPath : '')
const environmentDeployer = new EnvironmentDeployer()
let trayManager: TrayManager | null = null

const preloadPath = path.join(__dirname, '../preload/index.cjs')
const isDev = process.env.NODE_ENV === 'development'
const overlayManager = new OverlayManager(preloadPath, isDev)
const controllerService = new ControllerService(binariesDir)

function getAppIcon() {
  const icoPath = (app && app.isPackaged)
    ? path.join(process.resourcesPath, 'icons/icon.ico')
    : path.join(__dirname, '../../resources/icons/icon.ico')
  const pngPath = (app && app.isPackaged)
    ? path.join(process.resourcesPath, 'icons/icon.png')
    : path.join(__dirname, '../../resources/icons/icon.png')

  if (fs.existsSync(icoPath)) {
    return nativeImage.createFromPath(icoPath)
  }
  if (fs.existsSync(pngPath)) {
    return nativeImage.createFromPath(pngPath)
  }
  return undefined
}

function createMainWindow() {
  const appIcon = getAppIcon()

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    icon: appIcon,
    backgroundColor: '#030712',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      webSecurity: false // 允许加载本地 Mod 封面图片 file:///
    }
  })

  if (appIcon) {
    mainWindow.setIcon(appIcon)
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[LZ Main] mainWindow failed to load:', errorCode, errorDescription)
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

// 全局快捷键注册 (默认 Ctrl+F 唤起游戏内侧边悬浮窗)
function registerHotkeys() {
  const hotkey = configStore.getConfig().overlayHotkey || 'CommandOrControl+F'
  try {
    globalShortcut.register(hotkey, () => {
      overlayManager.toggleOverlay()
    })
  } catch (err) {
    console.warn('Failed to register global hotkey:', err)
  }
}

// 注册 IPC 通信路由
function setupIpc() {
  // Config
  ipcMain.handle('config:get', () => configStore.getConfig())
  ipcMain.handle('config:updateApp', (_, patch: any) => {
    configStore.updateAppConfig(patch)
    if (patch.persistBridgeEnabled !== undefined) {
      modEngine.setPersistBridgeEnabled(patch.persistBridgeEnabled)
    }
    if (patch.persistBridgeCacheSize !== undefined) {
      modEngine.setPersistBridgeCacheSize(patch.persistBridgeCacheSize)
    }
    if (patch.enableOptionAExclusive !== undefined) {
      modEngine.setOptionAExclusive(patch.enableOptionAExclusive)
    }
    return { success: true, config: configStore.getConfig() }
  })
  ipcMain.handle('config:setActiveGame', (_, gameId: string) => {
    configStore.setActiveGame(gameId)
    const g = configStore.getActiveGame()
    if (g) {
      const envRoot = getEnvRootForGame(g)
      modEngine.setModFolderPath(g.modFolderPath)
      modEngine.setPersistBridge(
        persistBridgeManager,
        envRoot,
        configStore.getConfig().persistBridgeEnabled ?? true,
        configStore.getConfig().persistBridgeCacheSize ?? 12
      )
      conflictDetector.setModFolderPath(g.modFolderPath)
    }
    return { success: true }
  })
  ipcMain.handle('config:updateGame', (_, gameId: string, patch: any) => {
    configStore.updateGameConfig(gameId, patch)
    const g = configStore.getActiveGame()
    if (g && g.id === gameId) {
      const envRoot = getEnvRootForGame(g)
      modEngine.setModFolderPath(g.modFolderPath)
      modEngine.setPersistBridge(
        persistBridgeManager,
        envRoot,
        configStore.getConfig().persistBridgeEnabled ?? true,
        configStore.getConfig().persistBridgeCacheSize ?? 12
      )
      conflictDetector.setModFolderPath(g.modFolderPath)
    }
    return { success: true }
  })

  // Persist Bridge (Mod 设定数值记忆与保留)
  ipcMain.handle('persist:getInfo', (_, modFullPath: string) => {
    const g = configStore.getActiveGame()
    if (!g) return { hasPersist: false, hash: '', namespace: '', stateFileName: '', variables: [] }
    const envRoot = getEnvRootForGame(g)
    return persistBridgeManager.getModPersistInfo(modFullPath, g.modFolderPath, envRoot)
  })

  ipcMain.handle('persist:updateVariable', async (_, modFullPath: string, varName: string, value: string) => {
    const g = configStore.getActiveGame()
    if (!g) return { success: false, error: '未选择游戏' }
    const envRoot = getEnvRootForGame(g)
    const res = persistBridgeManager.updateModVariable(envRoot, g.modFolderPath, modFullPath, varName, value)
    if (res.success) {
      // 触发 F10 热刷新让游戏内即时生效
      gameLauncher.triggerReloadF10().catch(() => {})
    }
    return res
  })

  ipcMain.handle('persist:resetVariables', async (_, modFullPath: string) => {
    const g = configStore.getActiveGame()
    if (!g) return { success: false, resetCount: 0, error: '未选择游戏' }
    const envRoot = getEnvRootForGame(g)
    const res = persistBridgeManager.resetModVariables(envRoot, g.modFolderPath, modFullPath)
    if (res.success) {
      // 触发 F10 热刷新让游戏内即时生效
      gameLauncher.triggerReloadF10().catch(() => {})
    }
    return res
  })

  ipcMain.handle('persist:clearCache', () => {
    const g = configStore.getActiveGame()
    if (!g) return { success: false, deletedCount: 0, error: '未选择游戏' }
    const envRoot = getEnvRootForGame(g)
    return persistBridgeManager.clearCache(envRoot)
  })

  // Mods
  ipcMain.handle('mods:scan', () => {
    const g = configStore.getActiveGame()
    if (!g) return {}
    modEngine.setModFolderPath(g.modFolderPath)
    const rawLocalResult = modEngine.scanMods()
    const result: Record<string, any[]> = {}

    // 1. 扫描本地文件夹并统一归一化为国服官方标准名（消除因别名并存产生的重复条目）
    for (const [rawCharName, mods] of Object.entries(rawLocalResult)) {
      const canonicalName = normalizeCharacterName(rawCharName, g.id)
      if (!result[canonicalName]) {
        result[canonicalName] = [...mods]
      } else {
        result[canonicalName].push(...mods)
      }
    }

    // 2. 合并游戏官方全量角色图鉴，确保尚未在本地建目录的角色也能在“全部角色”筛选中显示
    try {
      const roster = getCharactersForGame(g.id)
      if (Array.isArray(roster)) {
        for (const item of roster) {
          if (item.id === 'all' || !item.name) continue
          const canonicalName = normalizeCharacterName(item.name, g.id)
          if (!result[canonicalName]) {
            result[canonicalName] = []
          }
        }
      }
    } catch (_) {}

    return result
  })

  ipcMain.handle('mods:openCharacterFolder', (_, charName: string) => {
    const g = configStore.getActiveGame()
    if (!g || !g.modFolderPath) return { success: false, error: '未选择游戏或未配置Mod路径' }
    const canonicalName = normalizeCharacterName(charName, g.id)
    const charPath = path.join(g.modFolderPath, canonicalName)
    if (!fs.existsSync(charPath)) {
      try {
        fs.mkdirSync(charPath, { recursive: true })
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
    shell.openPath(charPath)
    return { success: true, path: charPath }
  })

  ipcMain.handle('characters:getAvatars', (_, gameId?: string) => {
    const g = configStore.getActiveGame()
    const targetGameId = gameId || g?.id
    if (g) {
      modEngine.setModFolderPath(g.modFolderPath)
    }
    return modEngine.getCharacterAvatars(targetGameId)
  })

  ipcMain.handle('characters:setAvatar', async (_, charName: string, imagePath: string) => {
    const g = configStore.getActiveGame()
    if (g) {
      modEngine.setModFolderPath(g.modFolderPath)
    }
    return modEngine.setCharacterAvatar(charName, imagePath)
  })

  ipcMain.handle('characters:saveAvatarFromData', async (_, charName: string, dataUrl: string) => {
    const g = configStore.getActiveGame()
    if (g) {
      modEngine.setModFolderPath(g.modFolderPath)
    }
    return modEngine.saveCharacterAvatarFromData(charName, dataUrl)
  })

  ipcMain.handle('mods:toggle', async (_, charName: string, modName: string, enabled: boolean) => {
    const res = await modEngine.toggleMod(charName, modName, enabled)
    // 切换成功后自动触发 F10 游戏内热刷新
    if (res.success) {
      gameLauncher.triggerReloadF10().catch(() => {})
    }
    return res
  })

  ipcMain.handle('mods:getDetails', (_, modFullPath: string) => {
    return modEngine.getModDetails(modFullPath)
  })

  ipcMain.handle('mods:saveMetadata', (_, modFullPath: string, metadata: any) => {
    return modEngine.saveModMetadata(modFullPath, metadata)
  })

  ipcMain.handle('mods:openFolder', (_, modFullPath: string) => {
    return shell.openPath(modFullPath)
  })

  ipcMain.handle('mods:setAsCover', (_, modFullPath: string, imagePath: string) => {
    return modEngine.setAsCoverImage(modFullPath, imagePath)
  })

  ipcMain.handle('mods:saveCoverFromData', (_, modFullPath: string, dataUrl: string) => {
    return modEngine.saveCoverFromDataUrl(modFullPath, dataUrl)
  })

  ipcMain.handle('mods:hasCoverBackup', (_, modFullPath: string) => {
    return modEngine.hasCoverBackup(modFullPath)
  })

  ipcMain.handle('mods:rollbackCover', (_, modFullPath: string) => {
    return modEngine.rollbackCover(modFullPath)
  })

  ipcMain.handle('mods:deleteImage', (_, imagePath: string) => {
    return modEngine.deleteModImage(imagePath)
  })

  ipcMain.handle('mods:readIni', (_, iniPath: string) => {
    return modEngine.readIniFile(iniPath)
  })

  ipcMain.handle('mods:saveIni', (_, iniPath: string, content: string) => {
    return modEngine.saveIniFile(iniPath, content)
  })

  // Conflicts
  ipcMain.handle('conflicts:detect', (_, characterName?: string) => {
    const g = configStore.getActiveGame()
    if (!g) return characterName ? null : {}
    conflictDetector.setModFolderPath(g.modFolderPath)
    if (characterName) {
      return conflictDetector.detectCharacterConflicts(characterName)
    } else {
      return conflictDetector.detectAllConflicts()
    }
  })

  ipcMain.handle('conflicts:resolve', async (_, characterName: string, keepModName: string, conflictingModNames: string[]) => {
    const res = await modEngine.resolveConflicts(characterName, keepModName, conflictingModNames)
    if (res.success) {
      gameLauncher.triggerReloadF10().catch(() => {})
    }
    return res
  })

  // Environment Deployer
  ipcMain.handle('env:check', (_, gameId?: string) => {
    const g = gameId ? configStore.getGameById(gameId) : configStore.getActiveGame()
    if (!g) return null
    return environmentDeployer.checkEnvironment(g)
  })

  ipcMain.handle('env:deploy', (_, gameId?: string) => {
    const g = gameId ? configStore.getGameById(gameId) : configStore.getActiveGame()
    if (!g) return { success: false, message: '游戏未配置', deployedFiles: [] }
    return environmentDeployer.deployEnvironment(g)
  })

  ipcMain.handle('mods:inspectArchive', (_, archivePath: string) => {
    const g = configStore.getActiveGame()
    return importEngine.inspectArchive(archivePath, g ? g.id : 'zzz')
  })

  ipcMain.handle('mods:importArchive', async (_, params: any) => {
    const g = configStore.getActiveGame()
    const res = await importEngine.importArchive({
      ...params,
      modFolderPath: g ? g.modFolderPath : ''
    })
    if (res.success && params.enableImmediately) {
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

  ipcMain.handle('gamebanana:detectCharacter', (_, modInfo: any, gameId?: string) => {
    const g = configStore.getActiveGame()
    const targetGame = gameId || g?.id
    return detectCharacterForMod(modInfo, targetGame)
  })

  ipcMain.handle('gamebanana:install', async (event, params: any) => {
    const g = configStore.getActiveGame()
    let resolvedChar = params.characterName
    // 智能识别：若未指定角色或为通用/all，尝试深度识别
    if ((!resolvedChar || resolvedChar === 'all' || resolvedChar === '通用') && g) {
      const detected = detectCharacterForMod(params, g.id)
      if (detected) resolvedChar = detected
    }
    if (resolvedChar && resolvedChar !== 'all') {
      resolvedChar = normalizeCharacterName(resolvedChar, g?.id)
    }

    let targetParentDir = params.targetParentDir
    if (!targetParentDir && g && g.modFolderPath) {
      if (resolvedChar && resolvedChar !== 'all') {
        targetParentDir = path.join(g.modFolderPath, resolvedChar)
      } else {
        targetParentDir = g.modFolderPath
      }
    } else if (targetParentDir && g && g.modFolderPath) {
      const rel = path.relative(g.modFolderPath, targetParentDir)
      if (rel && !rel.startsWith('..')) {
        const parts = rel.split(path.sep)
        parts[0] = normalizeCharacterName(parts[0], g.id)
        targetParentDir = path.join(g.modFolderPath, ...parts)
      }
    }
    const previewUrl =
      params.previewImageUrl ||
      params.previewImage ||
      (Array.isArray(params.previewImages) ? params.previewImages[0] : '') ||
      ''

    const finalSourceUrl =
      params.sourceUrl ||
      params.profileUrl ||
      (params.modId ? `https://gamebanana.com/mods/${params.modId}` : '')

    return installMod({
      ...params,
      characterName: resolvedChar || params.characterName,
      sourceUrl: finalSourceUrl,
      profileUrl: finalSourceUrl,
      previewImageUrl: previewUrl,
      targetParentDir: targetParentDir || (g ? g.modFolderPath : ''),
      onProgress: (p: any) => {
        event.sender.send('gamebanana:installProgress', p)
      }
    })
  })

  // 外观分区 (Appearance Sections)
  ipcMain.handle('appearance:getSections', (_, characterName: string) => {
    const g = configStore.getActiveGame()
    if (!g) return []
    modEngine.setModFolderPath(g.modFolderPath)
    const custom = configStore.getCharacterSections(g.id, characterName)
    return modEngine.getCharacterAppearanceSections(characterName, g.id, custom)
  })

  ipcMain.handle('appearance:createSection', (_, characterName: string, name: string, coverUrl?: string) => {
    const g = configStore.getActiveGame()
    if (!g) return { success: false, error: '未选择游戏' }
    const trimmed = String(name || '').trim()
    if (!trimmed) return { success: false, error: '分区名称不能为空' }
    const custom = configStore.getCharacterSections(g.id, characterName)
    if (custom.some((s: any) => s.name.toLowerCase() === trimmed.toLowerCase()) || trimmed === '原角色') {
      return { success: false, error: '同名外观分区已存在' }
    }
    const sectionId = `custom:${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const newSection = {
      id: sectionId,
      sectionId,
      name: trimmed,
      nameZh: trimmed,
      nameEn: '',
      kind: 'custom' as const,
      official: false,
      coverUrl: coverUrl || null,
      createdAt: new Date().toISOString()
    }
    const next = [...custom, newSection]
    configStore.setCharacterSections(g.id, characterName, next)
    return { success: true, section: newSection }
  })

  ipcMain.handle('appearance:updateSection', (_, characterName: string, sectionId: string, name: string) => {
    const g = configStore.getActiveGame()
    if (!g) return { success: false, error: '未选择游戏' }
    const trimmed = String(name || '').trim()
    if (!trimmed) return { success: false, error: '分区名称不能为空' }
    const custom = configStore.getCharacterSections(g.id, characterName)
    const idx = custom.findIndex((s: any) => s.sectionId === sectionId)
    if (idx === -1) return { success: false, error: '分区不存在' }
    custom[idx].name = trimmed
    custom[idx].nameZh = trimmed
    custom[idx].updatedAt = new Date().toISOString()
    configStore.setCharacterSections(g.id, characterName, custom)
    return { success: true }
  })

  ipcMain.handle('appearance:deleteSection', (_, characterName: string, sectionId: string) => {
    const g = configStore.getActiveGame()
    if (!g) return { success: false, error: '未选择游戏' }
    const custom = configStore.getCharacterSections(g.id, characterName)
    const next = custom.filter((s: any) => s.sectionId !== sectionId)
    configStore.setCharacterSections(g.id, characterName, next)
    modEngine.setModFolderPath(g.modFolderPath)
    modEngine.resetModsFromDeletedSection(characterName, sectionId)
    return { success: true }
  })

  ipcMain.handle('appearance:setModSection', (_, modFullPath: string, sectionId: string) => {
    const ok = modEngine.setModAppearanceSection(modFullPath, sectionId)
    return { success: ok }
  })

  // 外部链接跳转 (系统默认浏览器)
  ipcMain.handle('app:openExternal', async (_, url: string) => {
    if (url && typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url)
      return { success: true }
    }
    return { success: false, error: '无效的外部链接' }
  })

  // 模组翻译服务 (Mod Details Translation)
  ipcMain.handle('translate:text', async (_, params: { title?: string; description?: string; text?: string }) => {
    return translateModDetails(params)
  })

  // Overlay Controls
  ipcMain.handle('overlay:toggle', () => overlayManager.toggleOverlay())
  ipcMain.handle('overlay:hide', () => overlayManager.hide())
  ipcMain.handle('overlay:show', () => overlayManager.show())
  ipcMain.handle('overlay:setScale', (_, scale: number) => overlayManager.setScale(scale))
  ipcMain.handle('overlay:getScale', () => overlayManager.getScale())

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
    overlayManager.createOverlayWindow()
    registerHotkeys()

    // 初始化系统托盘常驻
    if (mainWindow) {
      trayManager = new TrayManager(mainWindow, {
        onToggleOverlay: () => overlayManager.toggleOverlay(),
        onReloadModsF10: () => gameLauncher.triggerReloadF10(),
        onLaunchGame: async () => {
          const g = configStore.getActiveGame()
          if (g && g.gamePath) {
            gameLauncher.launchExecutable(g.gamePath, false)
          }
        }
      })
    }

    // 启动手柄后台监听
    controllerService.start()
    controllerService.on('toggle', () => {
      overlayManager.toggleOverlay()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      } else {
        trayManager?.showMainWindow()
      }
    })
  })

  app.on('will-quit', () => {
    trayManager?.setQuitting(true)
    trayManager?.destroy()
    controllerService.stop()
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
  GameLauncher,
  ConflictDetector,
  EnvironmentDeployer,
  PersistBridgeManager
}
