/**
 * 悬停气泡的纯定位算法。
 *
 * 为什么单独抽出来：HoverHint 需要 Portal + fixed 定位（页面容器普遍
 * overflow:hidden，absolute 会被裁剪），而定位计算与 React 无关，
 * 抽成纯函数后可以在现有 vitest（node 环境）里直接覆盖边界情况。
 */

export type HintPlacement = 'top' | 'bottom' | 'auto'
export type HintAlign = 'start' | 'center' | 'end'
export type ResolvedPlacement = 'top' | 'bottom'

export interface HintRect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface HintLayoutInput {
  anchor: HintRect
  bubbleWidth: number
  bubbleHeight: number
  viewportWidth: number
  viewportHeight: number
  placement?: HintPlacement
  align?: HintAlign
  gap?: number
  margin?: number
}

export interface HintLayoutResult {
  top: number
  left: number
  placement: ResolvedPlacement
}

function clamp(value: number, min: number, max: number): number {
  // 视口比气泡还小时 max < min，此时贴住起始边，保证气泡仍可见
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function computeHintPosition(input: HintLayoutInput): HintLayoutResult {
  const {
    anchor,
    bubbleWidth,
    bubbleHeight,
    viewportWidth,
    viewportHeight,
    placement = 'top',
    align = 'center',
    gap = 8,
    margin = 8
  } = input

  const spaceAbove = anchor.top - gap - margin
  const spaceBelow = viewportHeight - anchor.bottom - gap - margin
  const fitsAbove = bubbleHeight <= spaceAbove
  const fitsBelow = bubbleHeight <= spaceBelow

  let side: ResolvedPlacement
  if (placement === 'bottom') {
    side = fitsBelow ? 'bottom' : fitsAbove ? 'top' : spaceBelow >= spaceAbove ? 'bottom' : 'top'
  } else if (placement === 'auto') {
    side = spaceBelow >= spaceAbove ? 'bottom' : 'top'
  } else {
    side = fitsAbove ? 'top' : fitsBelow ? 'bottom' : spaceAbove >= spaceBelow ? 'top' : 'bottom'
  }

  let top = side === 'top' ? anchor.top - gap - bubbleHeight : anchor.bottom + gap
  top = clamp(top, margin, viewportHeight - bubbleHeight - margin)

  let left: number
  if (align === 'start') {
    left = anchor.left
  } else if (align === 'end') {
    left = anchor.right - bubbleWidth
  } else {
    left = anchor.left + anchor.width / 2 - bubbleWidth / 2
  }
  left = clamp(left, margin, viewportWidth - bubbleWidth - margin)

  return { top, left, placement: side }
}

/** 触发元素完全滚出视口时，气泡应直接关闭而不是贴边显示 */
export function isHintAnchorVisible(
  anchor: HintRect,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  return (
    anchor.bottom > 0 &&
    anchor.top < viewportHeight &&
    anchor.right > 0 &&
    anchor.left < viewportWidth
  )
}
