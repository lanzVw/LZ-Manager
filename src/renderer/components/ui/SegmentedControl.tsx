import React from 'react'
import { HoverHint } from './HoverHint'

export interface SegmentedControlItem<T extends string = string> {
  id: T
  label: React.ReactNode
  /** 悬停标签时展示的说明；由于位于 tab 按钮内，不额外增加 tab 停靠点 */
  hint?: React.ReactNode
  icon?: React.ReactNode
  badge?: React.ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string = string> {
  items: SegmentedControlItem<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
  fullWidth?: boolean
}

/**
 * CDS Recipe 4 规范：999px 胶囊滑块组件
 * 采用 100% 几何精度的滑动背景药丸，支持光学对齐与非等宽防抖
 */
export function SegmentedControl<T extends string = string>({
  items,
  value,
  onChange,
  size = 'md',
  className = '',
  fullWidth = false
}: SegmentedControlProps<T>) {
  const activeIndex = Math.max(0, items.findIndex((item) => item.id === value))
  const count = items.length

  const sizeClasses = {
    sm: 'h-7 p-[2px] text-xs',
    md: 'h-8 p-[2px] text-xs',
    lg: 'h-10 p-[3px] text-sm font-medium'
  }[size]

  return (
    <div
      role="tablist"
      className={`relative rounded-full bg-surface-2 border border-border/80 select-none ${sizeClasses} ${
        fullWidth ? 'w-full grid' : 'inline-grid'
      } items-stretch ${className}`}
      style={{
        gridTemplateColumns: count > 0 ? `repeat(${count}, minmax(0, 1fr))` : undefined
      }}
    >
      {/* 100% 几何精度滑动背景药丸 */}
      {count > 0 && activeIndex >= 0 && (
        <div
          className="absolute top-[2px] bottom-[2px] rounded-full bg-surface shadow-cds-sm border border-border/40 transition-all duration-150 ease-[cubic-bezier(.32,.72,0,1)] pointer-events-none"
          style={{
            left: `calc(2px + ${activeIndex} * (100% - 4px) / ${count})`,
            width: `calc((100% - 4px) / ${count})`,
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px 0 rgba(0,0,0,0.08)'
          }}
        />
      )}

      {items.map((item, idx) => {
        const isActive = idx === activeIndex
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={`relative z-10 w-full h-full px-3 inline-flex items-center justify-center gap-1.5 rounded-full font-[480] tracking-tight transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isActive
                ? 'text-text font-semibold'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {item.icon && <span className="shrink-0 align-neg-125 inline-flex">{item.icon}</span>}
            {item.hint ? (
              <HoverHint
                content={item.hint}
                focusable={false}
                srOnlyDescription={false}
                className="max-w-full"
              >
                <span className="truncate">{item.label}</span>
              </HoverHint>
            ) : (
              <span className="truncate">{item.label}</span>
            )}
            {item.badge && <span className="tabular-nums-strict">{item.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
