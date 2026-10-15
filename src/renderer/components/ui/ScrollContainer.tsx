import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import {
  useClaudeScrollPinning,
  UseClaudeScrollPinningOptions
} from '../../hooks/useClaudeScrollPinning'

export interface ScrollContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  /** 渐隐遮罩高度尺寸（默认 24px） */
  fadeSize?: number
  /** 是否启用 CDS 视口图钉吸底能力（默认 false） */
  enablePinning?: boolean
  /** 视口图钉配置选项 */
  pinningOptions?: UseClaudeScrollPinningOptions
  /** 自定义滚动监听 */
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void
  /** 外部传入的目标容器引用 */
  containerRef?: React.RefObject<HTMLDivElement | null>
}

/**
 * 计算动态边界传感器对应的 7 阶渐隐遮罩上下尺寸
 * 算法依据：
 * - 当 scrollTop <= 1 时顶部遮罩为 0px
 * - 当 scrollTop + clientHeight >= scrollHeight - 1 时底部遮罩为 0px
 * - 内容高度不足一屏 (scrollHeight <= clientHeight) 时双向均为 0px
 * - 其余滚动区间恢复配置的非线性渐隐像素（默认 24px）
 */
export function computeScrollFadeMask(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  fadeSize: number = 24
): { top: string; bottom: string } {
  if (scrollHeight <= clientHeight) {
    return { top: '0px', bottom: '0px' }
  }
  const isAtTop = scrollTop <= 1
  const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1
  return {
    top: isAtTop ? '0px' : `${fadeSize}px`,
    bottom: isAtBottom ? '0px' : `${fadeSize}px`
  }
}

/**
 * CDS 逆向算法第 1 条：带 7 阶非线性渐隐遮罩的平滑滚动容器组件
 *
 * 核心设计：
 * 1. 挂载 .cds-scroll-fade-mask 7 阶 Quintic 渐隐着色遮罩
 * 2. 挂载动态边界传感器：
 *    - 当 scrollTop <= 1 时将 --cds-scroll-fade-top 设为 0px
 *    - 当 scrollTop + clientHeight >= scrollHeight - 1 时将 --cds-scroll-fade-bottom 设为 0px
 *    - 其余区间恢复配置大小（默认 24px）
 * 3. 可选接入 useClaudeScrollPinning 视口图钉与 150ms 冷却时间戳防抢夺能力
 */
export const ScrollContainer = forwardRef<HTMLDivElement, ScrollContainerProps>(
  (
    {
      children,
      fadeSize = 24,
      enablePinning = false,
      pinningOptions,
      onScroll,
      containerRef,
      className = '',
      style,
      ...props
    },
    ref
  ) => {
    const internalRef = useRef<HTMLDivElement | null>(null)
    const activeRef = containerRef || internalRef

    useImperativeHandle(ref, () => activeRef.current as HTMLDivElement)

    const pinning = useClaudeScrollPinning(activeRef, {
      bottomTolerance: pinningOptions?.bottomTolerance,
      cooldownMs: pinningOptions?.cooldownMs,
      deps: pinningOptions?.deps,
      enabled: enablePinning
    })

    const updateFadeMask = useCallback(() => {
      const el = activeRef.current
      if (!el) return
      const { scrollTop, clientHeight, scrollHeight } = el
      const mask = computeScrollFadeMask(scrollTop, clientHeight, scrollHeight, fadeSize)
      el.style.setProperty('--cds-scroll-fade-top', mask.top)
      el.style.setProperty('--cds-scroll-fade-bottom', mask.bottom)
    }, [activeRef, fadeSize])

    useEffect(() => {
      updateFadeMask()
      const el = activeRef.current
      if (!el) return

      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          updateFadeMask()
        })
        observer.observe(el)
        return () => observer.disconnect()
      }
    }, [updateFadeMask, activeRef])

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      updateFadeMask()
      if (enablePinning) {
        pinning.handleScroll(e)
      }
      onScroll?.(e)
    }

    return (
      <div
        ref={activeRef}
        onScroll={handleScroll}
        className={`cds-scroll-fade-mask overflow-y-auto ${className}`}
        style={{
          ['--cds-scroll-fade-top' as any]: '0px',
          ['--cds-scroll-fade-bottom' as any]: `${fadeSize}px`,
          ...style
        }}
        {...props}
      >
        {children}
      </div>
    )
  }
)

ScrollContainer.displayName = 'ScrollContainer'
