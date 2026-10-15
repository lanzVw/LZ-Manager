import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { GameLauncher } from '../src/core/game-launcher'
import { ConfigStore } from '../src/core/config-store'
import { GameConfig } from '../src/core/types'

describe('GameLauncher - EFMI_OFFICIAL 官方启动器联动模式', () => {
  let tmpDir: string
  let launcher: GameLauncher

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-launcher-test-'))
    launcher = new GameLauncher(tmpDir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // 临时目录清理容灾
    }
  })

  describe('resolveOfficialLauncherPath 路径推导', () => {
    it('显式配置 officialLauncherPath 且文件存在时优先返回', () => {
      const explicitLauncher = path.join(tmpDir, 'CustomLauncher.exe')
      fs.writeFileSync(explicitLauncher, 'dummy')

      const game: GameConfig = {
        id: 'endfield',
        name: '终末地',
        shortName: '终末地',
        gamePath: path.join(tmpDir, 'games', 'Endfield Game', 'Endfield.exe'),
        modFolderPath: '',
        modLoaderPath: '',
        officialLauncherPath: explicitLauncher
      }

      expect(launcher.resolveOfficialLauncherPath(game)).toBe(explicitLauncher)
    })

    it('根据游戏路径推导候选 1 (两级父目录下的 Launcher.exe)', () => {
      const launcherDir = path.join(tmpDir, 'Hypergryph Launcher')
      const gameDir = path.join(launcherDir, 'games', 'Endfield Game')
      fs.mkdirSync(gameDir, { recursive: true })

      const officialExe = path.join(launcherDir, 'Launcher.exe')
      fs.writeFileSync(officialExe, 'dummy')

      const gameExe = path.join(gameDir, 'Endfield.exe')
      fs.writeFileSync(gameExe, 'dummy')

      const game: GameConfig = {
        id: 'endfield',
        name: '终末地',
        shortName: '终末地',
        gamePath: gameExe,
        modFolderPath: '',
        modLoaderPath: ''
      }

      expect(launcher.resolveOfficialLauncherPath(game)).toBe(officialExe)
    })

    it('根据游戏路径推导候选 2 (同级目录下的 Launcher.exe)', () => {
      const gameDir = path.join(tmpDir, 'EndfieldGame')
      fs.mkdirSync(gameDir, { recursive: true })

      const officialExe = path.join(gameDir, 'Launcher.exe')
      fs.writeFileSync(officialExe, 'dummy')

      const gameExe = path.join(gameDir, 'Endfield.exe')
      fs.writeFileSync(gameExe, 'dummy')

      const game: GameConfig = {
        id: 'endfield',
        name: '终末地',
        shortName: '终末地',
        gamePath: gameExe,
        modFolderPath: '',
        modLoaderPath: ''
      }

      expect(launcher.resolveOfficialLauncherPath(game)).toBe(officialExe)
    })

    it('根据游戏路径推导候选 3 (国际服 Gryphline Launcher.exe)', () => {
      const launcherDir = path.join(tmpDir, 'Gryphline')
      const gameDir = path.join(launcherDir, 'games', 'Endfield Game')
      fs.mkdirSync(gameDir, { recursive: true })

      const officialExe = path.join(launcherDir, 'Gryphline Launcher.exe')
      fs.writeFileSync(officialExe, 'dummy')

      const gameExe = path.join(gameDir, 'Endfield.exe')
      fs.writeFileSync(gameExe, 'dummy')

      const game: GameConfig = {
        id: 'endfield',
        name: '终末地',
        shortName: '终末地',
        gamePath: gameExe,
        modFolderPath: '',
        modLoaderPath: ''
      }

      expect(launcher.resolveOfficialLauncherPath(game)).toBe(officialExe)
    })

    it('所有候选文件均不存在时返回空字符串', () => {
      const game: GameConfig = {
        id: 'endfield',
        name: '终末地',
        shortName: '终末地',
        gamePath: path.join(tmpDir, 'nonexistent', 'Endfield.exe'),
        modFolderPath: '',
        modLoaderPath: ''
      }

      expect(launcher.resolveOfficialLauncherPath(game)).toBe('')
    })
  })

  describe('ensureXxmiManualMode 配置修改', () => {
    it('正确向上查找到 XXMI Launcher Config.json 并将 DIRECT 改为 MANUAL，同时调整 start_timeout', () => {
      const xxmiRoot = path.join(tmpDir, 'XXMI')
      const binDir = path.join(xxmiRoot, 'Resources', 'Bin')
      fs.mkdirSync(binDir, { recursive: true })

      const loaderPath = path.join(binDir, 'XXMI Launcher.exe')
      fs.writeFileSync(loaderPath, 'dummy')

      const configPath = path.join(xxmiRoot, 'XXMI Launcher Config.json')
      const initialConfig = {
        Launcher: {
          start_timeout: 30
        },
        Importers: {
          EFMI: {
            Importer: {
              game_launch: 'DIRECT',
              start_timeout: 30
            }
          }
        }
      }
      fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2), 'utf8')

      launcher.ensureXxmiManualMode(loaderPath, 'EFMI')

      const updated = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      expect(updated.Importers.EFMI.Importer.game_launch).toBe('MANUAL')
      expect(updated.Importers.EFMI.Importer.start_timeout).toBe(60)
      expect(updated.Launcher.start_timeout).toBe(60)
      // 验证备份文件生成
      expect(fs.existsSync(`${configPath}.bak`)).toBe(true)
    })

    it('当配置文件已处于 MANUAL 且 timeout >= 60 时保持稳定', () => {
      const xxmiRoot = path.join(tmpDir, 'XXMI')
      const binDir = path.join(xxmiRoot, 'Resources', 'Bin')
      fs.mkdirSync(binDir, { recursive: true })

      const loaderPath = path.join(binDir, 'XXMI Launcher.exe')
      fs.writeFileSync(loaderPath, 'dummy')

      const configPath = path.join(xxmiRoot, 'XXMI Launcher Config.json')
      const initialConfig = {
        Launcher: {
          start_timeout: 90
        },
        Importers: {
          EFMI: {
            Importer: {
              game_launch: 'MANUAL',
              start_timeout: 60
            }
          }
        }
      }
      fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2), 'utf8')

      launcher.ensureXxmiManualMode(loaderPath, 'EFMI')

      const updated = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      expect(updated.Importers.EFMI.Importer.game_launch).toBe('MANUAL')
      expect(updated.Launcher.start_timeout).toBe(90)
    })
  })

  describe('launchGame EFMI_OFFICIAL 调度流程', () => {
    it('未配置或未找到加载器时返回失败', async () => {
      const game: GameConfig = {
        id: 'endfield',
        name: '终末地',
        shortName: '终末地',
        gamePath: '',
        modFolderPath: '',
        modLoaderPath: path.join(tmpDir, 'not_exists.exe'),
        launchMode: 'EFMI_OFFICIAL'
      }

      const res = await launcher.launchGame(game)
      expect(res.success).toBe(false)
      expect(res.error).toContain('未找到 EFMI 对应的 XXMI Launcher 加载器路径')
    })

    it('加载器存在且检测到官方启动器时提权调起官方启动器并返回引导提示', async () => {
      const xxmiRoot = path.join(tmpDir, 'XXMI')
      const binDir = path.join(xxmiRoot, 'Resources', 'Bin')
      fs.mkdirSync(binDir, { recursive: true })

      const loaderPath = path.join(binDir, 'XXMI Launcher.exe')
      fs.writeFileSync(loaderPath, 'dummy')

      const launcherDir = path.join(tmpDir, 'Hypergryph Launcher')
      const gameDir = path.join(launcherDir, 'games', 'Endfield Game')
      fs.mkdirSync(gameDir, { recursive: true })

      const officialExe = path.join(launcherDir, 'Launcher.exe')
      fs.writeFileSync(officialExe, 'dummy')
      const gameExe = path.join(gameDir, 'Endfield.exe')
      fs.writeFileSync(gameExe, 'dummy')

      // 拦截底层进程拉起，验证加载器使用普通方式调起，官方启动器使用提权方式调起
      const launchedViaStart: string[] = []
      const launchedElevated: string[] = []
      vi.spyOn(launcher as any, 'launchViaStart').mockImplementation((exePath: string) => {
        launchedViaStart.push(exePath)
        return Promise.resolve({ success: true })
      })
      vi.spyOn(launcher as any, 'launchElevated').mockImplementation((exePath: string) => {
        launchedElevated.push(exePath)
        return Promise.resolve({ success: true })
      })

      const game: GameConfig = {
        id: 'endfield',
        name: '终末地',
        shortName: '终末地',
        gamePath: gameExe,
        modFolderPath: '',
        modLoaderPath: loaderPath,
        launchMode: 'EFMI_OFFICIAL'
      }

      const res = await launcher.launchGame(game)
      expect(res.success).toBe(true)
      expect(res.message).toContain('EFMI 注入监听已就绪，已唤起官方启动器')
      expect(res.message).toContain('以 DirectX 11 启动')
      // 验证加载器走常规启动，官方启动器走提权启动
      expect(launchedViaStart).toEqual([loaderPath])
      expect(launchedElevated).toEqual([officialExe])
    })

    it('终末地模式为 EFMI 且存在官方启动器时，自动双向兜底走 EFMI_OFFICIAL 联动流程并提权拉起', async () => {
      const xxmiRoot = path.join(tmpDir, 'XXMI')
      const binDir = path.join(xxmiRoot, 'Resources', 'Bin')
      fs.mkdirSync(binDir, { recursive: true })

      const loaderPath = path.join(binDir, 'XXMI Launcher.exe')
      fs.writeFileSync(loaderPath, 'dummy')

      const launcherDir = path.join(tmpDir, 'Hypergryph Launcher')
      const gameDir = path.join(launcherDir, 'games', 'Endfield Game')
      fs.mkdirSync(gameDir, { recursive: true })

      const officialExe = path.join(launcherDir, 'Launcher.exe')
      fs.writeFileSync(officialExe, 'dummy')
      const gameExe = path.join(gameDir, 'Endfield.exe')
      fs.writeFileSync(gameExe, 'dummy')

      const launchedViaStart: string[] = []
      const launchedElevated: string[] = []
      vi.spyOn(launcher as any, 'launchViaStart').mockImplementation((exePath: string) => {
        launchedViaStart.push(exePath)
        return Promise.resolve({ success: true })
      })
      vi.spyOn(launcher as any, 'launchElevated').mockImplementation((exePath: string) => {
        launchedElevated.push(exePath)
        return Promise.resolve({ success: true })
      })

      // 模拟老配置中未切换为 EFMI_OFFICIAL 的终末地配置 (依然是 EFMI)
      const legacyGame: GameConfig = {
        id: 'endfield',
        name: '终末地',
        shortName: '终末地',
        gamePath: gameExe,
        modFolderPath: '',
        modLoaderPath: loaderPath,
        launchMode: 'EFMI'
      }

      const res = await launcher.launchGame(legacyGame)
      expect(res.success).toBe(true)
      expect(res.message).toContain('EFMI 注入监听已就绪，已唤起官方启动器')
      expect(launchedViaStart).toEqual([loaderPath])
      expect(launchedElevated).toEqual([officialExe])
    })

    it('终末地模式为 EFMI 且未检测到官方启动器时，正常回退至常规 EFMI 加载器模式', async () => {
      const xxmiRoot = path.join(tmpDir, 'XXMI')
      const binDir = path.join(xxmiRoot, 'Resources', 'Bin')
      fs.mkdirSync(binDir, { recursive: true })

      const loaderPath = path.join(binDir, 'XXMI Launcher.exe')
      fs.writeFileSync(loaderPath, 'dummy')

      const launchedViaStart: string[] = []
      const launchedElevated: string[] = []
      vi.spyOn(launcher as any, 'launchViaStart').mockImplementation((exePath: string) => {
        launchedViaStart.push(exePath)
        return Promise.resolve({ success: true })
      })
      vi.spyOn(launcher as any, 'launchElevated').mockImplementation((exePath: string) => {
        launchedElevated.push(exePath)
        return Promise.resolve({ success: true })
      })

      const game: GameConfig = {
        id: 'endfield',
        name: '终末地',
        shortName: '终末地',
        gamePath: path.join(tmpDir, 'nonexistent', 'Endfield.exe'),
        modFolderPath: '',
        modLoaderPath: loaderPath,
        launchMode: 'EFMI'
      }

      const res = await launcher.launchGame(game)
      expect(res.success).toBe(true)
      // 常规模式直接调起加载器，无需提权拉起官方启动器
      expect(launchedViaStart).toEqual([loaderPath])
      expect(launchedElevated).toEqual([])
    })

    it('加载器存在但未检测到官方启动器时返回手动打开提示', async () => {
      const xxmiRoot = path.join(tmpDir, 'XXMI')
      const binDir = path.join(xxmiRoot, 'Resources', 'Bin')
      fs.mkdirSync(binDir, { recursive: true })

      const loaderPath = path.join(binDir, 'XXMI Launcher.exe')
      fs.writeFileSync(loaderPath, 'dummy')

      const launchedCommands: string[] = []
      vi.spyOn(launcher as any, 'launchViaStart').mockImplementation((exePath: string) => {
        launchedCommands.push(exePath)
        return Promise.resolve({ success: true })
      })

      const game: GameConfig = {
        id: 'endfield',
        name: '终末地',
        shortName: '终末地',
        gamePath: path.join(tmpDir, 'nonexistent', 'Endfield.exe'),
        modFolderPath: '',
        modLoaderPath: loaderPath,
        launchMode: 'EFMI_OFFICIAL'
      }

      const res = await launcher.launchGame(game)
      expect(res.success).toBe(true)
      expect(res.message).toContain('未检测到官方启动器路径')
      expect(res.message).toContain('请手动打开鹰角启动器')
      expect(launchedCommands).toEqual([loaderPath])
    })
  })
})

