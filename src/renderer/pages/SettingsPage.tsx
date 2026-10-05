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
  Layers,
  Trash2,
  Zap,
  RotateCcw,
  Cpu
} from 'lucide-react'
import { EnvironmentStatus } from '../../core/types'

interface SettingsPageProps {
  activeGame: any
  onSaveGameConfig: (patch: any) => Promise<void>
  config?: any
  onUpdateAppConfig?: (patch: any) => Promise<void>
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  activeGame,
  onSaveGameConfig,
  config,
  onUpdateAppConfig
}) => {
  const [gamePath, setGamePath] = useState(activeGame?.gamePath || '')
  const [modFolderPath, setModFolderPath] = useState(activeGame?.modFolderPath || '')
  const [modLoaderPath, setModLoaderPath] = useState(activeGame?.modLoaderPath || '')
  const [saved, setSaved] = useState(false)

  // Persist Bridge 状态记忆设置
  const [persistBridgeEnabled, setPersistBridgeEnabled] = useState<boolean>(
    config?.persistBridgeEnabled ?? true
  )
  const [persistBridgeCacheSize, setPersistBridgeCacheSize] = useState<number>(
    typeof config?.persistBridgeCacheSize === 'number' ? config.persistBridgeCacheSize : 12
  )
  const [clearingCache, setClearingCache] = useState<boolean>(false)
  const [clearResult, setClearResult] = useState<string | null>(null)

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

  const loadAppConfig = async () => {
    try {
      const cfg = config || (await window.lz.getConfig())
      if (cfg) {
        setPersistBridgeEnabled(cfg.persistBridgeEnabled ?? true)
        setPersistBridgeCacheSize(
          typeof cfg.persistBridgeCacheSize === 'number' ? cfg.persistBridgeCacheSize : 12
        )
      }
    } catch (_) {}
  }

  useEffect(() => {
    setGamePath(activeGame?.gamePath || '')
    setModFolderPath(activeGame?.modFolderPath || '')
    setModLoaderPath(activeGame?.modLoaderPath || '')
    loadEnvironmentStatus()
    loadAppConfig()
  }, [activeGame, config])

  const handleTogglePersistBridge = async (val: boolean) => {
    setPersistBridgeEnabled(val)
    if (onUpdateAppConfig) {
      await onUpdateAppConfig({ persistBridgeEnabled: val })
    } else {
      await window.lz.updateAppConfig({ persistBridgeEnabled: val })
    }
  }

  const handleChangeCacheSize = async (size: number) => {
    setPersistBridgeCacheSize(size)
    if (onUpdateAppConfig) {
      await onUpdateAppConfig({ persistBridgeCacheSize: size })
    } else {
      await window.lz.updateAppConfig({ persistBridgeCacheSize: size })
    }
  }

  const handleClearPersistCache = async () => {
    if (
      !window.confirm(
        '确定要清空 Persist Bridge 缓存的状态文件吗？\n清空后已停用 Mod 的历史设定记忆将被重置，再次启用时将恢复初始默认设置。'
      )
    ) {
      return
    }
    setClearingCache(true)
    setClearResult(null)
    try {
      const res = await window.lz.clearPersistCache()
      if (res && res.success) {
        setClearResult(`✅ 已成功清空缓存，共移除 ${res.deletedCount} 个 Mod 状态记忆文件`)
      } else {
        setClearResult(`❌ 清空失败: ${res?.error || '未知错误'}`)
      }
    } catch (err: any) {
      setClearResult(`❌ 清空异常: ${err.message}`)
    } finally {
      setClearingCache(false)
    }
  }

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
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6 select-none porcelain-scrollbar">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2.5 tracking-wide">
            <Settings className="w-5 h-5 text-sky-400" />
            <span>游戏环境与路径设置 · {activeGame?.name}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            配置当前游戏的可执行文件、Mods 存放目录以及 XXMI / 3DMigoto 加载器路径
          </p>
        </div>

        {/* 1. 3DMigoto / XXMI 运行环境诊断与一键部署 */}
        <div className="bg-[#0c1426]/75 border border-white/[0.08] backdrop-blur-xl rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-2xl bg-blue-500/15 text-sky-400 border border-blue-400/20">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>3DMigoto / XXMI 运行环境健康度诊断</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  自动检查 DirectX 运行库挂载、DLL 依赖与 Mods 映射
                </p>
              </div>
            </div>

            <button
              onClick={loadEnvironmentStatus}
              disabled={envChecking}
              className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/10 hover:border-sky-400/40 transition active:scale-95 shadow-sm"
              title="刷新环境诊断"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${envChecking ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Diagnostic Grid */}
          {envStatus && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
              {/* Game Exe */}
              <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase">GAME EXECUTABLE</span>
                  <div className="text-xs font-mono font-bold text-slate-200 mt-0.5 truncate max-w-[190px]">
                    {envStatus.gamePath ? envStatus.gamePath.split(/[/\\]/).pop() : '未配置'}
                  </div>
                </div>
                {envStatus.gameExeExists ? (
                  <span className="flex items-center space-x-1 text-xs text-sky-300 font-semibold bg-blue-500/15 px-2.5 py-0.5 rounded-full border border-blue-400/20">
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>存在</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-xs text-rose-300 font-semibold bg-rose-500/15 px-2.5 py-0.5 rounded-full border border-rose-500/30">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>缺失</span>
                  </span>
                )}
              </div>

              {/* 3DMigoto DLL */}
              <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase">INJECTION DLL</span>
                  <div className="text-xs font-mono font-bold text-slate-200 mt-0.5">
                    d3d11.dll / dxgi.dll
                  </div>
                </div>
                {envStatus.d3d11Exists || envStatus.dxgiExists ? (
                  <span className="flex items-center space-x-1 text-xs text-sky-300 font-semibold bg-blue-500/15 px-2.5 py-0.5 rounded-full border border-blue-400/20">
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>已挂载</span>
                  </span>
                ) : envStatus.xxmiRuntimeExists ? (
                  <span className="flex items-center space-x-1 text-xs text-sky-300 font-semibold bg-blue-500/15 px-2.5 py-0.5 rounded-full border border-blue-400/20">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span>XXMI独立</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-xs text-amber-300 font-semibold bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>未挂载</span>
                  </span>
                )}
              </div>

              {/* XXMI Runtime */}
              <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase">XXMI RUNTIME</span>
                  <div className="text-xs font-mono font-bold text-slate-200 mt-0.5 truncate max-w-[190px]">
                    {envStatus.xxmiRuntimePath ? envStatus.xxmiRuntimePath.split(/[/\\]/).pop() : '未检测到'}
                  </div>
                </div>
                {envStatus.xxmiRuntimeExists ? (
                  <span className="flex items-center space-x-1 text-xs text-sky-300 font-semibold bg-blue-500/15 px-2.5 py-0.5 rounded-full border border-blue-400/20">
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>就绪</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-slate-400 font-medium">无独立运行库</span>
                )}
              </div>

              {/* Mod Directory */}
              <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase">MOD FOLDER</span>
                  <div className="text-xs font-mono font-bold text-slate-200 mt-0.5">
                    Mods 目录
                  </div>
                </div>
                {envStatus.modFolderExists ? (
                  <span className="flex items-center space-x-1 text-xs text-sky-300 font-semibold bg-blue-500/15 px-2.5 py-0.5 rounded-full border border-blue-400/20">
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>有效</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-xs text-rose-300 font-semibold bg-rose-500/15 px-2.5 py-0.5 rounded-full border border-rose-500/30">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>不可用</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Deploy Action */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/[0.06]">
            <div className="text-xs font-sans">
              <span className={`font-semibold ${envStatus?.ready ? 'text-sky-300' : 'text-amber-300'}`}>
                {envStatus?.message || '正在检测环境状态...'}
              </span>
            </div>

            <button
              onClick={handleAutoDeploy}
              disabled={deploying || !envStatus?.gameExeExists}
              className="flex items-center justify-center space-x-2 px-4 py-2 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 hover:from-blue-600 hover:to-sky-500 text-white text-xs font-bold shadow-md shadow-blue-900/30 transition active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 fill-sky-200" />
              <span>{deploying ? '正在部署运行库...' : '一键部署 / 同步 3DMigoto 运行库'}</span>
            </button>
          </div>

          {deployResult && (
            <div className="p-3 rounded-2xl bg-black/40 border border-white/10 text-xs font-mono text-slate-200">
              {deployResult}
            </div>
          )}
        </div>

        {/* 2. 保留 Mod 设定数值 (Persist Bridge 状态记忆) */}
        <div className="bg-[#0c1426]/75 border border-white/[0.08] backdrop-blur-xl rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-2xl bg-blue-500/15 text-sky-400 border border-blue-400/20">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>保留 Mod 设定数值 (PERSIST BRIDGE)</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold font-mono ${
                      persistBridgeEnabled
                        ? 'bg-blue-500/15 text-sky-300 border border-blue-400/20'
                        : 'bg-white/[0.06] text-slate-400'
                    }`}
                  >
                    {persistBridgeEnabled ? '已开启' : '已停用'}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  智能记忆服装、发型、开关等设定数值，Mod 停用/切换或重启游戏后无缝保留还原
                </p>
              </div>
            </div>

            {/* Switch Toggle */}
            <button
              type="button"
              onClick={() => handleTogglePersistBridge(!persistBridgeEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                persistBridgeEnabled ? 'bg-blue-600 shadow-md shadow-blue-900/50' : 'bg-white/10'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  persistBridgeEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="pt-2 border-t border-white/[0.06] space-y-4 text-xs">
            {/* Cache size slider */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-slate-200">最近记忆 Mod 数量缓存上限</h4>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  超出此数量时将自动清理最旧的历史 Mod 状态缓存 (建议 12 ~ 20)
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={persistBridgeCacheSize}
                  onChange={(e) => handleChangeCacheSize(parseInt(e.target.value, 10))}
                  className="w-32 accent-sky-400 cursor-pointer"
                />
                <span className="font-mono font-bold text-sky-300 bg-black/40 px-3 py-1 rounded-xl border border-white/10 min-w-[3.5rem] text-center">
                  {persistBridgeCacheSize === 0 ? '无上限' : `${persistBridgeCacheSize} 个`}
                </span>
              </div>
            </div>

            {/* Clear cache action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
              <div>
                <h4 className="font-semibold text-slate-200">清理 Persist Bridge 缓存</h4>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  清空 qaqm/cache 目录下的所有已停用 Mod 状态文件并重置激活列表
                </p>
              </div>

              <button
                type="button"
                onClick={handleClearPersistCache}
                disabled={clearingCache}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-2xl bg-white/[0.05] hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition disabled:opacity-50 active:scale-95 font-semibold shrink-0 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{clearingCache ? '正在清理...' : '清空状态缓存'}</span>
              </button>
            </div>

            {clearResult && (
              <div className="p-3 rounded-2xl bg-black/40 border border-white/10 text-xs font-mono text-sky-200">
                {clearResult}
              </div>
            )}
          </div>
        </div>

        {/* 3. 路径配置表单 */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="bg-[#0c1426]/75 border border-white/[0.08] backdrop-blur-xl rounded-3xl p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Folder className="w-4 h-4 text-sky-400" />
              <span>路径详细配置</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                游戏本体可执行文件路径 (Game Executable)
              </label>
              <input
                type="text"
                value={gamePath}
                onChange={(e) => setGamePath(e.target.value)}
                placeholder="例如：E:\Games\ZenlessZoneZero\ZenlessZoneZero.exe"
                className="w-full bg-white/[0.05] border border-white/10 focus:border-sky-400/60 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none font-mono transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Mod 目录路径 (Mods Folder)
              </label>
              <input
                type="text"
                value={modFolderPath}
                onChange={(e) => setModFolderPath(e.target.value)}
                placeholder="例如：F:\XXMI\ZZMI\Mods"
                className="w-full bg-white/[0.05] border border-white/10 focus:border-sky-400/60 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none font-mono transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                XXMI / 3DMigoto 加载器路径 (Mod Loader)
              </label>
              <input
                type="text"
                value={modLoaderPath}
                onChange={(e) => setModLoaderPath(e.target.value)}
                placeholder="例如：F:\XXMI\Resources\Bin\XXMI Launcher.exe"
                className="w-full bg-white/[0.05] border border-white/10 focus:border-sky-400/60 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none font-mono transition"
              />
            </div>
          </div>

          {/* 4. 系统托盘常驻说明 */}
          <div className="bg-[#0c1426]/60 border border-white/[0.06] rounded-3xl p-5 space-y-2 shadow-lg backdrop-blur-xl">
            <h3 className="text-xs font-bold text-sky-300 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>系统托盘常驻与游戏内即时响应</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              LZ Manager 已默认开启系统托盘常驻。关闭窗口时程序将自动隐藏至右下角系统托盘，保持低内存占用（约 30MB），并在您按下 <kbd className="px-1.5 py-0.5 bg-white/[0.08] border border-white/10 rounded-lg text-sky-300 font-mono">Ctrl+F</kbd> 或手柄 <kbd className="px-1.5 py-0.5 bg-white/[0.08] border border-white/10 rounded-lg text-sky-300 font-mono">Back+Start</kbd> 时瞬间在游戏上层呼出悬浮窗。
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-mono text-slate-500">
              * 设置会自动与原版 QAQManager 配置文件保持双向兼容同步
            </span>

            <button
              type="submit"
              className={`flex items-center space-x-2 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all active:scale-95 ${
                saved
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 hover:from-blue-600 hover:to-sky-500 text-white shadow-md shadow-blue-900/30'
              }`}
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4 stroke-[2.5]" />
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
