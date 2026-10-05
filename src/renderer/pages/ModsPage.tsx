import React, { useState, useMemo, useEffect } from 'react'
import {
  Search,
  CheckCircle2,
  XCircle,
  FolderOpen,
  Folder,
  Globe,
  Image as ImageIcon,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Zap,
  Sparkles,
  Layers,
  LayoutList,
  LayoutGrid,
  ArrowUpDown,
  Filter,
  ChevronRight
} from 'lucide-react'
import { CharacterConflictReport, ModConflictSummary } from '../../core/types'

interface ModsPageProps {
  modsData: Record<string, any[]>
  loading: boolean
  onRefresh: () => void
  onToggleMod: (charName: string, modName: string, enabled: boolean) => Promise<void>
  onSelectMod: (modFullPath: string) => void
  onNavigateTab?: (tab: string) => void
  activeGame?: any
}

// 角色头像/缩略图组件 (专为二游立绘优化，顶部居中、尺寸自适应、错误优雅兜底)
const CharacterThumbnail: React.FC<{
  src: string | null
  name: string
  hasActive: boolean
  isSelected: boolean
  className?: string
  aspectRatioClass?: string
}> = ({ src, name, hasActive, isSelected, className = 'w-11 h-11', aspectRatioClass = 'aspect-square' }) => {
  const [hasError, setHasError] = useState(false)

  // 当 src 改变时重置错误状态
  useEffect(() => {
    setHasError(false)
  }, [src])

  return (
    <div
      className={`relative ${className} ${aspectRatioClass} rounded-xl overflow-hidden shrink-0 border transition-all duration-300 bg-slate-100/90 shadow-xs flex items-center justify-center ${
        isSelected
          ? 'ring-2 ring-white/95 border-white/70 shadow-sm'
          : hasActive
          ? 'border-blue-400/80 ring-2 ring-blue-500/20'
          : 'border-slate-200/90'
      }`}
    >
      {src && !hasError ? (
        <img
          src={`file://${src}`}
          alt={name}
          className="w-full h-full object-cover object-top select-none pointer-events-none transition-transform duration-300 group-hover:scale-108"
          loading="lazy"
          onError={() => setHasError(true)}
        />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center font-bold text-xs select-none ${
            isSelected
              ? 'bg-white/20 text-white font-black'
              : hasActive
              ? 'bg-blue-100 text-blue-700 font-bold'
              : 'bg-slate-200/70 text-slate-600 font-semibold'
          }`}
        >
          {name.slice(0, 1)}
        </div>
      )}

      {/* 装备状态微光角标 */}
      {hasActive && (
        <span
          className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white shadow-xs"
          title="该角色当前已有装载生效的 Mod"
        />
      )}
    </div>
  )
}

export const ModsPage: React.FC<ModsPageProps> = ({
  modsData,
  loading,
  onRefresh,
  onToggleMod,
  onSelectMod,
  onNavigateTab,
  activeGame
}) => {
  const [selectedChar, setSelectedChar] = useState<string>('all')
  const [searchChar, setSearchChar] = useState<string>('')
  const [searchMod, setSearchMod] = useState<string>('')
  const [sidebarMode, setSidebarMode] = useState<'list' | 'grid'>('list')
  const [charFilter, setCharFilter] = useState<'all' | 'hasMods' | 'equipped'>('all')
  const [charSort, setCharSort] = useState<'count' | 'name' | 'enabled'>('count')
  const [characterAvatars, setCharacterAvatars] = useState<Record<string, string>>({})
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

  // 加载全量角色的缩略图/头像映射表
  const loadCharacterAvatars = async () => {
    try {
      const avatars = await window.lz.getCharacterAvatars?.()
      if (avatars) {
        setCharacterAvatars(avatars)
      }
    } catch (err) {
      console.error('Failed to load character avatars:', err)
    }
  }

  useEffect(() => {
    loadConflicts()
    loadCharacterAvatars()
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

  // Character list with counts and avatars
  const characters = useMemo(() => {
    const list = Object.keys(modsData).map((name) => {
      const mods = modsData[name] || []
      const enabledCount = mods.filter((m) => m.enabled).length
      return {
        name,
        total: mods.length,
        enabled: enabledCount,
        avatarPath: characterAvatars[name] || null
      }
    })
    return list
  }, [modsData, characterAvatars])

  const charactersWithModsCount = useMemo(() => {
    return characters.filter((c) => c.total > 0).length
  }, [characters])

  const charactersEquippedCount = useMemo(() => {
    return characters.filter((c) => c.enabled > 0).length
  }, [characters])

  const filteredCharacters = useMemo(() => {
    let list = [...characters]

    // 1. 状态筛选 (全部角色 / 仅有模组 / 仅已装备)
    if (charFilter === 'hasMods') {
      list = list.filter((c) => c.total > 0)
    } else if (charFilter === 'equipped') {
      list = list.filter((c) => c.enabled > 0)
    }

    // 2. 搜索框快速检索
    if (searchChar) {
      const q = searchChar.toLowerCase().trim()
      list = list.filter((c) => c.name.toLowerCase().includes(q))
    }

    // 3. 排序策略
    if (charSort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    } else if (charSort === 'enabled') {
      list.sort((a, b) => {
        if (b.enabled !== a.enabled) return b.enabled - a.enabled
        if (b.total !== a.total) return b.total - a.total
        return a.name.localeCompare(b.name, 'zh-Hans-CN')
      })
    } else {
      // 默认 'count': 有模组的按数量降序排前，未安装模组的排后，同数量按名称排序
      list.sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total
        return a.name.localeCompare(b.name, 'zh-Hans-CN')
      })
    }

    return list
  }, [characters, searchChar, charFilter, charSort])

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
      {/* Left Sidebar: Character Categories (角色缩略图选项侧边栏) */}
      <aside className="w-72 bg-white/80 border-r border-blue-100 backdrop-blur-2xl flex flex-col shrink-0 select-none z-10 shadow-sm transition-all duration-300">
        {/* Roster Header */}
        <div className="p-3 border-b border-blue-100/80 space-y-2 bg-white/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 tracking-wide flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>角色分类</span>
              <span className="text-[10px] font-mono text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                {filteredCharacters.length} / {characters.length}
              </span>
            </span>

            {/* View Mode Switcher (列表模式 / 缩略图画廊模式) */}
            <div className="flex items-center bg-slate-100/90 p-0.5 rounded-lg border border-slate-200/80">
              <button
                type="button"
                onClick={() => setSidebarMode('list')}
                title="图文列表模式"
                className={`p-1 rounded-md transition ${
                  sidebarMode === 'list'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSidebarMode('grid')}
                title="头像网格模式 (QAQM 风格)"
                className={`p-1 rounded-md transition ${
                  sidebarMode === 'grid'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="快速检索角色..."
              value={searchChar}
              onChange={(e) => setSearchChar(e.target.value)}
              className="w-full bg-slate-50/90 border border-slate-200 focus:border-blue-400 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none transition font-sans shadow-2xs"
            />
          </div>

          {/* Filter & Sort Controls (筛选与排序条，支持“全部/未安装”角色) */}
          <div className="flex items-center justify-between gap-1 pt-0.5">
            {/* Display Filter: 全部 / 有Mod / 已装载 */}
            <div className="flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/80 text-[10px] font-semibold">
              <button
                type="button"
                onClick={() => setCharFilter('all')}
                className={`px-2 py-0.5 rounded-lg transition ${
                  charFilter === 'all'
                    ? 'bg-white text-blue-600 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="显示所有角色，包含未安装模组的角色"
              >
                全部
              </button>
              <button
                type="button"
                onClick={() => setCharFilter('hasMods')}
                className={`px-1.5 py-0.5 rounded-lg transition ${
                  charFilter === 'hasMods'
                    ? 'bg-white text-blue-600 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="仅显示已安装模组的角色"
              >
                有Mod ({charactersWithModsCount})
              </button>
              <button
                type="button"
                onClick={() => setCharFilter('equipped')}
                className={`px-1.5 py-0.5 rounded-lg transition ${
                  charFilter === 'equipped'
                    ? 'bg-white text-blue-600 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="仅显示当前已装备模组的角色"
              >
                已装载 ({charactersEquippedCount})
              </button>
            </div>

            {/* Sort Toggle: 数量 / 名称 / 常用 */}
            <button
              type="button"
              onClick={() => {
                if (charSort === 'count') setCharSort('name')
                else if (charSort === 'name') setCharSort('enabled')
                else setCharSort('count')
              }}
              className="flex items-center space-x-1 px-2 py-1 rounded-xl bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/80 text-[10px] font-medium text-slate-600 transition"
              title="切换排序规则：按数量 / 按名称 / 按装载优先"
            >
              <ArrowUpDown className="w-3 h-3 text-blue-600" />
              <span>
                {charSort === 'count' ? '数量' : charSort === 'name' ? '名称' : '常用'}
              </span>
            </button>
          </div>
        </div>

        {/* Character Categories List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 porcelain-scrollbar-light">
          {/* All Characters Option */}
          <button
            onClick={() => setSelectedChar('all')}
            className={`w-full flex items-center justify-between p-2 rounded-2xl text-xs font-semibold transition-all group relative border ${
              selectedChar === 'all'
                ? 'bg-gradient-to-r from-blue-600 to-sky-600 text-white shadow-md shadow-blue-500/25 border-blue-500'
                : 'bg-white/90 hover:bg-blue-50/80 text-slate-700 hover:text-blue-600 border-slate-200/70 hover:border-blue-200 shadow-xs'
            }`}
          >
            <div className="flex items-center space-x-2.5 truncate">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-transform duration-300 group-hover:scale-105 shadow-sm ${
                  selectedChar === 'all'
                    ? 'bg-white text-blue-600 ring-2 ring-white/90 border-white/50'
                    : 'bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-500 text-white border-blue-300'
                }`}
              >
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div className="flex flex-col text-left truncate">
                <span className={`truncate tracking-wide font-bold ${selectedChar === 'all' ? 'text-white' : 'text-slate-800'}`}>
                  全部角色
                </span>
                <span className={`text-[10px] truncate ${selectedChar === 'all' ? 'text-blue-100' : 'text-slate-400'}`}>
                  全库模组汇总
                </span>
              </div>
            </div>

            <div
              className={`flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 ml-1.5 ${
                selectedChar === 'all' ? 'bg-white/20 text-white font-bold' : 'bg-slate-100 text-slate-600 font-semibold'
              }`}
            >
              <span className="font-bold">{totalEnabledInAll}</span>
              <span className="opacity-50">/</span>
              <span>{characters.reduce((acc, c) => acc + c.total, 0)}</span>
            </div>
          </button>

          {sidebarMode === 'list' ? (
            /* 1. 图文列表视图 (以角色高清头像为核心选项) */
            <div className="space-y-1.5 pt-1">
              {filteredCharacters.map((c) => {
                const isSelected = selectedChar === c.name
                const hasActive = c.enabled > 0

                return (
                  <button
                    key={c.name}
                    onClick={() => setSelectedChar(c.name)}
                    className={`w-full flex items-center justify-between p-2 rounded-2xl text-xs font-semibold transition-all group relative border text-left ${
                      isSelected
                        ? 'bg-gradient-to-r from-blue-600 to-sky-600 text-white shadow-md shadow-blue-500/25 border-blue-500'
                        : 'bg-white/90 hover:bg-blue-50/80 text-slate-700 hover:text-blue-600 border-slate-200/70 hover:border-blue-200 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <CharacterThumbnail
                        src={c.avatarPath}
                        name={c.name}
                        hasActive={hasActive}
                        isSelected={isSelected}
                        className="w-11 h-11"
                      />
                      <div className="flex flex-col truncate">
                        <span className={`truncate tracking-wide font-bold ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                          {c.name}
                        </span>
                        <span className={`text-[10px] truncate ${
                          isSelected
                            ? 'text-blue-100'
                            : hasActive
                            ? 'text-blue-600 font-medium'
                            : c.total > 0
                            ? 'text-slate-400'
                            : 'text-slate-400/80 italic'
                        }`}>
                          {hasActive
                            ? `已装载 ${c.enabled} 款`
                            : c.total > 0
                            ? `${c.total} 款待命中`
                            : '未安装模组'}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 ml-1.5 ${
                        isSelected
                          ? 'bg-white/20 text-white font-bold'
                          : hasActive
                          ? 'bg-blue-50 text-blue-600 border border-blue-200/80 font-bold'
                          : c.total > 0
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-slate-100/60 text-slate-400'
                      }`}
                    >
                      {c.total > 0 ? (
                        <>
                          <span className={`font-bold ${isSelected ? 'text-white' : hasActive ? 'text-blue-600' : 'text-slate-600'}`}>
                            {c.enabled}
                          </span>
                          <span className="opacity-50">/</span>
                          <span>{c.total}</span>
                        </>
                      ) : (
                        <span className="text-[9px] opacity-75 font-mono">0 / 0</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            /* 2. QAQM 经典头像卡片画廊视图 (2列正方卡片) */
            <div className="grid grid-cols-2 gap-2 pt-1">
              {filteredCharacters.map((c) => {
                const isSelected = selectedChar === c.name
                const hasActive = c.enabled > 0

                return (
                  <button
                    key={c.name}
                    onClick={() => setSelectedChar(c.name)}
                    className={`group relative flex flex-col p-1.5 rounded-2xl border transition-all text-left cursor-pointer overflow-hidden ${
                      isSelected
                        ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/30 shadow-md shadow-blue-500/10'
                        : 'bg-white hover:bg-blue-50/60 border-slate-200 hover:border-blue-300 shadow-xs hover:-translate-y-0.5'
                    }`}
                  >
                    {/* Square Thumbnail */}
                    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200/70 shadow-inner">
                      <CharacterThumbnail
                        src={c.avatarPath}
                        name={c.name}
                        hasActive={hasActive}
                        isSelected={isSelected}
                        className="w-full h-full rounded-none border-0 shadow-none"
                      />

                      {/* Top-Right Badge (QAQM 经典悬浮角标，未安装模组的角色也标示 0/0) */}
                      <div className={`absolute top-1 right-1 flex items-center space-x-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded-full backdrop-blur-md font-bold shadow-xs ${
                        c.total > 0 ? 'bg-slate-900/75 text-white' : 'bg-slate-900/40 text-slate-300'
                      }`}>
                        <span className={hasActive ? 'text-amber-300' : 'text-slate-200'}>{c.enabled}</span>
                        <span className="text-slate-400">/</span>
                        <span>{c.total}</span>
                      </div>
                    </div>

                    {/* Character Name below thumbnail */}
                    <div className="mt-1 px-1 flex items-center justify-between">
                      <span className={`text-xs font-bold truncate ${isSelected ? 'text-blue-600' : 'text-slate-800'}`}>
                        {c.name}
                      </span>
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 ml-1 shadow-xs" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area: Mod Grid (白瓷卡片流) */}
      <main className="flex-1 flex flex-col overflow-hidden bg-transparent">
        {/* Sub-Header */}
        <div className="h-14 px-6 border-b border-blue-100 flex items-center justify-between shrink-0 bg-white/70 backdrop-blur-xl">
          <div className="flex items-center space-x-3.5">
            <div className="flex items-center space-x-3">
              {/* 当选中单个角色时，在标题前同步呈现该角色的微缩头像 */}
              {selectedChar !== 'all' && characterAvatars[selectedChar] && (
                <div className="w-8 h-8 rounded-xl overflow-hidden border border-blue-200/80 shadow-xs shrink-0 bg-slate-100">
                  <img
                    src={`file://${characterAvatars[selectedChar]}`}
                    alt={selectedChar}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              )}
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
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 space-y-4">
              {selectedChar !== 'all' && characterAvatars[selectedChar] ? (
                <div className="w-24 h-24 rounded-3xl overflow-hidden border-2 border-blue-200/80 shadow-lg ring-4 ring-blue-500/10 bg-white">
                  <img
                    src={`file://${characterAvatars[selectedChar]}`}
                    alt={selectedChar}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              ) : (
                <div className="p-5 rounded-3xl bg-white border border-blue-100 text-blue-500 shadow-sm">
                  <FolderOpen className="w-12 h-12 stroke-[1.2]" />
                </div>
              )}

              <div className="text-center max-w-md space-y-1.5">
                <div className="text-base font-bold text-slate-800">
                  {conflictFilterOnly
                    ? '未发现任何资源冲突'
                    : selectedChar === 'all'
                    ? '未找到匹配的模组'
                    : `【${selectedChar}】尚未安装任何模组`}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {conflictFilterOnly
                    ? '当前角色下的所有模组均正常运行，无文件冲突'
                    : selectedChar === 'all'
                    ? '全库暂无符合条件的模组，可直接拖拽 7z / zip / rar 压缩包到窗口自动导入'
                    : `您可以直接拖拽专属 Mod 压缩包至窗口导入，或前往 Mod 市场搜索下载【${selectedChar}】的外观模组！`}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                {selectedChar !== 'all' && onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab('gamebanana')}
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition active:scale-95 cursor-pointer"
                  >
                    <Globe className="w-4 h-4" />
                    <span>前往 Mod 市场查找模组</span>
                  </button>
                )}

                {selectedChar !== 'all' && (
                  <button
                    onClick={() => window.lz.openCharacterFolder(selectedChar)}
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    <Folder className="w-4 h-4 text-blue-600" />
                    <span>打开角色模组目录</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    onRefresh()
                    loadConflicts()
                  }}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition active:scale-95 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>刷新</span>
                </button>
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
