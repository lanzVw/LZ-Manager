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
  Monitor,
  Gamepad2,
  BookOpen,
  ChevronDown,
  Info
} from 'lucide-react'
import { EnvironmentStatus } from '../../core/types'
import { useTheme } from '../contexts/ThemeContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { HoverHint } from '../components/ui/HoverHint'
import { Input } from '../components/ui/Input'
import { Switch } from '../components/ui/Switch'
import { Badge } from '../components/ui/Badge'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { SegmentedControl, SegmentedControlItem } from '../components/ui/SegmentedControl'

import zzzLogo from '../assets/games/zzz_logo.png'
import endfieldLogo from '../assets/games/endfield_logo.png'
import wuwaLogo from '../assets/games/wuwa_logo.png'
import yihuanLogo from '../assets/games/yihuan_logo.png'
import starrailLogo from '../assets/games/starrail_logo.png'
import genshinLogo from '../assets/games/genshin_logo.png'

const GAME_LOGOS: Record<string, string> = {
  zzz: zzzLogo,
  endfield: endfieldLogo,
  'wuthering-waves': wuwaLogo,
  wuwa: wuwaLogo,
  'neverness-to-everness': yihuanLogo,
  yihuan: yihuanLogo,
  'honkai-star-rail': starrailLogo,
  starrail: starrailLogo,
  genshin: genshinLogo
}

function getGameLogo(gameId?: string): string | undefined {
  if (!gameId) return undefined
  return GAME_LOGOS[gameId.toLowerCase()]
}

interface SettingsPageProps {
  activeGame: any
  onSaveGameConfig: (patch: any) => Promise<void>
  config?: any
  onUpdateAppConfig?: (patch: any) => Promise<void>
  onSelectGame?: (gameId: string) => Promise<void>
}

// 启动模式派生默认值：与显示兜底逻辑保持同一份三元，保证「显示值 = 保存值」
const getDerivedLaunchMode = (game: any) => (game?.id === 'zzz' ? 'ZZMI' : 'VANILLA')

export type SettingsTab = 'appearance' | 'games_paths' | 'environment' | 'about'

const SETTINGS_TABS: SegmentedControlItem<SettingsTab>[] = [
  { id: 'appearance', label: '外观与交互', icon: <Palette className="w-3.5 h-3.5" /> },
  { id: 'games_paths', label: '游戏与路径', icon: <Folder className="w-3.5 h-3.5" /> },
  { id: 'environment', label: '环境与修复', icon: <Wrench className="w-3.5 h-3.5" /> },
  { id: 'about', label: '关于', icon: <Info className="w-3.5 h-3.5" /> }
]

interface GuideItem {
  title: string
  desc: string
}

const TAB_METADATA: Record<
  SettingsTab,
  {
    title: string
    description: string
    icon: React.ReactNode
    guides: GuideItem[]
  }
