import React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger'
  size?: 'sm' | 'md' | 'lg'
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
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-control transition-all duration-fast select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]'

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-xs px-3.5 py-2 gap-2',
    lg: 'text-sm px-5 py-2.5 gap-2.5 font-semibold'
  }[size]

  const variantClasses = {
    // 全局唯一实心主色按钮风格
    primary:
      'bg-primary text-primary-fg hover:brightness-105 active:brightness-95 shadow-sm border border-transparent',
    // 次要按钮：描边风格
    secondary:
      'bg-surface hover:bg-surface-2 text-text border border-border hover:border-primary/40 shadow-xs',
    // 幽灵按钮：仅悬浮出现底色
    ghost:
      'bg-transparent hover:bg-surface-2 text-text-muted hover:text-text border border-transparent',
    // 角色动态强调色按钮
    accent:
      'bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30',
    // 危险/警示按钮
    danger:
      'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20'
  }[variant]

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children}
    </button>
  )
}
