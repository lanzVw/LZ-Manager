import React from 'react'
import { AlertTriangle } from 'lucide-react'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * 全局渲染层兜底错误边界：
 * - 渲染期抛错时展示错误信息并提供「重载界面」入口，避免整个窗口白屏
 * - 覆盖 App / OverlayApp 的顶层渲染树
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught renderer error:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-surface/95 backdrop-blur-xl p-6 select-none">
        <div className="w-full max-w-md bg-surface border border-danger/40 rounded-card shadow-2xl p-6 space-y-4 text-text">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-control bg-danger/10 text-danger border border-danger/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text">界面运行异常</h2>
              <p className="text-[11px] text-text-muted mt-0.5">
                渲染层出现未捕获错误，可尝试重新加载界面
              </p>
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto p-3 rounded-control bg-surface-2 border border-border/60 font-mono text-[11px] text-danger break-all whitespace-pre-wrap scrollbar-thin">
            {error.message || String(error)}
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="w-full flex items-center justify-center px-4 py-2 rounded-control bg-primary text-primary-fg text-xs font-semibold shadow-sm border border-transparent transition-all duration-fast active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            重载界面
          </button>
        </div>
      </div>
    )
  }
}
