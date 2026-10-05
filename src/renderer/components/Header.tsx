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
    <header className="h-16 bg-[#0B0D14]/95 border-b border-cyan-500/20 backdrop-blur-xl flex items-center justify-between px-4 select-none drag-region relative z-30 shadow-[0_4px_25px_rgba(0,0,0,0.6)]">
      {/* Decorative Top Accent Line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00F0FF] to-transparent opacity-60" />

      {/* Left: Brand Emblem & Game Target Switcher */}
      <div className="flex items-center space-x-3 no-drag">
        {/* Anime Game Brand Emblem */}
        <div className="flex items-center space-x-2.5 group cursor-default">
          <div className="relative">
            <div className="w-9 h-9 bg-gradient-to-br from-[#E5FE40] to-[#00F0FF] rounded-lg p-[1.5px] shadow-[0_0_15px_rgba(0,240,255,0.3)]">
              <div className="w-full h-full bg-[#0B0D14] rounded-[6px] flex items-center justify-center font-black text-sm tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-[#E5FE40] to-[#00F0FF]">
                LZ
              </div>
            </div>
            {/* Small status dot */}
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#E5FE40] border-2 border-[#0B0D14] animate-pulse" />
          </div>

          <div className="flex flex-col">
            <span className="font-black text-sm tracking-wider text-white uppercase flex items-center space-x-1.5 leading-none">
              <span>LZ MANAGER</span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#E5FE40]/20 text-[#E5FE40] border border-[#E5FE40]/40 font-bold">
                PRO
              </span>
            </span>
            <span className="text-[9px] font-mono text-cyan-400/80 tracking-widest uppercase mt-0.5">
              // TACTICAL SYSTEM
            </span>
          </div>
        </div>

        <div className="h-5 w-[1px] bg-cyan-500/20 mx-1" />

        {/* Game Target Selector (Mission Sector) */}
        <div className="relative flex items-center">
          <div className="flex items-center space-x-2 bg-[#121622] hover:bg-[#161B2B] border border-cyan-500/30 hover:border-cyan-400/60 rounded-xl px-3 py-1.5 transition shadow-inner">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <select
              value={activeGame?.id || ''}
              onChange={(e) => onSelectGame(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-100 font-sans focus:outline-none cursor-pointer pr-4 appearance-none"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id} className="bg-[#0f121d] text-slate-100 font-semibold py-1">
                  {g.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-cyan-400 pointer-events-none absolute right-2.5" />
          </div>
        </div>
      </div>

      {/* Center: Main Navigation Tabs (Anime HUD Tactical Menu) */}
      <nav className="flex items-center space-x-1.5 no-drag bg-[#07080D]/80 p-1.5 rounded-xl border border-cyan-500/20 backdrop-blur-md">
        <button
          onClick={() => setActiveTab('mods')}
          className={`group flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
            activeTab === 'mods'
              ? 'bg-[#E5FE40] text-black shadow-[0_0_15px_rgba(229,254,64,0.4)] scale-102'
              : 'text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10'
          }`}
        >
          <FolderKanban className={`w-3.5 h-3.5 ${activeTab === 'mods' ? 'text-black' : 'text-cyan-400'}`} />
          <div className="flex flex-col text-left leading-none">
            <span>MOD 管理</span>
            <span className={`text-[8px] font-mono tracking-widest uppercase ${activeTab === 'mods' ? 'text-black/70' : 'text-slate-500'}`}>
              01 // ARCHIVE
            </span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('gamebanana')}
          className={`group flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
            activeTab === 'gamebanana'
              ? 'bg-[#E5FE40] text-black shadow-[0_0_15px_rgba(229,254,64,0.4)] scale-102'
              : 'text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10'
          }`}
        >
          <ShoppingBag className={`w-3.5 h-3.5 ${activeTab === 'gamebanana' ? 'text-black' : 'text-cyan-400'}`} />
          <div className="flex flex-col text-left leading-none">
            <span>GAMEBANANA</span>
            <span className={`text-[8px] font-mono tracking-widest uppercase ${activeTab === 'gamebanana' ? 'text-black/70' : 'text-slate-500'}`}>
              02 // WORKSHOP
            </span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('presets')}
          className={`group flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
            activeTab === 'presets'
              ? 'bg-[#E5FE40] text-black shadow-[0_0_15px_rgba(229,254,64,0.4)] scale-102'
              : 'text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10'
          }`}
        >
          <Sliders className={`w-3.5 h-3.5 ${activeTab === 'presets' ? 'text-black' : 'text-cyan-400'}`} />
          <div className="flex flex-col text-left leading-none">
            <span>方案预设</span>
            <span className={`text-[8px] font-mono tracking-widest uppercase ${activeTab === 'presets' ? 'text-black/70' : 'text-slate-500'}`}>
              03 // PRESETS
            </span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`group flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
            activeTab === 'settings'
              ? 'bg-[#E5FE40] text-black shadow-[0_0_15px_rgba(229,254,64,0.4)] scale-102'
              : 'text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10'
          }`}
        >
          <Settings className={`w-3.5 h-3.5 ${activeTab === 'settings' ? 'text-black' : 'text-cyan-400'}`} />
          <div className="flex flex-col text-left leading-none">
            <span>系统设置</span>
            <span className={`text-[8px] font-mono tracking-widest uppercase ${activeTab === 'settings' ? 'text-black/70' : 'text-slate-500'}`}>
              04 // CONFIG
            </span>
          </div>
        </button>
      </nav>

      {/* Right: Tactical Action Controls & Window Buttons */}
      <div className="flex items-center space-x-2.5 no-drag">
        {/* Quick Operations */}
        <div className="flex items-center space-x-1.5">
          {/* F10 Reload */}
          <button
            onClick={onReloadMods}
            title="向游戏发送热刷新信号 (F10)"
            className="group relative p-2 rounded-xl bg-[#121622] hover:bg-[#1A2033] border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 hover:text-white transition shadow-sm active:scale-95"
          >
            <RotateCw className="w-3.5 h-3.5 transition-transform group-hover:rotate-180 duration-500" />
            <span className="sr-only">F10 刷新</span>
          </button>

          {/* Loader Button */}
          <button
            onClick={onLaunchLoader}
            title="启动 3DMigoto / XXMI 加载器"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#121622] hover:bg-[#1A2033] border border-amber-500/30 hover:border-amber-400/80 text-amber-300 text-xs font-bold transition shadow-sm active:scale-95"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
            <span className="hidden xl:inline">XXMI</span>
          </button>

          {/* Overlay Button */}
          <button
            onClick={() => window.lz.toggleOverlay()}
            title="唤起游戏内置 HUD 悬浮窗 (Ctrl+F / 手柄 Back+Start)"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#131326] hover:bg-[#1B1B38] border border-fuchsia-500/30 hover:border-fuchsia-400/80 text-fuchsia-300 text-xs font-bold transition shadow-sm active:scale-95"
          >
            <Gamepad2 className="w-3.5 h-3.5 text-fuchsia-400" />
            <span className="hidden lg:inline">HUD (Ctrl+F)</span>
          </button>

          {/* Big Anime Game Launch Button */}
          <button
            onClick={onLaunchGame}
            className="relative group flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#E5FE40] via-[#CCFF00] to-[#84CC16] hover:from-[#FACC15] hover:to-[#A3E635] text-black font-black text-xs tracking-wider uppercase shadow-[0_0_20px_rgba(229,254,64,0.4)] hover:shadow-[0_0_30px_rgba(229,254,64,0.6)] transition-all transform active:scale-95 overflow-hidden"
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full duration-1000 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-all pointer-events-none" />
            <Play className="w-4 h-4 fill-current" />
            <div className="flex flex-col text-left leading-none">
              <span>启动游戏</span>
              <span className="text-[7.5px] font-mono tracking-widest text-black/75">
                EXECUTE //
              </span>
            </div>
          </button>
        </div>

        <div className="h-5 w-[1px] bg-cyan-500/20" />

        {/* Minimalist Anime HUD Window controls */}
        <div className="flex items-center space-x-1 bg-[#121622] border border-cyan-500/20 rounded-xl p-0.5">
          <button
            onClick={() => window.flairx.minimize()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 transition"
            title="最小化"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.flairx.maximize()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 transition"
            title="最大化"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={() => window.flairx.close()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-rose-600 text-slate-400 hover:text-white transition"
            title="关闭窗口 (最小化至托盘)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
