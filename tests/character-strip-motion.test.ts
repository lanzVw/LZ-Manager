import { describe, expect, it } from 'vitest'
import {
  clampScrollLeft,
  computeCenteredScrollLeft,
  computeEasedScrollLeft,
  normalizeWheelScrollDelta,
  resolveAnimationDuration
} from '../src/renderer/overlay/useAnimatedHorizontalScroll'

describe('character strip scroll geometry', () => {
  it('clamps scroll targets to the available range', () => {
    expect(clampScrollLeft(-20, 100)).toBe(0)
    expect(clampScrollLeft(40, 100)).toBe(40)
    expect(clampScrollLeft(140, 100)).toBe(100)
    expect(clampScrollLeft(40, Number.NaN)).toBe(0)
    expect(clampScrollLeft(Number.NaN, 100)).toBe(0)
  })

  it('normalizes pixel, line and page wheel deltas', () => {
    expect(normalizeWheelScrollDelta(12, 3, 0, 300)).toBe(12)
    expect(normalizeWheelScrollDelta(2, 9, 0, 300)).toBe(9)
    expect(normalizeWheelScrollDelta(0, 2, 1, 300)).toBe(32)
    expect(normalizeWheelScrollDelta(0, 2, 2, 300)).toBe(600)
    expect(normalizeWheelScrollDelta(Number.NaN, Number.NaN, 0, 300)).toBe(0)
  })

  it('centers first, middle and last items inside the scroller', () => {
    expect(computeCenteredScrollLeft(300, 126, 48, 600)).toBe(0)
    expect(computeCenteredScrollLeft(300, 426, 48, 600)).toBe(300)
    expect(computeCenteredScrollLeft(300, 726, 48, 600)).toBe(600)
    expect(computeCenteredScrollLeft(0, 126, 48, 600)).toBe(0)
  })

  it('uses the requested duration unless reduced motion is enabled', () => {
    expect(resolveAnimationDuration(280, false)).toBe(280)
    expect(resolveAnimationDuration(280, true)).toBe(0)
    expect(resolveAnimationDuration(0, false)).toBe(0)
    expect(resolveAnimationDuration(Number.NaN, false)).toBe(0)
  })

  it('eases out without overshooting the target', () => {
    expect(computeEasedScrollLeft(0, 100, 0, 200)).toBe(0)
    expect(computeEasedScrollLeft(0, 100, 100, 200)).toBe(87.5)
    expect(computeEasedScrollLeft(0, 100, 200, 200)).toBe(100)
    expect(computeEasedScrollLeft(0, 100, 400, 200)).toBe(100)
    expect(computeEasedScrollLeft(30, 100, 0, 0)).toBe(100)
  })
})
