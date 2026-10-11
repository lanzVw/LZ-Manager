import React from 'react'
import {
  FolderKanban,
  ShoppingBag,
  Sliders,
  Settings,
  Play,
  RotateCw,
  Minus,
  Square,
  X,
  Zap,
  Gamepad2,
  ChevronDown,
  ArrowDownToLine,
  Sun,
  Moon
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { Logo } from './Logo'
import { Select } from './ui/Select'

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

interface HeaderProps {
  activeTab: string
  setActiveTab: (tab: string) => void
  activeGame: any
  games: any[]
  closeAction?: 'quit' | 'minimize_to_tray'
  launchingGame?: boolean
  onSelectGame: (gameId: string) => void
  onLaunchGame: () => void
  onLaunchLoader: () => void
  onReloadMods: () => void
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  activeGame,
  games,
  closeAction = 'quit',
  launchingGame = false,
  onSelectGame,
  onLaunchGame,
  onLaunchLoader,
  onReloadMods
}) => {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="h-16 bg-surface/85 border-b border-border backdrop-blur-xl flex items-center justify-between px-5 select-none drag-region relative z-30 shadow-xs">
      {/* Decorative Top Accent Line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-60 pointer-events-none" />

      {/* Left: Brand Emblem & Game Target Switcher */}
      <div className="flex items-center space-x-3.5 no-drag">
        {/* Brand Badge */}
        <div className="flex items-center space-x-2.5 group cursor-default">
          <div className="rounded-[9px] shadow-sm overflow-hidden group-hover:scale-105 transition-transform duration-fast">
            <Logo size={30} />
          </div>

          <div className="flex flex-col">
            <span className="font-title font-extrabold text-sm tracking-wider text-text uppercase leading-none">
              LZ MANAGER
            </span>
          </div>
        </div>

        <div className="h-4 w-[1px] bg-border mx-1" />

        {/* Game Target Selector */}
        <div className="relative flex items-center">
          <Select
            value={activeGame?.id || ''}
            onChange={(val) => onSelectGame(val)}
            options={games.filter((g) => !g.hidden).map((g) => {
              const logo = getGameLogo(g.id)
              return {
                value: g.id,
                label: g.name,
                icon: logo ? (
                  <img
                    src={logo}
                    alt=""
                    className="w-4 h-4 rounded-[4px] object-contain shrink-0 shadow-2xs"
                  />
                ) : (
                  <Gamepad2 className="w-4 h-4 text-primary shrink-0" />
                )
              }
            })}
            size="sm"
            className="w-44 font-semibold"
            popupClassName="w-52"
          />
        </div>
      </div>

      {/* Center: Navigation Tabs (Active tab uses subtle pale background) */}
      <nav className="flex items-center space-x-1 no-drag bg-surface-2/80 p-1 rounded-control border border-border">
        <button
          type="button"
          onClick={() => setActiveTab('mods')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all border cursor-pointer ${
            activeTab === 'mods'
              ? 'bg-primary/12 text-primary border-primary/25 shadow-xs'
              : 'text-text-muted hover:text-text hover:bg-surface/80 border-transparent'
          }`}
        >
          <FolderKanban className={`w-3.5 h-3.5 ${activeTab === 'mods' ? 'text-primary' : 'text-text-muted'}`} />
          <span>角色库</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gamebanana')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all border cursor-pointer ${
            activeTab === 'gamebanana'
              ? 'bg-primary/12 text-primary border-primary/25 shadow-xs'
              : 'text-text-muted hover:text-text hover:bg-surface/80 border-transparent'
          }`}
        >
          <ShoppingBag className={`w-3.5 h-3.5 ${activeTab === 'gamebanana' ? 'text-primary' : 'text-text-muted'}`} />
          <span>Mod市场</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('presets')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all border cursor-pointer ${
            activeTab === 'presets'
              ? 'bg-primary/12 text-primary border-primary/25 shadow-xs'
              : 'text-text-muted hover:text-text hover:bg-surface/80 border-transparent'
          }`}
        >
          <Sliders className={`w-3.5 h-3.5 ${activeTab === 'presets' ? 'text-primary' : 'text-text-muted'}`} />
          <span>方案预设</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all border cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-primary/12 text-primary border-primary/25 shadow-xs'
              : 'text-text-muted hover:text-text hover:bg-surface/80 border-transparent'
          }`}
        >
          <Settings className={`w-3.5 h-3.5 ${activeTab === 'settings' ? 'text-primary' : 'text-text-muted'}`} />
          <span>系统设置</span>
        </button>
      </nav>

      {/* Right: Quick Actions, Theme Switcher & Window Controls */}
      <div className="flex items-center space-x-2 no-drag">
        {/* Quick Operations */}
        <div className="flex items-center space-x-1.5">
          {/* Light/Dark Theme Switcher */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? '切换至浅色模式 (瓷白·钴蓝)' : '切换至深色模式 (深青墨夜)'}
            className="p-2 rounded-control bg-surface hover:bg-surface-2 border border-border hover:border-primary/40 text-text-muted hover:text-primary transition shadow-2xs active:scale-95 cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-primary" />
            )}
            <span className="sr-only">切换主题</span>
          </button>

          {/* F10 Reload */}
          <button
            type="button"
            onClick={onReloadMods}
            title="向游戏发送热刷新信号 (F10)"
            className="group p-2 rounded-control bg-surface hover:bg-surface-2 border border-border hover:border-primary/40 text-text-muted hover:text-primary transition shadow-2xs active:scale-95 cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5 transition-transform group-hover:rotate-180 duration-500 text-text-muted group-hover:text-primary" />
            <span className="sr-only">F10 刷新</span>
          </button>

          {/* XXMI Loader */}
          <button
            type="button"
            onClick={onLaunchLoader}
            title="启动 3DMigoto / XXMI 加载器"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-control bg-surface hover:bg-surface-2 border border-border hover:border-primary/40 text-text hover:text-primary text-xs font-semibold transition shadow-2xs active:scale-95 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="hidden xl:inline">XXMI</span>
          </button>

          {/* Overlay Button */}
          <button
            type="button"
            onClick={() => window.lz.toggleOverlay()}
            title="唤起游戏内置悬浮窗 (Ctrl+F)"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-control bg-surface hover:bg-surface-2 border border-border hover:border-primary/40 text-text hover:text-primary text-xs font-semibold transition shadow-2xs active:scale-95 cursor-pointer"
          >
            <Gamepad2 className="w-3.5 h-3.5 text-primary" />
            <span className="hidden lg:inline">悬浮窗</span>
          </button>

          {/* Play Button - The ONLY solid primary button in Header */}
          <button
            type="button"
            onClick={onLaunchGame}
            disabled={launchingGame}
            className={`btn-play flex items-center space-x-2 px-4 py-1.5 rounded-control font-bold text-xs tracking-wider uppercase cursor-pointer transition-all ${
              launchingGame ? 'opacity-80 cursor-wait' : 'active:scale-95'
            }`}
            title="启动当前游戏"
          >
            {launchingGame ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span className="tracking-wide">{launchingGame ? '启动中...' : '开始游戏'}</span>
          </button>
        </div>

        <div className="h-4 w-[1px] bg-border mx-0.5" />

        {/* Window Controls: 托盘收起、任务栏最小化、最大化、彻底关闭 */}
        <div className="flex items-center space-x-0.5 bg-surface-2 border border-border rounded-control p-0.5">
          {/* 1. 收起至托盘 (后台运行) */}
          <button
            type="button"
            onClick={() => window.flairx.hideToTray()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface text-text-muted hover:text-text transition cursor-pointer"
            title="收起至系统托盘 (保持后台运行，Ctrl+F 游戏悬浮窗可用)"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
          </button>

          {/* 2. 最小化到任务栏 (保留任务栏图标) */}
          <button
            type="button"
            onClick={() => window.flairx.minimize()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface text-text-muted hover:text-text transition cursor-pointer"
            title="最小化到任务栏 (保留任务栏图标)"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* 3. 最大化 / 还原 */}
          <button
            type="button"
            onClick={() => window.flairx.maximize()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface text-text-muted hover:text-text transition cursor-pointer"
            title="最大化 / 还原"
          >
            <Square className="w-3 h-3" />
          </button>

          {/* 4. 彻底退出程序 / 关闭 */}
          <button
            type="button"
            onClick={() => window.flairx.close()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-rose-600 text-text-muted hover:text-white transition cursor-pointer"
            title={
              closeAction === 'minimize_to_tray'
                ? '关闭主界面 (保持托盘后台运行)'
                : '彻底退出程序 (关闭所有窗口并释放内存)'
            }
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
