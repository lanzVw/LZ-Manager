import React, { useState } from 'react'
import { Monitor, X, Terminal, Power } from 'lucide-react'

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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/45 dark:bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-surface border border-border/80 rounded-2xl shadow-popover w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-150 select-none text-text">
        {/* 头部 */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <Monitor className="w-5 h-5 align-neg-125" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text">关闭窗口</h3>
              <p className="text-xs text-text-muted mt-0.5">请选择点击窗口关闭按钮时的行为</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text p-1.5 rounded-lg hover:bg-surface-2 transition cursor-pointer"
            title="取消并关闭"
          >
            <X className="w-4 h-4 align-neg-125" />
          </button>
        </div>

        {/* 选项列表 */}
        <div className="space-y-3 pt-1">
          {/* 选项 1: 最小化到系统托盘 (默认推荐) */}
          <div
            onClick={() => setSelectedAction('minimize_to_tray')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-150 flex items-center space-x-3 ${
              selectedAction === 'minimize_to_tray'
                ? 'border-primary ring-2 ring-primary/25 bg-primary/[0.04] shadow-cds-sm'
                : 'border-border/80 bg-surface hover:border-primary/40 hover:bg-surface-2/50'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                selectedAction === 'minimize_to_tray' ? 'border-primary' : 'border-border'
              }`}
            >
              {selectedAction === 'minimize_to_tray' && (
                <div className="w-2 h-2 rounded-full bg-primary" />
              )}
            </div>

            <div className="w-9 h-9 rounded-lg bg-teal-500/15 border border-teal-500/25 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Terminal className="w-4 h-4 font-bold" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-text">最小化到系统托盘</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/25">
                  默认推荐
                </span>
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 leading-tight">
                应用将在后台常驻，可通过托盘图标或热键随时唤醒
              </p>
            </div>
          </div>

          {/* 选项 2: 彻底退出程序 */}
          <div
            onClick={() => setSelectedAction('quit')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-150 flex items-center space-x-3 ${
              selectedAction === 'quit'
                ? 'border-primary ring-2 ring-primary/25 bg-primary/[0.04] shadow-cds-sm'
                : 'border-border/80 bg-surface hover:border-primary/40 hover:bg-surface-2/50'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                selectedAction === 'quit' ? 'border-primary' : 'border-border'
              }`}
            >
              {selectedAction === 'quit' && (
                <div className="w-2 h-2 rounded-full bg-primary" />
              )}
            </div>

            <div className="w-9 h-9 rounded-lg bg-rose-500/15 border border-rose-500/25 text-rose-500 flex items-center justify-center shrink-0">
              <Power className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-text">彻底退出程序</span>
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 leading-tight">
                完全关闭所有窗口，退出后台服务与游戏内悬浮窗
              </p>
            </div>
          </div>
        </div>

        {/* 记住选择复选框 */}
        <label className="flex items-center space-x-2 text-xs text-text-muted hover:text-text cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
          />
          <span>记住我的选择，不再提示（可在「系统设置」中修改）</span>
        </label>

        {/* 底部按钮栏 */}
        <div className="border-t border-border/80 pt-3 flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium border border-border/80 hover:bg-surface-2 text-text transition cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedAction, remember)}
            className="px-5 py-1.5 rounded-lg text-xs font-bold bg-[#f43f5e] hover:bg-[#e11d48] text-white shadow-cds-sm active:scale-95 transition cursor-pointer"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