describe('ConfigStore - EFMI_OFFICIAL 兼容与初始化', () => {
  it('默认 endfield 配置包含 EFMI_OFFICIAL 启动模式且默认模式为 EFMI_OFFICIAL', () => {
    const store = new ConfigStore()
    const endfield = store.getConfig().games.find((g) => g.id === 'endfield')
    expect(endfield).toBeDefined()
    expect(endfield?.supportedLaunchModes).toContain('EFMI_OFFICIAL')
    expect(endfield?.launchMode).toBe('EFMI_OFFICIAL')
  })

  it('旧配置如果未包含 EFMI_OFFICIAL，加载后自动追加兼容并将 launchMode 迁移至 EFMI_OFFICIAL', () => {
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-cfg-legacy-'))
    const cfgPath = path.join(legacyDir, 'config.json')
    const legacyData = {
      activeGameId: 'endfield',
      games: [
        {
          id: 'endfield',
          name: '明日方舟：终末地',
          shortName: '终末地',
          gamePath: 'E:\\Hypergryph Launcher\\games\\Endfield Game\\Endfield.exe',
          modFolderPath: 'F:\\XXMI\\EFMI\\Mods',
          modLoaderPath: 'F:\\XXMI\\Resources\\Bin\\XXMI Launcher.exe',
          launchMode: 'EFMI',
          supportedLaunchModes: ['EFMI', 'XXMI']
        }
      ]
    }
    fs.writeFileSync(cfgPath, JSON.stringify(legacyData, null, 2), 'utf8')

    const store = new ConfigStore(legacyDir)
    const endfield = store.getConfig().games.find((g) => g.id === 'endfield')
    expect(endfield?.supportedLaunchModes).toContain('EFMI_OFFICIAL')
    expect(endfield?.supportedLaunchModes).toContain('EFMI')
    expect(endfield?.supportedLaunchModes).toContain('XXMI')
    expect(endfield?.launchMode).toBe('EFMI_OFFICIAL')

    try {
      fs.rmSync(legacyDir, { recursive: true, force: true })
    } catch {
      // 容灾清理
    }
  })
})
