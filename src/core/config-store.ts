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
    const visibleGames = this.config.games.filter(g => !g.hidden)
    const game = visibleGames.find(g => g.id === this.config.activeGameId)
    return game || (visibleGames.length > 0 ? visibleGames[0] : (this.config.games[0] || null))
  }

  public getGameById(gameId: string): GameConfig | null {
    if (!gameId) return null
    return this.config.games.find(g => g.id === gameId) || null
  }

  public setActiveGame(gameId: string) {
    this.config.activeGameId = gameId
    this.saveConfig()
  }

  public updateGameConfig(gameId: string, patch: Partial<GameConfig>) {
    const idx = this.config.games.findIndex(g => g.id === gameId)
    if (idx !== -1) {
      this.config.games[idx] = { ...this.config.games[idx], ...patch }
      // 如果隐藏了当前激活游戏，自动将 activeGameId 顺移至首个可见游戏
      if (patch.hidden && this.config.activeGameId === gameId) {
        const visible = this.config.games.filter(g => !g.hidden)
        if (visible.length > 0) {
          this.config.activeGameId = visible[0].id
        }
      }
      this.saveConfig()
    }
  }

  public updateAppConfig(patch: Partial<AppConfig>) {
    this.config = { ...this.config, ...patch }
    this.saveConfig()
  }

  public getCharacterSections(gameId: string, charName: string): any[] {
    const raw = (this.config as any).characterSectionsByGame || {}
    const gameStore = raw[gameId] || {}
    return gameStore[charName] || []
  }

  public setCharacterSections(gameId: string, charName: string, sections: any[]) {
    if (!(this.config as any).characterSectionsByGame) {
      (this.config as any).characterSectionsByGame = {}
    }
    if (!(this.config as any).characterSectionsByGame[gameId]) {
      (this.config as any).characterSectionsByGame[gameId] = {}
    }
    (this.config as any).characterSectionsByGame[gameId][charName] = sections
    this.saveConfig()
  }

  /**
   * 原子化写 JSON：写临时文件 → 备份当前文件(.bak) → rename 替换。
   * 避免"写一半被杀/磁盘满"产生截断损坏；rename 失败时原文件仍在。
   */
  private atomicWriteJson(filePath: string, data: string) {
    const tmpPath = `${filePath}.tmp`
    fs.writeFileSync(tmpPath, data, 'utf8')
    try {
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, `${filePath}.bak`)
      }
      fs.renameSync(tmpPath, filePath)
    } catch (err) {
      // rename 失败时保留 tmp 与 .bak，不覆盖原文件，并把错误抛给调用方
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch { /* ignore */ }
      throw err
    }
  }

  public saveConfig() {
    try {
      this.atomicWriteJson(this.configPath, JSON.stringify(this.config, null, 2))
    } catch (err) {
      console.error('Failed to save config.json:', err)
    }
  }

  public savePresets() {
    try {
      this.atomicWriteJson(this.presetsPath, JSON.stringify(this.presets, null, 2))
    } catch (err) {
      console.error('Failed to save presets.json:', err)
    }
  }

  /** 解析失败时优先尝试 .bak 备份；全部失败则把坏文件改名 .broken 留证后走默认 */
  private readJsonWithRecovery(filePath: string): any | null {
    const candidates = [filePath, `${filePath}.bak`]
    for (const candidate of candidates) {
      try {
        if (!fs.existsSync(candidate)) continue
        const data = JSON.parse(fs.readFileSync(candidate, 'utf8'))
        if (data && typeof data === 'object') {
          if (candidate !== filePath) {
            console.warn(`[config-store] ${filePath} 损坏，已从备份 ${candidate} 恢复`)
          }
          return data
        }
      } catch (err) {
        console.error(`[config-store] Failed to parse ${candidate}:`, err)
      }
    }
    try {
      if (fs.existsSync(filePath)) {
        const broken = `${filePath}.broken-${Date.now()}`
        fs.renameSync(filePath, broken)
        console.warn(`[config-store] ${filePath} 无法解析，已重命名为 ${broken}`)
      }
    } catch (err) {
      console.error('[config-store] Failed to quarantine broken file:', err)
    }
    return null
  }

  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = this.readJsonWithRecovery(this.configPath)
        if (!data) {
          console.error('Error reading config.json, fallback to defaults')
        } else {
          let games: GameConfig[] = Array.isArray(data.games) ? data.games : []
          if (games.length === 0) {
            games = this.getDefaultGames(data)
          } else {
            // 老版本配置升级兼容：确保终末地游戏拥有 EFMI_OFFICIAL 支持选项与推荐启动模式
            for (const g of games) {
              if (g.id === 'endfield') {
                if (!g.supportedLaunchModes) {
                  g.supportedLaunchModes = ['EFMI', 'EFMI_OFFICIAL', 'XXMI']
                } else if (!g.supportedLaunchModes.includes('EFMI_OFFICIAL')) {
                  g.supportedLaunchModes.push('EFMI_OFFICIAL')
                }
                // 老配置平滑迁移：终末地 1.6+ 官方启动器强校验注入，将 EFMI 自动升级为 EFMI_OFFICIAL
                if (g.launchMode === 'EFMI') {
                  g.launchMode = 'EFMI_OFFICIAL'
                }
              }
            }
          }

          const visibleGames = games.filter((g) => !g.hidden)
          const validActive = visibleGames.some((g) => g.id === data.activeGameId)
          const activeGameId = validActive
            ? data.activeGameId
            : (visibleGames.length > 0 ? visibleGames[0].id : (games.length > 0 ? games[0].id : 'zzz'))

          return {
            activeGameId,
            games,
            characterUsage: data.characterUsage || {},
            serverUrl: data.serverUrl || 'https://qaqm.top',
            enableOptionAExclusive: data.enableOptionAExclusive ?? true,
            overlayHotkey: data.overlayHotkey || 'Ctrl+F',
            persistBridgeEnabled: data.persistBridgeEnabled ?? true,
            persistBridgeCacheSize: typeof data.persistBridgeCacheSize === 'number' ? data.persistBridgeCacheSize : 12,
            closeAction: data.closeAction || 'minimize_to_tray'
          }
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
      persistBridgeCacheSize: 12,
      closeAction: 'minimize_to_tray'
    }
  }

  private loadPresets(): PresetsData {
    try {
      if (fs.existsSync(this.presetsPath)) {
        const data = this.readJsonWithRecovery(this.presetsPath)
        // 校验形状：可解析但结构不对的内容会打穿 presetsByGame 访问
        if (data && typeof data === 'object' && !Array.isArray(data) && data.presetsByGame && typeof data.presetsByGame === 'object' && !Array.isArray(data.presetsByGame)) {
          return data as PresetsData
        }
        console.warn('[config-store] presets.json 结构异常，已重置为空预设')
        return { presetsByGame: {} }
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
        launchMode: 'EFMI_OFFICIAL',
        supportedLaunchModes: ['EFMI', 'EFMI_OFFICIAL', 'XXMI']
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
