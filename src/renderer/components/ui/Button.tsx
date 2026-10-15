import React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  // 基础样式与二阶阻尼物理弹簧手感
  const baseClasses =
    'inline-flex items-center justify-center font-medium select-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.96] transition-all duration-[80ms] ease-[cubic-bezier(.16,1,.3,1)]'

  // CDS 4 级尺寸系统
  const sizeClasses = {
    xs: 'h-6 text-[11px] px-2.5 py-0.5 gap-1.5 rounded-sm',
    sm: 'h-7 text-xs px-3 py-1 gap-1.5 rounded-sm',
    md: 'h-8 text-xs px-3.5 py-1.5 gap-2 rounded-md',
    lg: 'h-10 text-sm px-5 py-2.5 gap-2.5 rounded-lg font-semibold'
  }[size]

  // CDS 5 大变体系统
  const variantClasses = {
    // 全局唯一实心主色按钮风格
    primary:
      'bg-primary text-primary-fg hover:brightness-105 active:brightness-95 shadow-cds-sm border border-transparent',
    // 次要按钮：描边与微底色风格
    secondary:
      'bg-surface hover:bg-surface-2 text-text border border-border/80 hover:border-primary/40 shadow-cds-sm',
    // 幽灵按钮：仅悬浮出现底色
    ghost:
      'bg-transparent hover:bg-surface-2 text-text-muted hover:text-text border border-transparent',
    // 角色动态强调色按钮
    accent:
      'bg-accent/10 hover:bg-accent/20 text-accent border border-accent/25',
    // 危险/警示按钮
    danger:
      'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/25'
  }[variant]

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0 align-neg-125" />
      ) : (
        icon && <span className="shrink-0 align-neg-125 inline-flex items-center">{icon}</span>
      )}
      {children}
    </button>
  )
}
