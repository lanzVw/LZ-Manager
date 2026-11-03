import React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  prefixIcon?: React.ReactNode
  suffixIcon?: React.ReactNode
  /** ghost：无边框透明底，聚焦环交给外层 composer 统一绘制 */
  variant?: 'default' | 'ghost'
  containerClassName?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ prefixIcon, suffixIcon, variant = 'default', containerClassName = '', className = '', ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if ((e.nativeEvent as any)?.isComposing || e.keyCode === 229) return
      props.onKeyDown?.(e)
    }

    const isGhost = variant === 'ghost'
    const variantClasses = isGhost
      ? 'bg-transparent border-0 shadow-none rounded-none py-0 focus:ring-0 focus:outline-none'
      : 'bg-surface-2 border border-border focus:border-primary/80 focus:ring-2 focus:ring-primary/20 shadow-cds-sm rounded-control py-2 focus:outline-none'
    const prefixIconClass = isGhost ? 'left-2' : 'left-3'
    const suffixIconClass = isGhost ? 'right-2' : 'right-3'

    return (
      <div className={`relative flex items-center w-full ${containerClassName}`}>
        {prefixIcon && (
          <div
            className={`absolute ${prefixIconClass} text-text-muted pointer-events-none flex items-center justify-center align-neg-125 shrink-0`}
          >
            {prefixIcon}
          </div>
        )}
        <input
          ref={ref}
          className={`w-full text-text placeholder:text-text-muted text-xs transition-colors duration-fast ${
            isGhost ? (prefixIcon ? 'pl-8' : 'pl-0') : prefixIcon ? 'pl-9' : 'pl-3'
          } ${isGhost ? (suffixIcon ? 'pr-8' : 'pr-0') : suffixIcon ? 'pr-9' : 'pr-3'} ${variantClasses} ${className}`}
          {...props}
          onKeyDown={handleKeyDown}
        />
        {suffixIcon && (
          <div
            className={`absolute ${suffixIconClass} text-text-muted flex items-center justify-center align-neg-125 shrink-0`}
          >
            {suffixIcon}
          </div>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
