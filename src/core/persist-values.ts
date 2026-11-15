import type { ModPersistValueKind, ModPersistValueSource } from './types'
import { stripIniComments } from './base-mod'

export interface PersistValueHintBound {
  op: '<' | '<=' | '>' | '>='
  value: number
}

export interface PersistValueHints {
  equalities: string[]
  literals: string[]
  bounds: PersistValueHintBound[]
  cycleSteps: number[]
  hasArithmetic: boolean
  hasFloat: boolean
}

export interface PersistValueInference {
  kind: ModPersistValueKind
  allowedValues?: string[]
  min?: number
  max?: number
  step?: number
  source: ModPersistValueSource
}

const NUMBER = String.raw`[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?`
const VAR_REF = String.raw`\$([A-Za-z0-9_\\/]+)`
const LITERAL_LIST = new RegExp(`^${NUMBER}(?:\\s*,\\s*${NUMBER})*$`)

function canonicalVarName(ref: string): string {
  const parts = String(ref || '').split(/[\\/]/).filter(Boolean)
  return (parts[parts.length - 1] || '').toLowerCase()
}

function createHints(): PersistValueHints {
  return {
    equalities: [],
    literals: [],
    bounds: [],
    cycleSteps: [],
    hasArithmetic: false,
    hasFloat: false
  }
}

function getHints(map: Map<string, PersistValueHints>, name: string): PersistValueHints {
  const key = name.toLowerCase()
  if (!map.has(key)) map.set(key, createHints())
  return map.get(key)!
}

function isNumericLiteral(value: string): boolean {
  return new RegExp(`^${NUMBER}$`).test(String(value || '').trim())
}

function hasDecimalPoint(value: string): boolean {
  return /(?:^|[^\d])[-+]?\d+\.\d*(?:[^\d]|$)/.test(String(value || ''))
}

/**
 * 收集一个 ini 中每个变量出现过的比较值、字面量赋值和循环边界。
 *
 * 很多 Mod 没有 `[Key...]` 档位表，而是用 `if $var == 2` 和
 * `if $var < 3` + `$var = $var + 1` 驱动菜单；这些才是实际可取值。
 */
export function collectPersistValueHints(lines: string[]): Map<string, PersistValueHints> {
  const hints = new Map<string, PersistValueHints>()
  const content = stripIniComments(lines.join('\n'))

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const equalityRe = new RegExp(`${VAR_REF}\\s*==\\s*(${NUMBER})`, 'gi')
    let match: RegExpExecArray | null
    while ((match = equalityRe.exec(line))) {
      const name = canonicalVarName(match[1])
      if (name) getHints(hints, name).equalities.push(match[2])
    }

    const boundRe = new RegExp(`${VAR_REF}\\s*(<=|<|>=|>)\\s*(${NUMBER})`, 'gi')
    while ((match = boundRe.exec(line))) {
      const name = canonicalVarName(match[1])
      if (!name) continue
      getHints(hints, name).bounds.push({
        op: match[2] as PersistValueHintBound['op'],
        value: Number(match[3])
      })
    }

    const incrementRe = new RegExp(`${VAR_REF}\\s*(\\+=|-=)\\s*(${NUMBER})`, 'gi')
    while ((match = incrementRe.exec(line))) {
      const name = canonicalVarName(match[1])
      if (!name) continue
      const target = getHints(hints, name)
      target.hasArithmetic = true
      target.cycleSteps.push(Number(match[3]) * (match[2] === '-=' ? -1 : 1))
    }

    const assignM = line.match(new RegExp(`^${VAR_REF}\\s*=\\s*(?!=)(.+)$`, 'i'))
    if (!assignM) continue
    const name = canonicalVarName(assignM[1])
    if (!name) continue

    const target = getHints(hints, name)
    const rhs = assignM[2].trim()
    if (!rhs) continue

    if (LITERAL_LIST.test(rhs)) {
      const values = rhs.split(',').map((item) => item.trim()).filter(Boolean)
      target.literals.push(...values)
      if (values.some(hasDecimalPoint)) target.hasFloat = true
      continue
    }

    target.hasArithmetic = true
    if (hasDecimalPoint(rhs)) target.hasFloat = true

    const selfIncrement = rhs.match(new RegExp(`^${VAR_REF}\\s*([+-])\\s*(${NUMBER})$`, 'i'))
    if (selfIncrement && canonicalVarName(selfIncrement[1]) === name) {
      target.cycleSteps.push(Number(selfIncrement[3]) * (selfIncrement[2] === '-' ? -1 : 1))
    }
  }

  return hints
}

