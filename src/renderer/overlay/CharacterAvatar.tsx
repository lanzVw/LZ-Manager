import React, { useMemo, useState } from 'react'
import { toFileUrl } from '../utils/fileUrl'

export interface CharacterAvatarProps {
  name: string
  src?: string
  size?: 'sm' | 'lg'
  selected?: boolean
  enabledCount?: number
  totalCount?: number
  eager?: boolean
  className?: string
}

/**
 * 角色头像的统一展示层：轨道用 sm，角色全览用 lg。
 * 头像路径可能包含中文、空格或 #，必须走 toFileUrl，不能直接拼 file://。
 */
export const CharacterAvatar: React.FC<CharacterAvatarProps> = ({
  name,
  src,
  size = 'sm',
  selected = false,
  enabledCount = 0,
  totalCount = 0,
  eager = false,
  className = ''
}) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imageSrc = useMemo(() => (src ? toFileUrl(src) : ''), [src])
  const failed = Boolean(imageSrc) && failedSrc === imageSrc
  const initial = Array.from(name.trim())[0] || '?'

  const sizeClass =
    size === 'lg'
      ? 'w-14 h-14'
      : 'w-10 h-10 max-[420px]:w-8 max-[420px]:h-8'
  const frameRadius = size === 'lg' ? 'rounded-[18px]' : 'rounded-[14px] max-[420px]:rounded-[11px]'
  const imageRadius = size === 'lg' ? 'rounded-[16px]' : 'rounded-[12px] max-[420px]:rounded-[9px]'
  const badgeClass =
    size === 'lg'
      ? 'h-4 min-w-[18px] px-1 text-[9px]'
      : 'h-3 min-w-[16px] px-1 text-[8px] max-[420px]:h-2.5 max-[420px]:min-w-[14px] max-[420px]:text-[7px]'

  return (
    <div className={`relative shrink-0 ${sizeClass} ${className}`} aria-hidden="true">
      <div
        className={`w-full h-full p-[2px] transition-colors duration-150 ${frameRadius} ${
          selected ? 'bg-primary shadow-cds-sm' : 'bg-border/50'
        }`}
      >
        <div className={`w-full h-full overflow-hidden relative ${imageRadius} bg-surface-2`}>
          {imageSrc && !failed ? (
            <img
              src={imageSrc}
              alt=""
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
              onError={() => setFailedSrc(imageSrc)}
              className="w-full h-full object-cover object-top select-none pointer-events-none"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--primary) 16%, var(--surface-2)), color-mix(in srgb, var(--primary) 5%, var(--surface)))'
              }}
            >
              <span
                className={`font-title font-bold ${size === 'lg' ? 'text-lg' : 'text-sm max-[420px]:text-xs'} ${
                  selected ? 'text-primary' : 'text-text-muted'
                }`}
              >
                {initial}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent pointer-events-none" />
        </div>
      </div>

      {totalCount > 0 && (
        <span
          className={`absolute -right-1 -bottom-1 z-10 rounded-full border border-surface bg-surface/95 shadow-2xs font-mono font-bold leading-none flex items-center justify-center tabular-nums-strict ${badgeClass} ${
            enabledCount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-text-muted'
          }`}
        >
          {enabledCount}/{totalCount}
        </span>
      )}
    </div>
  )
}
