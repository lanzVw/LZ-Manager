import { contextBridge, ipcRenderer } from 'electron'

const flairxApi = {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateAppConfig: (patch: any) => ipcRenderer.invoke('config:updateApp', patch),
  setActiveGame: (gameId: string) => ipcRenderer.invoke('config:setActiveGame', gameId),
  updateGameConfig: (gameId: string, patch: any) => ipcRenderer.invoke('config:updateGame', gameId, patch),

  // Mods
  scanMods: () => ipcRenderer.invoke('mods:scan'),
  toggleMod: (characterName: string, modName: string, enabled: boolean) =>
    ipcRenderer.invoke('mods:toggle', characterName, modName, enabled),
  getModDetails: (modFullPath: string) => ipcRenderer.invoke('mods:getDetails', modFullPath),
  saveModMetadata: (modFullPath: string, metadata: any) =>
    ipcRenderer.invoke('mods:saveMetadata', modFullPath, metadata),
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
  readIni: (iniPath: string) => ipcRenderer.invoke('mods:readIni', iniPath),
  saveIni: (iniPath: string, content: string) => ipcRenderer.invoke('mods:saveIni', iniPath, content),
  inspectArchive: (archivePath: string) => ipcRenderer.invoke('mods:inspectArchive', archivePath),
  importArchive: (params: any) => ipcRenderer.invoke('mods:importArchive', params),

  // Characters
  getCharacterAvatars: (gameId?: string) => ipcRenderer.invoke('characters:getAvatars', gameId),
  setCharacterAvatar: (characterName: string, imagePath: string) =>
    ipcRenderer.invoke('characters:setAvatar', characterName, imagePath),
  saveCharacterAvatar: (characterName: string, dataUrl: string) =>
    ipcRenderer.invoke('characters:saveAvatarFromData', characterName, dataUrl),
  openCharacterFolder: (characterName: string) =>
    ipcRenderer.invoke('mods:openCharacterFolder', characterName),

  // Persist Bridge
  getModPersistInfo: (modFullPath: string) => ipcRenderer.invoke('persist:getInfo', modFullPath),
  updateModVariable: (modFullPath: string, varName: string, value: string) =>
    ipcRenderer.invoke('persist:updateVariable', modFullPath, varName, value),
  resetModVariables: (modFullPath: string) =>
    ipcRenderer.invoke('persist:resetVariables', modFullPath),
  clearPersistCache: () => ipcRenderer.invoke('persist:clearCache'),

  // Conflicts
  detectConflicts: (characterName?: string) =>
    ipcRenderer.invoke('conflicts:detect', characterName),
  resolveConflicts: (characterName: string, keepModName: string, conflictingModNames: string[]) =>
    ipcRenderer.invoke('conflicts:resolve', characterName, keepModName, conflictingModNames),

  // Environment
  checkEnvironment: (gameId?: string) =>
    ipcRenderer.invoke('env:check', gameId),
  deployEnvironment: (gameId?: string) =>
    ipcRenderer.invoke('env:deploy', gameId),

  // Presets
  getPresets: () => ipcRenderer.invoke('presets:get'),
  createPreset: (name: string, description?: string) =>
    ipcRenderer.invoke('presets:create', name, description),
  applyPreset: (presetId: string) => ipcRenderer.invoke('presets:apply', presetId),
  deletePreset: (presetId: string) => ipcRenderer.invoke('presets:delete', presetId),

  // Launcher & F10
  launchGame: (asAdmin?: boolean) => ipcRenderer.invoke('game:launch', asAdmin),
  launchLoader: () => ipcRenderer.invoke('game:launchLoader'),
  reloadModsF10: () => ipcRenderer.invoke('game:reloadModsF10'),

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
  translateText: (params: { title?: string; description?: string; text?: string }) =>
    ipcRenderer.invoke('translate:text', params),

  // Appearance Sections
  getAppearanceSections: (characterName: string) =>
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

  // Window & System Controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  openExternalUrl: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url)
}

contextBridge.exposeInMainWorld('lz', flairxApi)
contextBridge.exposeInMainWorld('flairx', flairxApi)

export type LZApi = typeof flairxApi
export type FlairXApi = LZApi
