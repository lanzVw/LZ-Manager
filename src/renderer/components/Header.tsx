import React, { useState, useRef, useEffect } from 'react'
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
  Sun,
  Moon
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { Logo } from './Logo'
import { Select } from './ui/Select'
import { SegmentedControl } from './ui/SegmentedControl'
import { CloseConfirmModal } from './ui/CloseConfirmModal'

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
  closePromptRemembered?: boolean
  launchingGame?: boolean
  onSelectGame: (gameId: string) => void
  onLaunchGame: () => void
  onLaunchLoader: () => void
  onReloadMods?: () => void
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  activeGame,
  games,
  closeAction = 'quit',
  closePromptRemembered = false,
  launchingGame = false,
  onSelectGame,
  onLaunchGame,
  onLaunchLoader,
  onReloadMods
}) => {
  const { theme, toggleTheme, palette } = useTheme()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleCloseClick = () => {
    if (closePromptRemembered) {
      window.flairx.close(closeAction)
    } else {
      setShowCloseModal(true)
    }
  }

  const getThemeToggleTitle = () => {
    if (theme === 'dark') {
      return palette === 'clay' ? '切换至浅色模式 (暖纸 · 陶土)' : '切换至浅色模式 (瓷白 · 钴蓝)'
    }
    return palette === 'clay' ? '切换至黑夜模式 (黑曜 · 陶土)' : '切换至黑夜模式 (深青 · 墨夜)'
  }

  useEffect(() => {
    if (!dropdownOpen) return
    const handlePointerDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [dropdownOpen])

  return (
    <>
      <header className="h-16 bg-surface/85 border-b border-border backdrop-blur-xl flex items-center justify-between px-5 select-none drag-region relative z-30 shadow-xs">
      {/* Decorative Top Accent Line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-60 pointer-events-none" />

      {/* Left: Brand Emblem & Game Target Switcher */}
      <div className="flex items-center space-x-3.5 no-drag shrink-0">
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

      {/* Center: Navigation Tabs */}
      <div className="no-drag shrink-0 mx-4">
        <SegmentedControl
          items={[
            { id: 'mods', label: '角色库', icon: <FolderKanban className="w-3.5 h-3.5" /> },
            { id: 'gamebanana', label: 'Mod市场', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
            { id: 'presets', label: '方案预设', icon: <Sliders className="w-3.5 h-3.5" /> },
            { id: 'settings', label: '系统设置', icon: <Settings className="w-3.5 h-3.5" /> }
          ]}
          value={activeTab}
          onChange={(val) => setActiveTab(val)}
          size="sm"
        />
      </div>

      {/* Right: Quick Actions, Theme Switcher & Window Controls */}
      <div className="flex items-center space-x-2 no-drag shrink-0 ml-auto">
        {/* Quick Operations */}
        <div className="flex items-center space-x-1.5">
          {/* Light/Dark Theme Switcher */}
          <button
            type="button"
            onClick={toggleTheme}
            title={getThemeToggleTitle()}
            className="w-8 h-8 aspect-square flex items-center justify-center rounded-control bg-surface hover:bg-surface-2 border border-border hover:border-primary/40 text-text hover:text-primary transition shadow-2xs active:scale-95 cursor-pointer shrink-0"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 align-neg-125" />
            ) : (
              <Moon className="w-4 h-4 text-primary align-neg-125" />
            )}
            <span className="sr-only">切换主题</span>
          </button>

          {/* Overlay Button */}
          <button
            type="button"
            onClick={() => window.lz.toggleOverlay()}
            title="唤起游戏内置悬浮窗 (Ctrl+F)"
            className="w-8 h-8 aspect-square flex items-center justify-center rounded-control bg-surface hover:bg-surface-2 border border-border hover:border-primary/40 text-text hover:text-primary transition shadow-2xs active:scale-95 cursor-pointer shrink-0"
          >
            <Gamepad2 className="w-4 h-4 text-primary align-neg-125" />
            <span className="sr-only">唤起游戏内置悬浮窗</span>
          </button>

          {/* Play Split Button - The ONLY solid primary button in Header */}
          <div ref={dropdownRef} className="relative inline-flex items-stretch">
            <div
              className={`btn-play inline-flex items-stretch overflow-hidden ${
                launchingGame ? 'opacity-80 cursor-wait' : ''
              }`}
            >
              {/* 左侧主按钮 */}
              <button
                type="button"
                onClick={onLaunchGame}
                disabled={launchingGame}
                className={`flex items-center space-x-2 px-3.5 py-1.5 font-bold text-xs tracking-wider uppercase cursor-pointer transition-colors hover:bg-white/10 active:bg-white/20 ${
                  launchingGame ? 'cursor-wait' : ''
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

              {/* 中间微细分割线 */}
              <div className="w-[1px] bg-white/20 my-1.5 self-stretch" />

              {/* 右侧下拉箭头按钮 */}
              <button
                type="button"
                onClick={() => setDropdownOpen((prev) => !prev)}
                disabled={launchingGame}
                className={`flex items-center justify-center px-2 py-1.5 cursor-pointer transition-colors hover:bg-white/10 active:bg-white/20 ${
                  launchingGame ? 'cursor-wait' : ''
                }`}
                title="启动选项"
                aria-expanded={dropdownOpen}
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    dropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            {/* 下拉菜单 */}
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-surface border border-border/80 shadow-popover p-1.5 z-50">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false)
                    onLaunchGame()
                  }}
                  className="w-full flex items-start space-x-2.5 p-2 rounded-lg hover:bg-surface-2 text-left transition-colors cursor-pointer group"
                >
                  <div className="p-1.5 rounded-md bg-primary/10 text-primary mt-0.5 group-hover:bg-primary group-hover:text-primary-fg transition-colors">
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-text group-hover:text-primary transition-colors">
                      开始游戏
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5 leading-tight">
                      启动当前关联的游戏客户端
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false)
                    onLaunchLoader()
                  }}
                  className="w-full flex items-start space-x-2.5 p-2 rounded-lg hover:bg-surface-2 text-left transition-colors cursor-pointer group mt-1"
                >
                  <div className="p-1.5 rounded-md bg-primary/10 text-primary mt-0.5 group-hover:bg-primary group-hover:text-primary-fg transition-colors">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-text group-hover:text-primary transition-colors">
                      启动 XXMI 加载器
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5 leading-tight">
                      调起 3DMigoto / XXMI 独立环境
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="h-4 w-[1px] bg-border mx-0.5" />

        {/* Window Controls: 任务栏最小化、最大化、关闭 */}
        <div className="flex items-center space-x-0.5 bg-surface-2 border border-border rounded-control p-0.5">
          {/* 1. 最小化到任务栏 (保留任务栏图标) */}
          <button
            type="button"
            onClick={() => window.flairx.minimize()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface text-text-muted hover:text-text transition cursor-pointer"
            title="最小化到任务栏 (保留任务栏图标)"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* 2. 最大化 / 还原 */}
          <button
            type="button"
            onClick={() => window.flairx.maximize()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface text-text-muted hover:text-text transition cursor-pointer"
            title="最大化 / 还原"
          >
            <Square className="w-3 h-3" />
          </button>

          {/* 3. 关闭窗口 */}
          <button
            type="button"
            onClick={handleCloseClick}
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
      <CloseConfirmModal
        isOpen={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        initialAction={closeAction}
        onConfirm={async (action, remember) => {
          setShowCloseModal(false)
          if (remember) {
            try {
              await window.flairx.updateAppConfig({
                closeAction: action,
                closePromptRemembered: true
              })
            } catch (_) {}
          }
          window.flairx.close(action)
        }}
      />
    </>
  )
}
