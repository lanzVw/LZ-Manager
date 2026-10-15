import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, shell, dialog, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'

// 强制为 Windows 任务栏注册专属 AppUserModelId，彻底解除与默认 electron.exe 图标的关联
if (process.platform === 'win32' && app) {
  app.setAppUserModelId('com.lz.manager.v1')
}

import { ConfigStore } from '../core/config-store'
import { ModEngine } from '../core/mod-engine'
import { PresetEngine } from '../core/preset-engine'
import { GameLauncher } from '../core/game-launcher'
import { getCharactersForGame, normalizeCharacterName, detectCharacterForMod } from '../core/characters-data'
import { searchMods, getModDetails, installMod, checkModUpdate, checkAllModsUpdates } from '../core/gamebanana-service'
import { translateModDetails } from '../core/translate-service'
import { PersistBridgeManager } from '../core/persist-bridge'
import { autoTranslateModConfig, saveCustomVariableAlias } from '../core/mod-translator'
import {
  evaluateKeyDispatch,
  sanitizeProcessName
} from '../core/hotkey-dispatch'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// 单实例锁 - 彻底解决多开报错，已启动时直接唤醒并置顶窗口
const syncLog = (msg: string) => {
  try { fs.writeSync(1, `[LZ Main] ${msg}\n`) } catch (_) {}
}
syncLog(`bootstrap pid=${process.pid} argv=${JSON.stringify(process.argv.slice(1, 3))}`)
if (app) {
  syncLog('before requestSingleInstanceLock')
  const gotTheLock = app.requestSingleInstanceLock()
  syncLog(`after requestSingleInstanceLock gotTheLock=${gotTheLock}`)
  if (!gotTheLock) {
    syncLog('quitting: another instance holds the lock')
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
  logFatal('uncaughtException', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[LZ Main] Unhandled Rejection:', reason)
  logFatal('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)))
})

/**
 * 把主进程致命错误写入本地日志并弹一次系统错误框（限流），
 * 避免生产 GUI 环境下"功能坏了但完全不可见"。
 */
let fatalDialogShown = 0
function logFatal(kind: string, err: Error) {
  try {
    const logDir = app?.getPath ? app.getPath('userData') : process.cwd()
    const logPath = path.join(logDir, 'lz-main-error.log')
    const line = `[${new Date().toISOString()}] ${kind}: ${err.stack || err.message}\n`
    fs.appendFileSync(logPath, line, 'utf8')
    if (Date.now() - fatalDialogShown > 60000) {
      fatalDialogShown = Date.now()
      dialog.showErrorBox('LZ Manager 遇到内部错误', `${err.message}\n\n详细信息已写入:\n${logPath}`)
    }
  } catch (_) {
    /* 日志失败时静默，避免二次异常 */
  }
}


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
import { GameFocusService } from './game-focus-service'
import { ModFixer, getWuwaFixRuleMetadata } from '../core/mod-fixer'
import { listIniBackupsForMod, restoreIniBackupForMod } from '../core/ini-backup'

const binariesDir = (app && app.isPackaged)
  ? path.join(process.resourcesPath, 'binaries')
  : path.join(__dirname, '../../resources/binaries')
const resourcesDir = (app && app.isPackaged)
  ? process.resourcesPath
  : path.join(__dirname, '../../resources')
const gameLauncher = new GameLauncher(binariesDir)
const importEngine = new ImportEngine()
const conflictDetector = new ConflictDetector(activeGame ? activeGame.modFolderPath : '')
const environmentDeployer = new EnvironmentDeployer()
const modFixer = new ModFixer({
  userDataPath: app ? app.getPath('userData') : undefined,
  resourcesPath: resourcesDir
})
let isFixRunning = false
let trayManager: TrayManager | null = null

const preloadPath = path.join(__dirname, '../preload/index.cjs')
const isDev = process.env.NODE_ENV === 'development'
const overlayManager = new OverlayManager(preloadPath, isDev)
const controllerService = new ControllerService(binariesDir)
const gameFocusService = new GameFocusService(binariesDir)
gameFocusService.setGames(configStore.getConfig().games.filter((g) => !g.hidden))
gameFocusService.setActiveGame(activeGame)
overlayManager.setGameFocusService(gameFocusService)

/**
 * 统一的按键派发闸门：所有会向游戏投递按键的路径都必须经过这里。
 * 1. 游戏未运行时坚决不发按键，彻底杜绝盲发全局按键导致的死循环自激刷新与乱跳项；
 * 2. 刷新回声去重；
 * 3. 投递按键后，若悬浮窗处于打开状态，立即平稳将指针焦点拉回悬浮窗，防止游戏引擎捕获鼠标或丢失光标。
 */
async function dispatchKeyAction(
  action: (procName: string) => Promise<boolean>,
  opts: { applyEchoGuard: boolean; procName?: string }
): Promise<{ success: boolean; reason?: string }> {
  const g = configStore.getActiveGame()
  const hasGamePath = !!(g && g.gamePath)
  if (!hasGamePath) {
    return { success: false, reason: 'no_game' }
  }

  const procName = opts.procName || path.basename(g!.gamePath)
  const candidates = gameFocusService.getCandidateProcessNames(g)
  const gameRunning = await isGameRunningCached(candidates.length > 0 ? candidates : procName)

  const verdict = evaluateKeyDispatch({
    hasGamePath,
    gameRunning,
    applyEchoGuard: opts.applyEchoGuard,
    msSinceLastDispatch: Date.now() - lastKeyDispatchAt
  })
  if (verdict !== 'dispatch') {
    return { success: false, reason: verdict }
  }

  lastKeyDispatchAt = Date.now()
  const success = await action(procName)

  // 关键保护：按键投递完成后，只要悬浮窗正处于打开状态，立即将焦点与置顶平稳拉回，
  // 彻底防止 3D 动作游戏窗口在获得激活后劫持并锁定系统鼠标光标
  restoreOverlayFocus()

  return { success }
}

/** 若悬浮窗处于展示状态，重新平稳拉回置顶与聚焦 */
function restoreOverlayFocus() {
  const overlayWin = overlayManager.getWindow()
  if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) {
    overlayWin.focus()
    setTimeout(() => {
      if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) {
        overlayWin.focus()
      }
    }, 60)
  }
}

