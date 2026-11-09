import React from 'react'
import { ThumbsUp, User } from 'lucide-react'

interface GameBananaCardProps {
  mod: any
  previewUrl: string
  /** 2x 档（530）地址；为空时不输出 srcSet，浏览器沿用 1x */
  previewUrl2x?: string
  onOpenDetail: (mod: any) => void
  onSearchByAuthor: (authorName: string, e?: React.MouseEvent) => void
}

/**
 * GameBanana 市场卡片
 * - 根元素由 div+onClick 改为 <button type="button">：Tab 可聚焦，Enter/Space 打开详情（键盘可达）
 * - 以 React.memo 包裹：兄弟卡片重渲染时避免整批卡片跟着刷新
 * - 安装入口只在详情抽屉里：卡片不再提供一键装载，避免误装到错误角色
 */
const GameBananaCardBase: React.FC<GameBananaCardProps> = ({
  mod,
  previewUrl,
  previewUrl2x,
  onOpenDetail,
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
            srcSet={previewUrl2x ? `${previewUrl} 1x, ${previewUrl2x} 2x` : undefined}
            alt={mod.name}
            className="w-full h-full object-cover transition-transform duration-normal group-hover:scale-105"
            loading="lazy"
            decoding="async"
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
      </div>
    </button>
  )
}

export const GameBananaCard = React.memo(GameBananaCardBase)

export default GameBananaCard