function uniqueNumbers(values: string[]): string[] {
  const entries = values
    .map((value) => ({ raw: String(value).trim(), number: Number(value) }))
    .filter((entry) => entry.raw && Number.isFinite(entry.number))
  entries.sort((a, b) => a.number - b.number)

  const seen = new Set<number>()
  const result: string[] = []
  for (const entry of entries) {
    if (seen.has(entry.number)) continue
    seen.add(entry.number)
    result.push(entry.raw)
  }
  return result
}

function uniquePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const raw = String(value).trim()
    if (!raw || seen.has(raw)) continue
    seen.add(raw)
    result.push(raw)
  }
  return result
}

function isBinaryValues(values: string[]): boolean {
  if (values.length !== 2) return false
  const numbers = values.map(Number).sort((a, b) => a - b)
  return numbers[0] === 0 && numbers[1] === 1
}

function numberBounds(hints: PersistValueHints | undefined): { min?: number; max?: number } {
  if (!hints) return {}
  let min: number | undefined
  let max: number | undefined
  for (const bound of hints.bounds) {
    if (bound.op === '>' || bound.op === '>=') {
      const candidate = bound.op === '>' ? bound.value + 1 : bound.value
      min = min === undefined ? candidate : Math.max(min, candidate)
    } else {
      const candidate = bound.op === '<' ? bound.value - 1 : bound.value
      max = max === undefined ? candidate : Math.min(max, candidate)
    }
  }
  return { min, max }
}

/**
 * 根据显式档位表或 ini 使用痕迹推断 UI 控件。
 *
 * 证据不足时不猜测枚举：默认值不是 0/1 的变量交给数值输入，
 * 避免把坐标、倍率一类连续值错误地画成开关。
 */
export function inferPersistValueOptions(
  explicitAllowed: string[] | undefined,
  defaultValue: string,
  currentValue: string,
  hints?: PersistValueHints
): PersistValueInference {
  const explicit = uniquePreservingOrder(explicitAllowed || [])
  if (explicit.length > 0) {
    if (isBinaryValues(explicit)) {
      return { kind: 'binary', allowedValues: ['0', '1'], source: 'explicit' }
    }
    return { kind: 'enum', allowedValues: explicit, source: 'explicit' }
  }

  const values: string[] = []
  if (hints) values.push(...hints.equalities, ...hints.literals)
  if (isNumericLiteral(defaultValue)) values.push(defaultValue.trim())
  if (isNumericLiteral(currentValue)) values.push(currentValue.trim())

  let candidates = uniqueNumbers(values)
  let source: ModPersistValueSource = hints && candidates.length > 0 ? 'conditions' : 'fallback'

  // `< N` + `$var = $var + 1` 是常见的 0..N 循环；步长不是 1 时不能这样外推
  const ascendingBound = hints?.bounds
    .filter((bound) => bound.op === '<' && Number.isFinite(bound.value) && bound.value > 0)
    .sort((a, b) => a.value - b.value)[0]
  const hasUnitStep = !!hints?.cycleSteps.some((step) => step === 1)
  if (ascendingBound && hasUnitStep && ascendingBound.value <= 20) {
    const max = ascendingBound.value
    if (candidates.some((value) => Number(value) === max - 1)) {
      for (let index = 0; index <= max; index++) candidates.push(String(index))
      candidates = uniqueNumbers(candidates)
      source = 'cycle'
    }
  } else if (
    ascendingBound &&
    hints?.cycleSteps.some((step) => step === 0) &&
    candidates.length <= 1 &&
    ascendingBound.value <= 20
  ) {
    for (let index = 0; index < ascendingBound.value; index++) candidates.push(String(index))
    candidates = uniqueNumbers(candidates)
    source = 'cycle'
  }

  const hasFloat = !!hints?.hasFloat || candidates.some((value) => hasDecimalPoint(value))
  if (hasFloat) {
    return { kind: 'number', step: 0.01, source }
  }

  if (candidates.length >= 2) {
    if (isBinaryValues(candidates)) {
      return { kind: 'binary', allowedValues: ['0', '1'], source }
    }
    if (candidates.length <= 20) {
      return { kind: 'enum', allowedValues: candidates, source }
    }
    const bounds = numberBounds(hints)
    return { kind: 'number', min: bounds.min, max: bounds.max, step: 1, source }
  }

  if (ascendingBound && hasUnitStep && ascendingBound.value > 20) {
    return { kind: 'number', min: 0, max: ascendingBound.value, step: 1, source: 'cycle' }
  }

  if (defaultValue === '0' || defaultValue === '1') {
    return { kind: 'binary', allowedValues: ['0', '1'], source: 'fallback' }
  }

  const bounds = numberBounds(hints)
  return {
    kind: 'number',
    min: bounds.min,
    max: bounds.max,
    step: 1,
    source: hints ? 'conditions' : 'fallback'
  }
}