> = {
  appearance: {
    title: '界面外观与窗口交互',
    description:
      '定制客户端视觉调色板与窗口生命周期行为。支持一键快速切换浅色与黑夜模式，自定义关闭行为以保持游戏内热键秒级响应。',
    icon: <Palette className="w-24 h-24 stroke-[1.2]" />,
    guides: [
      {
        title: '任务栏最小化模式',
        desc: '点击顶栏最小化按钮 (-) 时，窗口缩入任务栏，保留任务栏图标，单次点击秒级呼出。'
      },
      {
        title: '系统托盘常驻模式',
        desc: '设为最小化至托盘时，点击关闭将隐藏到屏幕右下角托盘区，持续在后台保持 Ctrl+F 悬浮窗响应。'
      },
      {
        title: '托盘右键快捷菜单',
        desc: '右键右下角托盘图标，可随时唤起游戏悬浮窗、执行 F10 热刷新 Mod、快速启动游戏或彻底退出。'
      },
      {
        title: '深色与色彩体系自适应',
        desc: '经典主题在深色模式下匹配「深青 · 墨夜」；CDS 主题在深色模式下自动匹配「黑曜 · 陶土」。'
      }
    ]
  },
  games_paths: {
    title: '游戏库与目录映射',
    description:
      '配置当前目标游戏的本体程序位置、Mods 存放目录及 3DMigoto 专属启动注入模式；管理主界面顶栏展示的游戏列表。',
    icon: <Folder className="w-24 h-24 stroke-[1.2]" />,
    guides: [
      {
        title: '游戏本体程序 (Game Executable)',
        desc: '游戏主程序的 .exe 文件。用于前台窗口感知、焦点检测以及从管理器一键开始游戏。'
      },
      {
        title: 'Mod 存放目录 (Mods Folder)',
        desc: '3DMigoto 扫描与装载 Mod 的文件夹。LZ Manager 会在此目录内创建角色子目录并管理启用状态。'
      },
      {
        title: 'XXMI 加载器 (Mod Loader)',
        desc: '配套的 XXMI Launcher.exe。用于通过专用注入环境调起游戏，确保 Mod 正常生效。'
      },
      {
        title: '启动模式区别 (Launch Mode)',
        desc: '各游戏推荐使用专属加载器模式（如 ZZMI / EFMI / WWMI / SRMI）；选择 VANILLA 原生直启将跳过 Mod 注入。'
      }
    ]
  },
  environment: {
    title: '3DMigoto 环境与修复引擎',
    description:
      'DirectX 运行库注入健康度诊断、Mod 数值持久化状态记忆桥，以及应对游戏版本更新的 Hash 修复规则引擎。',
    icon: <Wrench className="w-24 h-24 stroke-[1.2]" />,
    guides: [
      {
        title: 'DirectX 注入环境 (DLL)',
        desc: '检测游戏目录是否存在 d3d11.dll 或 dxgi.dll。若未挂载，可使用「一键自动修复/部署」自动同步。'
      },
      {
        title: 'Persist Bridge 状态记忆',
        desc: '自动持久化保存 Mod 内通过快捷键切换的衣服发型参数，下次启动游戏无需重新按键调整。'
      },
      {
        title: '鸣潮 Hash 规则引擎',
        desc: '游戏大版本更新后角色 Hash 可能会发生变动，点击「更新 Hash 规则」可拉取社区最新映射规则库。'
      },
      {
        title: '外部独立修复程序',
        desc: '支持挂接第三方修复工具 exe 或压缩包，LZ Manager 会自动校验安装并在必要时协助执行修复。'
      }
    ]
  },
  about: {
    title: '关于 LZ Manager',
    description:
      '面向 Windows 的 3DMigoto / XXMI Mod 管理器，支持绝区零、鸣潮、崩坏：星穹铁道、明日方舟：终末地与原神。',
    icon: <Info className="w-24 h-24 stroke-[1.2]" />,
    guides: []
  }
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  activeGame,
  onSaveGameConfig,
  config,
  onUpdateAppConfig,
  onSelectGame
}) => {
  const toast = useToast()
  const { theme, setTheme, palette, setPalette } = useTheme()
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance')
  const [showGuide, setShowGuide] = useState<boolean>(false)
  const [gamePath, setGamePath] = useState(activeGame?.gamePath || '')
  const [modFolderPath, setModFolderPath] = useState(activeGame?.modFolderPath || '')
  const [modLoaderPath, setModLoaderPath] = useState(activeGame?.modLoaderPath || '')
  const [officialLauncherPath, setOfficialLauncherPath] = useState(activeGame?.officialLauncherPath || '')
  const [launchMode, setLaunchMode] = useState<string>(activeGame?.launchMode || getDerivedLaunchMode(activeGame))
  const [launchArgs, setLaunchArgs] = useState(activeGame?.launchArgs || '')
  const [saved, setSaved] = useState(false)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.flairx
      .getAppVersion()
      .then((v) => setAppVersion(v || ''))
      .catch(() => {})
  }, [])

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
    config?.closeAction || 'minimize_to_tray'
  )
  const [closePromptRemembered, setClosePromptRemembered] = useState<boolean>(
    config?.closePromptRemembered ?? false
  )
  const [appConfig, setAppConfig] = useState<any>(config)

  // 运行环境检测与一键部署状态
  const [envStatus, setEnvStatus] = useState<EnvironmentStatus | null>(null)
  const [envChecking, setEnvChecking] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<string | null>(null)

  // Mod 修复工具状态与管理
  const [fixStatus, setFixStatus] = useState<any>(null)
  const [loadingFixStatus, setLoadingFixStatus] = useState<boolean>(false)
  const [updatingRules, setUpdatingRules] = useState<boolean>(false)
  const [selectingFixer, setSelectingFixer] = useState<boolean>(false)

  const loadFixStatus = async () => {
    setLoadingFixStatus(true)
    try {
      const status = await window.flairx.fixGetStatus(activeGame?.id)
      if (status) setFixStatus(status)
    } catch (err) {
      console.error('Failed to get fix status:', err)
    } finally {
      setLoadingFixStatus(false)
    }
  }

  const handleUpdateRules = async () => {
    setUpdatingRules(true)
    try {
      const res = await window.flairx.fixUpdateWuwaRules()
      if (res && res.success) {
        if (res.updated) {
          toast.success('规则更新成功', `已更新至 revision ${res.revision}，包含 ${res.ruleCount} 条规则`)
        } else {
          toast.info('规则无需更新', res.message || '本地 Hash 规则已是最新版本')
        }
        await loadFixStatus()
      } else {
        toast.error('更新失败', res?.error || '无法拉取线上规则')
      }
    } catch (err: any) {
      toast.error('更新异常', err?.message || String(err))
    } finally {
      setUpdatingRules(false)
    }
  }

  const handleSelectCustomFixer = async () => {
    setSelectingFixer(true)
    try {
      const res = await window.flairx.fixSelectCustomExe(activeGame?.id)
      if (res && !res.canceled) {
        if (res.success) {
          toast.success(
            '修复程序已安装',
            `已成功配置修复程序: ${res.resolvedExePath ? res.resolvedExePath.split(/[/\\]/).pop() : '自定义程序'}`
          )
          await loadFixStatus()
        } else {
          toast.error('安装修复程序失败', res.error || '未能成功校验或安装该修复程序')
        }
      }
    } catch (err: any) {
      toast.error('选择异常', err?.message || String(err))
    } finally {
      setSelectingFixer(false)
    }
  }

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
        setAppConfig(cfg)
        setPersistBridgeEnabled(cfg.persistBridgeEnabled ?? true)
        setPersistBridgeCacheSize(
          typeof cfg.persistBridgeCacheSize === 'number' ? cfg.persistBridgeCacheSize : 12
        )
        setCloseAction(cfg.closeAction || 'minimize_to_tray')
        setClosePromptRemembered(cfg.closePromptRemembered ?? false)
      }
    } catch (_) {}
  }

  useEffect(() => {
    setGamePath(activeGame?.gamePath || '')
    setModFolderPath(activeGame?.modFolderPath || '')
    setModLoaderPath(activeGame?.modLoaderPath || '')
    setOfficialLauncherPath(activeGame?.officialLauncherPath || '')
    setLaunchMode(activeGame?.launchMode || getDerivedLaunchMode(activeGame))
    setLaunchArgs(activeGame?.launchArgs || '')
    if (config) {
      setAppConfig(config)
      setClosePromptRemembered(config.closePromptRemembered ?? false)
    }
    loadEnvironmentStatus()
    loadAppConfig()
    loadFixStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGame, config])

  // 切换单款游戏的显示/隐藏状态
  const handleToggleGameVisibility = async (targetGame: any, nextVisible: boolean) => {
    const games = appConfig?.games || config?.games || []
    const visibleGames = games.filter((g: any) => !g.hidden)

    // 防空守卫：如果当前仅剩 1 款游戏可见，且用户试图隐藏它，禁止操作
    if (!nextVisible && visibleGames.length <= 1 && !targetGame.hidden) {
      toast.warning('无法隐藏', '请至少保留一款可见游戏！')
      return
    }

    try {
      const res = await window.lz.updateGameConfig(targetGame.id, { hidden: !nextVisible })
      if (res && res.success) {
        if (res.config) {
          setAppConfig(res.config)
        } else {
          await loadAppConfig()
        }

        if (!nextVisible && activeGame?.id === targetGame.id) {
          const remainingVisible = games.filter((g: any) => g.id !== targetGame.id && !g.hidden)
          if (remainingVisible.length > 0 && onSelectGame) {
            await onSelectGame(remainingVisible[0].id)
            toast.info('已自动切换当前游戏', `原游戏已隐藏，已自动切至【${remainingVisible[0].name}】`)
          }
        } else {
          toast.success(
            '游戏显示设置已更新',
            `已${nextVisible ? '启用显示' : '隐藏'}【${targetGame.name}】`
          )
        }
      } else {
        toast.error('设置失败', res?.error || '未知错误')
      }
    } catch (err: any) {
      toast.error('设置异常', err?.message || '未知错误')
    }
  }

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
      officialLauncherPath,
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

  const allGames = appConfig?.games || config?.games || []
  const activeMeta = TAB_METADATA[settingsTab]

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6 select-none bg-surface/40">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-text flex items-center space-x-2.5 tracking-wide">
            <Settings className="w-5 h-5 text-primary" />
            <span>系统与环境设置 · {activeGame?.name}</span>
          </h2>
        </div>

        {/* 顶部主 Tab 栏 */}
        <div className="no-drag">
          <SegmentedControl
            items={SETTINGS_TABS}
            value={settingsTab}
            onChange={(val) => setSettingsTab(val as SettingsTab)}
            size="md"
            fullWidth
          />
        </div>

        {/* Claude 风格 Context Banner (顶部概览与可展开详细指南) */}
        <div className="relative overflow-hidden rounded-2xl bg-surface border border-border/80 p-5 shadow-cds-sm transition-all duration-200">
          {/* 背景水印图标 */}
          <div className="absolute -right-3 -bottom-3 text-primary/[0.05] dark:text-primary/[0.07] pointer-events-none select-none">
            {activeMeta.icon}
          </div>

          <div className="relative z-10 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="min-w-0 text-base font-bold text-text tracking-tight text-balance-native">
                <HoverHint content={activeMeta.description} focusable>
                  {activeMeta.title}
                </HoverHint>
              </h3>

              {activeMeta.guides.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowGuide(!showGuide)}
                  className="shrink-0 inline-flex items-center space-x-1.5 text-xs font-medium text-text-muted hover:text-text px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-2/80 border border-border/60 transition cursor-pointer select-none active:scale-95"
                >
                  <BookOpen className="w-3.5 h-3.5 align-neg-125 text-primary" />
                  <span>{showGuide ? '收起功能指南' : '功能指南与说明'}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      showGuide ? 'rotate-180 text-primary' : ''
                    }`}
                  />
                </button>
              )}
            </div>

            {/* 可展开详细说明抽屉 */}
            {showGuide && (
              <div className="pt-3.5 mt-3 border-t border-border/60 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs animate-in fade-in duration-200">
                {activeMeta.guides.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-surface-2/60 border border-border/60 space-y-1"
                  >
                    <div className="font-semibold text-text flex items-center space-x-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span>{item.title}</span>
                    </div>
                    <p className="text-[11px] text-text-muted leading-relaxed pl-3 text-pretty-native">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ========== TAB 1: 外观与交互 ========== */}
        {settingsTab === 'appearance' && (
          <div className="space-y-6">
            {/* 0. 界面主题与视觉风格 */}
            <Card className="p-5 space-y-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
              <Palette className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-text">界面主题与视觉风格</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* 卡片 1：经典主题 (default) */}
            <button
              type="button"
              onClick={() => setPalette('default')}
              className={`group p-3.5 rounded-xl border cursor-pointer transition-all duration-150 flex flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                palette === 'default'
                  ? 'border-primary ring-2 ring-primary/25 bg-primary/[0.03] shadow-cds-sm'
                  : 'border-border/80 bg-surface hover:border-primary/40 hover:shadow-2xs'
              }`}
            >
              {/* 微型视窗：日夜双拼预览 */}
              <div className="w-full h-24 rounded-lg overflow-hidden border border-border/60 relative grid grid-cols-2 mb-3 shadow-2xs pointer-events-none select-none">
                {/* 左半边：瓷白·钴蓝 (浅色) */}
                <div className="bg-[#F4F7FC] p-2 flex flex-col justify-between border-r border-border/40">
                  <div className="flex items-center justify-between">
                    <div className="flex space-x-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#1F4FC4]/40" />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#1F4FC4]/25" />
                    </div>
                    <span className="text-[9px] font-bold text-[#1F4FC4] tracking-tight">瓷白</span>
                  </div>
                  <div className="space-y-1">
                    <div className="bg-white rounded p-1 border border-[#1F4FC4]/15 shadow-2xs">
                      <div className="w-1/2 h-1.5 rounded-full bg-[#1F4FC4]/30" />
                    </div>
                    <div className="w-7 h-2 rounded bg-[#1F4FC4] text-white flex items-center justify-center text-[7px] font-bold">
                      MOD
                    </div>
                  </div>
                </div>

                {/* 右半边：深青·墨夜 (深色) */}
                <div className="bg-[#0F1626] p-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-[#5B8CFF] tracking-tight ml-auto">墨夜</span>
                    <div className="flex space-x-1 ml-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#5B8CFF]/30" />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#5B8CFF]/50" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="bg-[#172036] rounded p-1 border border-[#5B8CFF]/20 shadow-2xs">
                      <div className="w-1/2 h-1.5 rounded-full bg-[#5B8CFF]/40 ml-auto" />
                    </div>
                    <div className="w-7 h-2 rounded bg-[#5B8CFF] text-[#0F1626] flex items-center justify-center text-[7px] font-bold ml-auto">
                      MOD
                    </div>
                  </div>
                </div>
              </div>

              {/* 标题与激活状态 */}
              <div className="flex items-center justify-between mt-0.5">
                <div className="flex items-center space-x-2">
                  <HoverHint content="经典清爽科技风格；浅色呈现瓷白钴蓝，深色模式自动适配「深青 · 墨夜」">
                    <span className="text-xs font-bold text-text">经典主题</span>
                  </HoverHint>
                </div>
                {palette === 'default' ? (
                  <div className="flex items-center space-x-1 text-primary text-[11px] font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 align-neg-125" />
                    <span>已应用</span>
                  </div>
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-border group-hover:border-primary/50" />
                )}
              </div>

            </button>

            {/* 卡片 2：CDS 主题 (clay) */}
            <button
              type="button"
              onClick={() => setPalette('clay')}
              className={`group p-3.5 rounded-xl border cursor-pointer transition-all duration-150 flex flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                palette === 'clay'
                  ? 'border-primary ring-2 ring-primary/25 bg-primary/[0.03] shadow-cds-sm'
                  : 'border-border/80 bg-surface hover:border-primary/40 hover:shadow-2xs'
              }`}
            >
              {/* 微型视窗：日夜双拼预览 */}
              <div className="w-full h-24 rounded-lg overflow-hidden border border-border/60 relative grid grid-cols-2 mb-3 shadow-2xs pointer-events-none select-none">
                {/* 左半边：暖纸·陶土 (浅色) */}
                <div className="bg-[#f5f5f3] p-2 flex flex-col justify-between border-r border-[#d97757]/20">
                  <div className="flex items-center justify-between">
                    <div className="flex space-x-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#d97757]/50" />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#d97757]/30" />
                    </div>
                    <span className="text-[9px] font-bold text-[#d97757] tracking-tight">暖纸</span>
                  </div>
                  <div className="space-y-1">
                    <div className="bg-[#ffffff] rounded p-1 border border-[#d97757]/15 shadow-2xs">
                      <div className="w-1/2 h-1.5 rounded-full bg-[#d97757]/35" />
                    </div>
                    <div className="w-7 h-2 rounded bg-[#d97757] text-white flex items-center justify-center text-[7px] font-bold">
                      MOD
                    </div>
                  </div>
                </div>

                {/* 右半边：黑曜·陶土 (深色) */}
                <div className="bg-[#0b0b0a] p-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-[#d97757] tracking-tight ml-auto">黑曜</span>
                    <div className="flex space-x-1 ml-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#d97757]/30" />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#d97757]/50" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="bg-[#1a1a19] rounded p-1 border border-[#d97757]/25 shadow-2xs">
                      <div className="w-1/2 h-1.5 rounded-full bg-[#d97757]/40 ml-auto" />
                    </div>
                    <div className="w-7 h-2 rounded bg-[#d97757] text-white flex items-center justify-center text-[7px] font-bold ml-auto">
                      MOD
                    </div>
                  </div>
                </div>
              </div>

              {/* 标题与激活状态 */}
              <div className="flex items-center justify-between mt-0.5">
                <div className="flex items-center space-x-2">
                  <HoverHint content="Claude 官方纸质暖调风格；浅色呈现暖纸陶土，深色模式自动适配「黑曜 · 陶土」">
                    <span className="text-xs font-bold text-text">CDS 主题</span>
                  </HoverHint>
                </div>
                {palette === 'clay' ? (
                  <div className="flex items-center space-x-1 text-primary text-[11px] font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 align-neg-125" />
                    <span>已应用</span>
                  </div>
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-border group-hover:border-primary/50" />
                )}
              </div>

            </button>
          </div>
        </Card>

        {/* 4. 窗口关闭与任务栏交互控制 */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
              <Sliders className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-text">
              <HoverHint
                content="设为最小化至托盘时，关闭后可在任务栏右下角托盘区找到图标；右键可呼出快捷菜单。可在顶部「功能指南与说明」中查看完整说明。"
                focusable
              >
                窗口与任务栏交互控制
              </HoverHint>
            </h3>
          </div>

          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* 选项 1: 最小化到系统托盘 (默认推荐) */}
              <button
                type="button"
                onClick={() => handleCloseActionChange('minimize_to_tray')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-[120ms] ease-[cubic-bezier(.16,1,.3,1)] flex items-center justify-between gap-3 text-left active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  closeAction === 'minimize_to_tray'
                    ? 'border-primary ring-2 ring-primary/20 bg-primary/[0.035] shadow-cds-sm'
                    : 'border-border/70 bg-surface hover:border-primary/40 hover:bg-surface-2/40'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border/80 text-primary flex items-center justify-center shrink-0 shadow-2xs">
                    <ArrowDownToLine className="w-5 h-5 align-neg-125" />
                  </div>
                  <div className="min-w-0 text-xs font-bold text-text flex items-center gap-2 flex-wrap">
                    <HoverHint content="主窗口收纳至屏幕右下角托盘常驻，随时按 Ctrl+F 唤起游戏悬浮窗">
                      <span>最小化到系统托盘</span>
                    </HoverHint>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary border border-primary/20">
                      默认推荐
                    </span>
                  </div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                    closeAction === 'minimize_to_tray' ? 'border-primary bg-primary/10' : 'border-border bg-surface-2'
                  }`}
                >
                  {closeAction === 'minimize_to_tray' && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
              </button>

              {/* 选项 2: 彻底退出程序 */}
              <button
                type="button"
                onClick={() => handleCloseActionChange('quit')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-[120ms] ease-[cubic-bezier(.16,1,.3,1)] flex items-center justify-between gap-3 text-left active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  closeAction === 'quit'
                    ? 'border-primary ring-2 ring-primary/20 bg-primary/[0.035] shadow-cds-sm'
                    : 'border-border/70 bg-surface hover:border-primary/40 hover:bg-surface-2/40'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border/80 text-text-muted flex items-center justify-center shrink-0 shadow-2xs">
                    <LogOut className="w-5 h-5 align-neg-125" />
                  </div>
                  <div className="min-w-0 text-xs font-bold text-text">
                    <HoverHint content="关闭所有窗口并终止后台进程，立即完全释放系统与显存占用">
                      彻底退出程序
                    </HoverHint>
                  </div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                    closeAction === 'quit' ? 'border-primary bg-primary/10' : 'border-border bg-surface-2'
                  }`}
                >
                  {closeAction === 'quit' && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
              </button>
            </div>

            {/* 记住弹窗选项复选框 */}
            <div className="flex items-center space-x-2.5 pt-1">
              <button
                type="button"
                role="checkbox"
                aria-checked={!closePromptRemembered}
                aria-label="关闭时弹出确认提示"
                onClick={async () => {
                  const next = !closePromptRemembered
                  setClosePromptRemembered(next)
                  await onUpdateAppConfig?.({ closePromptRemembered: next })
                }}
                className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors cursor-pointer ${
                  !closePromptRemembered
                    ? 'bg-primary border-primary text-primary-fg shadow-2xs'
                    : 'border-border bg-surface-2 hover:border-primary/50'
                }`}
              >
                {!closePromptRemembered && <Check className="w-3 h-3 stroke-[3]" />}
              </button>
              <span
                className="text-xs text-text-muted hover:text-text cursor-pointer select-none text-pretty-native"
                onClick={async () => {
                  const next = !closePromptRemembered
                  setClosePromptRemembered(next)
                  await onUpdateAppConfig?.({ closePromptRemembered: next })
                }}
              >
                <HoverHint content="取消勾选后将按上述选择直接执行">
                  点击右上角关闭按钮 (✕) 时弹出确认提示
                </HoverHint>
              </span>
            </div>

          </div>
        </Card>
      </div>
    )}

        {/* ========== TAB 2: 游戏与路径 ========== */}
        {settingsTab === 'games_paths' && (
          <div className="space-y-6">
            {/* 0.5. 目标游戏显示与管理 */}
            <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
                <Gamepad2 className="w-4 h-4" />
              </div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-text">游戏显示管理</h3>
                <Badge variant="primary" className="text-[10px] px-1.5 py-0 font-mono">
                  可见: {allGames.filter((g: any) => !g.hidden).length} / {allGames.length}
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {allGames.map((g: any) => {
              const isVisible = !g.hidden
              const isCurrent = activeGame?.id === g.id
              const logo = getGameLogo(g.id)
              const visibleCount = allGames.filter((item: any) => !item.hidden).length
              const isLastVisible = isVisible && visibleCount <= 1

              return (
                <div
                  key={g.id}
                  className={`p-3 rounded-control border flex items-center justify-between transition-all duration-fast ${
                    isCurrent
                      ? 'bg-primary/5 border-primary/40 shadow-xs ring-1 ring-primary/20'
                      : isVisible
                      ? 'bg-surface border-border hover:border-primary/30'
                      : 'bg-surface-2/40 border-border/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-9 h-9 rounded-control bg-surface-2 border border-border/80 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                      {logo ? (
                        <img src={logo} alt="" className="w-6 h-6 object-contain" />
                      ) : (
                        <Gamepad2 className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-bold text-text truncate max-w-[120px]">{g.name}</span>
                        {isCurrent && (
                          <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-primary text-primary-fg leading-tight">
                            使用中
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-muted truncate mt-0.5">
                        {isVisible ? '前台识别与切换已启用' : '已隐藏 (不参与识别与切换)'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 ml-2" title={isLastVisible ? '至少需保留一款可见游戏' : undefined}>
                    <Switch
                      checked={isVisible}
                      disabled={isLastVisible}
                      onChange={(checked) => handleToggleGameVisibility(g, checked)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* 3. 路径配置表单 */}
        <form onSubmit={handleSave} className="space-y-4">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-bold text-text flex items-center space-x-2">
              <Folder className="w-4 h-4 text-primary" />
              <HoverHint content="路径变更将在点击保存后生效并重新检测环境" focusable>
                <span>路径详细配置</span>
              </HoverHint>
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

            <div>
              <label className="block text-xs font-semibold text-text mb-1.5">
                官方启动器路径 (Official Launcher)
              </label>
              <Input
                value={officialLauncherPath}
                onChange={(e) => setOfficialLauncherPath(e.target.value)}
                placeholder="例如：E:\Hypergryph Launcher\Launcher.exe（留空将自动从游戏路径推导）"
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
                      else if (m === 'EFMI_OFFICIAL') label = 'EFMI 官方启动器联动模式 (终末地 1.6+ 推荐 · 先挂起注入再调起官方启动器)'
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

          <div className="flex items-center justify-end pt-1">
            <Button
              type="submit"
              variant={saved ? 'secondary' : 'primary'}
              size="md"
              icon={saved ? <Check className="w-4 h-4 stroke-[2.5]" /> : <Save className="w-4 h-4" />}
            >
              {saved ? '已保存设置！' : '保存路径与配置'}
            </Button>
          </div>
        </form>
      </div>
    )}

        {/* ========== TAB 3: 环境与修复 ========== */}
        {settingsTab === 'environment' && (
          <div className="space-y-6">
            {/* 1. 3DMigoto / XXMI 运行环境诊断与一键部署 */}
            <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
                <Wrench className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-text">
                <HoverHint
                  content="环境缺失？一键将配套运行库及 3DMigoto 自动部署至游戏目录"
                  focusable
                >
                  3DMigoto / XXMI 运行环境健康度诊断
                </HoverHint>
              </h3>
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
          <div className="pt-2 border-t border-border flex items-center justify-end">
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
            <h3 className="text-sm font-bold text-text">
              <HoverHint content="如遇参数混乱，可重置清空所有 Mod 的历史状态缓存" focusable>
                Persist Bridge 状态记忆引擎
              </HoverHint>
            </h3>
          </div>

          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between p-3.5 rounded-control bg-surface-2 border border-border">
              <div>
                <div className="text-xs font-bold text-text">
                  <HoverHint content="开启后将自动为包含可变变量的 Mod 挂载持久化桥接，记忆您的自定义外观">
                    启用 Persist 状态持久化记忆
                  </HoverHint>
                </div>
              </div>
              <Switch
                checked={persistBridgeEnabled}
                onChange={handleTogglePersistBridge}
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-control bg-surface-2 border border-border">
              <div>
                <div className="text-xs font-bold text-text">
                  <HoverHint content="设定同时保留记忆的已停用 Mod 数量上限 (默认 12 款)">
                    最大缓存 Mod 状态记忆数量
                  </HoverHint>
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

            <div className="flex items-center justify-end pt-1">
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

        {/* Mod 修复工具与 Hash 规则 */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
              <Wrench className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-text">
              Mod 修复工具与 Hash 规则引擎
            </h3>
          </div>

          <div className="space-y-4 pt-1">
            {/* 鸣潮内置 Hash 规则引擎状态 */}
            {(activeGame?.id === 'wuthering-waves' || activeGame?.id === 'wuwa' || fixStatus?.engine === 'builtin-wuwa') && (
              <div className="p-4 rounded-control bg-surface-2 border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-text">鸣潮内置 Hash 规则引擎</span>
                    <Badge variant="primary">内置引擎</Badge>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={updatingRules}
                    onClick={handleUpdateRules}
                    icon={<RefreshCw className={`w-3.5 h-3.5 text-primary ${updatingRules ? 'animate-spin' : ''}`} />}
                  >
                    更新 Hash 规则
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
                  <div className="p-2.5 rounded bg-surface border border-border/60">
                    <div className="text-[10px] text-text-muted">规则版本 (Revision)</div>
                    <div className="font-mono font-bold text-text mt-0.5">
                      {fixStatus?.ruleVersion ? `v${fixStatus.ruleVersion}` : 'v3.5'}
                      <span className="text-primary text-[11px] ml-1">
                        (Rev {fixStatus?.ruleRevision ?? 1})
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded bg-surface border border-border/60">
                    <div className="text-[10px] text-text-muted">匹配游戏版本</div>
                    <div className="font-mono font-bold text-text mt-0.5">
                      {fixStatus?.gameVersion || '全版本兼容'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded bg-surface border border-border/60">
                    <div className="text-[10px] text-text-muted">规则与映射统计</div>
                    <div className="font-mono font-bold text-text mt-0.5">
                      {fixStatus?.ruleCount ?? 0} 条 / {fixStatus?.totalReplacements ?? 0} 映射
                    </div>
                  </div>
                  <div className="p-2.5 rounded bg-surface border border-border/60">
                    <div className="text-[10px] text-text-muted">数据源</div>
                    <div className="font-mono font-bold text-text mt-0.5">
                      {fixStatus?.ruleSource === 'cache'
                        ? '在线更新缓存'
                        : fixStatus?.ruleSource === 'cache-backup'
                        ? '本地回退备份'
                        : '随包内置'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 外部独立修复程序配置与安装 */}
            <div className="p-4 rounded-control bg-surface-2 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-text flex items-center space-x-2">
                    <HoverHint content="支持直接选取 .exe 文件、或选择包含修复工具的 zip / rar / 7z 压缩包及目录，程序将自动解包、校验并管理安装。">
                      <span>外部独立修复程序 ({activeGame?.name || '当前游戏'})</span>
                    </HoverHint>
                    {(fixStatus?.externalExePath || fixStatus?.exePath) ? (
                      <Badge variant="primary">已就绪</Badge>
                    ) : (
                      <Badge variant="default">未配置</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5 font-mono truncate max-w-[320px]">
                    {fixStatus?.externalExeName || fixStatus?.exeName || '未检测到可执行修复器'}
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  loading={selectingFixer}
                  onClick={handleSelectCustomFixer}
                  icon={<Folder className="w-3.5 h-3.5 text-primary" />}
                >
                  选择自定义程序
                </Button>
              </div>

              {(fixStatus?.externalExeSha256 || fixStatus?.exeSha256) && (
                <div className="p-2.5 rounded bg-surface border border-border/60 text-[11px] font-mono text-text-muted flex items-center justify-between">
                  <span>SHA256 校验指纹:</span>
                  <span className="text-text select-all">
                    {fixStatus?.externalExeSha256 || fixStatus?.exeSha256}
                  </span>
                </div>
              )}

            </div>
          </div>
        </Card>
      </div>
    )}

        {/* ========== TAB 4: 关于 ========== */}
        {settingsTab === 'about' && (
          <div className="space-y-6">
            <Card className="p-5 space-y-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
                  <Info className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-text">应用信息</h3>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded bg-surface-2 border border-border/60 text-xs">
                <span className="text-text-muted">应用版本</span>
                <span className="font-mono font-bold text-text select-all">
                  {appVersion ? `v${appVersion}` : '读取中...'}
                </span>
              </div>
            </Card>
          </div>
        )}
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