// 与 evaluateKeyDispatch 的 KEY_ECHO_GUARD_MS 成对使用：供按键回声守卫判断间隔
let lastKeyDispatchAt = 0

// 多档位切换会在一步之内连发数次按键，每次都起一次 tasklist 既慢又无意义；
// 缓存窗口取短，游戏刚启动/刚退出时最多延迟这么久才反映到判断上
const PROCESS_CHECK_TTL_MS = 1000
let processCheckCache: { key: string; running: boolean; at: number } | null = null

async function isGameRunningCached(names: string | string[]): Promise<boolean> {
  const list = (Array.isArray(names) ? names : [names]).sort()
  const key = list.join('|').toLowerCase()
  const now = Date.now()
  if (processCheckCache && processCheckCache.key === key && now - processCheckCache.at < PROCESS_CHECK_TTL_MS) {
    return processCheckCache.running
  }
  const running = await gameLauncher.isGameRunning(list)
  processCheckCache = { key, running, at: now }
  return running
}

const dispatchReloadF10 = (opts: { applyEchoGuard: boolean }) =>
  dispatchKeyAction((procName) => gameLauncher.triggerReloadF10(procName), opts)

const dispatchHotkey = (keys: string[], procName?: string) =>
  dispatchKeyAction((resolved) => gameLauncher.triggerHotkey(keys, resolved), {
    applyEchoGuard: false,
    procName
  })

/**
 * 统一切换激活游戏并同步所有底层服务与窗口
 */
function applyActiveGame(gameId: string, origin: 'manual' | 'auto-focus' = 'manual'): boolean {
  if (!gameId) return false
  const cfg = configStore.getConfig()
  const g = cfg.games.find((x: any) => x.id === gameId)
  if (!g) return false

  const prevId = cfg.activeGameId
  if (prevId !== gameId) {
    configStore.setActiveGame(gameId)
  } else if (origin === 'auto-focus') {
    // 焦点切回的仍是当前激活游戏：什么都不用重置，也不向两个窗口重复广播 game:changed，
    // 否则每次 alt-tab 回游戏都会触发两份全量扫描 + 悬浮窗浏览状态丢失
    gameFocusService.setActiveGame(g)
    return true
  }

  gameFocusService.setActiveGame(g)
  const envRoot = getEnvRootForGame(g)
  modEngine.setModFolderPath(g.modFolderPath)
  modEngine.setPersistBridge(
    persistBridgeManager,
    envRoot,
    configStore.getConfig().persistBridgeEnabled ?? true,
    configStore.getConfig().persistBridgeCacheSize ?? 12
  )
  conflictDetector.setModFolderPath(g.modFolderPath)

  broadcastGameChanged(origin)
  return true
}

function broadcastGameChanged(origin: 'manual' | 'auto-focus' | 'fix' = 'manual') {
  const g = configStore.getActiveGame()
  if (!g) return
  const payload = { game: g, gameId: g.id, origin }
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game:changed', payload)
    }
  } catch (_) {}

  try {
    const overlayWin = overlayManager.getWindow()
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send('game:changed', payload)
    }
  } catch (_) {}

  try {
    trayManager?.updateContextMenu()
  } catch (_) {}
}

overlayManager.setOnAutoSwitchGame((matchedGame: any) => {
  if (matchedGame && matchedGame.id) {
    applyActiveGame(matchedGame.id, 'auto-focus')
  }
})

gameFocusService.on('game-change', (matchedGame: any) => {
  if (matchedGame && matchedGame.id) {
    applyActiveGame(matchedGame.id, 'auto-focus')
  }
})

function getAppIconPath(): string {
  const icoPath = (app && app.isPackaged)
    ? path.join(process.resourcesPath, 'icons/icon.ico')
    : path.join(__dirname, '../../resources/icons/icon.ico')
  const pngPath = (app && app.isPackaged)
    ? path.join(process.resourcesPath, 'icons/icon.png')
    : path.join(__dirname, '../../resources/icons/icon.png')

  if (fs.existsSync(icoPath)) return icoPath
  if (fs.existsSync(pngPath)) return pngPath
  return ''
}

function getAppIcon() {
  const iconPath = getAppIconPath()
  if (iconPath) {
    return nativeImage.createFromPath(iconPath)
  }
  return undefined
}

function createMainWindow() {
  const iconPath = getAppIconPath()
  const appIcon = getAppIcon()

  mainWindow = new BrowserWindow({
    title: 'LZ Manager',
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    skipTaskbar: false,
    icon: iconPath || appIcon,
    backgroundColor: '#030712',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      // preload 仅使用 ipcRenderer/contextBridge/webUtils，可安全沙箱化
      sandbox: true,
      // 生产环境保持 webSecurity 开启（file:// 页面加载 file:// 图片不受影响）；
      // 仅开发模式下为让 dev server 页面加载本地 file:// 封面图临时放开
      webSecurity: process.env.NODE_ENV === 'development'
    }
  })

  // 防护：任何 window.open 一律拒绝，http/https 交给系统浏览器；
  // 否则新窗口会继承本窗口 webPreferences（含 preload），远程页面将获得全部 IPC API
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {})
    }
    return { action: 'deny' }
  })
  // 防护：禁止主文档导航到远程内容（防注入跳转）
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = process.env.NODE_ENV === 'development'
      ? url.startsWith('http://localhost:5173')
      : url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    const closeAction = configStore.getConfig().closeAction || 'quit'
    if (closeAction === 'quit') {
      app.quit()
    }
  })

  if (iconPath) {
    mainWindow.setIcon(iconPath)
  } else if (appIcon) {
    mainWindow.setIcon(appIcon)
  }

  if (process.platform === 'win32' && iconPath) {
    try {
      mainWindow.setAppDetails({
        appId: 'com.lz.manager.v1',
        appIconPath: iconPath,
        appIconIndex: 0,
        relaunchDisplayName: 'LZ Manager'
      })
    } catch (err) {
      console.error('[LZ Main] setAppDetails error:', err)
    }
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
}

