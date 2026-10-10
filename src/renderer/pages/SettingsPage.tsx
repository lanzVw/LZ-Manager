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
  Cpu,
  Sun,
  Moon,
  Palette,
  ArrowDownToLine,
  LogOut,
  Monitor
} from 'lucide-react'
import { EnvironmentStatus } from '../../core/types'
import { useTheme } from '../contexts/ThemeContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Switch } from '../components/ui/Switch'
import { Badge } from '../components/ui/Badge'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { Logo } from '../components/Logo'

interface SettingsPageProps {
  activeGame: any
  onSaveGameConfig: (patch: any) => Promise<void>
  config?: any
  onUpdateAppConfig?: (patch: any) => Promise<void>
}

// 启动模式派生默认值：与显示兜底逻辑保持同一份三元，保证「显示值 = 保存值」
const getDerivedLaunchMode = (game: any) => (game?.id === 'zzz' ? 'ZZMI' : 'VANILLA')

export const SettingsPage: React.FC<SettingsPageProps> = ({
  activeGame,
  onSaveGameConfig,
  config,
  onUpdateAppConfig
}) => {
  const toast = useToast()
  const { theme, setTheme } = useTheme()
  const [gamePath, setGamePath] = useState(activeGame?.gamePath || '')
  const [modFolderPath, setModFolderPath] = useState(activeGame?.modFolderPath || '')
  const [modLoaderPath, setModLoaderPath] = useState(activeGame?.modLoaderPath || '')
  const [launchMode, setLaunchMode] = useState<string>(activeGame?.launchMode || getDerivedLaunchMode(activeGame))
  const [launchArgs, setLaunchArgs] = useState(activeGame?.launchArgs || '')
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
  const [showClearCacheModal, setShowClearCacheModal] = useState<boolean>(false)

  // 窗口与退出交互设置: 'quit' (彻底退出) | 'minimize_to_tray' (最小化到托盘)
  const [closeAction, setCloseAction] = useState<'quit' | 'minimize_to_tray'>(
    config?.closeAction || 'quit'
  )

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
        setCloseAction(cfg.closeAction || 'quit')
      }
    } catch (_) {}
  }

  useEffect(() => {
    setGamePath(activeGame?.gamePath || '')
    setModFolderPath(activeGame?.modFolderPath || '')
    setModLoaderPath(activeGame?.modLoaderPath || '')
    setLaunchMode(activeGame?.launchMode || getDerivedLaunchMode(activeGame))
    setLaunchArgs(activeGame?.launchArgs || '')
    loadEnvironmentStatus()
    loadAppConfig()
  }, [activeGame, config])

  const handleCloseActionChange = async (action: 'quit' | 'minimize_to_tray') => {
    setCloseAction(action)
    if (onUpdateAppConfig) {
      await onUpdateAppConfig({ closeAction: action })
    } else {
      await window.lz.updateAppConfig({ closeAction: action })
    }
    toast.success(
      '窗口设置已更新',
      action === 'quit' ? '点击右上角关闭 (✕) 将彻底退出程序并释放内存' : '点击右上角关闭 (✕) 将最小化至系统托盘'
    )
  }

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

  const handleExecuteClearPersistCache = async () => {
    setShowClearCacheModal(false)
    setClearingCache(true)
    setClearResult(null)
    try {
      const res = await window.lz.clearPersistCache()
      if (res && res.success) {
        setClearResult(`已成功清空缓存，共移除 ${res.deletedCount} 个 Mod 状态记忆文件`)
        toast.success('状态记忆已清空', `共移除 ${res.deletedCount} 个 Mod 状态记忆文件`)
      } else {
        setClearResult(`清空失败: ${res?.error || '未知错误'}`)
        toast.error('清空失败', res?.error || '未知错误')
      }
    } catch (err: any) {
      setClearResult(`清空异常: ${err.message}`)
      toast.error('清空异常', err.message)
    } finally {
      setClearingCache(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSaveGameConfig({
      gamePath,
      modFolderPath,
      modLoaderPath,
      launchMode,
      launchArgs
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
        setDeployResult(`部署成功: ${res.message} (${res.deployedFiles.join(', ')})`)
        await loadEnvironmentStatus()
      } else {
        setDeployResult(`部署失败: ${res?.message || '未知失败'}`)
      }
    } catch (err: any) {
      setDeployResult(`部署异常: ${err.message}`)
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6 select-none bg-surface/40">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-text flex items-center space-x-2.5 tracking-wide">
            <Settings className="w-5 h-5 text-primary" />
            <span>系统与环境设置 · {activeGame?.name}</span>
          </h2>
          <p className="text-xs text-text-muted mt-1">
            配置界面外观主题、游戏可执行文件、Mods 存放目录以及 3DMigoto / XXMI 环境
          </p>
        </div>

        {/* 0. 界面主题与外观风格 */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text">界面主题与视觉风格</h3>
              <p className="text-xs text-text-muted mt-0.5">
                实时切换界面明暗主题，设置自动持久化保存且启动防白屏闪烁
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            {/* 浅色主题卡片 */}
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`p-4 rounded-control border cursor-pointer transition-all duration-fast flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                theme === 'light'
                  ? 'border-primary ring-2 ring-primary/25 bg-primary/5 shadow-xs'
                  : 'border-border bg-surface hover:border-primary/40'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-control bg-[#F4F7FC] border border-[#1F4FC4]/20 flex items-center justify-center text-[#1F4FC4] shadow-xs">
                  <Sun className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <div className="text-xs font-bold text-text">瓷白 · 钴蓝 (浅色)</div>
                  <div className="text-[11px] text-text-muted mt-0.5">青花瓷质感清爽明快</div>
                </div>
              </div>
              {theme === 'light' && (
                <div className="w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface shadow-xs" />
              )}
            </button>

            {/* 深色主题卡片 */}
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`p-4 rounded-control border cursor-pointer transition-all duration-fast flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                theme === 'dark'
                  ? 'border-primary ring-2 ring-primary/25 bg-primary/10 shadow-xs'
                  : 'border-border bg-surface hover:border-primary/40'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-control bg-[#0F1626] border border-[#5B8CFF]/30 flex items-center justify-center text-[#5B8CFF] shadow-xs">
                  <Moon className="w-4 h-4 text-sky-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-text">深青 · 墨夜 (深色)</div>
                  <div className="text-[11px] text-text-muted mt-0.5">沉浸式护眼暗色模式</div>
                </div>
              </div>
              {theme === 'dark' && (
                <div className="w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface shadow-xs" />
              )}
            </button>
          </div>
        </Card>

        {/* 1. 3DMigoto / XXMI 运行环境诊断与一键部署 */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text">
                  3DMigoto / XXMI 运行环境健康度诊断
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  自动检查 DirectX 运行库挂载、DLL 依赖与 Mods 映射
                </p>
              </div>
            </div>

            <Button
              variant="secondary"
              onClick={loadEnvironmentStatus}
              disabled={envChecking}
              title="刷新环境诊断"
              className="p-2"
              icon={
                <RefreshCw
                  className={`w-3.5 h-3.5 text-primary ${envChecking ? 'animate-spin' : ''}`}
                />
              }
            />
          </div>

          {/* Diagnostic Grid */}
          {envStatus && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Game Exe */}
              <div className="p-3.5 rounded-control bg-surface-2 border border-border flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-text-muted uppercase">GAME EXECUTABLE</span>
                  <div className="text-xs font-mono font-bold text-text mt-0.5 truncate max-w-[190px]">
                    {envStatus.gamePath ? envStatus.gamePath.split(/[/\\]/).pop() : '未配置'}
                  </div>
                </div>
                {envStatus.gameExeExists ? (
                  <Badge variant="primary">
                    <CheckCircle2 className="w-3 h-3 text-primary" />
                    <span>存在</span>
                  </Badge>
                ) : (
                  <Badge variant="danger">
                    <AlertTriangle className="w-3 h-3 text-danger" />
                    <span>缺失</span>
                  </Badge>
                )}
              </div>

              {/* 3DMigoto DLL */}
              <div className="p-3.5 rounded-control bg-surface-2 border border-border flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-text-muted uppercase">INJECTION DLL</span>
                  <div className="text-xs font-mono font-bold text-text mt-0.5">
                    d3d11.dll / dxgi.dll
                  </div>
                </div>
                {envStatus.d3d11Exists || envStatus.dxgiExists ? (
                  <Badge variant="primary">
                    <CheckCircle2 className="w-3 h-3 text-primary" />
                    <span>已挂载</span>
                  </Badge>
                ) : envStatus.xxmiRuntimeExists ? (
                  <Badge variant="primary">
                    <Layers className="w-3 h-3 text-primary" />
                    <span>XXMI独立</span>
                  </Badge>
                ) : (
                  <Badge variant="default">
                    <AlertTriangle className="w-3 h-3" />
                    <span>未挂载</span>
                  </Badge>
                )}
              </div>

              {/* XXMI Runtime */}
              <div className="p-3.5 rounded-control bg-surface-2 border border-border flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-text-muted uppercase">XXMI RUNTIME</span>
                  <div className="text-xs font-mono font-bold text-text mt-0.5 truncate max-w-[190px]">
                    {envStatus.xxmiRuntimePath ? envStatus.xxmiRuntimePath.split(/[/\\]/).pop() : '未检测到'}
                  </div>
                </div>
                {envStatus.xxmiRuntimeExists ? (
                  <Badge variant="primary">
                    <CheckCircle2 className="w-3 h-3 text-primary" />
                    <span>就绪</span>
                  </Badge>
                ) : (
                  <Badge variant="default">
                    <AlertTriangle className="w-3 h-3" />
                    <span>缺失</span>
                  </Badge>
                )}
              </div>

              {/* Mods Folder Link */}
              <div className="p-3.5 rounded-control bg-surface-2 border border-border flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-text-muted uppercase">MODS FOLDER</span>
                  <div className="text-xs font-mono font-bold text-text mt-0.5">
                    {envStatus.modFolderExists ? '目录可达' : '路径不可达'}
                  </div>
                </div>
                {envStatus.modFolderExists ? (
                  <Badge variant="primary">
                    <CheckCircle2 className="w-3 h-3 text-primary" />
                    <span>正常</span>
                  </Badge>
                ) : (
                  <Badge variant="danger">
                    <AlertTriangle className="w-3 h-3 text-danger" />
                    <span>无效</span>
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Auto Deploy Action */}
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="text-xs text-text-muted">
              环境缺失？一键将配套运行库及 3DMigoto 自动部署至游戏目录
            </span>
            <Button
              variant="secondary"
              size="sm"
              loading={deploying}
              onClick={handleAutoDeploy}
              icon={<Zap className="w-3.5 h-3.5 text-primary" />}
            >
              一键自动修复/部署
            </Button>
          </div>

          {deployResult && (
            <div className="p-3 rounded-control bg-surface-2 border border-border text-xs font-mono text-primary">
              {deployResult}
            </div>
          )}
        </Card>

        {/* 2. Persist Bridge 状态记忆引擎 */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text">
                Persist Bridge 状态记忆引擎
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                自动记忆 Mod 内切换键与参数变量状态，游戏重开无需重新按快捷键
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between p-3.5 rounded-control bg-surface-2 border border-border">
              <div>
                <div className="text-xs font-bold text-text">启用 Persist 状态持久化记忆</div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  开启后将自动为包含可变变量的 Mod 挂载持久化桥接，记忆您的自定义外观
                </div>
              </div>
              <Switch
                checked={persistBridgeEnabled}
                onChange={handleTogglePersistBridge}
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-control bg-surface-2 border border-border">
              <div>
                <div className="text-xs font-bold text-text">最大缓存 Mod 状态记忆数量</div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  设定同时保留记忆的已停用 Mod 数量上限 (默认 12 款)
                </div>
              </div>
              <Select
                value={persistBridgeCacheSize}
                onChange={(val) => handleChangeCacheSize(val)}
                options={[
                  { value: 6, label: '6 款' },
                  { value: 12, label: '12 款 (推荐)' },
                  { value: 24, label: '24 款' },
                  { value: 48, label: '48 款' }
                ]}
                size="sm"
                className="w-36 font-medium"
                popupClassName="w-36"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-text-muted">
                如遇参数混乱，可重置清空所有 Mod 的历史状态缓存
              </span>
              <Button
                variant="danger"
                size="sm"
                loading={clearingCache}
                onClick={() => setShowClearCacheModal(true)}
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                清空状态缓存
              </Button>
            </div>

            {clearResult && (
              <div className="p-3 rounded-control bg-surface-2 border border-border text-xs font-mono text-primary">
                {clearResult}
              </div>
            )}
          </div>
        </Card>

        {/* 3. 路径配置表单 */}
        <form onSubmit={handleSave} className="space-y-4">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-bold text-text flex items-center space-x-2">
              <Folder className="w-4 h-4 text-primary" />
              <span>路径详细配置</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-text mb-1.5">
                游戏本体可执行文件路径 (Game Executable)
              </label>
              <Input
                value={gamePath}
                onChange={(e) => setGamePath(e.target.value)}
                placeholder="例如：E:\Games\ZenlessZoneZero\ZenlessZoneZero.exe"
                className="font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1.5">
                Mod 目录路径 (Mods Folder)
              </label>
              <Input
                value={modFolderPath}
                onChange={(e) => setModFolderPath(e.target.value)}
                placeholder="例如：F:\XXMI\ZZMI\Mods"
                className="font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1.5">
                XXMI / 3DMigoto 加载器路径 (Mod Loader)
              </label>
              <Input
                value={modLoaderPath}
                onChange={(e) => setModLoaderPath(e.target.value)}
                placeholder="例如：F:\XXMI\Resources\Bin\XXMI Launcher.exe"
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">
                  游戏启动调起模式 (Launch Mode)
                </label>
                <Select
                  value={launchMode || getDerivedLaunchMode(activeGame)}
                  onChange={(val) => setLaunchMode(String(val))}
                  options={(() => {
                    const defaultMode = activeGame?.id === 'zzz' ? 'ZZMI' : activeGame?.id === 'endfield' ? 'EFMI' : activeGame?.id === 'wuthering-waves' ? 'WWMI' : activeGame?.id === 'honkai-star-rail' ? 'SRMI' : 'XXMI'
                    const supported: string[] = activeGame?.supportedLaunchModes || [defaultMode]
                    const all = Array.from(new Set([...supported, 'VANILLA']))
                    return all.map((m) => {
                      let label = m
                      if (m === 'ZZMI') label = 'ZZMI 加载器模式 (绝区零推荐 · 自动注入 Mod)'
                      else if (m === 'EFMI') label = 'EFMI 加载器模式 (终末地推荐 · 自动注入 Mod)'
                      else if (m === 'WWMI') label = 'WWMI 加载器模式 (鸣潮推荐 · 自动注入 Mod)'
                      else if (m === 'SRMI') label = 'SRMI 加载器模式 (星铁推荐 · 自动注入 Mod)'
                      else if (m === 'NEMI') label = 'NEMI 加载器模式 (异环专属)'
                      else if (m === 'XXMI') label = 'XXMI 通用加载器模式'
                      else if (m === 'VANILLA') label = 'VANILLA 原生直启 (原版游戏，不注入 Mod)'
                      return { value: m, label }
                    })
                  })()}
                  className="w-full"
                  popupClassName="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">
                  附加命令行参数 (可选)
                </label>
                <Input
                  value={launchArgs}
                  onChange={(e) => setLaunchArgs(e.target.value)}
                  placeholder="例如：-screen-fullscreen 1"
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </Card>

          {/* 4. 窗口关闭与任务栏交互控制 */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text">窗口与任务栏交互控制</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  自定义关闭窗口时的行为，确保后台不留冗余进程或按需保持游戏内热键响应
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <label className="block text-xs font-semibold text-text">
                点击窗口右上角关闭按钮 (✕) 时：
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 选项 1: 彻底退出程序 (默认推荐) */}
                <button
                  type="button"
                  onClick={() => handleCloseActionChange('quit')}
                  className={`p-3.5 rounded-control border cursor-pointer transition-all duration-fast flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    closeAction === 'quit'
                      ? 'border-primary ring-2 ring-primary/25 bg-primary/5 shadow-xs'
                      : 'border-border bg-surface hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20">
                        <LogOut className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-text flex items-center space-x-1.5">
                          <span>彻底退出程序</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary/10 text-primary font-medium">默认推荐</span>
                        </div>
                        <div className="text-[11px] text-text-muted mt-1 leading-snug">
                          关闭所有窗口并终止后台进程，立即释放全部系统与显存占用
                        </div>
                      </div>
                    </div>
                    {closeAction === 'quit' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface shadow-xs shrink-0 mt-1" />
                    )}
                  </div>
                </button>

                {/* 选项 2: 最小化到系统托盘 */}
                <button
                  type="button"
                  onClick={() => handleCloseActionChange('minimize_to_tray')}
                  className={`p-3.5 rounded-control border cursor-pointer transition-all duration-fast flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    closeAction === 'minimize_to_tray'
                      ? 'border-primary ring-2 ring-primary/25 bg-primary/5 shadow-xs'
                      : 'border-border bg-surface hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500 border border-sky-500/20">
                        <ArrowDownToLine className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-text">最小化到系统托盘</div>
                        <div className="text-[11px] text-text-muted mt-1 leading-snug">
                          主窗口收纳至屏幕右下角，保持后台运行以便随时按 Ctrl+F 唤起游戏悬浮窗
                        </div>
                      </div>
                    </div>
                    {closeAction === 'minimize_to_tray' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface shadow-xs shrink-0 mt-1" />
                    )}
                  </div>
                </button>
              </div>

              {/* 任务栏与托盘状态说明 */}
              <div className="mt-3 p-3.5 rounded-control bg-surface-2 border border-border text-[11px] text-text-muted space-y-1.5 font-sans leading-relaxed">
                <div className="flex items-center space-x-1.5 text-text font-semibold">
                  <Monitor className="w-3.5 h-3.5 text-primary" />
                  <span>任务栏与系统托盘状态说明</span>
                </div>
                <div>
                  • <strong className="text-text">任务栏状态</strong>：点击最小化按钮 (<kbd className="px-1 py-0.5 bg-surface border border-border rounded font-mono text-[10px]">-</kbd>)，窗口缩入 Windows 任务栏，任务栏图标持续保留，单次左键点击即可瞬间还原主界面。
                </div>
                <div>
                  • <strong className="text-text">系统托盘状态</strong>：点击顶部托盘收起按钮 (<kbd className="px-1 py-0.5 bg-surface border border-border rounded font-mono text-[10px]">⤓</kbd>) 或设为最小化至托盘时，程序收纳在屏幕右下角托盘区（可在任务栏右下角 <kbd className="px-1 py-0.5 bg-surface border border-border rounded font-mono text-[10px]">^</kbd> 折叠箭头内查找）。
                </div>
                <div>
                  • <strong className="text-text">托盘右键菜单</strong>：右键系统托盘图标可一键呼出游戏悬浮窗、刷新 Mod (F10)、启动游戏或随时选择“彻底退出程序”。
                </div>
              </div>
            </div>
          </Card>

          {/* 5. 品牌与关于 */}
          <div className="flex items-center justify-between p-4 rounded-card bg-surface border border-border/80 shadow-xs">
            <div className="flex items-center space-x-3.5">
              <div className="rounded-[10px] shadow-xs overflow-hidden">
                <Logo size={38} />
              </div>
              <div className="flex flex-col">
                <span className="font-title font-extrabold text-sm tracking-wide text-text uppercase">
                  LZ MANAGER PRO
                </span>
                <span className="text-[11px] text-text-muted">
                  现代化 3DMigoto / XXMI 游戏模组管理器 · 绝区零专属
                </span>
              </div>
            </div>
            <Badge variant="default" className="font-mono text-[11px] px-2 py-0.5">
              v1.0.0
            </Badge>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-mono text-text-muted">
              * 设置会自动与原版 QAQManager 配置文件保持双向兼容同步
            </span>

            <Button
              type="submit"
              variant={saved ? 'secondary' : 'primary'}
              size="md"
              icon={saved ? <Check className="w-4 h-4 stroke-[2.5]" /> : <Save className="w-4 h-4" />}
            >
              {saved ? '已保存设置！' : '保存设置'}
            </Button>
          </div>
        </form>
      </div>

      <Modal
        isOpen={showClearCacheModal}
        onClose={() => setShowClearCacheModal(false)}
        onConfirm={handleExecuteClearPersistCache}
        title="清空 Persist Bridge 状态缓存"
        variant="warning"
        confirmText="确认清空"
        cancelText="取消"
      >
        <p className="text-sm text-slate-300 leading-relaxed">
          确定要清空 Persist Bridge 缓存的状态文件吗？<br />
          清空后已停用 Mod 的历史设定记忆将被重置，再次启用时将恢复初始默认设置。
        </p>
      </Modal>
    </div>
  )
}
