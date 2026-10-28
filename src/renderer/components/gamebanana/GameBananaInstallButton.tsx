import React from 'react'
import { Check, Download, RefreshCw, RotateCcw } from 'lucide-react'

export type GameBananaInstallButtonState = 'idle' | 'installing' | 'installed'

export interface GameBananaInstallButtonProps {
  state: GameBananaInstallButtonState
  percent?: number
  disabled?: boolean
  onClick: () => void
}

const clampPercent = (value?: number) =>
  Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? (value as number) : 0)))

/**
 * 文件行右侧的统一安装控件：
 * - idle 是列表里唯一的实心主按钮；
 * - installed 收敛为浅表面状态按钮，悬浮才提示可重新安装；
 * - installing 保持主色不降透明度，避免把「正在执行」误读成「不可用」。
 */
export const GameBananaInstallButton: React.FC<GameBananaInstallButtonProps> = ({
  state,
  percent,
  disabled = false,
  onClick
}) => {
  const isInstalling = state === 'installing'
  const isInstalled = state === 'installed'

  const baseClasses =
    'inline-flex h-8 min-w-[92px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-xs font-semibold select-none transition-all duration-[80ms] ease-[cubic-bezier(.16,1,.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

  const toneClasses = isInstalled
    ? 'group border border-border/80 bg-surface text-text-muted shadow-cds-sm hover:border-primary/40 hover:text-text active:scale-[0.96]'
    : 'bg-primary text-primary-fg shadow-cds-sm hover:brightness-105 active:scale-[0.96]'

  // installing 的 disabled 是流程状态，不是「不可用」，不能套 disabled:opacity-40
  const interactionClasses = isInstalling
    ? 'cursor-wait'
    : disabled
      ? 'cursor-not-allowed opacity-40'
      : 'cursor-pointer'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isInstalling}
      aria-busy={isInstalling || undefined}
      aria-label={isInstalled ? '已安装，点击重新安装' : undefined}
      title={isInstalled && !disabled ? '点击重新安装' : undefined}
      className={`${baseClasses} ${toneClasses} ${interactionClasses}`}
    >
      {isInstalling ? (
        <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : isInstalled ? (
        <span className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center align-neg-125">
          <Check className="absolute h-3.5 w-3.5 text-success transition-opacity duration-[80ms] group-hover:opacity-0 group-focus-visible:opacity-0" />
          <RotateCcw className="absolute h-3.5 w-3.5 opacity-0 transition-opacity duration-[80ms] group-hover:opacity-100 group-focus-visible:opacity-100" />
        </span>
      ) : (
        <Download className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className={isInstalling ? 'tabular-nums-strict' : undefined}>
        {isInstalling ? `安装中 ${clampPercent(percent)}%` : isInstalled ? '已安装' : '安装'}
      </span>
    </button>
  )
}
