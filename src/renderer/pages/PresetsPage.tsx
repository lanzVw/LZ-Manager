import React, { useState, useEffect } from 'react'
import {
  Sliders,
  Plus,
  CheckCircle2,
  Trash2,
  FolderCheck,
  Calendar,
  Layers,
  Sparkles,
  Zap,
  BookmarkCheck,
  ShieldCheck
} from 'lucide-react'

interface PresetsPageProps {
  activeGame: any
  onPresetApplied?: () => void
}

export const PresetsPage: React.FC<PresetsPageProps> = ({
  activeGame,
  onPresetApplied
}) => {
  const [presets, setPresets] = useState<any[]>([])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState<boolean>(false)
  const [newPresetName, setNewPresetName] = useState<string>('')
  const [newPresetDesc, setNewPresetDesc] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  const loadPresets = async () => {
    try {
      const res = await window.flairx.getPresets()
      setPresets(res.presets || [])
      setActivePresetId(res.activePresetId || null)
    } catch (err) {
      console.error('Failed to load presets:', err)
    }
  }

  useEffect(() => {
    loadPresets()
  }, [activeGame])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPresetName.trim()) return
    setLoading(true)
    try {
      await window.flairx.createPreset(newPresetName.trim(), newPresetDesc.trim())
      setNewPresetName('')
      setNewPresetDesc('')
      setIsCreating(false)
      await loadPresets()
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async (presetId: string) => {
    setLoading(true)
    try {
      const res = await window.flairx.applyPreset(presetId)
      if (res.success) {
        await loadPresets()
        if (onPresetApplied) onPresetApplied()
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (presetId: string) => {
    if (!confirm('确定要删除这个预设方案吗？')) return
    await window.flairx.deletePreset(presetId)
    await loadPresets()
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#07090E]/60 p-6 select-none">
      {/* Tactical Loadout Header */}
      <div className="flex items-center justify-between pb-6 border-b border-cyan-500/20 shrink-0">
        <div>
          <div className="text-[9px] font-mono tracking-widest text-[#E5FE40] font-black uppercase">
            // TACTICAL LOADOUT MATRIX //
          </div>
          <h2 className="text-lg font-black text-white flex items-center space-x-2 tracking-wide mt-0.5">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <span>MOD 阵容预设与一键切换</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            将当前全角色特工的 Mod 装配方案一键拍快照，支持秒切并自动同步 Persist Bridge 状态
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#E5FE40] to-[#A3E635] hover:brightness-110 text-black text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(229,254,64,0.35)] transition-all active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>保存当前装配为新方案 // SAVE</span>
        </button>
      </div>

      {/* Create Dialog Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md bg-[#0B0D14] border border-cyan-500/40 rounded-3xl p-6 space-y-4 shadow-[0_0_40px_rgba(0,240,255,0.2)] acg-corner-markers"
          >
            <div>
              <div className="text-[10px] font-mono tracking-widest text-cyan-400 font-bold uppercase">
                // CREATE LOADOUT SNAPSHOT //
              </div>
              <h3 className="text-base font-black text-white mt-1">新建预设方案</h3>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                方案代号 / 名称
              </label>
              <input
                type="text"
                required
                placeholder="例如：主战常态套装 / 盛装泳装派对"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="w-full bg-[#121622] border border-cyan-500/30 focus:border-cyan-400 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                方案简述 (可选)
              </label>
              <textarea
                rows={2}
                placeholder="简述该方案的 Mod 搭配特色..."
                value={newPresetDesc}
                onChange={(e) => setNewPresetDesc(e.target.value)}
                className="w-full bg-[#121622] border border-cyan-500/30 focus:border-cyan-400 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-sans resize-none"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                取消 // CANCEL
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-cyan-500 hover:bg-cyan-400 text-black shadow-lg shadow-cyan-500/30 transition active:scale-95"
              >
                保存当前快照 // CONFIRM
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Presets Grid */}
      <div className="flex-1 overflow-y-auto pt-6">
        {presets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
            <div className="p-4 rounded-2xl bg-[#121622] border border-cyan-500/20 text-cyan-400/50">
              <Layers className="w-12 h-12 stroke-[1.2]" />
            </div>
            <div className="text-center">
              <div className="text-xs font-mono tracking-widest text-slate-400 uppercase">
                // NO PRESET SNAPSHOTS //
              </div>
              <p className="text-xs text-slate-500 mt-1">
                暂无保存的方案预设，点击右上角即可将当前启用的所有 Mod 保存为一键预设
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {presets.map((preset) => {
              const isActive = activePresetId === preset.id
              const enabledCount = preset.mods ? preset.mods.filter((m: any) => m.enabled).length : 0

              return (
                <div
                  key={preset.id}
                  className={`rounded-2xl border p-5 flex flex-col justify-between space-y-4 transition-all duration-300 relative overflow-hidden ${
                    isActive
                      ? 'bg-[#101420]/95 border-cyan-400 shadow-[0_0_25px_rgba(0,240,255,0.25)] ring-1 ring-cyan-400'
                      : 'bg-[#0B0D14]/85 border-cyan-500/20 hover:border-cyan-500/50 hover:bg-[#121522]'
                  }`}
                >
                  {/* Top Glow on Active */}
                  {isActive && (
                    <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-[#E5FE40] via-[#00F0FF] to-[#E5FE40]" />
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base font-black text-white tracking-wide">
                          {preset.name}
                        </h3>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-[#E5FE40] text-black flex items-center space-x-1 shadow-[0_0_10px_rgba(229,254,64,0.5)]">
                            <CheckCircle2 className="w-3 h-3 fill-current" />
                            <span>DEPLOYED // 已生效</span>
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => handleDelete(preset.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition"
                        title="删除预设"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {preset.description && (
                      <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                        {preset.description}
                      </p>
                    )}

                    <div className="flex items-center space-x-4 text-[11px] font-mono text-slate-400 mt-4 pt-3 border-t border-cyan-500/10">
                      <div className="flex items-center space-x-1.5 text-cyan-300">
                        <BookmarkCheck className="w-3.5 h-3.5 text-cyan-400" />
                        <span>已包含 {enabledCount} 个角色 MOD</span>
                      </div>
                      {preset.createdAt && (
                        <div className="flex items-center space-x-1 text-slate-500">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(preset.createdAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleApply(preset.id)}
                    disabled={isActive || loading}
                    className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all shadow-md active:scale-95 ${
                      isActive
                        ? 'bg-[#121622] text-slate-500 border border-slate-800 cursor-default'
                        : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black shadow-cyan-500/20'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-cyan-400" />
                        <span>当前方案已部署生效</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 fill-black text-black" />
                        <span>一键部署此方案 // DEPLOY</span>
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
