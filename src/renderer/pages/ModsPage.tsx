import React, { useState, useMemo, useEffect } from 'react'
import {
  Search,
  CheckCircle2,
  XCircle,
  FolderOpen,
  Image as ImageIcon,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Zap,
  Sparkles,
  Layers,
  ChevronRight
} from 'lucide-react'
import { CharacterConflictReport, ModConflictSummary } from '../../core/types'

interface ModsPageProps {
  modsData: Record<string, any[]>
  loading: boolean
  onRefresh: () => void
  onToggleMod: (charName: string, modName: string, enabled: boolean) => Promise<void>
  onSelectMod: (modFullPath: string) => void
}

export const ModsPage: React.FC<ModsPageProps> = ({
  modsData,
  loading,
  onRefresh,
  onToggleMod,
  onSelectMod
}) => {
  const [selectedChar, setSelectedChar] = useState<string>('all')
  const [searchChar, setSearchChar] = useState<string>('')
  const [searchMod, setSearchMod] = useState<string>('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [conflictsMap, setConflictsMap] = useState<Record<string, CharacterConflictReport>>({})
  const [conflictFilterOnly, setConflictFilterOnly] = useState<boolean>(false)

  // 扫描检测所有冲突
  const loadConflicts = async () => {
    try {
      const reps: any = await window.lz.detectConflicts()
      if (reps) setConflictsMap(reps)
    } catch (_) {}
  }

  useEffect(() => {
    loadConflicts()
  }, [modsData])

  const getModConflict = (charName: string, modName: string): ModConflictSummary | null => {
    const charReport = conflictsMap[charName]
    if (charReport && charReport.conflictsByMod && charReport.conflictsByMod[modName]?.hasConflict) {
      return charReport.conflictsByMod[modName]
    }
    return null
  }

  const totalConflictsCount = useMemo(() => {
    let count = 0
    for (const rep of Object.values(conflictsMap)) {
      if (rep && rep.allCollisions) {
        count += rep.allCollisions.length
      }
    }
    return count
  }, [conflictsMap])

  // Character list with counts
  const characters = useMemo(() => {
    const list = Object.keys(modsData).map((name) => {
      const mods = modsData[name] || []
      const enabledCount = mods.filter((m) => m.enabled).length
      return {
        name,
        total: mods.length,
        enabled: enabledCount
      }
    })
    return list.sort((a, b) => b.total - a.total)
  }, [modsData])

  const filteredCharacters = useMemo(() => {
    if (!searchChar) return characters
    const q = searchChar.toLowerCase()
    return characters.filter((c) => c.name.toLowerCase().includes(q))
  }, [characters, searchChar])

  // Active mods to display
  const displayedMods = useMemo(() => {
    let list: any[] = []
    if (selectedChar === 'all') {
      for (const [charName, mods] of Object.entries(modsData)) {
        list.push(...mods.map((m) => ({ ...m, charName })))
      }
    } else {
      const mods = modsData[selectedChar] || []
      list = mods.map((m) => ({ ...m, charName: selectedChar }))
    }

    if (searchMod) {
      const q = searchMod.toLowerCase()
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.charName.toLowerCase().includes(q)
      )
    }

    if (conflictFilterOnly) {
      list = list.filter((m) => getModConflict(m.charName, m.name) !== null)
    }

    return list
  }, [modsData, selectedChar, searchMod, conflictFilterOnly, conflictsMap])

  const handleToggle = async (charName: string, modName: string, currentState: boolean) => {
    const id = `${charName}::${modName}`
    setTogglingId(id)
    try {
      await onToggleMod(charName, modName, !currentState)
    } finally {
      setTogglingId(null)
    }
  }

  const totalEnabledInAll = useMemo(() => {
    let count = 0
    for (const mods of Object.values(modsData)) {
      count += (mods || []).filter((m) => m.enabled).length
    }
    return count
  }, [modsData])

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Left Sidebar: Character Agent Roster (角色特工编制) */}
      <aside className="w-64 bg-[#0B0D14]/90 border-r border-cyan-500/20 backdrop-blur-xl flex flex-col shrink-0 select-none z-10 shadow-2xl">
        {/* Roster Header */}
        <div className="p-3.5 border-b border-cyan-500/20 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-widest text-[#E5FE40] font-black uppercase flex items-center space-x-1.5">
              <span>// AGENT ROSTER</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#E5FE40] animate-ping" />
            </span>
            <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
              {characters.length} CHARS
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-cyan-400" />
            <input
              type="text"
              placeholder="搜索角色特工..."
              value={searchChar}
              onChange={(e) => setSearchChar(e.target.value)}
              className="w-full bg-[#121622] border border-cyan-500/30 focus:border-cyan-400 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition font-sans"
            />
          </div>
        </div>

        {/* Character Roster List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* All Characters Option */}
          <button
            onClick={() => setSelectedChar('all')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
              selectedChar === 'all'
                ? 'bg-gradient-to-r from-cyan-500/25 to-blue-500/10 text-cyan-200 border border-cyan-400/60 shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#121622]/60 border border-transparent'
            }`}
          >
            <div className="flex items-center space-x-2.5 truncate">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] font-mono ${
                selectedChar === 'all' ? 'bg-cyan-400 text-black' : 'bg-slate-800 text-slate-300'
              }`}>
                ALL
              </div>
              <span className="truncate">全部角色</span>
            </div>

            <div className="flex items-center space-x-1.5 text-[10px] font-mono">
              <span className="text-[#E5FE40] font-black">{totalEnabledInAll}</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-400">
                {characters.reduce((acc, c) => acc + c.total, 0)}
              </span>
            </div>
          </button>

          {/* Individual Character Buttons */}
          {filteredCharacters.map((c) => {
            const isSelected = selectedChar === c.name
            const hasActive = c.enabled > 0

            return (
              <button
                key={c.name}
                onClick={() => setSelectedChar(c.name)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all group ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#E5FE40]/20 via-[#E5FE40]/10 to-transparent text-[#E5FE40] border-l-4 border-l-[#E5FE40] border-y border-r border-[#E5FE40]/30 shadow-[0_0_15px_rgba(229,254,64,0.15)]'
                    : 'text-slate-300 hover:text-white hover:bg-[#121622]/80 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[11px] font-sans shrink-0 transition-transform group-hover:scale-105 ${
                      isSelected
                        ? 'bg-[#E5FE40] text-black font-black'
                        : hasActive
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-slate-800/80 text-slate-400'
                    }`}
                  >
                    {c.name.slice(0, 1)}
                  </div>
                  <span className="truncate tracking-wide">{c.name}</span>
                </div>

                <div className="flex items-center space-x-1 text-[10px] font-mono">
                  <span
                    className={`font-black ${
                      hasActive
                        ? isSelected
                          ? 'text-[#E5FE40]'
                          : 'text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {c.enabled}
                  </span>
                  <span className="text-slate-700">/</span>
                  <span className="text-slate-400">{c.total}</span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Main Content Area: Mod Grid */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#07090E]/60 backdrop-blur-md">
        {/* Tactical Sub-Header */}
        <div className="h-14 px-6 border-b border-cyan-500/20 flex items-center justify-between shrink-0 bg-[#0B0D14]/70">
          <div className="flex items-center space-x-3">
            <div>
              <div className="text-[9px] font-mono tracking-widest text-cyan-400/80 uppercase leading-none">
                DEPLOYMENT MATRIX //
              </div>
              <h2 className="text-base font-black text-white flex items-center space-x-2 tracking-wide mt-0.5">
                <span>{selectedChar === 'all' ? '全部角色 MOD 档案' : `${selectedChar} · MOD 档案`}</span>
                <span className="text-xs font-mono text-cyan-300 px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800/60 font-semibold">
                  {displayedMods.length} ITEMS
                </span>
              </h2>
            </div>

            {/* Option A Exclusive Tag */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-xs font-bold text-cyan-300 shadow-sm">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>单选互斥已就绪</span>
            </div>

            {/* Conflict Filter Button */}
            {totalConflictsCount > 0 && (
              <button
                onClick={() => setConflictFilterOnly(!conflictFilterOnly)}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-black transition-all ${
                  conflictFilterOnly
                    ? 'bg-rose-600 text-white shadow-[0_0_15px_rgba(244,63,94,0.5)] animate-pulse'
                    : 'bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>仅看冲突 ({totalConflictsCount})</span>
              </button>
            )}
          </div>

          {/* Search & Actions */}
          <div className="flex items-center space-x-3">
            <div className="relative w-60">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-cyan-400" />
              <input
                type="text"
                placeholder="过滤 Mod 标识..."
                value={searchMod}
                onChange={(e) => setSearchMod(e.target.value)}
                className="w-full bg-[#121622] border border-cyan-500/30 focus:border-cyan-400 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-sans transition"
              />
            </div>

            <button
              onClick={() => {
                onRefresh()
                loadConflicts()
              }}
              disabled={loading}
              className="p-2 rounded-lg bg-[#121622] hover:bg-[#1A2033] text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-400 transition shadow-sm active:scale-95"
              title="重新扫描 Mod 目录"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mod Grid Canvas */}
        <div className="flex-1 overflow-y-auto p-6">
          {displayedMods.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
              <div className="p-4 rounded-2xl bg-[#121622] border border-cyan-500/20 text-cyan-500/50">
                <FolderOpen className="w-12 h-12 stroke-[1.2]" />
              </div>
              <div className="text-center">
                <div className="text-xs font-mono tracking-widest text-slate-400 uppercase">
                  // NO DATA ARCHIVED //
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {conflictFilterOnly ? '当前角色未发现任何资源冲突' : '未检测到匹配的 Mod 实体，可拖入压缩包立即导入'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4.5">
              {displayedMods.map((mod) => {
                const id = `${mod.charName}::${mod.name}`
                const isToggling = togglingId === id
                const conflict = getModConflict(mod.charName, mod.name)

                return (
                  <div
                    key={id}
                    onClick={() => onSelectMod(mod.fullPath)}
                    className={`group relative rounded-2xl border overflow-hidden transition-all duration-300 flex flex-col cursor-pointer ${
                      conflict
                        ? 'bg-[#151218]/90 border-rose-500/80 shadow-[0_0_20px_rgba(244,63,94,0.25)] hover:border-rose-400 ring-1 ring-rose-500/40'
                        : mod.enabled
                        ? 'bg-[#101420]/95 border-cyan-400/80 shadow-[0_0_20px_rgba(0,240,255,0.25)] hover:border-cyan-300 ring-1 ring-cyan-400/40 hover:-translate-y-1'
                        : 'bg-[#0E1017]/80 border-cyan-500/20 hover:border-cyan-400/50 hover:bg-[#121522] opacity-85 hover:opacity-100 hover:-translate-y-0.5'
                    }`}
                  >
                    {/* Top Holographic Glow for Active Cards */}
                    {mod.enabled && (
                      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#E5FE40] via-[#00F0FF] to-[#E5FE40] z-20 shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
                    )}

                    {/* Cover Showcase */}
                    <div className="relative aspect-[16/10] bg-[#07090F] flex items-center justify-center overflow-hidden">
                      {mod.coverPath ? (
                        <img
                          src={`file://${mod.coverPath}`}
                          alt={mod.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-108"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-600">
                          <ImageIcon className="w-8 h-8 stroke-[1.2] mb-1 text-slate-500" />
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                            NO PREVIEW
                          </span>
                        </div>
                      )}

                      {/* Dark Vignette Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D14] via-transparent to-black/40 pointer-events-none" />

                      {/* Active Status Ribbon (ZZZ / Anime Combat Style) */}
                      <div className="absolute top-2 left-2 z-10">
                        {mod.enabled ? (
                          <div className="flex items-center space-x-1 px-2.5 py-0.5 rounded-md bg-[#E5FE40] text-black font-black text-[10px] tracking-wider uppercase shadow-[0_0_12px_rgba(229,254,64,0.6)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                            <span>ACTIVE // 已激活</span>
                          </div>
                        ) : (
                          <div className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md border border-slate-700/80 text-slate-400 font-mono text-[9px] uppercase tracking-wider">
                            STANDBY // 待命
                          </div>
                        )}
                      </div>

                      {/* Conflict Alert Tag */}
                      {conflict && (
                        <div className="absolute top-2 right-2 z-20">
                          <span
                            className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-600 text-white flex items-center space-x-1 shadow-lg shadow-rose-950/80 border border-rose-300 animate-pulse"
                            title={`与 ${conflict.conflictingMods.join(', ')} 存在 Hash 冲突`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>冲突 ({conflict.collisions.length})</span>
                          </span>
                        </div>
                      )}

                      {/* INI Technical Indicator */}
                      {mod.hasIni && !conflict && (
                        <div className="absolute top-2 right-2 z-10">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#0B0D14]/85 text-cyan-300 border border-cyan-500/40 backdrop-blur-md">
                            INI READY
                          </span>
                        </div>
                      )}

                      {/* Corner Tech Crosshairs */}
                      <div className="absolute bottom-1 right-1 text-[8px] font-mono text-cyan-400/40 pointer-events-none select-none">
                        +
                      </div>
                    </div>

                    {/* Mod Information & Tactical Action */}
                    <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        {selectedChar === 'all' && (
                          <div className="text-[10px] font-mono font-bold text-cyan-400 tracking-wider mb-0.5">
                            #{mod.charName}
                          </div>
                        )}
                        <h3
                          className="text-xs font-bold text-slate-100 line-clamp-2 leading-relaxed group-hover:text-cyan-300 transition"
                          title={mod.name}
                        >
                          {mod.name}
                        </h3>
                      </div>

                      {/* Tactical Action Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggle(mod.charName, mod.name, mod.enabled)
                        }}
                        disabled={isToggling}
                        className={`w-full py-2 rounded-xl text-xs font-black tracking-wider uppercase flex items-center justify-center space-x-1.5 transition-all shadow-md active:scale-95 ${
                          mod.enabled
                            ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 hover:border-rose-400'
                            : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold shadow-cyan-500/25'
                        } ${isToggling ? 'opacity-50 cursor-wait' : ''}`}
                      >
                        {isToggling ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : mod.enabled ? (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                            <span>卸下 MOD // EJECT</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5 fill-black text-black" />
                            <span>装备 MOD // EQUIP</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
