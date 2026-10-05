import fs from 'fs'
import path from 'path'
import os from 'os'
import { AppConfig, GameConfig, PresetsData } from './types'

export class ConfigStore {
  private configDir: string
  private configPath: string
  private presetsPath: string
  private config: AppConfig
  private presets: PresetsData

  constructor() {
    // 优先读取原版 QAQManager 目录，实现 100% 无缝继承用户既有数据
    const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support') : path.join(os.homedir(), '.config'))
    this.configDir = path.join(appData, 'QAQManager')
    
    if (!fs.existsSync(this.configDir)) {
      try {
        fs.mkdirSync(this.configDir, { recursive: true })
      } catch (err) {
        console.error('Failed to create configDir:', err)
      }
    }

    this.configPath = path.join(this.configDir, 'config.json')
    this.presetsPath = path.join(this.configDir, 'presets.json')
    
    this.config = this.loadConfig()
    this.presets = this.loadPresets()
  }

  public getConfig(): AppConfig {
    return this.config
  }

  public getPresets(): PresetsData {
    return this.presets
  }

  public getActiveGame(): GameConfig | null {
    const game = this.config.games.find(g => g.id === this.config.activeGameId)
    return game || (this.config.games.length > 0 ? this.config.games[0] : null)
  }

  public setActiveGame(gameId: string) {
    this.config.activeGameId = gameId
    this.saveConfig()
  }

  public updateGameConfig(gameId: string, patch: Partial<GameConfig>) {
    const idx = this.config.games.findIndex(g => g.id === gameId)
    if (idx !== -1) {
      this.config.games[idx] = { ...this.config.games[idx], ...patch }
      this.saveConfig()
    }
  }

  public updateAppConfig(patch: Partial<AppConfig>) {
    this.config = { ...this.config, ...patch }
    this.saveConfig()
  }

  public saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8')
    } catch (err) {
      console.error('Failed to save config.json:', err)
    }
  }

  public savePresets() {
    try {
      fs.writeFileSync(this.presetsPath, JSON.stringify(this.presets, null, 2), 'utf8')
    } catch (err) {
      console.error('Failed to save presets.json:', err)
    }
  }

  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8')
        const data = JSON.parse(raw)
        
        let games: GameConfig[] = Array.isArray(data.games) ? data.games : []
        if (games.length === 0) {
          games = this.getDefaultGames(data)
        }

        const activeGameId = data.activeGameId || (games.length > 0 ? games[0].id : 'zzz')

        return {
          activeGameId,
          games,
          characterUsage: data.characterUsage || {},
          serverUrl: data.serverUrl || 'https://qaqm.top',
          enableOptionAExclusive: data.enableOptionAExclusive ?? true,
          overlayHotkey: data.overlayHotkey || 'Ctrl+F',
          persistBridgeEnabled: data.persistBridgeEnabled ?? true,
          persistBridgeCacheSize: typeof data.persistBridgeCacheSize === 'number' ? data.persistBridgeCacheSize : 12
        }
      }
    } catch (err) {
      console.error('Error reading config.json, fallback to defaults:', err)
    }

    return {
      activeGameId: 'zzz',
      games: this.getDefaultGames(),
      characterUsage: {},
      serverUrl: 'https://qaqm.top',
      enableOptionAExclusive: true,
      overlayHotkey: 'Ctrl+F',
      persistBridgeEnabled: true,
      persistBridgeCacheSize: 12
    }
  }

  private loadPresets(): PresetsData {
    try {
      if (fs.existsSync(this.presetsPath)) {
        const raw = fs.readFileSync(this.presetsPath, 'utf8')
        return JSON.parse(raw)
      }
    } catch (err) {
      console.error('Error reading presets.json:', err)
    }
    return { presetsByGame: {} }
  }

  private getDefaultGames(existingData: any = {}): GameConfig[] {
    return [
      {
        id: 'zzz',
        name: '绝区零',
        shortName: '绝区零',
        description: 'HoYoverse 都市动作游戏 (ZZMI 环境)',
        gamePath: existingData.gamePath || '',
        modFolderPath: existingData.modsPath || 'F:\\XXMI\\ZZMI\\Mods',
        modLoaderPath: existingData.loaderPath || 'F:\\XXMI\\Resources\\Bin\\XXMI Launcher.exe',
        launchMode: 'ZZMI'
      },
      {
        id: 'endfield',
        name: '明日方舟：终末地',
        shortName: '终末地',
        description: 'Hypergryph 3D 工业科幻 RPG (EFMI 环境)',
        gamePath: 'E:\\Hypergryph Launcher\\games\\Endfield Game\\Endfield.exe',
        modFolderPath: 'F:\\XXMI\\EFMI\\Mods',
        modLoaderPath: 'F:\\XXMI\\Resources\\Bin\\XXMI Launcher.exe',
        launchMode: 'EFMI'
      },
      {
        id: 'wuwa',
        name: '鸣潮',
        shortName: '鸣潮',
        description: 'Kuro Games 开放世界动作 RPG (WWMI 环境)',
        gamePath: '',
        modFolderPath: 'F:\\XXMI\\WWMI\\Mods',
        modLoaderPath: 'F:\\XXMI\\Resources\\Bin\\XXMI Launcher.exe',
        launchMode: 'WWMI'
      },
      {
        id: 'honkai-star-rail',
        name: '崩坏：星穹铁道',
        shortName: '星穹铁道',
        description: 'HoYoverse 银河冒险策略 RPG (SRMI 环境)',
        gamePath: '',
        modFolderPath: 'F:\\XXMI\\SRMI\\Mods',
        modLoaderPath: 'F:\\XXMI\\Resources\\Bin\\XXMI Launcher.exe',
        launchMode: 'SRMI'
      },
      {
        id: 'genshin',
        name: '原神',
        shortName: '原神',
        description: 'HoYoverse 开放世界冒险 RPG (GIMI 环境)',
        gamePath: '',
        modFolderPath: 'F:\\XXMI\\GIMI\\Mods',
        modLoaderPath: 'F:\\XXMI\\Resources\\Bin\\XXMI Launcher.exe',
        launchMode: 'GIMI'
      }
    ]
  }
}
