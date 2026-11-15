import { describe, expect, it } from 'vitest'
import {
  collectPersistValueHints,
  inferPersistValueOptions
} from '../src/core/persist-values'

function infer(
  lines: string[],
  name: string,
  defaultValue: string,
  currentValue = defaultValue,
  explicitAllowed?: string[]
) {
  const hints = collectPersistValueHints(lines).get(name.toLowerCase())
  return inferPersistValueOptions(explicitAllowed, defaultValue, currentValue, hints)
}

describe('persist value inference', () => {
  it('prefers an explicit key cycle over inferred values', () => {
    const result = infer(
      ['[Constants]', 'global persist $hair = 0', '[KeyHair]', '$hair = 0, 1, 2'],
      'hair',
      '0',
      '0',
      ['0', '1', '2']
    )

    expect(result).toEqual({
      kind: 'enum',
      allowedValues: ['0', '1', '2'],
      source: 'explicit'
    })
  })

  it('infers three glasses positions from equality checks and a two-step cycle', () => {
    const result = infer(
      [
        '[Constants]',
        'global persist $glasses = 1',
        'if $glasses == 0',
        'if $glasses == 1',
        'if $glasses < 2',
        '$glasses = $glasses + 1',
        'else',
        '$glasses = 0'
      ],
      'glasses',
      '1',
      '2'
    )

    expect(result.kind).toBe('enum')
    expect(result.allowedValues).toEqual(['0', '1', '2'])
  })

  it('keeps a default value that is higher than the equality checks', () => {
    const result = infer(
      [
        'global persist $sleeves = 3',
        'if $sleeves == 0',
        'if $sleeves == 1',
        'if $sleeves == 2'
      ],
      'sleeves',
      '3'
    )

    expect(result.kind).toBe('enum')
    expect(result.allowedValues).toEqual(['0', '1', '2', '3'])
  })

  it('expands a unit-step cycle to its terminal value', () => {
    const result = infer(
      [
        'global persist $feetdec = 2',
        'if $feetdec == 0',
        'if $feetdec == 1',
        'if $feetdec == 2',
        'if $feetdec < 3',
        '$feetdec = $feetdec + 1'
      ],
      'feetdec',
      '2'
    )

    expect(result.kind).toBe('enum')
    expect(result.allowedValues).toEqual(['0', '1', '2', '3'])
  })

  it('uses a numeric input for computed float offsets', () => {
    const result = infer(
      [
        'global persist $final_x_off = -1',
        '$final_x_off = 0.5 - $x_size/2 + -0.01701',
        '$final_x_off = 0'
      ],
      'final_x_off',
      '-1',
      '0.168866664'
    )

    expect(result.kind).toBe('number')
    expect(result.step).toBe(0.01)
  })

  it('falls back to a toggle only when the default is 0 or 1', () => {
    expect(infer([], 'flag', '0')).toEqual({
      kind: 'binary',
      allowedValues: ['0', '1'],
      source: 'fallback'
    })
    expect(infer([], 'scale', '2')).toMatchObject({
      kind: 'number',
      step: 1
    })
  })

  it('handles qualified bridge variable names', () => {
    const hints = collectPersistValueHints([
      'if $\\QAQM\\Persist\\Bridge_6571342a40b3\\Jacket == 2',
      '$\\QAQM\\Persist\\Bridge_6571342a40b3\\Jacket = 0'
    ])
    expect(hints.get('jacket')?.equalities).toEqual(['2'])
    expect(hints.get('jacket')?.literals).toEqual(['0'])
  })

  it('uses a range-only condition for a step-zero toggle', () => {
    const result = infer(
      ['global persist $eyes = 0', 'if $eyes < 2', '$eyes = $eyes + 0'],
      'eyes',
      '0'
    )

    expect(result.kind).toBe('binary')
    expect(result.allowedValues).toEqual(['0', '1'])
  })
})
