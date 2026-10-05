import { contextBridge, ipcRenderer } from 'electron'

const flairxApi = {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setActiveGame: (gameId: string) => ipcRenderer.invoke('config:setActiveGame', gameId),
  updateGameConfig: (gameId: string, patch: any) => ipcRenderer.invoke('config:updateGame', gameId, patch),

  // Mods
  scanMods: () => ipcRenderer.invoke('mods:scan'),
  toggleMod: (characterName: string, modName: string, enabled: boolean) =>
    ipcRenderer.invoke('mods:toggle', characterName, modName, enabled),

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

  // Window Controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close')
}

contextBridge.exposeInMainWorld('lz', flairxApi)
contextBridge.exposeInMainWorld('flairx', flairxApi)

export type LZApi = typeof flairxApi
export type FlairXApi = LZApi
