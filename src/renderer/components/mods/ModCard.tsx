import React, { useMemo } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpCircle,
  FolderInput,
  Image as ImageIcon,
  Layers,
  XCircle,
  Zap
} from 'lucide-react'
import { ModConflictSummary, AppearanceSection } from '../../../core/types'
import { toFileUrl } from '../../utils/fileUrl'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'

export interface ModCardProps {
  mod: any
  isToggling: boolean
  conflict: ModConflictSummary | null
  updateItem: any
  selectedChar: string
  sections: AppearanceSection[]
  onSelect: (modFullPath: string) => void
  onToggle: (charName: string, modName: string, currentState: boolean) => void
  onMoveSection: (mod: any, nextSectionId: string) => void
  onOpenMove: (mod: any) => void
}

// 模组卡片 (React.memo: 仅当相关 props 变化时重渲染)
const ModCardBase: React.FC<ModCardProps> = ({
  mod,
  isToggling,
  conflict,
  updateItem,
  selectedChar,
  sections,
  onSelect,
  onToggle,
  onMoveSection,
  onOpenMove
}) => {
  const isBroken = Boolean(mod.modBroken)
  const hasUpdate = Boolean(updateItem?.hasUpdate)

  // 外观分区下拉选项 (useMemo 稳定引用，避免每次渲染重建)
  const sectionOptions = useMemo(
    () =>
      sections.map((s) => ({
        value: s.sectionId,
        label: s.name
      })),
    [sections]
  )

  return (
    <Card
      hoverable
      selected={mod.enabled}
      onClick={() => onSelect(mod.fullPath)}
      className={`overflow-hidden flex flex-col group ${
        isBroken
          ? 'border-danger/60 ring-1 ring-danger/30'
          : conflict
          ? 'border-danger/40 ring-1 ring-danger/20'
          : hasUpdate
          ? 'border-amber-500/50 ring-1 ring-amber-500/30'
          : ''
      }`}
    >
      {/* 封面展示区 */}
      <div className="relative aspect-[16/10] bg-surface-2 flex items-center justify-center overflow-hidden border-b border-border">
        {mod.coverPath ? (
          <img
            src={toFileUrl(mod.coverPath)}
            alt={mod.name}
            className="w-full h-full object-cover transition-transform duration-normal group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-text-muted">
            <ImageIcon className="w-7 h-7 stroke-[1.2] mb-1 opacity-50" />
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-60">
              无预览图
            </span>
          </div>
        )}

        {/* 状态徽标 (左上角) */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 items-start">
          {isBroken && (
            <div
              className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-danger text-white font-bold text-[10px] shadow-xs"
              title={mod.brokenReason ? `已标记失效: ${mod.brokenReason}` : '已标记为失效'}
            >
              <AlertOctagon className="w-3 h-3" />
              <span>已失效</span>
            </div>
          )}
          {mod.isBaseMod && (
            <div
              className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-primary text-primary-fg font-semibold text-[10px] shadow-xs"
              title={`基底 Mod${mod.baseModNamespace ? ` · namespace ${mod.baseModNamespace}` : ''}`}
            >
              <Layers className="w-3 h-3" />
              <span>基底 Mod</span>
            </div>
          )}
        </div>

        {/* 冲突提示 (右上角) */}
        {conflict && (
          <div className="absolute top-2 right-2 z-20">
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger text-white flex items-center space-x-1 shadow-xs border border-danger/40"
              title={`与 ${conflict.conflictingMods.join(', ')} 存在 Hash 冲突`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>冲突 ({conflict.collisions.length})</span>
            </span>
          </div>
        )}

        {/* 可更新提示 (右上角，无冲突时显示) */}
        {hasUpdate && !conflict && (
          <div className="absolute top-2 right-2 z-20">
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white flex items-center space-x-1 shadow-xs border border-amber-600"
              title={`线上有更新: ${updateItem.remoteVersion || '新版本'}`}
            >
              <ArrowUpCircle className="w-3 h-3" />
              <span>可更新</span>
            </span>
          </div>
        )}
      </div>

      {/* 模组信息与底部操作 */}
      <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5 bg-surface">
        <div>
          {selectedChar === 'all' && (
            <div className="text-[10px] font-semibold text-primary mb-0.5">
              {mod.charName}
            </div>
          )}
          <h3
            className="text-xs font-bold text-text line-clamp-2 leading-relaxed group-hover:text-primary transition-colors"
            title={mod.name}
          >
            {mod.name}
          </h3>
          {isBroken && mod.brokenReason && (
            <p className="text-[10px] text-danger/80 line-clamp-1 mt-0.5" title={mod.brokenReason}>
              原因: {mod.brokenReason}
            </p>
          )}
        </div>

        {/* 外观分区快捷切换 (支持列表卡片直接修改分区) */}
        {selectedChar !== 'all' && sections.length > 0 && (
          <div
            className="flex items-center justify-between text-[11px] pt-1.5 border-t border-border/50"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-text-muted flex items-center space-x-1 shrink-0 text-[10px]">
              <Layers className="w-3 h-3 text-primary/70" />
              <span>分区:</span>
            </span>
            <Select
              value={mod.appearanceSectionId || 'base'}
              onChange={(val) => onMoveSection(mod, val)}
              options={sectionOptions}
              size="sm"
              align="right"
              className="max-w-[130px] font-medium"
              popupClassName="w-36"
              title="快速调整外观分区 (只改变筛选归类，不改变启用状态)"
            />
          </div>
        )}

        {/* 底部操作按钮：装备/卸下 + 移动到角色按钮 */}
        <div className="flex items-center space-x-1.5">
          <Button
            variant={mod.enabled ? 'danger' : 'secondary'}
            size="sm"
            loading={isToggling}
            onClick={(e) => {
              e.stopPropagation()
              onToggle(mod.charName, mod.name, mod.enabled)
            }}
            className="flex-1"
            icon={
              mod.enabled ? (
                <XCircle className="w-3.5 h-3.5 text-danger" />
              ) : (
                <Zap className="w-3.5 h-3.5 text-primary" />
              )
            }
          >
            {mod.enabled ? '卸下模组' : '装备模组'}
          </Button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenMove(mod)
            }}
            className="p-1.5 rounded-[8px] border border-border/80 hover:border-primary/60 hover:bg-surface-2 text-text-muted hover:text-text transition-all cursor-pointer shrink-0"
            title="将此 Mod 移动到其他角色分类"
          >
            <FolderInput className="w-3.5 h-3.5 text-primary" />
          </button>
        </div>
      </div>
    </Card>
  )
}

export const ModCard = React.memo(ModCardBase)
