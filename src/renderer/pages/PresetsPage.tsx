import React, { useState, useEffect } from 'react'
import {
  Sliders,
  Plus,
  CheckCircle2,
  Trash2,
  Calendar,
  Layers,
  BookmarkCheck,
  ShieldCheck,
  Zap
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'

interface PresetsPageProps {
  activeGame: any
  onPresetApplied?: () => void
}

export const PresetsPage: React.FC<PresetsPageProps> = ({
  activeGame,
  onPresetApplied
}) => {
  const toast = useToast()
  const [presets, setPresets] = useState<any[]>([])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null)
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
      toast.success('预设方案创建成功')
    } catch (err: any) {
      toast.error('创建预设失败', err.message)
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
        toast.success('预设方案已成功应用')
      } else {
        toast.error('应用预设方案失败', res.error)
      }
    } catch (err: any) {
      toast.error('应用预设方案异常', err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletePresetId) return
    try {
      await window.flairx.deletePreset(deletePresetId)
      await loadPresets()
      toast.success('预设方案已成功删除')
    } catch (err: any) {
      toast.error('删除预设失败', err.message)
    } finally {
      setDeletePresetId(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 select-none bg-surface/30">
      {/* Header */}
      <div className="flex items-center justify-between pb-5 border-b border-border shrink-0">
        <div>
          <h2 className="text-lg font-bold text-text flex items-center space-x-2.5 tracking-wide">
            <Sliders className="w-5 h-5 text-primary" />
            <span>MOD 阵容预设与一键切换</span>
          </h2>
          <p className="text-xs text-text-muted mt-1">
            将当前全角色的 Mod 装配方案一键保存快照，支持秒切并自动同步 Persist Bridge 状态
          </p>
        </div>

        <Button
          variant="secondary"
          size="md"
          onClick={() => setIsCreating(true)}
          icon={<Plus className="w-4 h-4 text-primary" />}
        >
          保存当前装配为新方案
        </Button>
      </div>

      {/* Create Dialog Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md bg-surface border border-border rounded-card p-6 space-y-4 shadow-xl"
          >
            <div>
              <h3 className="text-base font-bold text-text">新建预设方案</h3>
              <p className="text-xs text-text-muted mt-0.5">为当前的 Mod 装配创建快照副本</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                方案名称
              </label>
              <Input
                required
                placeholder="例如：主战常态套装 / 盛装泳装派对"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                方案描述 (可选)
              </label>
              <textarea
                rows={2}
                placeholder="简述该方案的 Mod 搭配特色..."
                value={newPresetDesc}
                onChange={(e) => setNewPresetDesc(e.target.value)}
                className="w-full bg-surface-2 border border-border focus:border-primary rounded-control px-3.5 py-2 text-xs text-text placeholder:text-text-muted focus:outline-none font-sans resize-none"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsCreating(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={loading}
              >
                保存方案
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Presets Grid */}
      <div className="flex-1 overflow-y-auto pt-6">
        {presets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-3">
            <div className="p-4 rounded-2xl bg-surface border border-border text-primary shadow-xs">
              <Layers className="w-10 h-10 stroke-[1.2]" />
            </div>
            <div className="text-center">
              <div className="text-xs font-mono tracking-widest text-text-muted uppercase">
                // NO PRESET SNAPSHOTS //
              </div>
              <p className="text-xs text-text-muted mt-1">
                暂无保存的方案预设，点击右上角即可将当前启用的所有 Mod 保存为一键预设
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {presets.map((preset) => {
              const isActive = activePresetId === preset.id
              const enabledCount = preset.mods ? preset.mods.filter((m: any) => m.enabled).length : 0

              return (
                <Card
                  key={preset.id}
                  selected={isActive}
                  className="p-5 flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-bold text-text tracking-wide">
                          {preset.name}
                        </h3>
                        {isActive && (
                          <Badge variant="primary" size="sm">
                            <CheckCircle2 className="w-3 h-3 text-primary" />
                            <span>当前已生效</span>
                          </Badge>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setDeletePresetId(preset.id)}
                        className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors cursor-pointer"
                        title="删除预设"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {preset.description && (
                      <p className="text-xs text-text-muted mt-1.5 line-clamp-2 leading-relaxed">
                        {preset.description}
                      </p>
                    )}

                    <div className="flex items-center space-x-4 text-[11px] font-mono text-text-muted mt-4 pt-3 border-t border-border">
                      <div className="flex items-center space-x-1.5 text-primary">
                        <BookmarkCheck className="w-3.5 h-3.5 text-primary" />
                        <span>已包含 {enabledCount} 个角色 MOD</span>
                      </div>
                      {preset.createdAt && (
                        <div className="flex items-center space-x-1 text-text-muted">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(preset.createdAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    variant={isActive ? 'ghost' : 'secondary'}
                    size="sm"
                    onClick={() => handleApply(preset.id)}
                    disabled={isActive || loading}
                    className="w-full"
                    icon={
                      isActive ? (
                        <ShieldCheck className="w-4 h-4 text-primary" />
                      ) : (
                        <Zap className="w-4 h-4 text-primary" />
                      )
                    }
                  >
                    {isActive ? '当前方案已部署生效' : '一键应用此方案'}
                  </Button>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <Modal
        isOpen={!!deletePresetId}
        onClose={() => setDeletePresetId(null)}
        onConfirm={handleConfirmDelete}
        title="删除预设方案"
        variant="danger"
        confirmText="确认删除"
        cancelText="取消"
      >
        <p className="text-sm text-slate-300">
          确定要删除这个预设方案吗？删除后将无法恢复已保存的 MOD 装配快照。
        </p>
      </Modal>
    </div>
  )
}