// 全局快捷键注册 (默认 Ctrl+F 唤起游戏内侧边悬浮窗)
function registerHotkeys() {
  const hotkey = configStore.getConfig().overlayHotkey || 'CommandOrControl+F'
  try {
    const ok = globalShortcut.register(hotkey, () => {
      overlayManager.toggleOverlay()
    })
    if (!ok) {
      // 快捷键被其他全局软件占用时注册会静默失败，必须让用户知道
      console.warn(`[LZ Main] Global hotkey "${hotkey}" failed to register (可能被其他程序占用)`)
      const win = mainWindow
      if (win && !win.isDestroyed()) {
        win.webContents.send('overlay:toast', `全局快捷键 ${hotkey} 注册失败，可能被其他程序占用，请在设置中更换`)
      }
    }
  } catch (err) {
    console.warn('Failed to register global hotkey:', err)
  }
}

// 注册 IPC 通信路由
function setupIpc() {
  // Config
  // 白名单校验：config patch 由渲染层传入，必须限制可写的键，
  // 防止被注入的渲染进程把 gamePath/modFolderPath 改成任意程序路径再借 game:launch 启动
  const APP_CONFIG_KEYS = new Set([
    'activeGameId', 'characterUsage', 'serverUrl', 'enableOptionAExclusive',
    'overlayHotkey', 'persistBridgeEnabled', 'persistBridgeCacheSize', 'closeAction',
    'closePromptRemembered',
    'theme', 'palette', 'characterSectionsByGame'
  ])
  const GAME_CONFIG_KEYS = new Set([
    'name', 'shortName', 'description', 'gamePath', 'modFolderPath', 'modLoaderPath', 'officialLauncherPath', 'launchMode', 'hidden'
  ])
  const sanitizePatch = (patch: any, allowed: Set<string>): any => {
    if (!patch || typeof patch !== 'object') return {}
    const out: any = {}
    for (const [k, v] of Object.entries(patch)) {
      if (allowed.has(k)) out[k] = v
    }
    // 路径类字段必须是字符串且不含控制字符（真正存在性校验在使用处做，避免误杀未安装的游戏）
    for (const p of ['gamePath', 'modFolderPath', 'modLoaderPath', 'officialLauncherPath']) {
      if (p in out && (typeof out[p] !== 'string' || /[\u0000-\u001f]/.test(out[p]))) delete out[p]
    }
    if ('persistBridgeCacheSize' in out && typeof out.persistBridgeCacheSize !== 'number') delete out.persistBridgeCacheSize
    if ('overlayHotkey' in out && (typeof out.overlayHotkey !== 'string' || out.overlayHotkey.length > 64)) delete out.overlayHotkey
    if ('hidden' in out && typeof out.hidden !== 'boolean') delete out.hidden
    return out
  }

  ipcMain.handle('config:get', () => configStore.getConfig())
  ipcMain.handle('config:updateApp', (_, patch: any) => {
    const safe = sanitizePatch(patch, APP_CONFIG_KEYS)
    configStore.updateAppConfig(safe)
    if (safe.persistBridgeEnabled !== undefined) {
      modEngine.setPersistBridgeEnabled(safe.persistBridgeEnabled)
    }
    if (safe.persistBridgeCacheSize !== undefined) {
      modEngine.setPersistBridgeCacheSize(safe.persistBridgeCacheSize)
    }
    if (safe.enableOptionAExclusive !== undefined) {
      modEngine.setOptionAExclusive(safe.enableOptionAExclusive)
    }
    return { success: true, config: configStore.getConfig() }
  })
  ipcMain.handle('config:setActiveGame', (_, gameId: string) => {
    const success = applyActiveGame(gameId, 'manual')
    return { success }
  })
  ipcMain.handle('config:updateGame', (_, gameId: string, patch: any) => {
    if (!gameId || typeof gameId !== 'string') return { success: false, error: '无效的游戏 ID' }
    const safe = sanitizePatch(patch, GAME_CONFIG_KEYS)
    configStore.updateGameConfig(gameId, safe)
    gameFocusService.setGames(configStore.getConfig().games.filter((g) => !g.hidden))
    const g = configStore.getActiveGame()
    if (g) {
      applyActiveGame(g.id, 'manual')
    }
    return { success: true, config: configStore.getConfig() }
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
      dispatchReloadF10({ applyEchoGuard: false }).catch(() => {})
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
      dispatchReloadF10({ applyEchoGuard: false }).catch(() => {})
    }
    return res
  })

  ipcMain.handle('persist:clearCache', () => {
    const g = configStore.getActiveGame()
    if (!g) return { success: false, deletedCount: 0, error: '未选择游戏' }
    const envRoot = getEnvRootForGame(g)
    return persistBridgeManager.clearCache(envRoot)
  })

  // 重置 Mod ini 为初始备份版本 (*.qaqm-persistbak -> *.ini)
  const handleResetModIni = async (
    target: { modFullPath?: string; characterName?: string; modName?: string } | string
  ) => {
    const g = configStore.getActiveGame()
    if (!g || !g.modFolderPath) return { success: false, error: '未选择游戏或 Mods 路径未配置', restoredCount: 0 }

    let targetModPath = ''
    if (typeof target === 'string') {
      targetModPath = target
    } else if (target?.modFullPath) {
      targetModPath = target.modFullPath
    } else if (target?.characterName && target?.modName) {
      const safeChar = modEngine.sanitizePathSegment(target.characterName)
      const safeMod = modEngine.sanitizePathSegment(target.modName)
      const p1 = path.join(g.modFolderPath, safeChar, safeMod)
      const p2 = path.join(g.modFolderPath, safeChar, `DISABLED_${safeMod}`)
      targetModPath = fs.existsSync(p1) ? p1 : p2
    }

    const safeDir = modEngine.resolvePathInsideModRoot(targetModPath)
    if (!safeDir || !fs.existsSync(safeDir)) {
      return { success: false, error: 'Mod 目录不存在或超出 Mods 根目录', restoredCount: 0 }
    }

    const restoredCount = modEngine.restorePersistBakFiles(safeDir)
    if (restoredCount > 0) {
      const envRoot = getEnvRootForGame(g)
      if (configStore.getConfig().persistBridgeEnabled && envRoot) {
        try {
          persistBridgeManager.syncAllActiveMods(envRoot, g.modFolderPath)
        } catch (_) {}
      }
      broadcastGameChanged('manual')
      dispatchReloadF10({ applyEchoGuard: false }).catch(() => {})
    }
    return { success: true, restoredCount }
  }

  const handleResetCharacterIni = async (characterName: string) => {
    const g = configStore.getActiveGame()
    if (!g || !g.modFolderPath) return { success: false, error: '未选择游戏或 Mods 路径未配置', restoredCount: 0 }
    const safeChar = modEngine.sanitizePathSegment(characterName)
    if (!safeChar) return { success: false, error: '无效的角色名', restoredCount: 0 }
    const charDir = modEngine.resolvePathInsideModRoot(path.join(g.modFolderPath, safeChar))
    if (!charDir || !fs.existsSync(charDir)) {
      return { success: false, error: `角色目录不存在: ${safeChar}`, restoredCount: 0 }
    }
    let totalRestored = 0
    try {
      const entries = fs.readdirSync(charDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const modDir = path.join(charDir, entry.name)
        totalRestored += modEngine.restorePersistBakFiles(modDir)
      }
    } catch (e: any) {
      return { success: false, error: e.message || '读取角色目录失败', restoredCount: 0 }
    }
    if (totalRestored > 0) {
      const envRoot = getEnvRootForGame(g)
      if (configStore.getConfig().persistBridgeEnabled && envRoot) {
        try {
          persistBridgeManager.syncAllActiveMods(envRoot, g.modFolderPath)
        } catch (_) {}
      }
      broadcastGameChanged('manual')
      dispatchReloadF10({ applyEchoGuard: false }).catch(() => {})
    }
    return { success: true, restoredCount: totalRestored }
  }

  ipcMain.handle('persist:resetIni', (_, target) => handleResetModIni(target))
  ipcMain.handle('persist-bridge-reset-mod', (_, target) => handleResetModIni(target))
  ipcMain.handle('persist:resetIniCharacter', (_, characterName) => handleResetCharacterIni(characterName))
  ipcMain.handle('persist-bridge-reset-character', (_, characterName) => handleResetCharacterIni(characterName))

  // 修复备份回滚 (Ini Backup)
  const handleListModBackups = async (
    target: { modFullPath?: string; characterName?: string; modName?: string } | string
  ) => {
    const g = configStore.getActiveGame()
    if (!g || !g.modFolderPath) return { success: false, backups: [], error: '未选择游戏' }
    let targetModPath = ''
    if (typeof target === 'string') {
      targetModPath = target
    } else if (target?.modFullPath) {
      targetModPath = target.modFullPath
    } else if (target?.characterName && target?.modName) {
      const safeChar = modEngine.sanitizePathSegment(target.characterName)
      const safeMod = modEngine.sanitizePathSegment(target.modName)
      const p1 = path.join(g.modFolderPath, safeChar, safeMod)
      const p2 = path.join(g.modFolderPath, safeChar, `DISABLED_${safeMod}`)
      targetModPath = fs.existsSync(p1) ? p1 : p2
    }
    const safeDir = modEngine.resolvePathInsideModRoot(targetModPath)
    if (!safeDir || !fs.existsSync(safeDir)) {
      return { success: false, backups: [], error: 'Mod 目录不存在或超出 Mods 根目录' }
    }
    try {
      const isWuwa = g.id === 'wuwa'
      const backups = listIniBackupsForMod(safeDir, { includeWuwaIndependent: isWuwa })
      return { success: true, backups }
    } catch (e: any) {
      return { success: false, backups: [], error: e.message || '读取备份失败' }
    }
  }

  const handleRestoreModBackup = async (target: {
    modFullPath?: string
    characterName?: string
    modName?: string
    stamp: string
  }) => {
    if (isFixRunning) {
      return { success: false, error: '已有修复或回滚任务正在进行中，请稍后再试' }
    }
    const g = configStore.getActiveGame()
    if (!g || !g.modFolderPath) return { success: false, error: '未选择游戏' }
    let targetModPath = ''
    if (target?.modFullPath) {
      targetModPath = target.modFullPath
    } else if (target?.characterName && target?.modName) {
      const safeChar = modEngine.sanitizePathSegment(target.characterName)
      const safeMod = modEngine.sanitizePathSegment(target.modName)
      const p1 = path.join(g.modFolderPath, safeChar, safeMod)
      const p2 = path.join(g.modFolderPath, safeChar, `DISABLED_${safeMod}`)
      targetModPath = fs.existsSync(p1) ? p1 : p2
    }
    const safeDir = modEngine.resolvePathInsideModRoot(targetModPath)
    if (!safeDir || !fs.existsSync(safeDir)) {
      return { success: false, error: 'Mod 目录不存在或超出 Mods 根目录' }
    }
    isFixRunning = true
    try {
      const isWuwa = g.id === 'wuwa'
      const result = restoreIniBackupForMod(safeDir, target.stamp, { includeWuwaIndependent: isWuwa })
      if (result.restoredCount > 0) {
        const envRoot = getEnvRootForGame(g)
        if (configStore.getConfig().persistBridgeEnabled && envRoot) {
          try {
            persistBridgeManager.syncAllActiveMods(envRoot, g.modFolderPath)
          } catch (_) {}
        }
        broadcastGameChanged('manual')
        dispatchReloadF10({ applyEchoGuard: false }).catch(() => {})
      }
      return result
    } catch (e: any) {
      return {
        success: false,
        restoreSucceeded: false,
        cleanupAttempted: false,
        cleanupSucceeded: false,
        snapshotDeleted: false,
        cleanupFailed: false,
        snapshotFileCount: 0,
        restoredCount: 0,
        removedBackupCount: 0,
        errors: [e.message || String(e)],
        cleanupErrors: [],
        error: e.message || '回滚失败'
      }
    } finally {
      isFixRunning = false
    }
  }

  ipcMain.handle('iniBackup:list', (_, target) => handleListModBackups(target))
  ipcMain.handle('ini-backup:list-mod', (_, target) => handleListModBackups(target))
  ipcMain.handle('iniBackup:restore', (_, target) => handleRestoreModBackup(target))
  ipcMain.handle('ini-backup:restore-mod', (_, target) => handleRestoreModBackup(target))

  // Mod 修复核心 (Fix Engine & External Fixer)
  const resolveFixRequestGameId = (
    requestedGameId?: string
  ): { gameId: string; error?: string } => {
    if (requestedGameId) {
      const trimmed = String(requestedGameId).trim()
      const found = configStore
        .getConfig()
        .games.find(
          (game) =>
            game.id === trimmed ||
            (trimmed === 'wuwa' && game.id === 'wuthering-waves') ||
            (trimmed === 'wuthering-waves' && game.id === 'wuwa')
        )
      if (!found) {
        return { gameId: '', error: `修复请求的游戏无效: ${trimmed}` }
      }
      return { gameId: found.id }
    }
    const active = configStore.getActiveGame()
    return { gameId: active?.id || 'wuwa' }
  }

  const handleFixRunAll = async (options?: { mode?: 'builtin' | 'external'; gameId?: string }) => {
    if (isFixRunning) {
      return { success: false, error: '已有修复或回滚任务正在进行中，请稍后再试' }
    }
    const gameScope = resolveFixRequestGameId(options?.gameId)
    if (gameScope.error) return { success: false, error: gameScope.error }
    const targetGameId = gameScope.gameId

    const g = configStore.getActiveGame()
    if (!g || !g.modFolderPath || !fs.existsSync(g.modFolderPath)) {
      return { success: false, error: 'Mods 路径未设置或不存在，请先在设置中配置' }
    }
    const mode = options?.mode === 'external' ? 'external' : 'builtin'
    isFixRunning = true
    try {
      let result: any
      if (modFixer.toInternalGameId(targetGameId) === 'wuwa' && mode !== 'external') {
        result = await modFixer.runWuwaBuiltinFix(g.modFolderPath)
      } else {
        const exePath = modFixer.resolveFixExePath(targetGameId)
        if (!exePath) return { success: false, error: '当前游戏没有对应的修复程序' }
        result = await modFixer.runExternalFixerForGame(targetGameId, exePath, g.modFolderPath)
        result = { ...result, exeName: path.basename(exePath) }
      }
      broadcastGameChanged('fix')
      return result
    } catch (e: any) {
      return { success: false, error: e.message || String(e) }
    } finally {
      isFixRunning = false
    }
  }

  const handleFixRunCharacter = async (payload: {
    characterName: string
    mode?: 'builtin' | 'external'
    gameId?: string
  }) => {
    if (isFixRunning) {
      return { success: false, error: '已有修复或回滚任务正在进行中，请稍后再试' }
    }
    const gameScope = resolveFixRequestGameId(payload?.gameId)
    if (gameScope.error) return { success: false, error: gameScope.error }
    const targetGameId = gameScope.gameId

    const g = configStore.getActiveGame()
    if (!g || !g.modFolderPath || !fs.existsSync(g.modFolderPath)) {
      return { success: false, error: 'Mods 路径未设置或不存在，请先在设置中配置' }
    }
    const safeChar = modEngine.sanitizePathSegment(payload?.characterName)
    if (!safeChar) return { success: false, error: '角色名称无效' }
    const charDir = modEngine.resolvePathInsideModRoot(path.join(g.modFolderPath, safeChar))
    if (!charDir || !fs.existsSync(charDir)) {
      return { success: false, error: `角色目录不存在或超出 Mods 路径: ${safeChar}` }
    }
    const mode = payload?.mode === 'external' ? 'external' : 'builtin'
    isFixRunning = true
    try {
      let result: any
      if (modFixer.toInternalGameId(targetGameId) === 'wuwa' && mode !== 'external') {
        result = await modFixer.runWuwaBuiltinFix(charDir)
      } else {
        const exePath = modFixer.resolveFixExePath(targetGameId)
        if (!exePath) return { success: false, error: '当前游戏没有对应的修复程序' }
        result = await modFixer.runExternalFixerForGame(targetGameId, exePath, charDir)
        result = { ...result, exeName: path.basename(exePath) }
      }
      broadcastGameChanged('fix')
      return result
    } catch (e: any) {
      return { success: false, error: e.message || String(e) }
    } finally {
      isFixRunning = false
    }
  }

  const handleFixRunMod = async (payload: {
    modFullPath?: string
    characterName?: string
    modName?: string
    mode?: 'builtin' | 'external'
    gameId?: string
  }) => {
    if (isFixRunning) {
      return { success: false, error: '已有修复或回滚任务正在进行中，请稍后再试' }
    }
    const gameScope = resolveFixRequestGameId(payload?.gameId)
    if (gameScope.error) return { success: false, error: gameScope.error }
    const targetGameId = gameScope.gameId

    const g = configStore.getActiveGame()
    if (!g || !g.modFolderPath || !fs.existsSync(g.modFolderPath)) {
      return { success: false, error: 'Mods 路径未设置或不存在，请先在设置中配置' }
    }
    let targetModPath = ''
    if (payload?.modFullPath) {
      targetModPath = payload.modFullPath
    } else if (payload?.characterName && payload?.modName) {
      const safeChar = modEngine.sanitizePathSegment(payload.characterName)
      const safeMod = modEngine.sanitizePathSegment(payload.modName)
      const p1 = path.join(g.modFolderPath, safeChar, safeMod)
      const p2 = path.join(g.modFolderPath, safeChar, `DISABLED_${safeMod}`)
      targetModPath = fs.existsSync(p1) ? p1 : p2
    }
    const safeDir = modEngine.resolvePathInsideModRoot(targetModPath)
    if (!safeDir || !fs.existsSync(safeDir)) {
      return {
        success: false,
        error: `Mod 目录不存在或超出 Mods 根目录: ${payload?.modName || targetModPath}`
      }
    }
    const mode = payload?.mode === 'external' ? 'external' : 'builtin'
    isFixRunning = true
    try {
      let result: any
      if (modFixer.toInternalGameId(targetGameId) === 'wuwa' && mode !== 'external') {
        result = await modFixer.runWuwaBuiltinFix(safeDir)
      } else {
        const exePath = modFixer.resolveFixExePath(targetGameId)
        if (!exePath) return { success: false, error: '当前游戏没有对应的修复程序' }
        result = await modFixer.runExternalFixerForGame(targetGameId, exePath, safeDir)
        result = { ...result, exeName: path.basename(exePath) }
      }
      broadcastGameChanged('fix')
      return result
    } catch (e: any) {
      return { success: false, error: e.message || String(e) }
    } finally {
      isFixRunning = false
    }
  }

  ipcMain.handle('fix:runAll', (_, options) => handleFixRunAll(options))
  ipcMain.handle('fix:run-all', (_, options) => handleFixRunAll(options))
  ipcMain.handle('fix:runCharacter', (_, payload) => handleFixRunCharacter(payload))
  ipcMain.handle('fix:run-character', (_, payload) => handleFixRunCharacter(payload))
  ipcMain.handle('fix:runMod', (_, payload) => handleFixRunMod(payload))
  ipcMain.handle('fix:run-mod', (_, payload) => handleFixRunMod(payload))

  const handleFixGetStatus = (_: any, options?: { gameId?: string }) => {
    const gameScope = resolveFixRequestGameId(options?.gameId)
    if (gameScope.error) return { success: false, error: gameScope.error }
    return modFixer.getStatus(gameScope.gameId)
  }
  ipcMain.handle('fix:getStatus', handleFixGetStatus)
  ipcMain.handle('fix:get-exe-path', handleFixGetStatus)

  const handleFixUpdateWuwaRules = async () => {
    try {
      const result = await modFixer.updateWuwaFixRules({ force: true })
      return {
        success: true,
        checked: result.checked,
        updated: result.updated,
        ruleSource: result.source,
        ruleVersion: result.manifest?.toolVersion,
        ruleRevision: result.manifest?.revision,
        gameVersion: result.manifest?.gameVersion,
        ...getWuwaFixRuleMetadata(result.manifest)
      }
    } catch (error: any) {
      let local: any = null
      try {
        local = modFixer.loadBestLocalWuwaFixRules()
      } catch (_) {}
      return {
        success: false,
        error: error?.message || String(error),
        ruleSource: local?.source,
        ruleVersion: local?.manifest?.toolVersion,
        ruleRevision: local?.manifest?.revision,
        gameVersion: local?.manifest?.gameVersion,
        ...(local?.manifest ? getWuwaFixRuleMetadata(local.manifest) : {})
      }
    }
  }
  ipcMain.handle('fix:updateWuwaRules', handleFixUpdateWuwaRules)
  ipcMain.handle('fix:update-wuwa-rules', handleFixUpdateWuwaRules)

  const handleFixSelectCustomExe = async (_: any, options?: { gameId?: string }) => {
    try {
      const gameScope = resolveFixRequestGameId(options?.gameId)
      if (gameScope.error) return { success: false, error: gameScope.error }
      const targetGameId = gameScope.gameId

      const dialogWindow = mainWindow ?? undefined
      const dialogOptions = {
        title: '选择修复程序',
        filters: [{ name: '修复程序或压缩包', extensions: ['exe', 'zip', 'rar', '7z'] }],
        properties: ['openFile'] as ['openFile']
      }
      const result = dialogWindow
        ? await dialog.showOpenDialog(dialogWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)
      if (result.canceled || !result.filePaths.length) return { canceled: true }
      const src = result.filePaths[0]
      console.log(`[mod-fixer] Selecting managed fixer: src=${src}, gameId=${targetGameId}`)
      const installed = await modFixer.installManagedFixerFromSource(src, targetGameId)
      return { ...installed, exePath: installed.resolvedExePath }
    } catch (e: any) {
      console.error(`[mod-fixer] selectCustomExe failed: ${e.message}`)
      return { success: false, error: e.message }
    }
  }
  ipcMain.handle('fix:selectCustomExe', handleFixSelectCustomExe)
  ipcMain.handle('fix:select-custom-exe', handleFixSelectCustomExe)

  // Mods
  ipcMain.handle('mods:scan', async () => {
    const g = configStore.getActiveGame()
    if (!g) return {}
    modEngine.setModFolderPath(g.modFolderPath)
    const rawLocalResult = await modEngine.scanMods()
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
    // 显式传入 gameId（如悬浮窗）时必须用该游戏自己的 modFolderPath 扫描，
    // 否则头像索引与当前激活游戏错配
    const g = gameId
      ? (configStore.getGameById(gameId) || configStore.getActiveGame())
      : configStore.getActiveGame()
    if (g) {
      modEngine.setModFolderPath(g.modFolderPath)
    }
    return modEngine.getCharacterAvatars(gameId || g?.id)
  })

  // 批量读取 Mod 元数据（批量检查更新用）：一次 IPC 并发读取，替代渲染层 N+1 串行
  ipcMain.handle('mods:batchDetails', async (_, fullPaths: string[]) => {
    if (!Array.isArray(fullPaths)) return {}
    const list = fullPaths.filter((p) => typeof p === 'string' && p).slice(0, 2000)
    const concurrency = 8
    const result: Record<string, any> = {}
    let cursor = 0
    const workers = Array(Math.min(concurrency, list.length))
      .fill(null)
      .map(async () => {
        while (cursor < list.length) {
          const p = list[cursor++]
          try {
            const d = await modEngine.getModDetails(p)
            if (d) {
              // modId/version/lastUpdated 位于 getModDetails 返回值的 metadata 下
              const meta: any = (d as any).metadata || {}
              result[p] = {
                fullPath: p,
                modId: meta.modId,
                version: meta.version,
                lastUpdated: meta.lastUpdated
              }
            }
          } catch (_) {
            /* 单个失败不影响整体 */
          }
        }
      })
    await Promise.all(workers)
    return result
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
      dispatchReloadF10({ applyEchoGuard: false }).catch(() => {})
    }
    return res
  })

  ipcMain.handle('mods:getDetails', (_, modFullPath: string) => {
    return modEngine.getModDetails(modFullPath)
  })

  ipcMain.handle('mods:saveMetadata', (_, modFullPath: string, metadata: any) => {
    return modEngine.saveModMetadata(modFullPath, metadata)
  })

  ipcMain.handle('mods:setBroken', (_, modFullPath: string, isBroken: boolean, reason?: string) => {
    const success = modEngine.setModBrokenStatus(modFullPath, isBroken, reason)
    return { success }
  })

  ipcMain.handle('mods:checkUpdate', async (_, params: { modId: number; localDate?: any; localVersion?: string }) => {
    return checkModUpdate(params)
  })

  ipcMain.handle('mods:checkAllUpdates', async (_, mods: Array<{ fullPath: string; modId: number; lastUpdated?: any; version?: string }>) => {
    return checkAllModsUpdates(mods)
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

  ipcMain.handle('mods:delete', async (_, modFullPath: string) => {
    if (!modFullPath || typeof modFullPath !== 'string') {
      return { success: false, error: '无效的模组路径' }
    }
    const resolved = path.resolve(modFullPath)
    if (!fs.existsSync(resolved)) {
      return { success: false, error: '模组目录不存在或已被移除' }
    }

    // 安全检查：目标必须在当前游戏 Mods 目录下，且至少是 Mods/角色名/模组名 级别，禁止误删根目录或角色目录
    // 注意：必须在无激活游戏时直接拒绝（此处不设防会造成任意路径删除）；
    // 包含判断必须用 path.relative（startsWith 前缀判断会被兄弟目录如 F:\x\Mods2 绕过）
    const g = configStore.getActiveGame()
    if (!g || !g.modFolderPath) {
      return { success: false, error: '未配置激活游戏或模组目录，拒绝删除' }
    }
    const modRoot = path.resolve(g.modFolderPath)
    const rel = path.relative(modRoot, resolved)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      return { success: false, error: '非法删除路径：目标超出模组目录范围' }
    }
    const parts = rel.split(/[\\/]/)
    if (parts.length < 2) {
      return { success: false, error: '非法删除路径：无法直接删除角色分类目录或根目录' }
    }

    try {
      await shell.trashItem(resolved)
      return { success: true, recycled: true }
    } catch (err: any) {
      console.warn('[LZ Main] shell.trashItem failed, attempting fallback rmSync:', err)
      try {
        fs.rmSync(resolved, { recursive: true, force: true })
        return { success: true, recycled: false }
      } catch (rmErr: any) {
        console.error('[LZ Main] Failed to remove mod directory:', rmErr)
        return { success: false, error: rmErr.message || '删除模组失败' }
      }
    }
  })

  ipcMain.handle('mods:moveToCharacter', async (_, modFullPath: string, targetCharacterName: string) => {
    const res = await modEngine.moveModToCharacter(modFullPath, targetCharacterName)
    if (res.success) {
      dispatchReloadF10({ applyEchoGuard: false }).catch(() => {})
    }
    return res
  })

  ipcMain.handle('mods:readIni', (_, iniPath: string) => {
    return modEngine.readIniFile(iniPath)
  })

  ipcMain.handle('mods:saveIni', (_, iniPath: string, content: string) => {
    return modEngine.saveIniFile(iniPath, content)
  })

  ipcMain.handle('mods:translateConfig', async (_, modFullPath: string) => {
    return autoTranslateModConfig(modFullPath, { forceCloud: true })
  })

  ipcMain.handle('mods:setVariableAlias', (_, modFullPath: string, varName: string, alias: string) => {
    return saveCustomVariableAlias(modFullPath, varName, alias)
  })

  // Conflicts
  ipcMain.handle('conflicts:detect', async (_, characterName?: string) => {
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
      dispatchReloadF10({ applyEchoGuard: false }).catch(() => {})
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
      dispatchReloadF10({ applyEchoGuard: false }).catch(() => {})
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

  ipcMain.handle('presets:create', async (_, name: string, description?: string) => {
    const g = configStore.getActiveGame()
    if (!g) throw new Error('No active game')
    const preset = await presetEngine.createPresetFromCurrent(g.id, name, description)
    return preset
  })

  ipcMain.handle('presets:apply', async (_, presetId: string) => {
    const g = configStore.getActiveGame()
    if (!g) return { success: false, applied: 0 }
    const res = await presetEngine.applyPreset(g.id, presetId)
    if (res.success) {
      dispatchReloadF10({ applyEchoGuard: false }).catch(() => {})
    }
    return res
  })

  ipcMain.handle('presets:delete', (_, presetId: string) => {
    const g = configStore.getActiveGame()
    if (!g) return false
    return presetEngine.deletePreset(g.id, presetId)
  })

  // Launcher & F10
  ipcMain.handle('game:launch', async (_, asAdmin?: boolean) => {
    const g = configStore.getActiveGame()
    if (!g) return { success: false, error: '未选择任何有效游戏' }
    return gameLauncher.launchGame(g, !!asAdmin)
  })

  ipcMain.handle('game:launchLoader', async () => {
    const g = configStore.getActiveGame()
    if (!g) return { success: false, error: '未选择任何有效游戏' }
    return gameLauncher.launchLoader(g)
  })

  ipcMain.handle('game:reloadModsF10', () => dispatchReloadF10({ applyEchoGuard: true }))

  ipcMain.handle('game:triggerHotkey', (_, keys: string[], targetProcName?: string) => {
    // 渲染层传入的进程名同样只允许是裸文件名，避免被指定到任意窗口上投递按键
    return dispatchHotkey(keys, sanitizeProcessName(targetProcName || ''))
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

    // 安装目录校验：targetParentDir 由渲染层传入，必须位于当前游戏 Mods 目录内，逃逸一律拒绝
    let targetParentDir = params.targetParentDir
    if (!targetParentDir && g && g.modFolderPath) {
      if (resolvedChar && resolvedChar !== 'all') {
        targetParentDir = path.join(g.modFolderPath, resolvedChar)
      } else {
        targetParentDir = g.modFolderPath
      }
    } else if (targetParentDir) {
      if (!g || !g.modFolderPath) {
        return { success: false, error: '未配置激活游戏或模组目录，拒绝安装' }
      }
      const rel = path.relative(path.resolve(g.modFolderPath), path.resolve(targetParentDir))
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
        return { success: false, error: '非法安装路径：目标目录超出模组目录范围' }
      }
      const parts = rel.split(/[\\/]/)
      parts[0] = normalizeCharacterName(parts[0], g.id)
      targetParentDir = path.join(path.resolve(g.modFolderPath), ...parts)
    }

    // 下载地址白名单：只允许来自 GameBanana 官方域名的 https 链接，防止渲染层注入任意下载源
    const downloadUrl = typeof params.downloadUrl === 'string' ? params.downloadUrl : ''
    if (!downloadUrl || !/^https:\/\//i.test(downloadUrl)) {
      return { success: false, error: '无效或缺失的下载地址' }
    }
    try {
      const downloadHost = new URL(downloadUrl).hostname.toLowerCase()
      if (downloadHost !== 'gamebanana.com' && !downloadHost.endsWith('.gamebanana.com')) {
        return { success: false, error: `下载地址域名不受支持: ${downloadHost}` }
      }
    } catch {
      return { success: false, error: '无效的下载地址' }
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
  ipcMain.handle('appearance:getSections', async (_, characterName: string) => {
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
    if (sectionId === 'base' || sectionId.startsWith('skin:')) {
      return { success: false, error: '官方时装分区不允许重命名' }
    }
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
    if (sectionId === 'base' || sectionId.startsWith('skin:')) {
      return { success: false, error: '官方时装分区不允许删除' }
    }
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
  ipcMain.handle('overlay:setOnlyInGame', (_, enabled: boolean) => {
    overlayManager.setOnlyShowInGame(enabled)
    return { success: true }
  })
  ipcMain.handle('overlay:getOnlyInGame', () => {
    return overlayManager.getOnlyShowInGame()
  })
  ipcMain.handle('overlay:setPinned', (_, pinned: boolean) => {
    overlayManager.setPinned(!!pinned)
    return { success: true }
  })

  // Window & System Controls
  ipcMain.handle('window:minimize', () => {
    if (mainWindow) {
      mainWindow.minimize()
    }
  })
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.handle('window:hideToTray', () => {
    if (mainWindow) {
      mainWindow.hide()
      trayManager?.notifyHiddenToTray()
    }
  })
  ipcMain.handle('window:close', (_event, action?: 'quit' | 'minimize_to_tray') => {
    const closeAction = action || configStore.getConfig().closeAction || 'minimize_to_tray'
    if (closeAction === 'minimize_to_tray') {
      if (mainWindow) {
        mainWindow.hide()
        trayManager?.notifyHiddenToTray()
      }
    } else {
      // 彻底退出程序，释放全部后台进程与内存
      trayManager?.setQuitting(true)
      app.quit()
    }
  })
}

if (app) {
  app.on('quit', (_e: Electron.Event | undefined, code: number) => {
    syncLog(`app quit, exitCode = ${code}`)
  })
  process.on('exit', (code) => syncLog(`process exit, code = ${code}`))
  app.whenReady().then(() => {
    syncLog('app ready, creating windows')
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.lz.manager.v1')
    }
    setupIpc()
    createMainWindow()
    overlayManager.createOverlayWindow()
    registerHotkeys()

    // 启动前台游戏窗口智能跟随服务
    gameFocusService.startWatch()

    // 初始化系统托盘常驻（托盘异常不应连锁阻断手柄监听等后续初始化）
    if (mainWindow) {
      try {
        trayManager = new TrayManager(mainWindow, {
          onToggleOverlay: () => overlayManager.toggleOverlay(),
          onReloadModsF10: () => dispatchReloadF10({ applyEchoGuard: false }),
          onLaunchGame: async () => {
            const g = configStore.getActiveGame()
            if (g) {
              await gameLauncher.launchGame(g)
            }
          },
          getActiveGame: () => configStore.getActiveGame() || null,
          getAllGames: () => configStore.getConfig().games || [],
          onSwitchGame: (gameId) => applyActiveGame(gameId, 'manual'),
          onOpenSettings: () => {
            if (mainWindow) {
              trayManager?.showMainWindow()
              mainWindow.webContents.send('app:navigate', 'settings')
            }
          },
          getCloseAction: () => configStore.getConfig().closeAction || 'minimize_to_tray'
        })
      } catch (trayErr) {
        console.warn('[LZ Main] TrayManager init failed, continue without tray:', trayErr)
        trayManager = null
      }
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
    overlayManager?.destroy()
    controllerService.stop()
    gameFocusService.stopWatch()
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
