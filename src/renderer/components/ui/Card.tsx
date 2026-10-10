import React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
  selected?: boolean
  /** 渲染为 div（默认）或 button；设为 'button' 时整体可聚焦、可回车触发 */
  as?: 'div' | 'button'
  /** 可交互卡片：渲染为 <button type="button"> 并附加 focus-visible 焦点环 */
  interactive?: boolean
}

export const Card: React.FC<CardProps> = ({
  children,
  hoverable = false,
  selected = false,
  as = 'div',
  interactive = false,
  className = '',
  ...props
}) => {
  const baseClasses = `bg-surface rounded-card border transition-all duration-fast ${
    selected
      ? 'border-primary ring-2 ring-primary/20 shadow-md'
      : 'border-border'
  } ${
    hoverable
      ? 'hover:border-primary/40 hover:shadow-sm hover:-translate-y-0.5 cursor-pointer'
      : ''
  } ${className}`

  if (interactive || as === 'button') {
    return (
      <button
        type="button"
        className={`${baseClasses} w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40`}
        {...(props as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
    )
  }

  return (
    <div className={baseClasses} {...(props as React.HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  )
}
