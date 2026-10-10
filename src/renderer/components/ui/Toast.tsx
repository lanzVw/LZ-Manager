import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react'

export interface ToastItem {
  id: string
  message: string
  description?: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

interface ToastContextType {
  toast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', duration?: number, description?: string) => void
  success: (message: string, description?: string) => void
  error: (message: string, description?: string) => void
  warning: (message: string, description?: string) => void
  info: (message: string, description?: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

// 屏幕上同时保留的最大 Toast 条数，超出后移除最旧的
const MAX_TOASTS = 5

// 无 Provider 时的静默降级实现（模块级常量，引用天然稳定）
const FALLBACK_TOAST_API: ToastContextType = {
  toast: (message: string) => console.log(message),
  success: (message: string) => console.log(message),
  error: (message: string) => console.error(message),
  warning: (message: string) => console.warn(message),
  info: (message: string) => console.log(message)
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  // 自动关闭定时器登记表：手动关闭与卸载时统一 clearTimeout
  const timersRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration = 3000, description?: string) => {
      const id = `${Date.now()}_${Math.random()}`
      // setState 函数式更新：新条目追加，超过上限时移除最旧的，引用天然稳定
      setToasts((prev) => {
        const next = [...prev, { id, message, description, type, duration }]
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next
      })

      if (duration > 0) {
        const timer = window.setTimeout(() => {
          timersRef.current.delete(id)
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }, duration)
        timersRef.current.set(id, timer)
      }
    },
    []
  )

  const success = useCallback((msg: string, desc?: string) => toast(msg, 'success', 3000, desc), [toast])
  const error = useCallback((msg: string, desc?: string) => toast(msg, 'error', 4500, desc), [toast])
  const warning = useCallback((msg: string, desc?: string) => toast(msg, 'warning', 4000, desc), [toast])
  const info = useCallback((msg: string, desc?: string) => toast(msg, 'info', 3000, desc), [toast])

  const contextValue = useMemo(
    () => ({ toast, success, error, warning, info }),
    [toast, success, error, warning, info]
  )

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Toast Container */}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-5 right-5 z-[9999] flex flex-col space-y-2 pointer-events-none max-w-sm w-full select-none"
      >
        {toasts.map((t) => {
          const isSuccess = t.type === 'success'
          const isError = t.type === 'error'
          const isWarning = t.type === 'warning'

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl border shadow-xl backdrop-blur-xl animate-in slide-in-from-bottom-2 fade-in duration-fast ${
                isSuccess
                  ? 'bg-surface/95 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : isError
                  ? 'bg-surface/95 border-danger/40 text-danger'
                  : isWarning
                  ? 'bg-surface/95 border-amber-500/40 text-amber-600 dark:text-amber-400'
                  : 'bg-surface/95 border-primary/30 text-primary'
              }`}
            >
              <div className="flex items-start space-x-2.5 truncate mr-2">
                {isSuccess && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                {isError && <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                {isWarning && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                {!isSuccess && !isError && !isWarning && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
                <div className="flex flex-col truncate">
                  <span className="text-xs font-semibold text-text truncate">{t.message}</span>
                  {t.description && (
                    <span className="text-[11px] text-text-muted truncate mt-0.5">{t.description}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="p-1 rounded-control text-text-muted hover:text-text hover:bg-surface-2 transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return FALLBACK_TOAST_API
  }
  return ctx
}
