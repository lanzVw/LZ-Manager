import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  computeHintPosition,
  isHintAnchorVisible,
  type HintAlign,
  type HintLayoutResult,
  type HintPlacement
} from '../../utils/hoverHintLayout'

export type HoverHintTone = 'surface' | 'dark'

export interface HoverHintProps {
  content: React.ReactNode
  children: React.ReactNode
  placement?: HintPlacement
  align?: HintAlign
  maxWidth?: number
  gap?: number
  delayMs?: number
  closeDelayMs?: number
  disabled?: boolean
  /** 是否让说明文字本身成为 tab 停靠点；可点击卡片/菜单项内部应保持 false */
  focusable?: boolean
  tone?: HoverHintTone
  className?: string
  panelClassName?: string
  descriptionId?: string
  /** 是否在 DOM 中保留一份 sr-only 说明；位于 tab 标签内时应关闭，避免撑长可访问名称 */
  srOnlyDescription?: boolean
}

/**
 * 悬停标题时在 Portal 中显示多行说明气泡。
 *
 * 为什么用 Portal + fixed：设置页、市场页、详情页等滚动容器普遍带
 * overflow-hidden / overflow-y-auto，absolute 定位的气泡会被裁掉。
 * 为什么包一层 span 而不是 cloneElement：标题常位于 flex 行内且含图标、
 * Badge 等兄弟节点，cloneElement 会把整行都变成 hover 目标，也容易覆盖
 * 调用方已有的 ref / className / 事件。
 */
export const HoverHint: React.FC<HoverHintProps> = ({
  content,
  children,
  placement = 'top',
  align = 'center',
  maxWidth = 320,
  gap = 8,
  delayMs = 300,
  closeDelayMs = 80,
  disabled = false,
  focusable = false,
  tone = 'surface',
  className = '',
  panelClassName = '',
  descriptionId,
  srOnlyDescription = true
}) => {
  const hasContent = !disabled && content !== null && content !== undefined && content !== ''
  const reactId = useId().replace(/:/g, '')
  const descId = descriptionId || `hover-hint-desc-${reactId}`
  const panelId = `hover-hint-panel-${reactId}`

  const triggerRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<HintLayoutResult | null>(null)

  const clearTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const closeNow = useCallback(() => {
    clearTimers()
    setOpen(false)
    setCoords(null)
  }, [clearTimers])

  const scheduleClose = useCallback(() => {
    if (focusable && triggerRef.current?.contains(document.activeElement)) return
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      setOpen(false)
      setCoords(null)
    }, closeDelayMs)
  }, [closeDelayMs, focusable])

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) {
      closeNow()
      return
    }
    const anchor = trigger.getBoundingClientRect()
    if (!isHintAnchorVisible(anchor, window.innerWidth, window.innerHeight)) {
      closeNow()
      return
    }
    const panel = panelRef.current
    if (!panel) return
    const bubble = panel.getBoundingClientRect()
    const next = computeHintPosition({
      anchor,
      bubbleWidth: bubble.width,
      bubbleHeight: bubble.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      placement,
      align,
      gap
    })
    setCoords((prev) =>
      prev && prev.top === next.top && prev.left === next.left && prev.placement === next.placement
        ? prev
        : next
    )
  }, [align, closeNow, gap, placement])

  // 气泡挂载后先测量再定位，避免首帧从 (0,0) 跳到目标位置
  useLayoutEffect(() => {
    if (open) updatePosition()
  }, [open, updatePosition])

  useEffect(() => {
    if (!hasContent) closeNow()
  }, [hasContent, closeNow])

  useEffect(() => () => clearTimers(), [clearTimers])

  // 滚动/缩放跟随；ResizeObserver 处理内容换行导致的尺寸变化
  useEffect(() => {
    if (!open) return
    const onViewportChange = () => {
      if (rafRef.current !== null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        updatePosition()
      })
    }
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && panelRef.current) {
      observer = new ResizeObserver(onViewportChange)
      observer.observe(panelRef.current)
    }
    return () => {
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
      observer?.disconnect()
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [open, updatePosition])

  // Escape 关闭用 capture 并阻止冒泡：气泡打开时按 Esc 只关气泡，不关闭底层 Modal
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      closeNow()
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      closeNow()
    }
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [open, closeNow])

  const handleMouseEnter = () => {
    if (!hasContent) return
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    if (open || openTimerRef.current) return
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null
      setOpen(true)
    }, delayMs)
  }

  const handleMouseLeave = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    scheduleClose()
  }

  const handleFocus = () => {
    if (!hasContent) return
    clearTimers()
    setOpen(true)
  }

  const handleBlur = (event: React.FocusEvent<HTMLSpanElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    scheduleClose()
  }

  if (!hasContent) return <>{children}</>

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : maxWidth + 16
  const resolvedMaxWidth = Math.max(120, Math.min(maxWidth, viewportWidth - 16))
  const toneClasses =
    tone === 'dark'
      ? 'bg-zinc-900/95 border-zinc-700/80 text-zinc-300 shadow-2xl'
      : 'bg-surface/95 backdrop-blur-xl border-border/80 text-text-muted shadow-popover'

  return (
    <>
      <span
        ref={triggerRef}
        className={`relative inline-flex items-center min-w-0 max-w-full align-middle ${
          focusable ? 'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40' : ''
        } ${className}`}
        tabIndex={focusable ? 0 : undefined}
        aria-describedby={srOnlyDescription ? descId : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {children}
      </span>

      {/* 常驻的可访问描述源：视觉气泡隐藏后，读屏仍能获取说明 */}
      {srOnlyDescription && (
        <span id={descId} className="sr-only">
          {content}
        </span>
      )}

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="tooltip"
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              maxWidth: resolvedMaxWidth,
              visibility: coords ? 'visible' : 'hidden'
            }}
            className={`z-[99999] w-max rounded-xl border px-3 py-2 text-[11px] leading-relaxed whitespace-pre-line break-words pointer-events-none select-none animate-in fade-in zoom-in-95 duration-fast ring-1 ring-black/5 dark:ring-white/10 ${toneClasses} ${
              coords?.placement === 'bottom'
                ? 'slide-in-from-top-1 origin-top'
                : 'slide-in-from-bottom-1 origin-bottom'
            } ${panelClassName}`}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  )
}
