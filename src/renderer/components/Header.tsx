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
  Gamepad2
} from 'lucide-react'

interface HeaderProps {
  activeTab: string
  setActiveTab: (tab: string) => void
  activeGame: any
  games: any[]
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
  onSelectGame,
  onLaunchGame,
  onLaunchLoader,
  onReloadMods
}) => {
  return (
    <header className="h-14 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between px-4 select-none drag-region">
      {/* Left: Brand & Game Switcher */}
      <div className="flex items-center space-x-3 no-drag">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
            LZ
          </div>
          <span className="font-bold text-slate-100 tracking-wide text-sm hidden sm:inline">
            LZ Manager
          </span>
        </div>

        <div className="h-4 w-px bg-slate-700 mx-2" />

        {/* Game Switcher Dropdown */}
        <select
          value={activeGame?.id || ''}
          onChange={(e) => onSelectGame(e.target.value)}
          className="bg-slate-800/80 border border-slate-700/80 rounded-md px-3 py-1 text-xs text-slate-200 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer hover:bg-slate-750 transition"
        >
          {games.map((g) => (
            <option key={g.id} value={g.id} className="bg-slate-900 text-slate-200">
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {/* Center: Main Navigation Tabs */}
      <nav className="flex items-center space-x-1 no-drag bg-slate-950/60 p-1 rounded-lg border border-slate-800/60">
        <button
          onClick={() => setActiveTab('mods')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
            activeTab === 'mods'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <FolderKanban className="w-3.5 h-3.5" />
          <span>Mod 管理</span>
        </button>

        <button
          onClick={() => setActiveTab('gamebanana')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
            activeTab === 'gamebanana'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>GameBanana</span>
        </button>

        <button
          onClick={() => setActiveTab('presets')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
            activeTab === 'presets'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>方案预设</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
            activeTab === 'settings'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>设置</span>
        </button>
      </nav>

      {/* Right: Actions & Window Controls */}
      <div className="flex items-center space-x-3 no-drag">
        {/* Quick Launch & F10 */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={onReloadMods}
            title="刷新 3DMigoto Mod (F10)"
            className="p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onLaunchLoader}
            title="启动 XXMI 加载器"
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/80 text-xs font-medium transition"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">加载器</span>
          </button>

          <button
            onClick={() => window.lz.toggleOverlay()}
            title="唤起/测试游戏内悬浮窗 (Ctrl+F)"
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-medium transition"
          >
            <Gamepad2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden lg:inline">悬浮窗 (Ctrl+F)</span>
          </button>

          <button
            onClick={onLaunchGame}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 text-xs font-medium transition"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>启动游戏</span>
          </button>
        </div>

        <div className="h-4 w-px bg-slate-700" />

        {/* Window controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => window.flairx.minimize()}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.flairx.maximize()}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={() => window.flairx.close()}
            className="p-1.5 rounded hover:bg-rose-600 text-slate-400 hover:text-white transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
