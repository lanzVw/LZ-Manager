import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layers, Plus, Sliders } from 'lucide-react'
import type { ModItem, Preset, PresetApplyMode } from '../../core/types'
import { planPresetApply, type PresetPlan } from '../../core/preset-plan'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { ScrollContainer } from '../components/ui/ScrollContainer'
import { useToast } from '../components/ui/Toast'
import { PresetCard } from '../components/presets/PresetCard'
import { PresetDetailModal } from '../components/presets/PresetDetailModal'
import { PresetEditorModal } from '../components/presets/PresetEditorModal'

interface PresetsPageProps {
  activeGame: any
  modsData: Record<string, ModItem[]>
  modsLoading: boolean
  onRefreshMods: () => void
}

export const PresetsPage: React.FC<PresetsPageProps> = ({
  activeGame,
  modsData,
  modsLoading,
  onRefreshMods
}) => {
  const toast = useToast()
  const [presets, setPresets] = useState<Preset[]>([])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [editorTarget, setEditorTarget] = useState<'create' | Preset | null>(null)
  const [editorSubmitting, setEditorSubmitting] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [detailPresetId, setDetailPresetId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Preset | null>(null)
  const [overwriteTarget, setOverwriteTarget] = useState<Preset | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const loadSeqRef = useRef(0)

  const gameId = activeGame?.id || ''

  const loadPresets = useCallback(async () => {
    // 游戏切换与 presets:changed 广播可能并发触发加载，只允许最后一次请求落地
    const seq = loadSeqRef.current + 1
    loadSeqRef.current = seq
    try {
      const res = await window.flairx.getPresets()
      if (seq !== loadSeqRef.current) return
      setPresets(Array.isArray(res.presets) ? res.presets : [])
      setActivePresetId(res.activePresetId || null)
    } catch (err) {
      console.error('Failed to load presets:', err)
    }
  }, [])

  useEffect(() => {
    setPresets([])
    setActivePresetId(null)
    setEditorTarget(null)
    setDetailPresetId(null)
    setDeleteTarget(null)
    setOverwriteTarget(null)
    if (!gameId) return
    loadPresets()
  }, [gameId, loadPresets])

  useEffect(() => {
    const unsubscribe = window.flairx.onPresetsChanged?.(() => {
      loadPresets()
      onRefreshMods()
    })
    return () => {
      unsubscribe?.()
    }
  }, [loadPresets, onRefreshMods])

  const plans = useMemo(() => {
    const map: Record<string, PresetPlan> = {}
    for (const preset of presets) {
      map[preset.id] = planPresetApply(preset, modsData, 'replace')
    }
    return map
  }, [presets, modsData])

  const enabledModCount = useMemo(() => {
    let count = 0
    for (const mods of Object.values(modsData || {})) {
      for (const mod of mods || []) {
        if (mod?.enabled) count += 1
      }
    }
    return count
  }, [modsData])

  const editorPreset = editorTarget && editorTarget !== 'create' ? editorTarget : null
  const detailPreset = useMemo(
    () => presets.find((preset) => preset.id === detailPresetId) || null,
    [presets, detailPresetId]
  )
  const busy = applyingId !== null || mutatingId !== null

  const openCreateEditor = () => {
    setEditorError(null)
    setEditorTarget('create')
  }

  const openEditEditor = (preset: Preset) => {
    setEditorError(null)
    setEditorTarget(preset)
  }

  const closeEditor = () => {
    if (editorSubmitting) return
    setEditorTarget(null)
    setEditorError(null)
  }

  const handleEditorSubmit = async (name: string, description: string) => {
    if (!editorTarget) return
    setEditorSubmitting(true)
    setEditorError(null)
    try {
      if (editorTarget === 'create') {
        const res = await window.flairx.createPreset(name, description)
        if (!res.success) {
          setEditorError(res.error || '创建方案失败')
          return
        }
        toast.success('方案已创建', `「${res.preset?.name || name}」已保存当前装配快照`)
        setEditorTarget(null)
      } else {
        const res = await window.flairx.updatePreset(editorTarget.id, { name, description })
        if (!res.success) {
          setEditorError(res.error || '保存方案失败')
          return
        }
        toast.success('方案信息已更新')
        setEditorTarget(null)
      }
      await loadPresets()
    } catch (err: any) {
      setEditorError(err?.message || '保存方案失败')
    } finally {
      setEditorSubmitting(false)
    }
  }

  const runApply = async (presetId: string, mode: PresetApplyMode, presetName: string) => {
    setApplyingId(presetId)
    try {
      const res = await window.flairx.applyPreset(presetId, { mode })
      if (res.success) {
        const summary = `启用 ${res.enabled} 项 · 停用 ${res.disabled} 项`
        if (res.missing.length > 0) {
          toast.warning(
            `方案「${presetName}」已应用`,
            `${summary} · ${res.missing.length} 个引用不存在，已跳过`
          )
        } else {
          toast.success(`方案「${presetName}」已应用`, summary)
        }
        setDetailPresetId(null)
      } else {
        toast.error('应用方案失败', res.message || '请稍后重试')
      }
      await loadPresets()
      onRefreshMods()
    } catch (err: any) {
      toast.error('应用方案异常', err?.message || '请稍后重试')
    } finally {
      setApplyingId(null)
    }
  }

  const handleCardApply = (preset: Preset) => {
    if (modsLoading) return
    const plan = plans[preset.id]
    if (!plan || plan.match) return
    const refCount = plan.items.filter((item) => item.action !== 'disable').length
    // 失效引用会被跳过、空方案会停用全部 Mod，这两种情况必须先让用户在详情里确认
    if (plan.missing.length > 0 || refCount === 0) {
      setDetailPresetId(preset.id)
      return
    }
    void runApply(preset.id, 'replace', preset.name)
  }

  const handleDetailApply = (mode: PresetApplyMode) => {
    if (!detailPreset) return
    void runApply(detailPreset.id, mode, detailPreset.name)
  }

  const handleDuplicate = async (preset: Preset) => {
    setMutatingId(preset.id)
    try {
      const res = await window.flairx.duplicatePreset(preset.id)
      if (res.success) toast.success('方案已复制', `「${res.preset?.name || ''}」`)
      else toast.error('复制方案失败', res.error || '请稍后重试')
      await loadPresets()
    } catch (err: any) {
      toast.error('复制方案异常', err?.message || '请稍后重试')
    } finally {
      setMutatingId(null)
    }
  }

  const handleConfirmOverwrite = async () => {
    if (!overwriteTarget) return
    const target = overwriteTarget
    setMutatingId(target.id)
    try {
      const res = await window.flairx.overwritePresetFromCurrent(target.id)
      if (res.success) {
        toast.success('方案已覆盖为当前装配', `「${res.preset?.name || target.name}」`)
        setOverwriteTarget(null)
      } else {
        toast.error('覆盖方案失败', res.error || '请稍后重试')
      }
      await loadPresets()
      onRefreshMods()
    } catch (err: any) {
      toast.error('覆盖方案异常', err?.message || '请稍后重试')
    } finally {
      setMutatingId(null)
    }
  }

  const handlePrune = async (preset: Preset) => {
    setMutatingId(preset.id)
    try {
      const res = await window.flairx.prunePresetMissing(preset.id)
      if (!res.success) {
        toast.error('清理失效引用失败', res.error || '请稍后重试')
      } else if (res.removed > 0) {
        toast.success('已清理失效引用', `共移除 ${res.removed} 个引用`)
      } else {
        toast.info('没有需要清理的失效引用')
      }
      await loadPresets()
    } catch (err: any) {
      toast.error('清理失效引用异常', err?.message || '请稍后重试')
    } finally {
      setMutatingId(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setMutatingId(target.id)
    try {
      const deleted = await window.flairx.deletePreset(target.id)
      if (deleted) {
        toast.success('方案已删除', `「${target.name}」已移除，磁盘上的 Mod 未受影响`)
        setDeleteTarget(null)
      } else {
        toast.error('删除方案失败', '方案可能已不存在，请刷新后重试')
      }
      await loadPresets()
    } catch (err: any) {
      toast.error('删除方案异常', err?.message || '请稍后重试')
    } finally {
      setMutatingId(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 select-none bg-surface/30">
      <div className="flex items-center justify-between pb-5 border-b border-border shrink-0">
        <div>
          <h2 className="text-lg font-bold text-text flex items-center space-x-2.5 tracking-wide">
            <Sliders className="w-5 h-5 text-primary" />
            <span>MOD 阵容预设与一键切换</span>
          </h2>
          <p className="text-xs text-text-muted mt-1">
            将当前全角色的 Mod 装配保存为方案快照，应用前可实时预检差异并选择还原方式
          </p>
        </div>

        <Button
          variant="secondary"
          size="md"
          onClick={openCreateEditor}
          disabled={busy}
          icon={<Plus className="w-4 h-4 text-primary" />}
        >
          保存当前装配为新方案
        </Button>
      </div>

      <ScrollContainer className="flex-1 pt-6">
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
              const plan = plans[preset.id]
              if (!plan) return null
              return (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  plan={plan}
                  active={activePresetId === preset.id}
                  modsLoading={modsLoading}
                  applying={applyingId === preset.id}
                  busy={busy}
                  onViewDetails={() => setDetailPresetId(preset.id)}
                  onApply={() => handleCardApply(preset)}
                  onEdit={() => openEditEditor(preset)}
                  onDuplicate={() => handleDuplicate(preset)}
                  onOverwrite={() => setOverwriteTarget(preset)}
                  onPrune={() => handlePrune(preset)}
                  onDelete={() => setDeleteTarget(preset)}
                />
              )
            })}
          </div>
        )}
      </ScrollContainer>

      <PresetEditorModal
        isOpen={editorTarget !== null}
        preset={editorPreset}
        enabledModCount={enabledModCount}
        modsLoading={modsLoading}
        submitting={editorSubmitting}
        error={editorError}
        onSubmit={handleEditorSubmit}
        onClose={closeEditor}
      />

      <PresetDetailModal
        isOpen={detailPreset !== null}
        preset={detailPreset}
        modsData={modsData}
        modsLoading={modsLoading}
        applying={applyingId !== null && applyingId === detailPreset?.id}
        onClose={() => setDetailPresetId(null)}
        onRefreshMods={onRefreshMods}
        onApply={handleDetailApply}
      />

      <Modal
        isOpen={overwriteTarget !== null}
        onClose={() => {
          if (mutatingId) return
          setOverwriteTarget(null)
        }}
        onConfirm={handleConfirmOverwrite}
        title="用当前装配覆盖方案"
        variant="warning"
        confirmText="覆盖方案"
        cancelText="取消"
        loading={mutatingId !== null}
      >
        <p className="text-xs text-text-muted leading-relaxed">
          将用当前所有已启用的 Mod 重新生成「{overwriteTarget?.name}」的内容，原有快照会被替换且无法恢复。
        </p>
      </Modal>

      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => {
          if (mutatingId) return
          setDeleteTarget(null)
        }}
        onConfirm={handleConfirmDelete}
        title="删除预设方案"
        variant="danger"
        confirmText="确认删除"
        cancelText="取消"
        loading={mutatingId !== null}
      >
        <p className="text-xs text-text-muted leading-relaxed">
          将删除方案「{deleteTarget?.name}」。只删除方案快照，不会改动磁盘上的任何 Mod 文件，删除后无法恢复。
        </p>
      </Modal>
    </div>
  )
}
