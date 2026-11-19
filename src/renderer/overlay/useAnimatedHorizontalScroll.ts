import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'

interface ScrollAnimation {
  start: number
  target: number
  startedAt: number
  duration: number
}

export function clampScrollLeft(target: number, maxScroll: number): number {
  const max = Number.isFinite(maxScroll) ? Math.max(0, maxScroll) : 0
  if (!Number.isFinite(target)) return 0
  return Math.min(max, Math.max(0, target))
}

export function normalizeWheelScrollDelta(
  deltaX: number,
  deltaY: number,
  deltaMode: number,
  pageSize: number,
  lineHeight = 16
): number {
  const dominant = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
  if (!Number.isFinite(dominant)) return 0

  if (deltaMode === 1) return dominant * lineHeight
  if (deltaMode === 2) return dominant * Math.max(1, pageSize)
  return dominant
}

export function computeCenteredScrollLeft(
  viewportWidth: number,
  itemOffsetLeft: number,
  itemWidth: number,
  maxScroll: number
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 0
  return clampScrollLeft(itemOffsetLeft + itemWidth / 2 - viewportWidth / 2, maxScroll)
}

export function resolveAnimationDuration(durationMs: number, reduceMotion: boolean): number {
  if (reduceMotion || !Number.isFinite(durationMs) || durationMs <= 0) return 0
  return durationMs
}

export function computeEasedScrollLeft(
  start: number,
  target: number,
  elapsedMs: number,
  durationMs: number
): number {
  if (durationMs <= 0) return target
  const progress = Math.min(1, Math.max(0, elapsedMs / durationMs))
  const eased = 1 - Math.pow(1 - progress, 3)
  return start + (target - start) * eased
}

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useAnimatedHorizontalScroll<T extends HTMLElement>(
  ref: RefObject<T | null>
): {
  scrollTo: (target: number, durationMs?: number) => void
  scrollBy: (delta: number, durationMs?: number) => void
  stop: () => void
} {
  const animationRef = useRef<ScrollAnimation | null>(null)
  const frameRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    animationRef.current = null
  }, [])

  const runFrame = useCallback(function runFrame(now: number) {
    const element = ref.current
    const animation = animationRef.current
    if (!element || !animation) {
      frameRef.current = null
      return
    }

    const elapsed = now - animation.startedAt
    const maxScroll = element.scrollWidth - element.clientWidth
    const target = clampScrollLeft(animation.target, maxScroll)
    const next = computeEasedScrollLeft(animation.start, target, elapsed, animation.duration)

    if (elapsed >= animation.duration || Math.abs(target - next) < 0.5) {
      element.scrollLeft = target
      animationRef.current = null
      frameRef.current = null
      return
    }

    element.scrollLeft = next
    frameRef.current = requestAnimationFrame(runFrame)
  }, [ref])

  const scrollTo = useCallback(
    (requestedTarget: number, durationMs = 220) => {
      const element = ref.current
      if (!element) return

      const maxScroll = element.scrollWidth - element.clientWidth
      const target = clampScrollLeft(requestedTarget, maxScroll)
      const duration = resolveAnimationDuration(durationMs, prefersReducedMotion())

      if (duration === 0 || Math.abs(target - element.scrollLeft) < 0.5) {
        stop()
        element.scrollLeft = target
        return
      }

      animationRef.current = {
        start: element.scrollLeft,
        target,
        startedAt: performance.now(),
        duration
      }

      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(runFrame)
      }
    },
    [ref, runFrame, stop]
  )

  const scrollBy = useCallback(
    (delta: number, durationMs = 220) => {
      const element = ref.current
      if (!element || !Number.isFinite(delta) || delta === 0) return

      const base = animationRef.current?.target ?? element.scrollLeft
      scrollTo(base + delta, durationMs)
    },
    [ref, scrollTo]
  )

  useEffect(() => {
    return () => stop()
  }, [stop])

  return { scrollTo, scrollBy, stop }
}
