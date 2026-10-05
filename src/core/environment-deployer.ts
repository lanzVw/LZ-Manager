import fs from 'fs'
import path from 'path'
import { GameConfig, EnvironmentStatus } from './types'

export class EnvironmentDeployer {
  /**
   * 检查指定游戏的 3DMigoto / XXMI 运行环境完整度
   */
  public checkEnvironment(game: GameConfig): EnvironmentStatus {
    const gameId = game.id
    const gameName = game.name
    const gamePath = game.gamePath || ''
    const modFolderPath = game.modFolderPath || ''

    if (!gamePath) {
      return {
        gameId,
        gameName,
        gamePath: '',
        gameDir: '',
        gameExeExists: false,
        d3d11Exists: false,
        dxgiExists: false,
        d3dxIniExists: false,
        xxmiRuntimeExists: false,
        modFolderExists: fs.existsSync(modFolderPath),
        ready: false,
        status: 'not_configured',
        message: '未配置游戏可执行文件路径'
      }
    }

    const gameExeExists = fs.existsSync(gamePath)
    const gameDir = path.dirname(gamePath)

    if (!gameExeExists) {
      return {
        gameId,
        gameName,
        gamePath,
        gameDir,
        gameExeExists: false,
        d3d11Exists: false,
        dxgiExists: false,
        d3dxIniExists: false,
        xxmiRuntimeExists: false,
        modFolderExists: fs.existsSync(modFolderPath),
        ready: false,
        status: 'missing_game',
        message: `游戏文件不存在: ${path.basename(gamePath)}`
      }
    }

    // 检查游戏目录下的 DLL
    const d3d11InGame = fs.existsSync(path.join(gameDir, 'd3d11.dll'))
    const dxgiInGame = fs.existsSync(path.join(gameDir, 'dxgi.dll'))
    const d3dxIniInGame = fs.existsSync(path.join(gameDir, 'd3dx.ini'))

    // 检查 XXMI 运行时目录 (例如 F:\XXMI\ZZMI 或 F:\XXMI\EFMI)
    let xxmiRuntimePath = ''
    let xxmiRuntimeExists = false
    if (modFolderPath) {
      const parentDir = path.dirname(modFolderPath)
      const d3d11InParent = fs.existsSync(path.join(parentDir, 'd3d11.dll'))
      const d3dxIniInParent = fs.existsSync(path.join(parentDir, 'd3dx.ini'))
      if (d3d11InParent || d3dxIniInParent) {
        xxmiRuntimeExists = true
        xxmiRuntimePath = parentDir
      }
    }

    const modFolderExists = fs.existsSync(modFolderPath)

    // 判断就绪标准：
    // 无论是游戏内直装模式 (gameDir 下有 d3d11.dll) 还是 XXMI 独立注入模式 (XXMI runtime 存在且 modLoaderPath 存在)
    const hasLoader = game.modLoaderPath && fs.existsSync(game.modLoaderPath)
    const isDirectReady = d3d11InGame || dxgiInGame
    const isLoaderReady = (hasLoader || xxmiRuntimeExists) && modFolderExists

    const ready = isDirectReady || isLoaderReady

    let status: EnvironmentStatus['status'] = 'ready'
    let message = '3DMigoto / XXMI 运行环境就绪'

    if (!ready) {
      status = 'missing_dll'
      message = '未检测到 3DMigoto 注入 DLL (d3d11.dll) 或 XXMI 运行库'
    } else if (!modFolderExists) {
      status = 'missing_dll'
      message = 'Mod 文件夹不存在或无法访问'
    }

    return {
      gameId,
      gameName,
      gamePath,
      gameDir,
      gameExeExists: true,
      d3d11Exists: d3d11InGame,
      dxgiExists: dxgiInGame,
      d3dxIniExists: d3dxIniInGame,
      xxmiRuntimeExists,
      xxmiRuntimePath,
      modFolderExists,
      ready,
      status,
      message
    }
  }

  /**
   * 一键自动部署或同步 3DMigoto 环境到游戏目录
   */
  public deployEnvironment(game: GameConfig): { success: boolean; message: string; deployedFiles: string[] } {
    const status = this.checkEnvironment(game)
    if (!status.gameExeExists) {
      return { success: false, message: '游戏可执行文件不存在，请先在设置中配置正确路径', deployedFiles: [] }
    }

    const gameDir = status.gameDir
    const deployedFiles: string[] = []

    try {
      // 1. 如果 XXMI 运行时目录存在 (如 F:\XXMI\ZZMI)，从中同步 d3d11.dll 与 d3dcompiler_47.dll 到游戏目录
      if (status.xxmiRuntimePath && fs.existsSync(status.xxmiRuntimePath)) {
        const sourceFiles = ['d3d11.dll', 'd3dcompiler_47.dll', 'd3dx.ini']
        for (const file of sourceFiles) {
          const src = path.join(status.xxmiRuntimePath, file)
          const dst = path.join(gameDir, file)
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dst)
            deployedFiles.push(file)
          }
        }
      }

      // 2. 确保 Mod 目录存在
      if (game.modFolderPath && !fs.existsSync(game.modFolderPath)) {
        fs.mkdirSync(game.modFolderPath, { recursive: true })
        deployedFiles.push('Mods 目录')
      }

      // 3. 检查并修正 d3dx.ini 中的 target
      const d3dxIniPath = path.join(gameDir, 'd3dx.ini')
      if (fs.existsSync(d3dxIniPath)) {
        let iniContent = fs.readFileSync(d3dxIniPath, 'utf8')
        const targetExe = path.basename(game.gamePath)
        // 修正 target = ...
        if (!iniContent.includes(`target = ${targetExe}`)) {
          iniContent = iniContent.replace(/^(\s*target\s*=\s*).*$/m, `$1${targetExe}`)
          fs.writeFileSync(d3dxIniPath, iniContent, 'utf8')
          deployedFiles.push('d3dx.ini target 配置修正')
        }
      }

      return {
        success: true,
        message: `成功为 ${game.name} 部署并同步 3DMigoto 运行环境！`,
        deployedFiles
      }
    } catch (err: any) {
      console.error('Failed to deploy 3DMigoto environment:', err)
      return {
        success: false,
        message: `部署失败: ${err.message}`,
        deployedFiles
      }
    }
  }
}
