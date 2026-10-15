import React from 'react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'accent' | 'success' | 'danger' | 'clay'
  size?: 'sm' | 'md'
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
  ...props
}) => {
  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1'
  }[size]

  const variantClasses = {
    default: 'bg-surface-2 text-text-muted border border-border',
    primary: 'bg-primary/10 text-primary border border-primary/20',
    accent: 'bg-accent/10 text-accent border border-accent/20',
    success: 'bg-success/10 text-success border border-success/20',
    danger: 'bg-danger/10 text-danger border border-danger/20',
    clay: 'bg-clay/10 text-clay border border-clay/20'
  }[variant]

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full tabular-nums-strict ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
