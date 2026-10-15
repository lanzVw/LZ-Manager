import React, { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ThinkingQuietDots } from './StatusIndicators'

export interface ThinkingAccordionProps {
  /** 折叠标题（默认“思考过程”） */
  title?: React.ReactNode
  /** 状态描述文字（如“已思考 4 秒”、“正在分析文件结构...”） */
  statusText?: React.ReactNode
  /** 是否处于思考处理中（展示波浪动画点） */
  isThinking?: boolean
  /** 受控展开状态 */
  isOpen?: boolean
  /** 非受控初始展开状态（默认 false） */
  defaultOpen?: boolean
  /** 展开/折叠状态切换回调 */
  onToggle?: (open: boolean) => void
  /** 思考日志条目列表 */
  logs?: string[]
  /** 自定义折叠内容 */
  children?: React.ReactNode
  /** 容器自定义类名 */
  className?: string
}

/**
 * CDS Recipe 3 思考过程折叠面板组件
 *
 * 核心设计：
 * 1. 零 JS 高度测量：采用纯 CSS Grid `0fr -> 1fr` 弹性平滑过渡，无掉帧重排
 * 2. 头部状态：支持 ThinkingQuietDots 思考微光脉冲与 Chevron 图标 90 度旋转
 * 3. 灵活渲染：支持直接传入 logs 字符串数组或自定义 children
 */
export const ThinkingAccordion: React.FC<ThinkingAccordionProps> = ({
  title = '思考过程',
  statusText,
  isThinking = false,
  isOpen: controlledIsOpen,
  defaultOpen = false,
  onToggle,
  logs,
  children,
  className = ''
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen)
  const isControlled = controlledIsOpen !== undefined
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen

  const handleHeaderClick = () => {
    const nextState = !isOpen
    if (!isControlled) {
      setInternalIsOpen(nextState)
    }
    onToggle?.(nextState)
  }

  return (
    <div
      className={`border border-border/60 rounded-xl bg-surface-1/60 overflow-hidden transition-colors ${className}`}
    >
      {/* 折叠头部栏 */}
      <button
        type="button"
        onClick={handleHeaderClick}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-3.5 py-2 text-left hover:bg-surface-2/50 transition-colors duration-150 select-none cursor-pointer focus:outline-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isThinking && <ThinkingQuietDots size="sm" />}
          <span className="text-xs font-medium text-text truncate">{title}</span>
          {statusText && (
            <span className="text-[11px] text-text-muted truncate align-neg-075">
              {statusText}
            </span>
          )}
        </div>

        <ChevronRight
          className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-90' : 'rotate-0'
          }`}
        />
      </button>

      {/* 纯 CSS Grid 0fr -> 1fr 弹性过渡折叠容器 */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(.19,1,.22,1)]"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-3.5 pb-3 pt-1 text-xs text-text-muted border-t border-border/40 font-mono space-y-1">
            {logs && logs.length > 0 ? (
              logs.map((log, index) => (
                <div key={index} className="leading-relaxed break-all">
                  {log}
                </div>
              ))
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
