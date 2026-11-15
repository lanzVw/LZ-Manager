import React, { useEffect, useState } from 'react'
import { ToggleLeft, ToggleRight } from 'lucide-react'
import type { ModPersistVariable, ModPersistValueKind } from '../../core/types'
import { Input } from './ui/Input'
import { Select } from './ui/Select'

export interface PersistValueControlProps {
  variable: ModPersistVariable
  disabled?: boolean
  compact?: boolean
  onChange: (value: string) => void
}

const NUMERIC_VALUE = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?(?:\s*,\s*[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)*$/

function resolveKind(variable: ModPersistVariable, allowed: string[]): ModPersistValueKind {
  if (variable.inputKind) return variable.inputKind
  if (allowed.length === 2 && allowed.includes('0') && allowed.includes('1')) return 'binary'
  if (allowed.length > 1) return 'enum'
  return 'number'
}

function valueLabel(variable: ModPersistVariable, value: string, allowedCount: number): string {
  const numericKey = Number.isFinite(Number(value)) ? String(Number(value)) : value
  const custom = variable.valueLabels?.[value] || variable.valueLabels?.[numericKey]
  if (custom) return custom
  if (allowedCount === 2 && value === '0') return '关'
  if (allowedCount === 2 && value === '1') return '开'
  return value
}

export const PersistValueControl: React.FC<PersistValueControlProps> = ({
  variable,
  disabled = false,
  compact = false,
  onChange
}) => {
  const allowed = variable.allowedValues?.filter(Boolean) || []
  const kind = resolveKind(variable, allowed)
  const [draft, setDraft] = useState(variable.currentValue)

  useEffect(() => {
    setDraft(variable.currentValue)
  }, [variable.currentValue, variable.name, variable.namespace])

  if (!variable.supported) {
    return (
      <span className="text-[10px] text-amber-500">
        不可调节：{variable.supportError || '无法解析 namespace'}
      </span>
    )
  }

  if (kind === 'binary') {
    const isOn = variable.currentValue === '1'
    if (compact) {
      return (
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-label={isOn ? '关闭' : '开启'}
          title={isOn ? '关闭' : '开启'}
          onClick={() => onChange(isOn ? '0' : '1')}
          disabled={disabled}
          className={`qaq-switch scale-90 origin-right disabled:opacity-50 disabled:cursor-wait ${isOn ? 'active' : ''}`}
        />
      )
    }

    return (
      <button
        type="button"
        onClick={() => onChange(isOn ? '0' : '1')}
        disabled={disabled}
        className={`flex items-center space-x-1.5 rounded-full font-semibold border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait px-3 py-1.5 text-xs ${
          isOn
            ? 'bg-primary text-primary-fg border-primary shadow-xs'
            : 'bg-surface text-text border-border hover:bg-surface-2'
        }`}
      >
        {isOn ? (
          <ToggleRight className="w-4 h-4" />
        ) : (
          <ToggleLeft className="w-4 h-4 text-text-muted" />
        )}
        <span>{isOn ? '已开启 (1)' : '已关闭 (0)'}</span>
      </button>
    )
  }

  if (kind === 'enum' && allowed.length > 0) {
    if (!compact && allowed.length > 8) {
      return (
        <Select
          value={allowed.includes(variable.currentValue) ? variable.currentValue : allowed[0]}
          onChange={(value) => onChange(String(value))}
          options={allowed.map((value) => ({
            value,
            label: `${valueLabel(variable, value, allowed.length)} (${value})`
          }))}
          disabled={disabled}
          size="sm"
          className="w-36"
        />
      )
    }

    if (compact && allowed.length <= 6) {
      const activeIndex = allowed.indexOf(variable.currentValue)
      return (
        <div
          role="radiogroup"
          aria-label={variable.alias || variable.name}
          className="relative inline-grid h-[22px] p-[2px] rounded-full bg-surface-2/90 border border-border/80 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)] select-none"
          style={{
            gridTemplateColumns: `repeat(${allowed.length}, minmax(30px, 1fr))`
          }}
        >
          {activeIndex >= 0 && (
            <div
              className="absolute top-[2px] bottom-[2px] rounded-full bg-primary border border-primary/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_1px_3px_rgba(15,23,42,0.18)] transition-all duration-150 ease-[cubic-bezier(.32,.72,0,1)] pointer-events-none"
              style={{
                left: `calc(2px + ${activeIndex} * (100% - 4px) / ${allowed.length})`,
                width: `calc((100% - 4px) / ${allowed.length})`
              }}
            />
          )}

          {allowed.map((value) => {
            const current = variable.currentValue === value
            const label = valueLabel(variable, value, allowed.length)
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={current}
                onClick={() => onChange(value)}
                disabled={disabled}
                title={`${label} (${value})`}
                className={`relative z-10 h-full min-w-0 px-1.5 rounded-full text-[10px] leading-none tabular-nums-strict whitespace-nowrap transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:opacity-50 disabled:cursor-wait ${
                  current
                    ? 'text-primary-fg font-bold'
                    : 'text-text-muted font-semibold hover:text-text'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )
    }

    return (
      <div className={`flex items-center gap-1 flex-wrap ${compact ? 'justify-end' : ''}`}>
        {allowed.map((value) => {
          const current = variable.currentValue === value
          const label = valueLabel(variable, value, allowed.length)
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(value)}
              disabled={disabled}
              className={`rounded-full font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
                compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
              } ${
                current
                  ? 'bg-primary text-primary-fg border-primary shadow-xs'
                  : 'bg-surface text-text border-border hover:text-primary hover:border-primary/40'
              }`}
            >
              {compact ? label : `${label} (${value})`}
            </button>
          )
        })}
      </div>
    )
  }

  const trimmed = draft.trim()
  const valid = NUMERIC_VALUE.test(trimmed)
  const canApply = !disabled && valid && trimmed !== variable.currentValue
  const apply = () => {
    if (canApply) onChange(trimmed)
  }

  return (
    <div className={`flex items-center gap-1.5 ${compact ? 'justify-end' : ''}`}>
      <Input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') apply()
        }}
        disabled={disabled}
        placeholder={variable.defaultValue}
        title={variable.min !== undefined || variable.max !== undefined
          ? `范围：${variable.min ?? '不限'} ~ ${variable.max ?? '不限'}`
          : undefined}
        containerClassName={compact ? 'w-20' : 'w-28'}
      />
      <button
        type="button"
        onClick={apply}
        disabled={!canApply}
        className={`rounded-full font-semibold border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
          compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
        } ${
          canApply
            ? 'bg-primary text-primary-fg border-primary'
            : 'bg-surface text-text-muted border-border'
        }`}
      >
        应用
      </button>
    </div>
  )
}
