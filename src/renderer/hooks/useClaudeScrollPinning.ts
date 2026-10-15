import React, { useRef, useState, useCallback, useEffect } from 'react'

export interface UseClaudeScrollPinningOptions {
  /** 触发吸附的底部容差阈值（默认 40px） */
  bottomTolerance?: number
  /** 用户手动输入后的滚动冷却窗口（默认 150ms），用于防抢夺视口 */
  cooldownMs?: number
  /** 触发图钉滚动检查的依赖列表 */
  deps?: React.DependencyList
  /** 是否启用图钉机制（默认 true） */
  enabled?: boolean
}

export interface UseClaudeScrollPinningReturn<T extends HTMLElement> {
  containerRef: React.RefObject<T | null>
  isPinned: boolean
  setIsPinned: React.Dispatch<React.SetStateAction<boolean>>
  markUserInput: () => void
  handleScroll: (e?: React.UIEvent<HTMLElement> | Event) => void
  scrollToBottom: (behavior?: ScrollBehavior) => void
  lastUserInputAt: React.RefObject<number>
}

/**
 * CDS 逆向算法第 2 条：视口图钉（Scroll Pinning）与输入冷却守卫 Hook
 *
 * 核心机制：
 * 1. 默认吸底容差 bottomTolerance = 40px，输入冷却 cooldownMs = 150ms
 * 2. 维护 lastUserInputAt 记录最近一次键入/交互时间戳
 * 3. 当用户在冷却窗口内输入时，阻断流式追加时的强制吸底，彻底杜绝打字视口被抢夺
 * 4. 监听容器滚动：距离底部 <= 40px 恢复图钉；向上滚动离开后释放图钉
 */
export function useClaudeScrollPinning<T extends HTMLElement = HTMLDivElement>(
  refOrOptions?: React.RefObject<T | null> | UseClaudeScrollPinningOptions,
  maybeOptions?: UseClaudeScrollPinningOptions
): UseClaudeScrollPinningReturn<T> {
  let externalRef: React.RefObject<T | null> | undefined
  let options: UseClaudeScrollPinningOptions = {}

  if (refOrOptions && 'current' in refOrOptions) {
    externalRef = refOrOptions as React.RefObject<T | null>
    options = maybeOptions || {}
  } else if (refOrOptions) {
    options = refOrOptions as UseClaudeScrollPinningOptions
  }

  const {
    bottomTolerance = 40,
    cooldownMs = 150,
    deps = [],
    enabled = true
  } = options

  const internalRef = useRef<T | null>(null)
  const containerRef = externalRef || internalRef

  const lastUserInputAt = useRef<number>(0)
  const [isPinned, setIsPinned] = useState<boolean>(true)

  /**
   * 标记当前用户键盘/交互输入，刷新时间戳并临时释放图钉
   */
  const markUserInput = useCallback(() => {
    lastUserInputAt.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
    setIsPinned(false)
  }, [])

  /**
   * 监听容器滚动位置
   * 当 scrollHeight - scrollTop - clientHeight <= bottomTolerance 时恢复图钉
   */
  const handleScroll = useCallback(
    (e?: React.UIEvent<HTMLElement> | Event) => {
      if (!enabled) return
      const el = containerRef.current || (e?.currentTarget as HTMLElement | null)
      if (!el) return
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      if (distanceFromBottom <= bottomTolerance) {
        setIsPinned(true)
      } else {
        setIsPinned(false)
      }
    },
    [containerRef, bottomTolerance, enabled]
  )

  /**
   * 手动触发平滑/立即吸底
   */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      if (!containerRef.current) return
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior
      })
    },
    [containerRef]
  )

  /**
   * 依赖变化时执行图钉滚动
   * 守卫拦截：若 performance.now() - lastUserInputAt.current <= cooldownMs 则阻断；
   * 若仍保持 isPinned，则定位至最底部。
   */
  useEffect(() => {
    if (!enabled || !containerRef.current) return

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - lastUserInputAt.current <= cooldownMs) {
      return
    }

    if (isPinned) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'auto'
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return {
    containerRef,
    isPinned,
    setIsPinned,
    markUserInput,
    handleScroll,
    scrollToBottom,
    lastUserInputAt
  }
}
