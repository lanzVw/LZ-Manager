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
      {/* Left Sidebar: Character Categories (白瓷蓝调侧边栏) */}
      <aside className="w-64 bg-white/80 border-r border-blue-100 backdrop-blur-2xl flex flex-col shrink-0 select-none z-10 shadow-sm">
        {/* Roster Header */}
        <div className="p-3.5 border-b border-blue-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 tracking-wide flex items-center space-x-2">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>角色分类</span>
            </span>
            <span className="text-[10px] font-mono text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
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
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-400 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none transition font-sans"
            />
          </div>
        </div>

        {/* Character Categories List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 porcelain-scrollbar-light">
          {/* All Characters Option */}
          <button
            onClick={() => setSelectedChar('all')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              selectedChar === 'all'
                ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-md shadow-blue-500/25'
                : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50/70'
            }`}
          >
            <div className="flex items-center space-x-2.5 truncate">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px] font-mono ${
                selectedChar === 'all' ? 'bg-white text-blue-600 font-black shadow-sm' : 'bg-slate-100 text-slate-600'
              }`}>
                全
              </div>
              <span className="truncate">全部角色</span>
            </div>

            <div className={`flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
              selectedChar === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              <span className="font-bold">{totalEnabledInAll}</span>
              <span>/</span>
              <span>{characters.reduce((acc, c) => acc + c.total, 0)}</span>
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
                    ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-md shadow-blue-500/25'
                    : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50/70'
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[11px] font-sans shrink-0 transition-transform group-hover:scale-105 ${
                      isSelected
                        ? 'bg-white text-blue-600 font-black shadow-sm'
                        : hasActive
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {c.name.slice(0, 1)}
                  </div>
                  <span className="truncate tracking-wide">{c.name}</span>
                </div>

                <div className={`flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  <span className={`font-bold ${isSelected ? 'text-white' : hasActive ? 'text-blue-600' : 'text-slate-500'}`}>
                    {c.enabled}
                  </span>
                  <span>/</span>
                  <span>{c.total}</span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Main Content Area: Mod Grid (白瓷卡片流) */}
      <main className="flex-1 flex flex-col overflow-hidden bg-transparent">
        {/* Sub-Header */}
        <div className="h-14 px-6 border-b border-blue-100 flex items-center justify-between shrink-0 bg-white/70 backdrop-blur-xl">
          <div className="flex items-center space-x-3.5">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2.5 tracking-wide">
                <span>{selectedChar === 'all' ? '全部角色模组' : `${selectedChar} · 模组列表`}</span>
                <span className="text-xs font-mono text-blue-600 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 font-semibold">
                  {displayedMods.length} 个项目
                </span>
              </h2>
            </div>

            {/* Option A Exclusive Tag */}
            <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>单选互斥保护</span>
            </div>

            {/* Conflict Filter Button */}
            {totalConflictsCount > 0 && (
              <button
                onClick={() => setConflictFilterOnly(!conflictFilterOnly)}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  conflictFilterOnly
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
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
                className="w-full bg-white border border-slate-200 focus:border-blue-400 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-sans transition shadow-sm"
              />
            </div>

            <button
              onClick={() => {
                onRefresh()
                loadConflicts()
              }}
              disabled={loading}
              className="p-2 rounded-xl bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-300 transition shadow-sm active:scale-95"
              title="重新扫描 Mod 目录"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mod Grid Canvas */}
        <div className="flex-1 overflow-y-auto p-6 porcelain-scrollbar-light">
          {displayedMods.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div className="p-5 rounded-3xl bg-white border border-blue-100 text-blue-400 shadow-sm">
                <FolderOpen className="w-12 h-12 stroke-[1.2]" />
              </div>
              <div className="text-center">
                <div className="text-xs font-mono tracking-widest text-slate-500 uppercase">
                  // EMPTY ARCHIVE //
                </div>
                <p className="text-xs text-slate-500 mt-1">
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
                        ? 'bg-rose-50/50 border-rose-300 shadow-sm hover:border-rose-400'
                        : mod.enabled
                        ? 'bg-white border-blue-500 shadow-lg shadow-blue-500/10 hover:border-blue-600 ring-2 ring-blue-500/20 hover:-translate-y-1'
                        : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5'
                    }`}
                  >
                    {/* Cover Showcase */}
                    <div className="relative aspect-[16/10] bg-slate-100 flex items-center justify-center overflow-hidden">
                      {mod.coverPath ? (
                        <img
                          src={`file://${mod.coverPath}`}
                          alt={mod.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-106"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <ImageIcon className="w-8 h-8 stroke-[1.2] mb-1 text-slate-400" />
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                            无预览图
                          </span>
                        </div>
                      )}

                      {/* Status Capsule */}
                      <div className="absolute top-2.5 left-2.5 z-10">
                        {mod.enabled ? (
                          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-semibold text-[10px] shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            <span>已装备</span>
                          </div>
                        ) : (
                          <div className="px-2.5 py-0.5 rounded-full bg-white/90 backdrop-blur-md border border-slate-200 text-slate-600 text-[10px] font-medium shadow-sm">
                            待命
                          </div>
                        )}
                      </div>

                      {/* Conflict Alert Tag */}
                      {conflict && (
                        <div className="absolute top-2.5 right-2.5 z-20">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white flex items-center space-x-1 shadow-sm border border-rose-300"
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
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-white/90 text-blue-600 border border-blue-200 shadow-sm">
                            INI
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Mod Information & Bottom Action */}
                    <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3 bg-white">
                      <div>
                        {selectedChar === 'all' && (
                          <div className="text-[10px] font-semibold text-blue-600 mb-0.5">
                            {mod.charName}
                          </div>
                        )}
                        <h3
                          className="text-xs font-bold text-slate-800 line-clamp-2 leading-relaxed group-hover:text-blue-600 transition"
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
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
                            : 'bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 hover:from-blue-600 hover:to-sky-500 text-white shadow-blue-500/20'
                        } ${isToggling ? 'opacity-50 cursor-wait' : ''}`}
                      >
                        {isToggling ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : mod.enabled ? (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-rose-500" />
                            <span>卸下模组</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5 text-white fill-white" />
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
