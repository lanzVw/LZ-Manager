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
      {/* Left Sidebar: Steam Library Character Categories (青花毛玻璃侧边栏) */}
      <aside className="w-64 bg-[#0c1426]/75 border-r border-white/[0.08] backdrop-blur-2xl flex flex-col shrink-0 select-none z-10 shadow-xl">
        {/* Roster Header */}
        <div className="p-3.5 border-b border-white/[0.08] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white tracking-wide flex items-center space-x-2">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span>角色分类</span>
            </span>
            <span className="text-[10px] font-mono text-sky-300 font-semibold bg-blue-500/15 px-2 py-0.5 rounded-full border border-blue-400/20">
              {characters.length} 个角色
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="快速检索角色..."
              value={searchChar}
              onChange={(e) => setSearchChar(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/10 focus:border-sky-400/60 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none transition font-sans"
            />
          </div>
        </div>

        {/* Character Categories List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 porcelain-scrollbar">
          {/* All Characters Option */}
          <button
            onClick={() => setSelectedChar('all')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              selectedChar === 'all'
                ? 'bg-gradient-to-r from-blue-700/80 via-blue-600/50 to-transparent text-white border-l-4 border-l-sky-400 shadow-md shadow-blue-900/30'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.06] border-l-4 border-l-transparent'
            }`}
          >
            <div className="flex items-center space-x-2.5 truncate">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px] font-mono ${
                selectedChar === 'all' ? 'bg-sky-400 text-slate-950 font-black' : 'bg-white/10 text-slate-300'
              }`}>
                全
              </div>
              <span className="truncate">全部角色</span>
            </div>

            <div className="flex items-center space-x-1 text-[10px] font-mono bg-white/[0.06] px-2 py-0.5 rounded-full">
              <span className="text-sky-400 font-bold">{totalEnabledInAll}</span>
              <span className="text-slate-500">/</span>
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
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all group ${
                  isSelected
                    ? 'bg-gradient-to-r from-blue-700/80 via-blue-600/50 to-transparent text-white border-l-4 border-l-sky-400 shadow-md shadow-blue-900/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.06] border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[11px] font-sans shrink-0 transition-transform group-hover:scale-105 ${
                      isSelected
                        ? 'bg-sky-400 text-slate-950 font-black'
                        : hasActive
                        ? 'bg-blue-500/20 text-sky-300 border border-blue-400/30'
                        : 'bg-white/[0.06] text-slate-400'
                    }`}
                  >
                    {c.name.slice(0, 1)}
                  </div>
                  <span className="truncate tracking-wide">{c.name}</span>
                </div>

                <div className="flex items-center space-x-1 text-[10px] font-mono bg-white/[0.06] px-2 py-0.5 rounded-full">
                  <span
                    className={`font-bold ${
                      hasActive
                        ? isSelected
                          ? 'text-sky-300'
                          : 'text-sky-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {c.enabled}
                  </span>
                  <span className="text-slate-600">/</span>
                  <span className="text-slate-400">{c.total}</span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Main Content Area: Mod Grid (Steam 库卡片流) */}
      <main className="flex-1 flex flex-col overflow-hidden bg-transparent">
        {/* Sub-Header */}
        <div className="h-14 px-6 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-[#0d1527]/60 backdrop-blur-xl">
          <div className="flex items-center space-x-3.5">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center space-x-2.5 tracking-wide">
                <span>{selectedChar === 'all' ? '全部角色模组' : `${selectedChar} · 模组列表`}</span>
                <span className="text-xs font-mono text-sky-300 px-2.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-400/20 font-semibold">
                  {displayedMods.length} 个项目
                </span>
              </h2>
            </div>

            {/* Option A Exclusive Tag */}
            <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-blue-500/10 border border-blue-400/20 text-xs font-medium text-sky-300">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>单选互斥保护</span>
            </div>

            {/* Conflict Filter Button */}
            {totalConflictsCount > 0 && (
              <button
                onClick={() => setConflictFilterOnly(!conflictFilterOnly)}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  conflictFilterOnly
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/50'
                    : 'bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>冲突过滤 ({totalConflictsCount})</span>
              </button>
            )}
          </div>

          {/* Search & Actions */}
          <div className="flex items-center space-x-2.5">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="搜索模组名称..."
                value={searchMod}
                onChange={(e) => setSearchMod(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/10 focus:border-sky-400/60 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none font-sans transition"
              />
            </div>

            <button
              onClick={() => {
                onRefresh()
                loadConflicts()
              }}
              disabled={loading}
              className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/10 hover:border-sky-400/40 transition shadow-sm active:scale-95"
              title="重新扫描 Mod 目录"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mod Grid Canvas (Poster Cards) */}
        <div className="flex-1 overflow-y-auto p-6 porcelain-scrollbar">
          {displayedMods.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div className="p-5 rounded-3xl bg-white/[0.04] border border-white/10 text-sky-400/60">
                <FolderOpen className="w-12 h-12 stroke-[1.2]" />
              </div>
              <div className="text-center">
                <div className="text-xs font-mono tracking-widest text-slate-400 uppercase">
                  // EMPTY ARCHIVE //
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {conflictFilterOnly ? '当前角色未发现任何资源冲突' : '未检测到匹配的 Mod，可直接拖入压缩包导入'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
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
                        ? 'bg-[#18131d]/85 border-rose-500/60 shadow-lg shadow-rose-950/40 hover:border-rose-400'
                        : mod.enabled
                        ? 'bg-[#121c32]/85 border-sky-400/70 shadow-lg shadow-blue-950/50 hover:border-sky-300 ring-1 ring-sky-400/30 hover:-translate-y-1'
                        : 'bg-[#101728]/70 border-white/[0.08] hover:border-sky-400/40 hover:bg-[#141e34] hover:-translate-y-0.5'
                    }`}
                  >
                    {/* Cover Showcase */}
                    <div className="relative aspect-[16/10] bg-[#090e1a] flex items-center justify-center overflow-hidden">
                      {mod.coverPath ? (
                        <img
                          src={`file://${mod.coverPath}`}
                          alt={mod.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-106"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-500">
                          <ImageIcon className="w-8 h-8 stroke-[1.2] mb-1 text-slate-500" />
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                            无预览图
                          </span>
                        </div>
                      )}

                      {/* Soft Vignette Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0e1628] via-transparent to-black/30 pointer-events-none" />

                      {/* Status Capsule (Steam Style) */}
                      <div className="absolute top-2.5 left-2.5 z-10">
                        {mod.enabled ? (
                          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-blue-600/90 text-white font-semibold text-[10px] shadow-sm backdrop-blur-md border border-sky-300/40">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-300 animate-pulse" />
                            <span>已装备</span>
                          </div>
                        ) : (
                          <div className="px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-slate-300 text-[10px]">
                            待命
                          </div>
                        )}
                      </div>

                      {/* Conflict Alert Tag */}
                      {conflict && (
                        <div className="absolute top-2.5 right-2.5 z-20">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white flex items-center space-x-1 shadow-md border border-rose-300"
                            title={`与 ${conflict.conflictingMods.join(', ')} 存在 Hash 冲突`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>冲突 ({conflict.collisions.length})</span>
                          </span>
                        </div>
                      )}

                      {/* INI Tag */}
                      {mod.hasIni && !conflict && (
                        <div className="absolute top-2.5 right-2.5 z-10">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-medium bg-[#0b1222]/80 text-sky-300 border border-sky-400/30 backdrop-blur-md">
                            INI
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Mod Information & Bottom Action */}
                    <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        {selectedChar === 'all' && (
                          <div className="text-[10px] font-medium text-sky-400 mb-0.5">
                            {mod.charName}
                          </div>
                        )}
                        <h3
                          className="text-xs font-semibold text-white line-clamp-2 leading-relaxed group-hover:text-sky-300 transition"
                          title={mod.name}
                        >
                          {mod.name}
                        </h3>
                      </div>

                      {/* Action Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggle(mod.charName, mod.name, mod.enabled)
                        }}
                        disabled={isToggling}
                        className={`w-full py-1.5 rounded-xl text-xs font-semibold tracking-wide flex items-center justify-center space-x-1.5 transition-all shadow-sm active:scale-95 ${
                          mod.enabled
                            ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30'
                            : 'bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 hover:from-blue-600 hover:to-sky-500 text-white shadow-blue-900/30'
                        } ${isToggling ? 'opacity-50 cursor-wait' : ''}`}
                      >
                        {isToggling ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : mod.enabled ? (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                            <span>卸下模组</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5 text-sky-200 fill-sky-200" />
                            <span>装备模组</span>
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
