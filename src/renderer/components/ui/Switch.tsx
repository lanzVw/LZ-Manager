import React from 'react'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
  className?: string
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  className = ''
}) => {
  return (
    <label
      className={`inline-flex items-center gap-3 cursor-pointer select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div
          className={`w-9 h-5 rounded-full transition-colors duration-fast border ${
            checked
              ? 'bg-primary border-primary'
              : 'bg-surface-2 border-border'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ease-[cubic-bezier(0.2,0.85,0.32,1.2)] shadow-cds-sm ${
              checked ? 'translate-x-4' : 'translate-x-0.5'
            } mt-[1px]`}
          />
        </div>
      </div>
      {(label || description) && (
        <div className="flex flex-col">
          {label && <span className="text-xs font-medium text-text">{label}</span>}
          {description && (
            <span className="text-[11px] text-text-muted">{description}</span>
          )}
        </div>
      )}
    </label>
  )
}
