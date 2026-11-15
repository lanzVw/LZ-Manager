import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Info, RefreshCw } from 'lucide-react'
import type { ModItem, Preset, PresetApplyMode } from '../../../core/types'
import {
  planPresetApply,
  PresetPlanAction,
  PresetPlanItem
} from '../../../core/preset-plan'
import { Badge } from '../ui/Badge'
import { Modal } from '../ui/Modal'
import { ScrollContainer } from '../ui/ScrollContainer'
import { SegmentedControl, SegmentedControlItem } from '../ui/SegmentedControl'

interface PresetDetailModalProps {
  isOpen: boolean
  preset: Preset | null
  modsData: Record<string, ModItem[]>
  modsLoading: boolean
  applying: boolean
  onClose: () => void
  onRefreshMods: () => void
  onApply: (mode: PresetApplyMode) => void
}

const MODE_ITEMS: SegmentedControlItem<PresetApplyMode>[] = [
  {
    id: 'replace',
    label: '严格还原',
    hint: '与方案完全一致：启用方案内的 Mod，并停用方案外已启用的 Mod。'
  },
  {
    id: 'merge',
    label: '仅叠加启用',
    hint: '只叠加启用方案内的 Mod，方案外已启用的 Mod 保持现状。'
  }
]

const ACTION_META: Record<
  PresetPlanAction,
  { label: string; variant: 'default' | 'primary' | 'success' | 'danger' }
> = {
  enable: { label: '将启用', variant: 'primary' },
  disable: { label: '将停用', variant: 'default' },
  'keep-enabled': { label: '已启用', variant: 'default' },
  'keep-disabled': { label: '保持停用', variant: 'default' },
  missing: { label: '引用失效', variant: 'danger' }
}

// 项目内警告态统一用 amber（Badge 没有 warning 变体），这里单独渲染保持语义一致
const ActionTag: React.FC<{ action: PresetPlanAction }> = ({ action }) => {
  if (action === 'disable') {
    return (
      <span className="shrink-0 inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
        将停用
      </span>
    )
  }
  const meta = ACTION_META[action]
  return (
    <Badge variant={meta.variant} size="sm" className="shrink-0">
      {meta.label}
    </Badge>
  )
}

