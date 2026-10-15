import React from 'react'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface MessageBubbleProps {
  /** 消息角色：user (用户) | assistant (助手) | system (系统通知) */
  role: MessageRole
  /** 消息主体内容（字符串或节点） */
  content?: React.ReactNode
  /** 自定义子元素渲染（替代 content） */
  children?: React.ReactNode
  /** 发送者头像或图标插槽 */
  avatar?: React.ReactNode
  /** 时间戳或元信息展示 */
  timestamp?: React.ReactNode
  /** 底部操作栏（如复制、重新生成、编辑等） */
  actions?: React.ReactNode
  /** 自定义容器类名 */
  className?: string
}

/**
 * CDS 气泡入场物理与光学排版规范组件
 *
 * 核心规范：
 * 1. 用户气泡：animate-[code-user-bubble-enter_200ms_cubic-bezier(.34,1.3,.64,1)] 入场物理动效，
 *    Surface 2 底色与非对称优雅圆角（rounded-[18px] rounded-br-[4px]）
 * 2. 助手消息：animate-[message-fade-up_250ms_ease-out] 阶梯浮现动效，
 *    排版挂载 text-pretty-native 与 overflow-wrap-safe，确保无文本溢出且换行自然
 * 3. 系统消息：居中悬浮胶囊样式，用于提示、断开、状态通知等
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  role,
  content,
  children,
  avatar,
  timestamp,
  actions,
  className = ''
}) => {
  const displayContent = children ?? content

  if (role === 'system') {
    return (
      <div className={`flex justify-center w-full my-2.5 select-none ${className}`}>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-text-muted bg-surface-1 border border-border/60">
          {avatar && <span className="shrink-0 align-neg-125">{avatar}</span>}
          <span>{displayContent}</span>
          {timestamp && (
            <span className="text-[10px] text-text-muted/70 tabular-nums-strict ml-1">
              {timestamp}
            </span>
          )}
        </div>
      </div>
    )
  }

  if (role === 'user') {
    return (
      <div className={`flex justify-end w-full my-2 ${className}`}>
        <div className="flex flex-col items-end max-w-[85%] group">
          <div className="animate-[code-user-bubble-enter_200ms_cubic-bezier(.34,1.3,.64,1)] rounded-[18px] rounded-br-[4px] bg-surface-2 text-text px-4 py-2.5 text-sm shadow-cds-sm border border-border/50 text-pretty-native overflow-wrap-safe">
            {displayContent}
          </div>

          {(timestamp || actions) && (
            <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-text-muted/70 select-none">
              {timestamp && <span className="tabular-nums-strict">{timestamp}</span>}
              {actions && <div className="flex items-center gap-1">{actions}</div>}
            </div>
          )}
        </div>
      </div>
    )
  }

  // assistant 助手消息
  return (
    <div className={`flex w-full my-3 ${className}`}>
      <div className="flex flex-col w-full animate-[message-fade-up_250ms_ease-out]">
        <div className="flex items-center gap-2 mb-1.5 select-none">
          {avatar && <span className="shrink-0 align-neg-125">{avatar}</span>}
          {timestamp && (
            <span className="text-[11px] text-text-muted tabular-nums-strict">
              {timestamp}
            </span>
          )}
        </div>

        <div className="text-sm text-text leading-relaxed text-pretty-native overflow-wrap-safe">
          {displayContent}
        </div>

        {actions && (
          <div className="flex items-center gap-1.5 mt-2.5 text-text-muted">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
