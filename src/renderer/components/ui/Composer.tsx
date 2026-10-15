import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { ArrowUp } from 'lucide-react'

export interface ComposerProps {
  /** 当前输入内容 */
  value: string
  /** 文本变化回调 */
  onChange: (value: string) => void
  /** 发送提交回调 */
  onSend: (value: string) => void
  /** 是否禁用 */
  disabled?: boolean
  /** 是否正在提交/加载中 */
  loading?: boolean
  /** 占位提示文案 */
  placeholder?: string
  /** 最小行数（默认 1） */
  minRows?: number
  /** 最大展示行数（默认 8） */
  maxRows?: number
  /** 左侧辅助操作插槽（如文件上传、模型切换、清理会话等） */
  actionsLeft?: React.ReactNode
  /** 右侧自定义操作区域（若不传则显示默认 CDS 圆形发送按钮） */
  actionsRight?: React.ReactNode
  /** 用户键盘或输入事件触发时的钩子（用于更新图钉冷却时间戳） */
  onUserInput?: () => void
  /** 容器自定义类名 */
  className?: string
  /** 自定义键盘按键扩展监听 */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  /** 是否自动聚焦 */
  autoFocus?: boolean
}

/**
 * CJK IME 拼音/输入法合成双重互锁守卫处理函数
 * 拦截选词时的回车确认，仅在真正提交时执行 onSend
 */
export function handleComposerKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  disabled: boolean,
  onSend: (value: string) => void
): boolean {
  const isComposing = (e.nativeEvent as any)?.isComposing || e.keyCode === 229
  if (isComposing) return false

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (value.trim() && !disabled) {
      onSend(value)
      return true
    }
  }
  return false
}

/**
 * CDS Recipe 1 Claude 签名 20px 核心输入终端组件
 *
 * 核心设计：
 * 1. 严格对齐 20px 固定圆角（rounded-[20px]）
 * 2. 微弥散双环阴影：静止态与聚焦态自动平滑过渡
 * 3. CJK IME 合成双重互锁守卫：彻底防止中文输入法候选词回车误触发送
 * 4. 纯净无边框自适应弹性高度 Textarea
 * 5. 左侧工具插槽与右侧经典实心主色发送按钮（图标严格垂直光学居中）
 */
export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(
  (
    {
      value,
      onChange,
      onSend,
      disabled = false,
      loading = false,
      placeholder = '输入消息...（Enter 发送，Shift + Enter 换行）',
      minRows = 1,
      maxRows = 8,
      actionsLeft,
      actionsRight,
      onUserInput,
      className = '',
      onKeyDown: externalKeyDown,
      autoFocus = false
    },
    ref
  ) => {
    const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null)
    const [isFocused, setIsFocused] = useState(false)

    useImperativeHandle(ref, () => internalTextareaRef.current as HTMLTextAreaElement)

    // 自适应高度调整
    useEffect(() => {
      const textarea = internalTextareaRef.current
      if (!textarea) return
      textarea.style.height = 'auto'
      const scrollHeight = textarea.scrollHeight
      const lineHeight = 22
      const maxHeight = maxRows * lineHeight + 24
      const minHeight = minRows * lineHeight + 24
      const calculatedHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight))
      textarea.style.height = `${calculatedHeight}px`
    }, [value, minRows, maxRows])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      onUserInput?.()
      const handled = handleComposerKeyDown(e, value, disabled || loading, onSend)
      if (!handled) {
        externalKeyDown?.(e)
      }
    }

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
      onUserInput?.()
    }

    const handleSendClick = () => {
      if (value.trim() && !disabled && !loading) {
        onSend(value)
      }
    }

    return (
      <div
        className={`cds-composer-shadow group relative flex flex-col rounded-[20px] bg-surface transition-shadow duration-150 border border-border/60 ${className}`}
        style={{
          boxShadow: isFocused
            ? '0 0.25rem 1.25rem rgba(0,0,0,0.075), inset 0 0 0 1px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.16)'
            : '0 0.25rem 1.25rem rgba(0,0,0,0.035), inset 0 0 0 1px rgba(0,0,0,0.08)'
        }}
      >
        {/* 自适应无边框文本框 */}
        <textarea
          ref={internalTextareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          rows={minRows}
          className="w-full resize-none border-0 bg-transparent px-4 pt-3.5 pb-2 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-0 overflow-y-auto"
        />

        {/* 底部工具条与发送动作 */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {actionsLeft}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {actionsRight || (
              <button
                type="button"
                disabled={disabled || !value.trim() || loading}
                onClick={handleSendClick}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-primary text-primary-fg hover:brightness-105 active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed transition-all duration-150 shrink-0 select-none shadow-cds-sm cursor-pointer"
                aria-label="发送消息"
              >
                {loading ? (
                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0 align-neg-125" />
                ) : (
                  <ArrowUp className="w-4 h-4 align-neg-125 stroke-[2.5]" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
)

Composer.displayName = 'Composer'
