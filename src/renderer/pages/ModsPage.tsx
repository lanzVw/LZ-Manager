import React, { useState, useMemo } from 'react'
import {
  Search,
  CheckCircle2,
  XCircle,
  FolderOpen,
  Image as ImageIcon,
  ShieldCheck,
  RefreshCw,
  Sliders
} from 'lucide-react'

interface ModsPageProps {
  modsData: Record<string, any[]>
  loading: boolean
  onRefresh: () => void
  onToggleMod: (charName: string, modName: string, enabled: boolean) => Promise<void>
}

export const ModsPage: React.FC<ModsPageProps> = ({
  modsData,
  loading,
  onRefresh,
  onToggleMod
}) => {
  const [selectedChar, setSelectedChar] = useState<string>('all')
  const [searchChar, setSearchChar] = useState<string>('')
  const [searchMod, setSearchMod] = useState<string>('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

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

    return list
  }, [modsData, selectedChar, searchMod])

  const handleToggle = async (charName: string, modName: string, currentState: boolean) => {
    const id = `${charName}::${modName}`
    setTogglingId(id)
    try {
      await onToggleMod(charName, modName, !currentState)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Sidebar: Character Navigation */}
      <aside className="w-64 bg-slate-900/60 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索角色..."
              value={searchChar}
              onChange={(e) => setSearchChar(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            onClick={() => setSelectedChar('all')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition ${
              selectedChar === 'all'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <span>全部角色</span>
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-400">
              {characters.reduce((acc, c) => acc + c.total, 0)}
            </span>
          </button>

          {filteredCharacters.map((c) => (
            <button
              key={c.name}
              onClick={() => setSelectedChar(c.name)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition ${
                selectedChar === c.name
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <span className="truncate">{c.name}</span>
                {c.enabled > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                )}
              </div>
              <div className="flex items-center space-x-1 text-[10px]">
                <span className={c.enabled > 0 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {c.enabled}
                </span>
                <span className="text-slate-600">/</span>
                <span className="text-slate-400">{c.total}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content Area: Mod Grid */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950/40">
        {/* Top bar */}
        <div className="h-12 px-6 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <h2 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <span>{selectedChar === 'all' ? '全部角色 Mod' : selectedChar}</span>
              <span className="text-xs font-normal text-slate-400">
                ({displayedMods.length} 个 Mod)
              </span>
            </h2>

            <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800/40 text-[11px] text-blue-400">
              <ShieldCheck className="w-3 h-3" />
              <span>单选互斥已启用</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="搜索 Mod 名称..."
                value={searchMod}
                onChange={(e) => setSearchMod(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-md pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
              title="重新扫描 Mod 目录"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mod Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {displayedMods.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
              <FolderOpen className="w-10 h-10 stroke-[1.2]" />
              <p className="text-xs">未找到任何匹配的 Mod 文件</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {displayedMods.map((mod) => {
                const id = `${mod.charName}::${mod.name}`
                const isToggling = togglingId === id

                return (
                  <div
                    key={id}
                    className={`rounded-xl border overflow-hidden transition-all duration-200 flex flex-col group ${
                      mod.enabled
                        ? 'bg-slate-900/90 border-blue-500/50 shadow-lg shadow-blue-500/10'
                        : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700 opacity-80 hover:opacity-100'
                    }`}
                  >
                    {/* Cover Image */}
                    <div className="relative aspect-[16/10] bg-slate-950 flex items-center justify-center overflow-hidden">
                      {mod.coverPath ? (
                        <img
                          src={`file://${mod.coverPath}`}
                          alt={mod.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-600">
                          <ImageIcon className="w-8 h-8 stroke-[1.2] mb-1" />
                          <span className="text-[10px]">暂无封面</span>
                        </div>
                      )}

                      {/* Active Status Badge */}
                      <div className="absolute top-2 left-2">
                        {mod.enabled ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500 text-slate-950 flex items-center space-x-1 shadow-md">
                            <CheckCircle2 className="w-3 h-3 fill-current" />
                            <span>已激活</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900/80 text-slate-400 backdrop-blur-sm border border-slate-700/60">
                            未启用
                          </span>
                        )}
                      </div>

                      {/* INI tag */}
                      {mod.hasIni && (
                        <div className="absolute top-2 right-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-950/80 text-blue-400 border border-blue-900/60 backdrop-blur-sm">
                            INI
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Info & Toggle Area */}
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        {selectedChar === 'all' && (
                          <div className="text-[10px] text-blue-400 font-medium mb-0.5">
                            {mod.charName}
                          </div>
                        )}
                        <h3
                          className="text-xs font-semibold text-slate-200 line-clamp-2 leading-relaxed"
                          title={mod.name}
                        >
                          {mod.name}
                        </h3>
                      </div>

                      {/* Switch Button */}
                      <button
                        onClick={() => handleToggle(mod.charName, mod.name, mod.enabled)}
                        disabled={isToggling}
                        className={`w-full py-1.5 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition ${
                          mod.enabled
                            ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20'
                        } ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isToggling ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : mod.enabled ? (
                          <>
                            <XCircle className="w-3.5 h-3.5" />
                            <span>停用 Mod</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>启用 Mod</span>
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
