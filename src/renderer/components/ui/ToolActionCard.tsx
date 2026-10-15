import React, { useState } from 'react'
import { ChevronRight, Terminal, AlertTriangle, ShieldCheck } from 'lucide-react'
import { Badge } from './Badge'
import { Button } from './Button'

export type ToolActionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'running'
  | 'failed'

export interface ToolActionCardProps {
  /** 操作所属类别标签（如 DEPLOYMENT ACTION, HASH REPAIR, DANGEROUS REMOVAL） */
  category?: string
  /** 操作主标题 */
  title: React.ReactNode
  /** 操作详细描述或风险提示 */
  description?: React.ReactNode
  /** 当前状态 */
  status?: ToolActionStatus | string
  /** 自定义状态徽章文本（缺省根据 status 自动映射为 PENDING APPROVAL 等） */
  statusLabel?: string
  /** 待执行的代码段或命令内容 */
  code?: string
  /** 执行参数列表 */
  params?: Record<string, any> | Array<{ key: string; value: React.ReactNode }>
  /** 受控展开状态 */
  isExpanded?: boolean
  /** 默认是否展开参数/代码预览区（默认 false） */
  defaultExpanded?: boolean
  /** 展开切换回调 */
  onToggleExpand?: (expanded: boolean) => void
  /** 批准并执行回调 */
  onApprove?: () => void
  /** 取消/驳回回调 */
  onCancel?: () => void
  /** 批准按钮文案（默认“批准执行”） */
  approveText?: string
  /** 取消按钮文案（默认“取消”） */
  cancelText?: string
  /** 执行中状态 */
  loading?: boolean
  /** 是否禁用操作 */
  disabled?: boolean
  /** 自定义类名 */
  className?: string
  /** 危险等级（用于卡片高亮与警示色） */
  severity?: 'normal' | 'warning' | 'danger'
}

/**
 * CDS Recipe 5 官方 MCP App 审批卡片规范组件
 *
 * 核心规范：
 * 1. 专用于环境部署、Hash 修复、危险删除等敏感工具操作的先验确认
 * 2. 头部：统一包含操作类别全大写标签（如 DEPLOYMENT ACTION）与状态徽章
 * 3. 参数/代码区：利用纯 CSS Grid `0fr -> 1fr` 弹性展开/收起
 * 4. 底部动作区：配备取消 (secondary) 与实心主色批准 (primary) 按钮，
 *    搭载 CDS 600/30 弹簧按压手感
 */
export const ToolActionCard: React.FC<ToolActionCardProps> = ({
  category = 'DEPLOYMENT ACTION',
  title,
  description,
  status = 'pending',
  statusLabel,
  code,
  params,
  isExpanded: controlledExpanded,
  defaultExpanded = false,
  onToggleExpand,
  onApprove,
  onCancel,
  approveText = '批准执行',
  cancelText = '取消',
  loading = false,
  disabled = false,
  className = '',
  severity = 'normal'
}) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const isControlled = controlledExpanded !== undefined
  const expanded = isControlled ? controlledExpanded : internalExpanded

  const handleToggle = () => {
    const nextState = !expanded
    if (!isControlled) {
      setInternalExpanded(nextState)
    }
    onToggleExpand?.(nextState)
  }

  // 根据 status 映射徽章变体与默认文案
  const renderStatusBadge = () => {
    switch (status) {
      case 'pending':
        return <Badge variant="primary">{statusLabel || 'PENDING APPROVAL'}</Badge>
      case 'completed':
        return <Badge variant="success">{statusLabel || 'COMPLETED'}</Badge>
      case 'approved':
        return <Badge variant="clay">{statusLabel || 'APPROVED'}</Badge>
      case 'rejected':
        return <Badge variant="danger">{statusLabel || 'REJECTED'}</Badge>
      case 'failed':
        return <Badge variant="danger">{statusLabel || 'FAILED'}</Badge>
      case 'running':
        return <Badge variant="accent">{statusLabel || 'RUNNING'}</Badge>
      default:
        return <Badge variant="default">{statusLabel || String(status)}</Badge>
    }
  }

  const borderStyles = {
    normal: 'border-border/70',
    warning: 'border-amber-500/40 bg-amber-500/[0.02]',
    danger: 'border-danger/40 bg-danger/[0.02]'
  }[severity]

  const hasDetails = Boolean(code || params)

  return (
    <div
      className={`border rounded-xl bg-surface p-4 shadow-cds-sm transition-all ${borderStyles} ${className}`}
    >
      {/* 头部元信息 */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-text-muted select-none">
              {category}
            </span>
            {severity === 'warning' && (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 align-neg-125" />
            )}
            {severity === 'danger' && (
              <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0 align-neg-125" />
            )}
          </div>
          <h4 className="text-sm font-semibold text-text leading-snug">{title}</h4>
        </div>

        <div className="shrink-0">{renderStatusBadge()}</div>
      </div>

      {/* 详细描述 */}
      {description && (
        <div className="text-xs text-text-muted mb-3 leading-relaxed text-pretty-native">
          {description}
        </div>
      )}

      {/* 参数与代码折叠开关 */}
      {hasDetails && (
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium select-none mb-2 cursor-pointer focus:outline-none"
        >
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${
              expanded ? 'rotate-90' : 'rotate-0'
            }`}
          />
          <Terminal className="w-3.5 h-3.5 shrink-0 align-neg-125" />
          <span>{expanded ? '收起执行预览' : '查看参数与代码预览'}</span>
        </button>
      )}

      {/* 纯 CSS Grid 0fr -> 1fr 弹性过渡预览区 */}
      {hasDetails && (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(.19,1,.22,1)]"
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="rounded-lg bg-surface-2 p-3 text-xs font-mono border border-border/60 my-2 space-y-2">
              {params && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold text-text-muted/70 select-none">
                    参数 (Arguments)
                  </div>
                  {Array.isArray(params) ? (
                    params.map((item, idx) => (
                      <div key={idx} className="flex gap-2 text-text">
                        <span className="text-text-muted shrink-0">{item.key}:</span>
                        <span className="break-all">{item.value}</span>
                      </div>
                    ))
                  ) : (
                    Object.entries(params).map(([key, val]) => (
                      <div key={key} className="flex gap-2 text-text">
                        <span className="text-text-muted shrink-0">{key}:</span>
                        <span className="break-all">{JSON.stringify(val)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {code && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold text-text-muted/70 select-none">
                    执行脚本 (Payload)
                  </div>
                  <pre className="overflow-x-auto p-2 bg-surface rounded border border-border/40 text-[11px] leading-relaxed text-text">
                    <code>{code}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 底部审批操作按钮区 */}
      {(onApprove || onCancel) && (
        <div className="flex items-center justify-end gap-2.5 pt-3 mt-1 border-t border-border/60">
          {onCancel && (
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || loading}
              onClick={onCancel}
            >
              {cancelText}
            </Button>
          )}

          {onApprove && (
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              disabled={disabled || status === 'completed'}
              onClick={onApprove}
              icon={<ShieldCheck className="w-3.5 h-3.5 align-neg-125" />}
            >
              {approveText}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
