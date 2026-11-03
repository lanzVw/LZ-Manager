import React, { useRef } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from './Input'
import { Select } from './Select'

export interface SearchScopeOption {
  value: string
  label: React.ReactNode
  icon?: React.ReactNode
}

export interface SearchScopeControl {
  value: string
  onChange: (value: string) => void
  options: SearchScopeOption[]
  className?: string
  popupClassName?: string
  title?: string
}

export interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  /** Enter 提交（非 IME 合成态） */
  onSubmit?: (value: string) => void
  /** 点击 × 或按 Escape 清空后触发，供父层同步冲刷防抖 */
  onClear?: () => void
  placeholder?: string
  appearance?: 'composer' | 'subtle'
  /** 传入即渲染作用域选择器；不传为纯搜索框 */
  scope?: SearchScopeControl
  loading?: boolean
  disabled?: boolean
  className?: string
  autoFocus?: boolean
  'aria-label'?: string
}

const isComposing = (e: React.KeyboardEvent): boolean =>
  Boolean((e.nativeEvent as any)?.isComposing) || e.keyCode === 229

export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder = '搜索...',
  appearance = 'composer',
  scope,
  loading = false,
  disabled = false,
  className = '',
  autoFocus = false,
  'aria-label': ariaLabel
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const isComposer = appearance === 'composer'

  const clear = () => {
    onChange('')
    onClear?.()
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(e)) return
    if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit?.(value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (value) clear()
      else inputRef.current?.blur()
    }
  }

  const shellClasses = isComposer
    ? 'h-[34px] bg-surface border-border/60 shadow-cds-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15'
    : 'h-8 bg-surface-2/60 border-border/60 hover:bg-surface-2 focus-within:border-primary/40 focus-within:bg-surface-2 focus-within:ring-1 focus-within:ring-primary/15'

  return (
    <div
      role="search"
      aria-label={ariaLabel}
      className={`group flex items-center gap-1.5 rounded-control border pl-2 pr-1.5 transition-colors duration-fast ${shellClasses} ${className}`}
    >
      {scope && (
        <>
          <Select
            value={scope.value}
            onChange={scope.onChange}
            options={scope.options}
            size="sm"
            variant="ghost"
            title={scope.title}
            className={`shrink-0 ${scope.className ?? 'w-20'}`}
            popupClassName={scope.popupClassName ?? 'w-28'}
          />
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border/70" />
        </>
      )}

      <Search
        className={`shrink-0 text-text-muted ${isComposer ? 'w-4 h-4' : 'w-3.5 h-3.5'}`}
        aria-hidden="true"
      />

      <div className="h-full min-w-0 flex-1">
        <Input
          ref={inputRef}
          variant="ghost"
          containerClassName="h-full"
          className="h-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
        />
      </div>

      {loading && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin"
        />
      )}

      {value && !disabled && (
        <button
          type="button"
          aria-label="清空搜索"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
          className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-2 transition-colors duration-fast cursor-pointer animate-in fade-in zoom-in-95"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
