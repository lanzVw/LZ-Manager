import React, { useState, useEffect } from 'react'
import {
  Sliders,
  Plus,
  CheckCircle2,
  Trash2,
  FolderCheck,
  Calendar,
  Layers,
  Sparkles
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
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/40 p-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-800 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-blue-400" />
            <span>Mod 方案预设管理</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            将当前各个角色的 Mod 搭配一键保存为方案，支持游戏内秒切与热重载
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition"
        >
          <Plus className="w-4 h-4" />
          <span>保存当前搭配为新方案</span>
        </button>
      </div>

      {/* Create Dialog Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>新建 Mod 搭配方案</span>
            </h3>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                方案名称
              </label>
              <input
                type="text"
                required
                placeholder="例如：日常战斗装 / 清凉写真 / 拍照专用"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                方案描述 (可选)
              </label>
              <textarea
                placeholder="方案备注说明..."
                value={newPresetDesc}
                onChange={(e) => setNewPresetDesc(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 transition"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition"
              >
                保存当前快照
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Presets Grid */}
      <div className="flex-1 overflow-y-auto pt-6">
        {presets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
            <Layers className="w-12 h-12 stroke-[1.2]" />
            <p className="text-xs">暂无保存的方案预设，点击右上角保存当前 Mod 状态</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {presets.map((preset) => {
              const isActive = activePresetId === preset.id
              const enabledCount = preset.mods ? preset.mods.filter((m: any) => m.enabled).length : 0

              return (
                <div
                  key={preset.id}
                  className={`rounded-xl border p-4 flex flex-col justify-between space-y-4 transition ${
                    isActive
                      ? 'bg-blue-950/30 border-blue-500/60 shadow-lg shadow-blue-500/10'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-bold text-slate-100">{preset.name}</h3>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500 text-slate-950 flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 fill-current" />
                            <span>当前使用中</span>
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => handleDelete(preset.id)}
                        className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition"
                        title="删除预设"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {preset.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {preset.description}
                      </p>
                    )}

                    <div className="flex items-center space-x-4 text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-800/80">
                      <div className="flex items-center space-x-1">
                        <FolderCheck className="w-3.5 h-3.5 text-blue-400" />
                        <span>已激活 {enabledCount} 个 Mod</span>
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
                    className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition ${
                      isActive
                        ? 'bg-slate-800/60 text-slate-500 cursor-default'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isActive ? '方案已生效' : '一键应用此方案'}</span>
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
