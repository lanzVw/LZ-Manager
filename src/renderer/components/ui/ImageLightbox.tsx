import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeToClose } from '../../hooks/useEscape'

export interface ImageLightboxProps {
  isOpen: boolean
  src: string
  alt?: string
  onClose: () => void
}

/**
 * 全屏原图灯箱。
 *
 * 必须 portal 到 body：调用方的抽屉遮罩带 backdrop-blur、面板带 transform 动画，
 * 二者都会为 position: fixed 后代建立包含块，留在抽屉里只能盖住抽屉而非整个视口。
 * 也正因 portal 事件仍按 React 树冒泡，调用点要把它渲染在抽屉 onClick 遮罩之外。
 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  isOpen,
  src,
  alt = '原图预览',
  onClose
}) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEscapeToClose(isOpen, onClose)

  // 打开时把焦点移进灯箱、关闭时还原，避免焦点停在背后的抽屉里
  useEffect(() => {
    if (!isOpen) return
    setStatus('loading')
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    containerRef.current?.focus()
    return () => {
      previouslyFocusedRef.current?.focus()
    }
  }, [isOpen, src])

  if (!isOpen || !src) return null

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="原图预览"
      tabIndex={-1}
      onClick={(e) => {
        // 兜底：即使将来有人把它嵌回抽屉的 React 子树，点击也不会连带关闭抽屉
        e.stopPropagation()
        onClose()
      }}
      onKeyDown={(e) => {
        // 灯箱内没有可聚焦子元素，Tab 保持在容器上，防止焦点跑到背后的抽屉
        if (e.key === 'Tab') e.preventDefault()
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 select-none cursor-zoom-out outline-none animate-in fade-in duration-150"
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin shadow-xs" />
        </div>
      )}
      {status === 'error' ? (
        <div className="text-xs text-white/80 font-mono tracking-wider pointer-events-none">
          原图加载失败，点击任意处关闭
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          // pointer-events-none 让点击始终落到遮罩层，点图片本身也能关闭
          className={`max-w-full max-h-full w-auto h-auto object-contain pointer-events-none transition-opacity duration-150 ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>,
    document.body
  )
}
