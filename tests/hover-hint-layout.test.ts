import { describe, it, expect } from 'vitest'
import { computeHintPosition, isHintAnchorVisible } from '../src/renderer/utils/hoverHintLayout'

const anchor = (top: number, left: number, width = 120, height = 20) => ({
  top,
  left,
  right: left + width,
  bottom: top + height,
  width,
  height
})

const base = {
  bubbleWidth: 200,
  bubbleHeight: 60,
  viewportWidth: 1000,
  viewportHeight: 800,
  margin: 8,
  gap: 8
}

describe('悬停气泡定位', () => {
  it('默认在上方，且水平居中', () => {
    const result = computeHintPosition({
      ...base,
      anchor: anchor(300, 400),
      placement: 'top',
      align: 'center'
    })
    expect(result.placement).toBe('top')
    expect(result.top).toBe(300 - 8 - 60)
    expect(result.left).toBe(400 + 60 - 100)
  })

  it('上方放不下时自动翻到下方', () => {
    const result = computeHintPosition({
      ...base,
      anchor: anchor(40, 400),
      placement: 'top'
    })
    expect(result.placement).toBe('bottom')
    expect(result.top).toBe(40 + 20 + 8)
  })

  it('下方放不下时翻回上方', () => {
    const result = computeHintPosition({
      ...base,
      anchor: anchor(720, 400),
      placement: 'bottom'
    })
    expect(result.placement).toBe('top')
    expect(result.top).toBe(720 - 8 - 60)
  })

  it('auto 优先选择空间更大的一侧', () => {
    const low = computeHintPosition({ ...base, anchor: anchor(600, 400), placement: 'auto' })
    expect(low.placement).toBe('top')
    const high = computeHintPosition({ ...base, anchor: anchor(60, 400), placement: 'auto' })
    expect(high.placement).toBe('bottom')
  })

  it('左侧越界时 clamp 到 8px', () => {
    const result = computeHintPosition({ ...base, anchor: anchor(300, 0), align: 'start' })
    expect(result.left).toBe(8)
  })

  it('右侧越界时 clamp 到视口内', () => {
    const result = computeHintPosition({ ...base, anchor: anchor(300, 900), align: 'end' })
    expect(result.left).toBe(1000 - 200 - 8)
  })

  it('两端都放不下时垂直 clamp 到视口内', () => {
    const result = computeHintPosition({
      ...base,
      bubbleHeight: 780,
      anchor: anchor(400, 400),
      placement: 'top'
    })
    expect(result.top).toBe(8)
    expect(result.top + 780).toBeLessThanOrEqual(800)
  })

  it('窄视口（Overlay 60% 缩放）下气泡不超出左右边界', () => {
    const result = computeHintPosition({
      ...base,
      viewportWidth: 320,
      bubbleWidth: 300,
      anchor: anchor(300, 200, 60),
      align: 'center'
    })
    expect(result.left).toBeGreaterThanOrEqual(8)
    expect(result.left + 300).toBeLessThanOrEqual(320)
  })

  it('align=end 以触发元素右边缘对齐', () => {
    const result = computeHintPosition({ ...base, anchor: anchor(300, 400), align: 'end' })
    expect(result.left).toBe(400 + 120 - 200)
  })
})

describe('触发元素可见性', () => {
  it('完全滚出上方或下方时判定不可见', () => {
    expect(isHintAnchorVisible(anchor(-40, 100), 1000, 800)).toBe(false)
    expect(isHintAnchorVisible(anchor(820, 100), 1000, 800)).toBe(false)
    expect(isHintAnchorVisible(anchor(100, 100), 1000, 800)).toBe(true)
  })

  it('部分露出时仍视为可见', () => {
    expect(isHintAnchorVisible(anchor(-10, 100), 1000, 800)).toBe(true)
    expect(isHintAnchorVisible(anchor(790, 100), 1000, 800)).toBe(true)
  })
})
