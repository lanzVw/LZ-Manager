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
  ChevronDown
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
    <header className="h-16 bg-[#0d1424]/85 border-b border-white/[0.08] backdrop-blur-2xl flex items-center justify-between px-5 select-none drag-region relative z-30 shadow-[0_4px_30px_rgba(5,10,20,0.5)]">
      {/* Decorative Top Accent Line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />

      {/* Left: Brand Emblem & Game Target Switcher */}
      <div className="flex items-center space-x-3.5 no-drag">
        {/* Porcelain Blue Brand Badge */}
        <div className="flex items-center space-x-3 group cursor-default">
          <div className="relative">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-sky-500 p-[1.5px] shadow-[0_0_16px_rgba(37,99,235,0.35)]">
              <div className="w-full h-full bg-[#0d1527] rounded-[14px] flex items-center justify-center font-black text-sm tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-sky-100 to-sky-400">
                LZ
              </div>
            </div>
            {/* Small status dot */}
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sky-400 border-2 border-[#0d1527] shadow-[0_0_6px_rgba(56,189,248,0.8)]" />
          </div>

          <div className="flex flex-col">
            <span className="font-extrabold text-sm tracking-wider text-white uppercase flex items-center space-x-1.5 leading-none">
              <span>LZ MANAGER</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-blue-500/20 text-sky-300 border border-blue-400/30 font-semibold">
                STEAM
              </span>
            </span>
            <span className="text-[9.5px] text-slate-400 tracking-wider font-medium mt-0.5">
              青花瓷韵 · 模组管理中枢
            </span>
          </div>
        </div>

        <div className="h-5 w-[1px] bg-white/10 mx-1" />

        {/* Game Target Selector (Frosted Rounded Pill) */}
        <div className="relative flex items-center">
          <div className="flex items-center space-x-2 bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 hover:border-sky-400/40 rounded-2xl px-3.5 py-1.5 transition shadow-sm">
            <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]" />
            <select
              value={activeGame?.id || ''}
              onChange={(e) => onSelectGame(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-100 font-sans focus:outline-none cursor-pointer pr-4 appearance-none"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id} className="bg-[#0f172a] text-slate-100 font-medium py-1">
                  {g.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-3" />
          </div>
        </div>
      </div>

      {/* Center: Steam Classic Navigation Tabs (Rounded Frosted Glass) */}
      <nav className="flex items-center space-x-1.5 no-drag bg-black/25 p-1 rounded-2xl border border-white/[0.06] backdrop-blur-xl">
        <button
          onClick={() => setActiveTab('mods')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
            activeTab === 'mods'
              ? 'bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 text-white shadow-[0_2px_12px_rgba(29,78,216,0.35)] border border-sky-400/30'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <FolderKanban className={`w-3.5 h-3.5 ${activeTab === 'mods' ? 'text-white' : 'text-slate-400'}`} />
          <span>模组库</span>
        </button>

        <button
          onClick={() => setActiveTab('gamebanana')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
            activeTab === 'gamebanana'
              ? 'bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 text-white shadow-[0_2px_12px_rgba(29,78,216,0.35)] border border-sky-400/30'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <ShoppingBag className={`w-3.5 h-3.5 ${activeTab === 'gamebanana' ? 'text-white' : 'text-slate-400'}`} />
          <span>创意工坊</span>
        </button>

        <button
          onClick={() => setActiveTab('presets')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
            activeTab === 'presets'
              ? 'bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 text-white shadow-[0_2px_12px_rgba(29,78,216,0.35)] border border-sky-400/30'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <Sliders className={`w-3.5 h-3.5 ${activeTab === 'presets' ? 'text-white' : 'text-slate-400'}`} />
          <span>方案预设</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
            activeTab === 'settings'
              ? 'bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 text-white shadow-[0_2px_12px_rgba(29,78,216,0.35)] border border-sky-400/30'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <Settings className={`w-3.5 h-3.5 ${activeTab === 'settings' ? 'text-white' : 'text-slate-400'}`} />
          <span>系统设置</span>
        </button>
      </nav>

      {/* Right: Quick Actions & Steam Play Button */}
      <div className="flex items-center space-x-2.5 no-drag">
        {/* Quick Operations */}
        <div className="flex items-center space-x-1.5">
          {/* F10 Reload */}
          <button
            onClick={onReloadMods}
            title="向游戏发送热刷新信号 (F10)"
            className="group p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 hover:border-sky-400/40 text-slate-300 hover:text-white transition shadow-sm active:scale-95"
          >
            <RotateCw className="w-3.5 h-3.5 transition-transform group-hover:rotate-180 duration-500 text-sky-400" />
            <span className="sr-only">F10 刷新</span>
          </button>

          {/* Loader Button */}
          <button
            onClick={onLaunchLoader}
            title="启动 3DMigoto / XXMI 加载器"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 hover:border-sky-400/40 text-slate-200 hover:text-white text-xs font-medium transition shadow-sm active:scale-95"
          >
            <Zap className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden xl:inline">XXMI</span>
          </button>

          {/* Overlay Button */}
          <button
            onClick={() => window.lz.toggleOverlay()}
            title="唤起游戏内置悬浮窗 (Ctrl+F)"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 hover:border-sky-400/40 text-slate-200 hover:text-white text-xs font-medium transition shadow-sm active:scale-95"
          >
            <Gamepad2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden lg:inline">悬浮窗</span>
          </button>

          {/* Steam Signature Play Button */}
          <button
            onClick={onLaunchGame}
            className="btn-steam-play flex items-center space-x-2 px-5 py-2 rounded-2xl text-white font-bold text-xs tracking-wider uppercase cursor-pointer"
            title="启动当前游戏"
          >
            <Play className="w-4 h-4 fill-white" />
            <span className="tracking-wide">开始游戏</span>
          </button>
        </div>

        <div className="h-5 w-[1px] bg-white/10 mx-0.5" />

        {/* Minimalist Window Controls */}
        <div className="flex items-center space-x-0.5 bg-white/[0.04] border border-white/[0.08] rounded-xl p-0.5">
          <button
            onClick={() => window.flairx.minimize()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
            title="最小化"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.flairx.maximize()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
            title="最大化"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={() => window.flairx.close()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-rose-600 text-slate-400 hover:text-white transition"
            title="关闭 (最小化至托盘)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
