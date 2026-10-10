import { useEffect, useRef } from 'react'

/**
 * 弹出层 Escape 关闭 hook：
 * - isOpen 为真时在 window 上注册 keydown，按下 Escape 触发 onClose
 * - isOpen 变为否或组件卸载时移除监听，避免内存泄漏
 * - 通过 ref 跟踪最新 onClose，注册一次监听也不需要依赖回调身份
 */
export function useEscapeToClose(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])
}
