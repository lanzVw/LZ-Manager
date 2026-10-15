import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Monitor, X, ArrowDownToLine, Power, Check } from 'lucide-react'

export interface CloseConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  initialAction?: 'quit' | 'minimize_to_tray'
  onConfirm: (action: 'quit' | 'minimize_to_tray', remember: boolean) => void
}

export const CloseConfirmModal: React.FC<CloseConfirmModalProps> = ({
  isOpen,
  onClose,
  initialAction = 'minimize_to_tray',
  onConfirm
}) => {
  const [selectedAction, setSelectedAction] = useState<'quit' | 'minimize_to_tray'>(initialAction)
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSelectedAction(initialAction)
      setRemember(false)
    }
  }, [isOpen, initialAction])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[9999] bg-black/45 dark:bg-black/65 backdrop-blur-[6px] flex items-center justify-center p-4 animate-in fade-in duration-150 no-drag cursor-default"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className="bg-surface border border-border/80 dark:border-white/[0.08] rounded-[20px] shadow-[0_20px_50px_rgba(0,0,0,0.14),0_4px_16px_rgba(0,0,0,0.06)] w-full max-w-[420px] p-6 space-y-5 animate-in zoom-in-95 duration-150 select-none text-text no-drag"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label="关闭窗口确认"
      >
        {/* 头部 */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 shadow-2xs">
              <Monitor className="w-5 h-5 align-neg-125" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text tracking-tight text-balance-native">关闭窗口</h3>
              <p className="text-xs text-text-muted mt-0.5 text-pretty-native">请选择点击窗口关闭按钮时的行为</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text p-1.5 rounded-lg hover:bg-surface-2 transition-all duration-[80ms] ease-[cubic-bezier(.16,1,.3,1)] active:scale-95 cursor-pointer"
            title="取消并关闭"
          >
            <X className="w-4 h-4 align-neg-125" />
          </button>
        </div>

        {/* 选项卡片列表 */}
        <div className="space-y-3">
          {/* 选项 1: 最小化到系统托盘 (推荐) */}
          <button
            type="button"
            onClick={() => setSelectedAction('minimize_to_tray')}
            className={`w-full p-3.5 rounded-xl border cursor-pointer transition-all duration-[120ms] ease-[cubic-bezier(.16,1,.3,1)] flex items-center space-x-3 text-left active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              selectedAction === 'minimize_to_tray'
                ? 'border-primary ring-2 ring-primary/20 bg-primary/[0.035] shadow-cds-sm'
                : 'border-border/70 bg-surface hover:border-primary/40 hover:bg-surface-2/50'
            }`}
          >
            {/* CDS 精致单选指示 */}
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                selectedAction === 'minimize_to_tray' ? 'border-primary bg-primary/10' : 'border-border bg-surface-2'
              }`}
            >
              {selectedAction === 'minimize_to_tray' && (
                <div className="w-2 h-2 rounded-full bg-primary" />
              )}
            </div>

            <div className="w-9 h-9 rounded-lg bg-surface-2 border border-border/80 text-text flex items-center justify-center shrink-0 shadow-2xs">
              <ArrowDownToLine className="w-4 h-4 align-neg-125 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-text">最小化到系统托盘</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary border border-primary/20">
                  推荐
                </span>
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 leading-tight text-pretty-native">
                应用在后台常驻，可通过托盘图标或全局热键随时唤醒
              </p>
            </div>
          </button>

          {/* 选项 2: 彻底退出程序 */}
          <button
            type="button"
            onClick={() => setSelectedAction('quit')}
            className={`w-full p-3.5 rounded-xl border cursor-pointer transition-all duration-[120ms] ease-[cubic-bezier(.16,1,.3,1)] flex items-center space-x-3 text-left active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              selectedAction === 'quit'
                ? 'border-primary ring-2 ring-primary/20 bg-primary/[0.035] shadow-cds-sm'
                : 'border-border/70 bg-surface hover:border-primary/40 hover:bg-surface-2/50'
            }`}
          >
            {/* CDS 精致单选指示 */}
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                selectedAction === 'quit' ? 'border-primary bg-primary/10' : 'border-border bg-surface-2'
              }`}
            >
              {selectedAction === 'quit' && (
                <div className="w-2 h-2 rounded-full bg-primary" />
              )}
            </div>

            <div className="w-9 h-9 rounded-lg bg-surface-2 border border-border/80 text-text flex items-center justify-center shrink-0 shadow-2xs">
              <Power className="w-4 h-4 align-neg-125 text-text-muted" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-text">彻底退出程序</span>
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 leading-tight text-pretty-native">
                完全关闭所有窗口，退出后台服务与游戏内悬浮窗
              </p>
            </div>
          </button>
        </div>

        {/* 记住选择复选框 */}
        <label className="flex items-center space-x-2.5 text-xs text-text-muted hover:text-text cursor-pointer select-none pt-0.5">
          <span
            onClick={() => setRemember((prev) => !prev)}
            className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors ${
              remember
                ? 'bg-primary border-primary text-primary-fg shadow-2xs'
                : 'border-border bg-surface-2 hover:border-primary/50'
            }`}
          >
            {remember && <Check className="w-3 h-3 stroke-[3]" />}
          </span>
          <span className="text-pretty-native" onClick={() => setRemember((prev) => !prev)}>
            记住我的选择，不再提示（可在「系统设置」中修改）
          </span>
        </label>

        {/* 底部按钮栏 */}
        <div className="border-t border-border/80 pt-3.5 flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-lg text-xs font-medium border border-border/80 hover:bg-surface-2 text-text transition-all duration-[80ms] ease-[cubic-bezier(.16,1,.3,1)] active:scale-[0.96] cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedAction, remember)}
            className="h-8 px-5 rounded-lg text-xs font-semibold bg-primary hover:brightness-105 active:brightness-95 text-primary-fg shadow-cds-sm transition-all duration-[80ms] ease-[cubic-bezier(.16,1,.3,1)] active:scale-[0.96] cursor-pointer"
          >
            确定
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
