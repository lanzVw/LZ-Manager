import { describe, expect, it } from 'vitest'
import {
  getModEnterDelayMs,
  resolveCharacterSwitchDirection
} from '../src/renderer/overlay/overlay-mod-motion'

describe('resolveCharacterSwitchDirection', () => {
  const characters = ['A', 'B', 'C', 'D']

  it('returns a forward direction for the next character', () => {
    expect(resolveCharacterSwitchDirection('A', 'B', characters)).toBe(1)
    expect(resolveCharacterSwitchDirection('B', 'D', characters)).toBe(1)
  })

  it('returns a backward direction for the previous character', () => {
    expect(resolveCharacterSwitchDirection('B', 'A', characters)).toBe(-1)
    expect(resolveCharacterSwitchDirection('D', 'B', characters)).toBe(-1)
  })

  it('keeps the wheel/key direction when wrapping around the edges', () => {
    expect(resolveCharacterSwitchDirection('D', 'A', characters)).toBe(1)
    expect(resolveCharacterSwitchDirection('A', 'D', characters)).toBe(-1)
  })

  it('returns neutral when there is no character change or an unknown character', () => {
    expect(resolveCharacterSwitchDirection(null, 'A', characters)).toBe(0)
    expect(resolveCharacterSwitchDirection('A', 'A', characters)).toBe(0)
    expect(resolveCharacterSwitchDirection('A', 'missing', characters)).toBe(0)
    expect(resolveCharacterSwitchDirection('missing', 'A', characters)).toBe(0)
    expect(resolveCharacterSwitchDirection('A', 'B', [])).toBe(0)
  })
})

describe('getModEnterDelayMs', () => {
  it('staggers the first eight cards and caps the rest', () => {
    expect(getModEnterDelayMs(0)).toBe(0)
    expect(getModEnterDelayMs(3)).toBe(42)
    expect(getModEnterDelayMs(7)).toBe(98)
    expect(getModEnterDelayMs(20)).toBe(98)
  })

  it('falls back to no delay for invalid input', () => {
    expect(getModEnterDelayMs(Number.NaN)).toBe(0)
    expect(getModEnterDelayMs(-2)).toBe(0)
    expect(getModEnterDelayMs(2, Number.NaN)).toBe(0)
  })
})
