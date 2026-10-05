import React, { useState, useEffect } from 'react'
import {
  Settings,
  Folder,
  FileCode,
  Check,
  Save,
  Wrench,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Sparkles,
  Layers
} from 'lucide-react'
import { EnvironmentStatus } from '../../core/types'

interface SettingsPageProps {
  activeGame: any
  onSaveGameConfig: (patch: any) => Promise<void>
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  activeGame,
  onSaveGameConfig
}) => {
  const [gamePath, setGamePath] = useState(activeGame?.gamePath || '')
  const [modFolderPath, setModFolderPath] = useState(activeGame?.modFolderPath || '')
  const [modLoaderPath, setModLoaderPath] = useState(activeGame?.modLoaderPath || '')
  const [saved, setSaved] = useState(false)

  // 运行环境检测与一键部署状态
  const [envStatus, setEnvStatus] = useState<EnvironmentStatus | null>(null)
  const [envChecking, setEnvChecking] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<string | null>(null)

  const loadEnvironmentStatus = async () => {
    setEnvChecking(true)
    try {
      const status = await window.lz.checkEnvironment()
      if (status) setEnvStatus(status)
    } catch (err) {
      console.error('Failed to check environment:', err)
    } finally {
      setEnvChecking(false)
    }
  }

  useEffect(() => {
    setGamePath(activeGame?.gamePath || '')
    setModFolderPath(activeGame?.modFolderPath || '')
    setModLoaderPath(activeGame?.modLoaderPath || '')
    loadEnvironmentStatus()
  }, [activeGame])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSaveGameConfig({
      gamePath,
      modFolderPath,
      modLoaderPath
    })
    setSaved(true)
    await loadEnvironmentStatus()
    setTimeout(() => setSaved(false), 2000)
  }

  const handleAutoDeploy = async () => {
    setDeploying(true)
    setDeployResult(null)
    try {
      const res = await window.lz.deployEnvironment()
      if (res && res.success) {
        setDeployResult(`✅ ${res.message} (${res.deployedFiles.join(', ')})`)
        await loadEnvironmentStatus()
      } else {
        setDeployResult(`❌ ${res?.message || '部署失败'}`)
      }
    } catch (err: any) {
      setDeployResult(`❌ 部署异常: ${err.message}`)
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-slate-950/40 p-6 space-y-6">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        
        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <Settings className="w-5 h-5 text-blue-400" />
            <span>游戏环境与路径设置 - {activeGame?.name}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            配置当前游戏的可执行文件、Mods 存放目录以及 XXMI / 3DMigoto 加载器路径
          </p>
        </div>

        {/* 1. 3DMigoto / XXMI 运行环境诊断与一键部署 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  3DMigoto / XXMI 运行环境健康度诊断
                </h3>
                <p className="text-xs text-slate-400">
                  自动检查 DirectX 运行库挂载、DLL 依赖与 Mods 映射
                </p>
              </div>
            </div>

            <button
              onClick={loadEnvironmentStatus}
              disabled={envChecking}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              title="刷新环境诊断"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${envChecking ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Diagnostic Grid */}
          {envStatus && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Game Exe */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">游戏本体程序</span>
                  <div className="text-xs font-mono text-slate-200 mt-0.5 truncate max-w-[200px]">
                    {envStatus.gamePath ? envStatus.gamePath.split(/[/\\]/).pop() : '未配置'}
                  </div>
                </div>
                {envStatus.gameExeExists ? (
                  <span className="flex items-center space-x-1 text-xs text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>存在</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-xs text-rose-400 font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>缺失</span>
                  </span>
                )}
              </div>

              {/* 3DMigoto DLL */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">3DMigoto 注入 DLL</span>
                  <div className="text-xs font-mono text-slate-200 mt-0.5">
                    d3d11.dll / dxgi.dll
                  </div>
                </div>
                {envStatus.d3d11Exists || envStatus.dxgiExists ? (
                  <span className="flex items-center space-x-1 text-xs text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>已挂载</span>
                  </span>
                ) : envStatus.xxmiRuntimeExists ? (
                  <span className="flex items-center space-x-1 text-xs text-blue-400 font-semibold">
                    <Layers className="w-4 h-4" />
                    <span>XXMI独立</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-xs text-amber-400 font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>未挂载</span>
                  </span>
                )}
              </div>

              {/* XXMI Runtime */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">XXMI 运行库</span>
                  <div className="text-xs font-mono text-slate-200 mt-0.5 truncate max-w-[200px]">
                    {envStatus.xxmiRuntimePath ? envStatus.xxmiRuntimePath.split(/[/\\]/).pop() : '未检测到'}
                  </div>
                </div>
                {envStatus.xxmiRuntimeExists ? (
                  <span className="flex items-center space-x-1 text-xs text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>已就绪</span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 font-medium">无独立运行库</span>
                )}
              </div>

              {/* Mod Directory */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">Mods 目录状态</span>
                  <div className="text-xs font-mono text-slate-200 mt-0.5">
                    Mods 文件夹
                  </div>
                </div>
                {envStatus.modFolderExists ? (
                  <span className="flex items-center space-x-1 text-xs text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>有效</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-xs text-rose-400 font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>不可用</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Deploy Action */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800">
            <div className="text-xs">
              <span className={`font-semibold ${envStatus?.ready ? 'text-emerald-400' : 'text-amber-400'}`}>
                {envStatus?.message || '正在检测环境...'}
              </span>
            </div>

            <button
              onClick={handleAutoDeploy}
              disabled={deploying || !envStatus?.gameExeExists}
              className="flex items-center justify-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition disabled:opacity-50 active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>{deploying ? '正在部署运行库...' : '🛠️ 一键部署 / 同步 3DMigoto 运行库'}</span>
            </button>
          </div>

          {deployResult && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200">
              {deployResult}
            </div>
          )}
        </div>

        {/* 2. 路径配置表单 */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <Folder className="w-4 h-4 text-blue-400" />
              <span>路径详细配置</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                游戏本体可执行文件路径 (Game Executable)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={gamePath}
                  onChange={(e) => setGamePath(e.target.value)}
                  placeholder="例如：E:\Games\ZenlessZoneZero\ZenlessZoneZero.exe"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Mod 目录路径 (Mods Folder)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={modFolderPath}
                  onChange={(e) => setModFolderPath(e.target.value)}
                  placeholder="例如：F:\XXMI\ZZMI\Mods"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                XXMI / 3DMigoto 加载器路径 (Mod Loader)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={modLoaderPath}
                  onChange={(e) => setModLoaderPath(e.target.value)}
                  placeholder="例如：F:\XXMI\Resources\Bin\XXMI Launcher.exe"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* 3. 系统托盘常驻说明 */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-2">
            <h3 className="text-xs font-bold text-slate-300 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>系统托盘常驻与快捷响应</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              LZ Manager 已默认开启系统托盘常驻。关闭窗口时程序将自动隐藏至右下角系统托盘，保持低内存占用（约 30MB），并在您按下 <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-200 font-mono">Ctrl+F</kbd> 或手柄 <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-200 font-mono">Back+Start</kbd> 时瞬间在游戏上层呼出悬浮窗。
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500">
              * 设置会自动与原版 QAQManager 配置文件保持双向兼容同步
            </span>

            <button
              type="submit"
              className={`flex items-center space-x-1.5 px-6 py-2.5 rounded-xl text-xs font-semibold transition ${
                saved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
              }`}
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>已保存设置！</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>保存设置</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
