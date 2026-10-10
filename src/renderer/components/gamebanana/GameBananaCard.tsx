import React from 'react'
import { ThumbsUp, User, Download, RefreshCw } from 'lucide-react'

interface GameBananaCardProps {
  mod: any
  previewUrl: string
  isInstalling: boolean
  onOpenDetail: (mod: any) => void
  onCardInstallClick: (mod: any, e: React.MouseEvent) => void
  onSearchByAuthor: (authorName: string, e?: React.MouseEvent) => void
}

/**
 * GameBanana 市场卡片
 * - 根元素由 div+onClick 改为 <button type="button">：Tab 可聚焦，Enter/Space 打开详情（键盘可达）
 * - 以 React.memo 包裹：兄弟卡片进入安装态导致进度浮条高频刷新时，避免整批卡片重渲染
 * - 卡片内“按作者筛选 / 一键装载”均 stopPropagation，避免冒泡误触详情打开
 */
const GameBananaCardBase: React.FC<GameBananaCardProps> = ({
  mod,
  previewUrl,
  isInstalling,
  onOpenDetail,
  onCardInstallClick,
  onSearchByAuthor
}) => {
  const authorName = mod.submitter?.name || mod.author || '社区作者'
  const likes = mod.stats?.likes ?? mod.likesCount ?? 0
  const categoryTitle = typeof mod.category === 'object' ? mod.category?.name : mod.category

  return (
    <button
      type="button"
      onClick={() => onOpenDetail(mod)}
      className="bg-surface rounded-card border transition-all duration-fast hover:border-primary/40 hover:shadow-sm hover:-translate-y-0.5 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/50 overflow-hidden flex flex-col justify-between group"
    >
      {/* 封面缩略图 */}
      <div className="relative aspect-[16/10] bg-surface-2 overflow-hidden border-b border-border">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={mod.name}
            className="w-full h-full object-cover transition-transform duration-normal group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              // 图片加载失败时回退到占位块
              ;(e.target as HTMLElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted font-mono text-xs opacity-60">
            无预览图
          </div>
        )}

        {/* 分类角标 */}
        {categoryTitle && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-surface/90 border border-border/80 text-[10px] font-semibold text-text shadow-xs backdrop-blur-xs max-w-[120px] truncate">
            {categoryTitle}
          </div>
        )}

        {/* 点赞徽章 */}
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-surface/90 border border-border/80 text-[10px] text-text font-mono flex items-center space-x-1 shadow-xs backdrop-blur-xs">
          <ThumbsUp className="w-3 h-3 text-primary" />
          <span>{likes}</span>
        </div>
      </div>

      {/* 模组信息 */}
      <div className="p-3.5 flex flex-col justify-between flex-1">
        <div>
          {/* 作者名称 (支持点击按作者筛选) */}
          <div
            className="flex items-center space-x-1 text-[11px] text-text-muted mb-1 hover:text-primary transition-colors cursor-pointer w-fit"
            onClick={(e) => onSearchByAuthor(authorName, e)}
            title={`筛选该作者 ${authorName} 的所有模组`}
          >
            <User className="w-3 h-3 text-primary shrink-0" />
            <span className="truncate max-w-[140px] font-medium">{authorName}</span>
          </div>

          {/* 模组标题 */}
          <h4
            className="text-xs font-title font-extrabold text-text line-clamp-2 leading-snug group-hover:text-primary transition-colors tracking-wide"
            title={mod.name}
          >
            {mod.name}
          </h4>
        </div>

        {/* 底部一键装载操作（span[role=button]：根元素已是 button，内嵌原生 button 属非法嵌套；
            键盘用户经根按钮进入详情页安装，此处次要动作以指针/触屏为主） */}
        <div className="mt-3.5 pt-2.5 border-t border-border flex items-center justify-between">
          <span
            role="button"
            aria-disabled={isInstalling}
            onClick={(e) => {
              if (isInstalling) return
              onCardInstallClick(mod, e)
            }}
            className="inline-flex items-center justify-center font-medium rounded-control transition-all duration-fast select-none cursor-pointer active:scale-[0.98] text-xs px-2.5 py-1.5 gap-1.5 w-full font-semibold py-1.5 bg-surface hover:bg-surface-2 text-text border border-border hover:border-primary/40 shadow-xs"
          >
            {isInstalling ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <Download className="w-3.5 h-3.5 text-primary" />
            )}
            {isInstalling ? '正在安装...' : '一键装载'}
          </span>
        </div>
      </div>
    </button>
  )
}

export const GameBananaCard = React.memo(GameBananaCardBase)

export default GameBananaCard
