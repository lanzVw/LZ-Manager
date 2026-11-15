import React from 'react'
import {
  AlertTriangle,
  BookmarkCheck,
  Calendar,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wrench,
  Zap
} from 'lucide-react'
import type { Preset } from '../../../core/types'
import type { PresetPlan } from '../../../core/preset-plan'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

interface PresetCardProps {
  preset: Preset
  plan: PresetPlan
  active: boolean
  modsLoading: boolean
  applying: boolean
  busy: boolean
  onViewDetails: () => void
  onApply: () => void
  onEdit: () => void
  onDuplicate: () => void
  onOverwrite: () => void
  onPrune: () => void
  onDelete: () => void
}

const formatDate = (iso?: string): string => {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

const IconAction: React.FC<{
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}> = ({ label, danger = false, disabled = false, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    className={`p-1.5 rounded-md text-text-muted transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
      danger ? 'hover:bg-danger/10 hover:text-danger' : 'hover:bg-surface-2 hover:text-text'
    }`}
  >
    {children}
  </button>
)

export const PresetCard: React.FC<PresetCardProps> = ({
  preset,
  plan,
  active,
  modsLoading,
  applying,
  busy,
  onViewDetails,
  onApply,
  onEdit,
  onDuplicate,
  onOverwrite,
  onPrune,
  onDelete
}) => {
  // disable 项是严格还原时才会停用的方案外 Mod，不属于方案自身引用，不能计入"N 个 Mod"
  const presetItems = plan.items.filter((item) => item.action !== 'disable')
  const modCount = presetItems.length
  const characterCount = new Set(presetItems.map((item) => item.characterName)).size
  const missingCount = plan.missing.length
  // 空方案或存在失效引用时直接应用风险高，改为先打开详情确认
  const needsReview = missingCount > 0 || modCount === 0
  const disabled = busy || modsLoading

  const statusBadge = modsLoading ? (
    <Badge variant="default">
      <RefreshCw className="w-3 h-3 animate-spin" />
      <span>状态检测中</span>
    </Badge>
  ) : plan.match ? (
    <Badge variant="success">
      <CheckCircle2 className="w-3 h-3" />
      <span>当前配置一致</span>
    </Badge>
  ) : missingCount > 0 ? (
    <Badge variant="danger">
      <AlertTriangle className="w-3 h-3" />
      <span>{missingCount} 个引用失效</span>
    </Badge>
  ) : active ? (
    // Badge 没有 warning 变体，沿用项目内统一的 amber 警告配色
    <span className="inline-flex items-center gap-1 font-medium rounded-full tabular-nums-strict text-[10px] px-2 py-0.5 border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
      <AlertTriangle className="w-3 h-3" />
      <span>与当前配置不一致</span>
    </span>
  ) : null

  const applyButtonLabel = modsLoading
    ? '状态检测中…'
    : plan.match
    ? '当前方案已生效'
    : needsReview
    ? '检查后应用'
    : '一键应用'

  return (
    <Card selected={!modsLoading && plan.match} className="p-5 flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-text tracking-wide truncate" title={preset.name}>
              {preset.name}
            </h3>
            {statusBadge && <div className="mt-1.5">{statusBadge}</div>}
          </div>

          <div className="flex items-center shrink-0">
            <IconAction label="编辑方案信息" disabled={busy} onClick={onEdit}>
              <Edit3 className="w-3.5 h-3.5" />
            </IconAction>
            <IconAction label="复制方案" disabled={busy} onClick={onDuplicate}>
              <Copy className="w-3.5 h-3.5" />
            </IconAction>
            <IconAction label="用当前配置覆盖方案" disabled={busy} onClick={onOverwrite}>
              <RefreshCw className="w-3.5 h-3.5" />
            </IconAction>
            <IconAction label="删除方案" danger disabled={busy} onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5" />
            </IconAction>
          </div>
        </div>

        {preset.description && (
          <p className="text-xs text-text-muted mt-2 line-clamp-2 leading-relaxed">
            {preset.description}
          </p>
        )}

        {missingCount > 0 && (
          <button
            type="button"
            onClick={onPrune}
            disabled={disabled}
            title="从方案中移除已不存在的 Mod 引用"
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Wrench className="w-3 h-3" />
            <span>清理 {missingCount} 个失效引用</span>
          </button>
        )}

        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-text-muted mt-3 pt-3 border-t border-border">
          <span className="inline-flex items-center gap-1.5">
            <BookmarkCheck className="w-3.5 h-3.5 text-primary" />
            <span>
              {modCount} 个 Mod · {characterCount} 个角色
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>更新于 {formatDate(preset.updatedAt)}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={onViewDetails}
          disabled={busy}
          icon={<Eye className="w-4 h-4" />}
        >
          详情
        </Button>
        <Button
          variant={plan.match ? 'ghost' : 'primary'}
          size="sm"
          className="flex-1"
          onClick={needsReview ? onViewDetails : onApply}
          disabled={disabled || plan.match}
          loading={applying}
          icon={plan.match ? <ShieldCheck className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
        >
          {applyButtonLabel}
        </Button>
      </div>
    </Card>
  )
}
