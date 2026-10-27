import React, { useEffect, useRef } from 'react'
import { X, AlertTriangle, Info } from 'lucide-react'
import { Button } from './Button'

// 容器内可聚焦元素选择器（排除禁用与显式 tabindex=-1 的元素）
const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  variant?: 'default' | 'danger' | 'warning' | 'info'
  confirmText?: string
  cancelText?: string
  onConfirm?: () => void
  loading?: boolean
  maxWidth?: string
  className?: string
  /* 页脚左侧的次要动作插槽；不传时页脚布局与原先完全一致 */
  footerStart?: React.ReactNode
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  variant = 'default',
  confirmText,
  cancelText = '取消',
  onConfirm,
  loading = false,
  maxWidth = 'max-w-md',
  className,
  footerStart
}) => {
  const contentRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  // 打开时锁定页面滚动、记录并转移焦点；关闭时恢复滚动与焦点
  useEffect(() => {
    if (!isOpen) return
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    contentRef.current?.focus()
    return () => {
      document.body.style.overflow = ''
      previouslyFocusedRef.current?.focus()
    }
  }, [isOpen])

  // ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, loading, onClose])

  if (!isOpen) return null

  const handleOverlayClick = () => {
    if (loading) return
    onClose()
  }

  const handleCloseRequest = () => {
    if (loading) return
    onClose()
  }

  // Tab 焦点陷阱：在内容容器内首尾循环
  const handleTabTrap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !contentRef.current) return
    const container = contentRef.current
    const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    if (focusables.length === 0) {
      e.preventDefault()
      container.focus()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (e.shiftKey) {
      if (active === first || active === container) {
        e.preventDefault()
        last.focus()
      }
    } else if (active === last || active === container) {
      e.preventDefault()
      first.focus()
    }
  }

  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return <AlertTriangle className="w-5 h-5 text-danger shrink-0 align-neg-125" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 align-neg-125" />
      case 'info':
        return <Info className="w-5 h-5 text-primary shrink-0 align-neg-125" />
      default:
        return null
    }
  }

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 dark:bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleTabTrap}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={`bg-surface border border-border/80 rounded-2xl shadow-popover w-full ${maxWidth} p-6 space-y-4 animate-in zoom-in-95 duration-150 text-text select-none outline-none ${className || ''}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center space-x-2.5">
            {getIcon()}
            {title && <h3 className="text-sm font-bold text-text text-balance-native">{title}</h3>}
          </div>
          <button
            type="button"
            onClick={handleCloseRequest}
            disabled={loading}
            aria-label="关闭"
            className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-all duration-[80ms] ease-[cubic-bezier(.16,1,.3,1)] active:scale-[0.96] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
          >
            <X className="w-4 h-4 shrink-0 align-neg-125" />
          </button>
        </div>

        {/* Content */}
        {description && (
          <p className="text-xs text-text-muted leading-relaxed text-pretty-native whitespace-pre-wrap">
            {description}
          </p>
        )}
        {children}

        {/* Footer */}
        {(onConfirm || cancelText || footerStart) && (
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/80">
            <div className="min-w-0">{footerStart}</div>
            <div className="flex items-center space-x-2 shrink-0">
              {cancelText && (
                <Button variant="secondary" size="sm" onClick={handleCloseRequest} disabled={loading}>
                  {cancelText}
                </Button>
              )}
              {onConfirm && (
                <Button
                  variant={variant === 'danger' ? 'danger' : 'primary'}
                  size="sm"
                  onClick={onConfirm}
                  loading={loading}
                >
                  {confirmText || '确定'}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
