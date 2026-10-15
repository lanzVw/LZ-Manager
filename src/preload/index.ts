import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AppearanceSection,
  AppConfig,
  CharacterConflictReport,
  EnvironmentStatus,
  GamePresets,
  ModDetailedInfo,
  ModItem,
  ModPersistInfo,
  Preset
} from '../core/types'

const flairxApi = {
  // Config
  // 注意：配置对象在运行时可能带有 AppConfig 未声明的持久化键（如 theme），因此带索引签名兜底
  getConfig: (): Promise<AppConfig & Record<string, any>> => ipcRenderer.invoke('config:get'),
  updateAppConfig: (patch: any): Promise<{ success: boolean; config: AppConfig }> =>
    ipcRenderer.invoke('config:updateApp', patch),
  setActiveGame: (gameId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('config:setActiveGame', gameId),
  updateGameConfig: (
    gameId: string,
    patch: any
  ): Promise<{ success: boolean; error?: string; config?: AppConfig }> =>
    ipcRenderer.invoke('config:updateGame', gameId, patch),

  // Mods
  scanMods: (): Promise<Record<string, ModItem[]>> => ipcRenderer.invoke('mods:scan'),
  toggleMod: (characterName: string, modName: string, enabled: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('mods:toggle', characterName, modName, enabled),
  getModDetails: (modFullPath: string): Promise<ModDetailedInfo | null> =>
    ipcRenderer.invoke('mods:getDetails', modFullPath),
  saveModMetadata: (modFullPath: string, metadata: any): Promise<boolean> =>
    ipcRenderer.invoke('mods:saveMetadata', modFullPath, metadata),
  setModBrokenStatus: (modFullPath: string, isBroken: boolean, reason?: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('mods:setBroken', modFullPath, isBroken, reason),
  checkModUpdate: (params: { modId: number; localDate?: any; localVersion?: string }) =>
    ipcRenderer.invoke('mods:checkUpdate', params),
  checkAllModsUpdates: (mods: Array<{ fullPath: string; modId: number; lastUpdated?: any; version?: string }>) =>
    ipcRenderer.invoke('mods:checkAllUpdates', mods),
  getModsBatchDetails: (fullPaths: string[]) => ipcRenderer.invoke('mods:batchDetails', fullPaths),
  openModFolder: (modFullPath: string) => ipcRenderer.invoke('mods:openFolder', modFullPath),
  setAsCoverImage: (modFullPath: string, imagePath: string) =>
    ipcRenderer.invoke('mods:setAsCover', modFullPath, imagePath),
  saveModCover: (modFullPath: string, dataUrl: string) =>
    ipcRenderer.invoke('mods:saveCoverFromData', modFullPath, dataUrl),
  hasCoverBackup: (modFullPath: string) =>
    ipcRenderer.invoke('mods:hasCoverBackup', modFullPath),
  rollbackModCover: (modFullPath: string) =>
    ipcRenderer.invoke('mods:rollbackCover', modFullPath),
  deleteModImage: (imagePath: string) => ipcRenderer.invoke('mods:deleteImage', imagePath),
  deleteMod: (modFullPath: string) => ipcRenderer.invoke('mods:delete', modFullPath),
  moveToCharacter: (modFullPath: string, targetCharacterName: string) =>
    ipcRenderer.invoke('mods:moveToCharacter', modFullPath, targetCharacterName),
  readIni: (iniPath: string) => ipcRenderer.invoke('mods:readIni', iniPath),
  saveIni: (iniPath: string, content: string) => ipcRenderer.invoke('mods:saveIni', iniPath, content),
  translateConfig: (modFullPath: string) => ipcRenderer.invoke('mods:translateConfig', modFullPath),
  setVariableAlias: (modFullPath: string, varName: string, alias: string) =>
    ipcRenderer.invoke('mods:setVariableAlias', modFullPath, varName, alias),
  inspectArchive: (archivePath: string) => ipcRenderer.invoke('mods:inspectArchive', archivePath),
  importArchive: (params: any) => ipcRenderer.invoke('mods:importArchive', params),

  // Characters
  getCharacterAvatars: (gameId?: string): Promise<Record<string, string>> =>
    ipcRenderer.invoke('characters:getAvatars', gameId),
  setCharacterAvatar: (characterName: string, imagePath: string) =>
    ipcRenderer.invoke('characters:setAvatar', characterName, imagePath),
  saveCharacterAvatar: (characterName: string, dataUrl: string) =>
    ipcRenderer.invoke('characters:saveAvatarFromData', characterName, dataUrl),
  openCharacterFolder: (characterName: string) =>
    ipcRenderer.invoke('mods:openCharacterFolder', characterName),

  // Persist Bridge
  getModPersistInfo: (modFullPath: string): Promise<ModPersistInfo> =>
    ipcRenderer.invoke('persist:getInfo', modFullPath),
  updateModVariable: (modFullPath: string, varName: string, value: string) =>
    ipcRenderer.invoke('persist:updateVariable', modFullPath, varName, value),
  resetModVariables: (modFullPath: string) =>
    ipcRenderer.invoke('persist:resetVariables', modFullPath),
  clearPersistCache: () => ipcRenderer.invoke('persist:clearCache'),
  resetModIni: (
    params: { modFullPath?: string; characterName?: string; modName?: string } | string
  ): Promise<{ success: boolean; restoredCount: number; error?: string }> =>
    ipcRenderer.invoke(
      'persist:resetIni',
      typeof params === 'string' ? { modFullPath: params } : params
    ),
  resetCharacterIni: (
    params: string | { characterName: string }
  ): Promise<{ success: boolean; restoredCount: number; error?: string }> => {
    const characterName = typeof params === 'string' ? params : params.characterName
    return ipcRenderer.invoke('persist:resetIniCharacter', characterName)
  },

  // Mod Fix & Ini Backup
  fixRunAll: (
    modeOrOptions?: 'builtin' | 'external' | { mode?: 'builtin' | 'external'; gameId?: string },
    gameId?: string
  ): Promise<any> => {
    let mode: 'builtin' | 'external' = 'builtin'
    let gid = gameId
    if (typeof modeOrOptions === 'object' && modeOrOptions !== null) {
      mode = modeOrOptions.mode || 'builtin'
      gid = modeOrOptions.gameId || gid
    } else if (typeof modeOrOptions === 'string') {
      mode = modeOrOptions
    }
    return ipcRenderer.invoke('fix:runAll', { mode, gameId: gid })
  },
  fixRunCharacter: (
    characterNameOrParams:
      | string
      | { characterName: string; mode?: 'builtin' | 'external'; gameId?: string },
    mode: 'builtin' | 'external' = 'builtin',
    gameId?: string
  ): Promise<any> => {
    const charName = typeof characterNameOrParams === 'string' ? characterNameOrParams : characterNameOrParams.characterName
    const m = typeof characterNameOrParams === 'object' && characterNameOrParams ? (characterNameOrParams.mode || mode) : mode
    const gid = typeof characterNameOrParams === 'object' && characterNameOrParams ? (characterNameOrParams.gameId || gameId) : gameId
    return ipcRenderer.invoke('fix:runCharacter', { characterName: charName, mode: m, gameId: gid })
  },
  fixRunMod: (
    params:
      | {
          modFullPath?: string
          characterName?: string
          modName?: string
          mode?: 'builtin' | 'external'
          gameId?: string
        }
      | string,
    mode: 'builtin' | 'external' = 'builtin'
  ): Promise<any> => {
    const payload = typeof params === 'string' ? { modFullPath: params, mode } : { mode, ...params }
    return ipcRenderer.invoke('fix:runMod', payload)
  },
  fixGetStatus: (gameId?: string): Promise<any> => ipcRenderer.invoke('fix:getStatus', { gameId }),
  fixGetExePath: (gameId?: string): Promise<any> => ipcRenderer.invoke('fix:getStatus', { gameId }),
  fixUpdateWuwaRules: (): Promise<any> => ipcRenderer.invoke('fix:updateWuwaRules'),
  fixSelectCustomExe: (gameId?: string): Promise<any> =>
    ipcRenderer.invoke('fix:selectCustomExe', { gameId }),

  listModIniBackups: (
    params: { modFullPath?: string; characterName?: string; modName?: string } | string
  ): Promise<{
    success: boolean
    backups: Array<{
      stamp: string
      format: 'qaqm' | 'wuwa-independent'
      sortKey: string
      label: string
      fileCount: number
    }>
    error?: string
  }> =>
    ipcRenderer.invoke(
      'iniBackup:list',
      typeof params === 'string' ? { modFullPath: params } : params
    ),
  restoreModIniBackup: (
    params:
      | { modFullPath?: string; characterName?: string; modName?: string; stamp: string }
      | { characterName: string; modName: string; stamp: string }
  ): Promise<any> => ipcRenderer.invoke('iniBackup:restore', params),

  // Conflicts
  detectConflicts: (
    characterName?: string
  ): Promise<CharacterConflictReport | Record<string, CharacterConflictReport> | null> =>
    ipcRenderer.invoke('conflicts:detect', characterName),
  resolveConflicts: (
    characterName: string,
    keepModName: string,
    conflictingModNames: string[]
  ): Promise<{ success: boolean; disabledCount: number }> =>
    ipcRenderer.invoke('conflicts:resolve', characterName, keepModName, conflictingModNames),

  // Environment
  checkEnvironment: (gameId?: string): Promise<EnvironmentStatus | null> =>
    ipcRenderer.invoke('env:check', gameId),
  deployEnvironment: (gameId?: string): Promise<{ success: boolean; message: string; deployedFiles: string[] }> =>
    ipcRenderer.invoke('env:deploy', gameId),

  // Presets
  getPresets: (): Promise<GamePresets> => ipcRenderer.invoke('presets:get'),
  createPreset: (name: string, description?: string): Promise<Preset> =>
    ipcRenderer.invoke('presets:create', name, description),
  applyPreset: (
    presetId: string
  ): Promise<{
    success: boolean
    applied: number
    error?: string
    failed?: Array<{ characterName: string; modName: string; error?: string }>
    message?: string
  }> => ipcRenderer.invoke('presets:apply', presetId),
  deletePreset: (presetId: string): Promise<boolean> => ipcRenderer.invoke('presets:delete', presetId),

  // Launcher & F10 & Hotkeys
  launchGame: (asAdmin?: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('game:launch', asAdmin),
  launchLoader: () => ipcRenderer.invoke('game:launchLoader'),
  reloadModsF10: () => ipcRenderer.invoke('game:reloadModsF10'),
  triggerHotkey: (keys: string[], targetProcName?: string) =>
    ipcRenderer.invoke('game:triggerHotkey', keys, targetProcName),

  // GameBanana
  getGameBananaCharacters: (gameId: string) =>
    ipcRenderer.invoke('gamebanana:getCharacters', gameId),
  searchGameBanana: (params: any) => ipcRenderer.invoke('gamebanana:search', params),
  getGameBananaDetails: (params: any) => ipcRenderer.invoke('gamebanana:details', params),
  installGameBananaMod: (params: any) => ipcRenderer.invoke('gamebanana:install', params),
  onInstallProgress: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('gamebanana:installProgress', handler)
    return () => ipcRenderer.removeListener('gamebanana:installProgress', handler)
  },
  detectGameBananaCharacter: (modInfo: any, gameId?: string) =>
    ipcRenderer.invoke('gamebanana:detectCharacter', modInfo, gameId),
  translateText: (params: {
    title?: string
    description?: string
    text?: string
  }): Promise<{ translatedTitle: string; translatedDescription: string; translatedText: string; cached: boolean }> =>
    ipcRenderer.invoke('translate:text', params),

  // Appearance Sections
  getAppearanceSections: (characterName: string): Promise<AppearanceSection[]> =>
    ipcRenderer.invoke('appearance:getSections', characterName),
  createAppearanceSection: (characterName: string, name: string, coverUrl?: string) =>
    ipcRenderer.invoke('appearance:createSection', characterName, name, coverUrl),
  updateAppearanceSection: (characterName: string, sectionId: string, name: string) =>
    ipcRenderer.invoke('appearance:updateSection', characterName, sectionId, name),
  deleteAppearanceSection: (characterName: string, sectionId: string) =>
    ipcRenderer.invoke('appearance:deleteSection', characterName, sectionId),
  setModAppearanceSection: (modFullPath: string, sectionId: string) =>
    ipcRenderer.invoke('appearance:setModSection', modFullPath, sectionId),

  // Overlay
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  hideOverlay: () => ipcRenderer.invoke('overlay:hide'),
  showOverlay: () => ipcRenderer.invoke('overlay:show'),
  setOverlayScale: (scale: number) => ipcRenderer.invoke('overlay:setScale', scale),
  getOverlayScale: () => ipcRenderer.invoke('overlay:getScale'),
  setOverlayOnlyInGame: (enabled: boolean) => ipcRenderer.invoke('overlay:setOnlyInGame', enabled),
  getOverlayOnlyInGame: () => ipcRenderer.invoke('overlay:getOnlyInGame'),
  setOverlayPinned: (pinned: boolean) => ipcRenderer.invoke('overlay:setPinned', pinned),
  onShowToast: (callback: (msg: string) => void) => {
    const listener = (_: any, msg: string) => callback(msg)
    ipcRenderer.on('overlay:toast', listener)
    return () => ipcRenderer.removeListener('overlay:toast', listener)
  },
  onGameChanged: (callback: (data: { game: any; gameId: string; origin?: string }) => void) => {
    const listener = (_: any, data: any) => callback(data)
    ipcRenderer.on('game:changed', listener)
    return () => ipcRenderer.removeListener('game:changed', listener)
  },
  onOverlayShown: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('overlay:shown', listener)
    return () => ipcRenderer.removeListener('overlay:shown', listener)
  },

  // Window & System Controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  hideToTray: () => ipcRenderer.invoke('window:hideToTray'),
  close: (action?: 'quit' | 'minimize_to_tray') => ipcRenderer.invoke('window:close', action),
  openExternalUrl: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  // Electron 32+ 已移除 File.path，拖拽文件路径必须经 webUtils 获取
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('lz', flairxApi)
contextBridge.exposeInMainWorld('flairx', flairxApi)

export type LZApi = typeof flairxApi
export type FlairXApi = LZApi
