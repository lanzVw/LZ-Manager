import React from 'react'

export interface ThinkingQuietDotsProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  color?: string
}

/**
 * CDS 规范思考波浪点组件
 * 使用 cds-preset.css 中的 timeline-quiet-dot 动效
 */
export const ThinkingQuietDots: React.FC<ThinkingQuietDotsProps> = ({
  className = '',
  size = 'md',
  color = 'bg-primary'
}) => {
  const sizeClasses = {
    sm: 'gap-1',
    md: 'gap-1.5',
    lg: 'gap-2'
  }[size]

  const dotSize = {
    sm: 'w-1 h-1',
    md: 'w-1.5 h-1.5',
    lg: 'w-2 h-2'
  }[size]

  return (
    <span
      className={`inline-flex items-center align-neg-125 select-none ${sizeClasses} ${className}`}
      role="status"
      aria-label="思考处理中"
    >
      <span className={`rounded-full ${dotSize} ${color} cds-quiet-dot-1 shrink-0`} />
      <span className={`rounded-full ${dotSize} ${color} cds-quiet-dot-2 shrink-0`} />
      <span className={`rounded-full ${dotSize} ${color} cds-quiet-dot-3 shrink-0`} />
    </span>
  )
}

export type StatusBeaconType = 'online' | 'busy' | 'warning' | 'error' | 'idle' | 'clay'

export interface StatusBeaconProps {
  status: StatusBeaconType
  label?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  pulse?: boolean
  className?: string
}

/**
 * CDS 规范呼吸状态指示灯
 * 包含柔和 ping 光晕与实体圆点，支持 6 种状态语义与可选文案
 */
export const StatusBeacon: React.FC<StatusBeaconProps> = ({
  status,
  label,
  size = 'md',
  pulse = true,
  className = ''
}) => {
  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5'
  }[size]

  const colorStyles: Record<StatusBeaconType, { dot: string; ping: string }> = {
    online: {
      dot: 'bg-emerald-500 dark:bg-emerald-400',
      ping: 'bg-emerald-400 dark:bg-emerald-300'
    },
    busy: {
      dot: 'bg-primary',
      ping: 'bg-primary'
    },
    warning: {
      dot: 'bg-amber-500',
      ping: 'bg-amber-400'
    },
    error: {
      dot: 'bg-danger',
      ping: 'bg-danger'
    },
    idle: {
      dot: 'bg-zinc-400 dark:bg-zinc-500',
      ping: 'bg-zinc-300'
    },
    clay: {
      dot: 'bg-clay',
      ping: 'bg-clay'
    }
  }

  const { dot, ping } = colorStyles[status]
  const shouldPulse = pulse && status !== 'idle'

  return (
    <span className={`inline-flex items-center gap-1.5 select-none ${className}`}>
      <span className="relative flex shrink-0 items-center justify-center">
        {shouldPulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${ping}`}
          />
        )}
        <span className={`relative inline-flex rounded-full ${dotSizes} ${dot}`} />
      </span>
      {label && (
        <span className="text-xs text-text-muted truncate align-neg-075">{label}</span>
      )}
    </span>
  )
}

export interface ActivityBadgeProps {
  status?: StatusBeaconType
  label: React.ReactNode
  icon?: React.ReactNode
  variant?: 'default' | 'surface' | 'outline'
  size?: 'sm' | 'md'
  className?: string
}

/**
 * CDS 规范胶囊状态小标组件
 */
export const ActivityBadge: React.FC<ActivityBadgeProps> = ({
  status,
  label,
  icon,
  variant = 'default',
  size = 'sm',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'h-5 px-2 text-[10px] gap-1',
    md: 'h-6 px-2.5 text-xs gap-1.5'
  }[size]

  const variantClasses = {
    default: 'bg-surface-2 text-text-muted border border-border/80',
    surface: 'bg-surface text-text shadow-cds-sm border border-border/60',
    outline: 'bg-transparent text-text border border-border'
  }[variant]

  return (
    <span
      className={`inline-flex items-center justify-center font-medium rounded-full tabular-nums-strict select-none ${sizeClasses} ${variantClasses} ${className}`}
    >
      {status && <StatusBeacon status={status} size="sm" pulse={false} />}
      {icon && <span className="shrink-0 align-neg-125 inline-flex items-center">{icon}</span>}
      <span className="truncate">{label}</span>
    </span>
  )
}