const formatDate = (iso?: string): string => {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

const PlanStat: React.FC<{ label: string; value: number; tone: string }> = ({
  label,
  value,
  tone
}) => (
  <div className="rounded-lg border border-border/70 bg-surface-2/60 px-3 py-2">
    <div className={`text-base font-bold tabular-nums-strict ${tone}`}>{value}</div>
    <div className="text-[10px] text-text-muted mt-0.5">{label}</div>
  </div>
)

export const PresetDetailModal: React.FC<PresetDetailModalProps> = ({
  isOpen,
  preset,
  modsData,
  modsLoading,
  applying,
  onClose,
  onRefreshMods,
  onApply
}) => {
  const [mode, setMode] = useState<PresetApplyMode>('replace')
  const presetId = preset?.id || ''

  // 打开详情时磁盘状态可能已被悬浮窗或外部改动，先重新扫描再给预检结论
  useEffect(() => {
    if (!isOpen || !presetId) return
    setMode('replace')
    onRefreshMods()
  }, [isOpen, presetId, onRefreshMods])

  const plan = useMemo(
    () => (preset ? planPresetApply(preset, modsData, mode) : null),
    [preset, modsData, mode]
  )

  const groups = useMemo(() => {
    if (!plan) return [] as Array<{ characterName: string; items: PresetPlanItem[] }>
    const grouped = new Map<string, PresetPlanItem[]>()
    for (const item of plan.items) {
      const list = grouped.get(item.characterName)
      if (list) list.push(item)
      else grouped.set(item.characterName, [item])
    }
    return Array.from(grouped.entries()).map(([characterName, items]) => ({
      characterName,
      items
    }))
  }, [plan])

  if (!preset || !plan) return null

  const presetItems = plan.items.filter((item) => item.action !== 'disable')
  const plannedRefCount = presetItems.length
  const characterCount = new Set(presetItems.map((item) => item.characterName)).size
  const emptyPlan = plannedRefCount === 0
  const replaceEmpty = mode === 'replace' && emptyPlan

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="方案详情与预检"
      maxWidth="max-w-3xl"
      cancelText="取消"
      confirmText="应用方案"
      onConfirm={() => onApply(mode)}
      loading={applying}
      variant={replaceEmpty ? 'warning' : 'default'}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-bold text-text break-words">{preset.name}</div>
            {preset.description && (
              <p className="text-xs text-text-muted mt-1 leading-relaxed">{preset.description}</p>
            )}
            {modsLoading && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] text-text-muted">
                <RefreshCw className="w-3 h-3 animate-spin" />
                状态检测中
              </span>
            )}
          </div>
          <div className="shrink-0 text-right text-[11px] font-mono text-text-muted space-y-0.5">
            <div>
              {plannedRefCount} 个 Mod · {characterCount} 个角色
            </div>
            {preset.lastAppliedAt && <div>上次应用 {formatDate(preset.lastAppliedAt)}</div>}
          </div>
        </div>

        <div className="space-y-2">
          <SegmentedControl<PresetApplyMode>
            items={MODE_ITEMS}
            value={mode}
            onChange={setMode}
            size="sm"
            fullWidth
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <PlanStat label="将启用" value={plan.toEnable} tone="text-primary" />
          <PlanStat
            label="将停用"
            value={plan.toDisable}
            tone="text-amber-600 dark:text-amber-400"
          />
          <PlanStat label="已一致" value={plan.unchanged} tone="text-success" />
          <PlanStat label="引用失效" value={plan.missing.length} tone="text-danger" />
        </div>

        {plan.missing.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              {plan.missing.length} 个引用在当前 Mod 目录中已不存在，应用时会自动跳过；可回到列表使用「清理失效引用」移除。
            </span>
          </div>
        )}

        {replaceEmpty && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>该方案未包含任何启用的 Mod，应用后将停用当前全部已启用的 Mod。</span>
          </div>
        )}

        {mode === 'merge' && emptyPlan && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] leading-relaxed text-primary">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>该方案未包含任何启用的 Mod，仅叠加模式不会改动当前配置。</span>
          </div>
        )}

        {mode === 'merge' && plan.extraEnabledCount > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface-2/60 px-3 py-2 text-[11px] leading-relaxed text-text-muted">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
            <span>
              仅叠加模式会保留方案外已启用的 {plan.extraEnabledCount} 个 Mod，不会将其停用。
            </span>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-text">按角色分组明细</h4>
            <span className="text-[10px] text-text-muted">共 {plan.items.length} 项</span>
          </div>

          {groups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-text-muted">
              该方案没有任何 Mod 引用
            </div>
          ) : (
            <ScrollContainer className="max-h-[40vh] space-y-2 pr-1">
              {groups.map((group) => (
                <div
                  key={group.characterName}
                  className="rounded-lg border border-border/70 bg-surface-2/40 px-3 py-2"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-text">
                      {group.characterName}
                    </span>
                    <span className="text-[10px] text-text-muted">{group.items.length} 项</span>
                  </div>
                  <div>
                    {group.items.map((item) => (
                      <div
                        key={`${item.characterName}::${item.modName}::${item.action}`}
                        className="flex items-center justify-between gap-2 py-1 border-t border-border/40 first:border-t-0"
                      >
                        <span
                          className={`text-[11px] truncate ${
                            item.action === 'missing' ? 'text-text-muted line-through' : 'text-text'
                          }`}
                          title={item.modName}
                        >
                          {item.modName}
                        </span>
                        <ActionTag action={item.action} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </ScrollContainer>
          )}
        </div>
      </div>
    </Modal>
  )
}
