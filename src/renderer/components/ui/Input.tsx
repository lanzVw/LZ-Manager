import React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  prefixIcon?: React.ReactNode
  suffixIcon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ prefixIcon, suffixIcon, className = '', ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if ((e.nativeEvent as any)?.isComposing || e.keyCode === 229) return
      props.onKeyDown?.(e)
    }

    return (
      <div className="relative flex items-center w-full">
        {prefixIcon && (
          <div className="absolute left-3 text-text-muted pointer-events-none flex items-center justify-center align-neg-125 shrink-0">
            {prefixIcon}
          </div>
        )}
        <input
          ref={ref}
          className={`w-full bg-surface-2 border border-border focus:border-primary/80 focus:ring-2 focus:ring-primary/20 shadow-cds-sm text-text placeholder:text-text-muted text-xs rounded-control transition-colors duration-fast focus:outline-none ${
            prefixIcon ? 'pl-9' : 'pl-3'
          } ${suffixIcon ? 'pr-9' : 'pr-3'} py-2 ${className}`}
          {...props}
          onKeyDown={handleKeyDown}
        />
        {suffixIcon && (
          <div className="absolute right-3 text-text-muted flex items-center justify-center align-neg-125 shrink-0">
            {suffixIcon}
          </div>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
