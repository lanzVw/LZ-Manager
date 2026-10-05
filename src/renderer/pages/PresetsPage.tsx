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
    <div className="flex-1 flex flex-col overflow-hidden p-6 select-none porcelain-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-white/[0.08] shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2.5 tracking-wide">
            <Sliders className="w-5 h-5 text-sky-400" />
            <span>MOD 阵容预设与一键切换</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            将当前全角色的 Mod 装配方案一键保存快照，支持秒切并自动同步 Persist Bridge 状态
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center space-x-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 hover:from-blue-600 hover:to-sky-500 text-white text-xs font-bold tracking-wide shadow-md shadow-blue-900/30 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>保存当前装配为新方案</span>
        </button>
      </div>

      {/* Create Dialog Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md bg-[#0c1426]/90 border border-white/10 rounded-3xl p-6 space-y-4 shadow-2xl backdrop-blur-2xl"
          >
            <div>
              <h3 className="text-base font-bold text-white">新建预设方案</h3>
              <p className="text-xs text-slate-400 mt-0.5">为当前的 Mod 装配创建快照副本</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                方案名称
              </label>
              <input
                type="text"
                required
                placeholder="例如：主战常态套装 / 盛装泳装派对"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/10 focus:border-sky-400/60 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                方案描述 (可选)
              </label>
              <textarea
                rows={2}
                placeholder="简述该方案的 Mod 搭配特色..."
                value={newPresetDesc}
                onChange={(e) => setNewPresetDesc(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/10 focus:border-sky-400/60 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-sans resize-none"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.06] transition"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-900/30 transition active:scale-95"
              >
                保存方案
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Presets Grid */}
      <div className="flex-1 overflow-y-auto pt-6 porcelain-scrollbar">
        {presets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
            <div className="p-5 rounded-3xl bg-white/[0.04] border border-white/10 text-sky-400/50">
              <Layers className="w-12 h-12 stroke-[1.2]" />
            </div>
            <div className="text-center">
              <div className="text-xs font-mono tracking-widest text-slate-400 uppercase">
                // NO PRESET SNAPSHOTS //
              </div>
              <p className="text-xs text-slate-400 mt-1">
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
                  className={`rounded-3xl border p-5 flex flex-col justify-between space-y-4 transition-all duration-300 relative overflow-hidden backdrop-blur-xl ${
                    isActive
                      ? 'bg-[#101930]/85 border-sky-400/70 shadow-xl shadow-blue-950/40 ring-1 ring-sky-400/40'
                      : 'bg-[#0c1426]/75 border-white/[0.08] hover:border-sky-400/40 hover:bg-[#101b32]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base font-bold text-white tracking-wide">
                          {preset.name}
                        </h3>
                        {isActive && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-sky-300 border border-blue-400/30 flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-sky-400" />
                            <span>当前已生效</span>
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => handleDelete(preset.id)}
                        className="p-1.5 rounded-xl hover:bg-rose-500/20 text-slate-500 hover:text-rose-300 transition"
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

                    <div className="flex items-center space-x-4 text-[11px] font-mono text-slate-400 mt-4 pt-3 border-t border-white/[0.06]">
                      <div className="flex items-center space-x-1.5 text-sky-300">
                        <BookmarkCheck className="w-3.5 h-3.5 text-sky-400" />
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
                    className={`w-full py-2.5 rounded-2xl text-xs font-bold tracking-wide flex items-center justify-center space-x-1.5 transition-all shadow-sm active:scale-95 ${
                      isActive
                        ? 'bg-white/[0.05] text-slate-500 border border-white/10 cursor-default'
                        : 'bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 hover:from-blue-600 hover:to-sky-500 text-white shadow-blue-900/30'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-sky-400" />
                        <span>当前方案已部署生效</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 fill-sky-200 text-sky-200" />
                        <span>一键应用此方案</span>
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
