import React from 'react'
import { AlertTriangle, ArchiveRestore, CopyPlus, FolderArchive, ShieldCheck } from 'lucide-react'
import type { GameBananaInstallResult, ModInstallTarget } from '../../core/types'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'

// 市场安装前的本地同源 Mod 命中信息
export interface GameBananaOverwriteTarget {
  existing: ModInstallTarget
  duplicates: ModInstallTarget[]
}

// 待确认的安装请求：两个入口共用同一份状态形状，避免弹窗与安装参数各写一套
export interface PendingOverwriteInstall extends GameBananaOverwriteTarget {
  modInfo: any
  targetFile: any
  targetCharacter: string
}

// 安装结果 toast 只依赖这两个方法，两个入口各自传入自己的 toast 实例
export interface InstallResultToastApi {
  success: (message: string, description?: string) => void
  info: (message: string, description?: string) => void
}

export interface GameBananaOverwriteConfirmProps {
  isOpen: boolean
  modName?: string
  fileName?: string
  target: GameBananaOverwriteTarget | null
  onConfirmUpdate: () => void
  onConfirmNewInstall: () => void
  onCancel: () => void
}

// 安装结果反馈的唯一出口：两个入口都走这里，避免"更新"与"新建"文案分叉
export const reportInstallResult = (
  toast: InstallResultToastApi,
  res: GameBananaInstallResult,
  installedInto: string
) => {
  if (res.action === 'update') {
    // 覆盖成功后目录名与启用状态沿用旧 Mod，不能再说"安装至 X 目录"，否则用户会去找新文件夹
    toast.success('已更新', res.preservedEnabled ? '保留原启用状态' : '原为停用状态')
  } else {
    toast.success('安装成功', `模组已安装至 ${installedInto} 目录`)
  }

  const duplicateCount = res.duplicates?.length || 0
  if (duplicateCount > 0) {
    toast.info(`检测到 ${duplicateCount} 份同源旧副本，可在模组列表中手动清理`)
  }
}

// 安装失败反馈：更新失败时若旧版本没能自动恢复，必须把备份路径摆到用户眼前
// 为什么：那种情况下备份是旧版本的唯一副本，只打日志等于让用户以为 Mod 丢了
export const reportInstallFailure = (
  toast: InstallResultToastApi & { error: (message: string, description?: string) => void },
  res: GameBananaInstallResult
) => {
  if (res?.backupPath) {
    toast.error('更新失败，旧版本已备份', res.backupPath)
    return
  }
  toast.error('安装模组失败', res?.error || '未知错误')
}

// 安装前预检：旧版 preload 没有该方法或主进程异常时一律返回 null，
// 让调用方静默走原来的直接安装，绝不因为预检失败挡住用户
export const inspectOverwriteTarget = async (
  modId?: number | null
): Promise<GameBananaOverwriteTarget | null> => {
  const id = Number(modId)
  if (!Number.isInteger(id) || id <= 0) return null
  try {
    // 旧版 preload 没有这个方法，typeof 守卫让降级路径不依赖类型声明
    const api = window.flairx as any
    if (!api || typeof api.inspectInstalledGameBananaMod !== 'function') return null
    const res = await api.inspectInstalledGameBananaMod(id)
    const existing: ModInstallTarget | null = res?.existing || null
    if (!existing) return null
    return {
      existing,
      duplicates: Array.isArray(res?.duplicates) ? res.duplicates : []
    }
  } catch (err: any) {
    console.warn('[GameBanana] 安装前预检本地同源 Mod 失败，按普通安装继续:', err?.message || err)
    return null
  }
}

export const GameBananaOverwriteConfirm: React.FC<GameBananaOverwriteConfirmProps> = ({
  isOpen,
  modName,
  fileName,
  target,
  onConfirmUpdate,
  onConfirmNewInstall,
  onCancel
}) => {
  if (!isOpen || !target) return null

  const { existing, duplicates } = target

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="该模组已在本地安装"
      variant="warning"
      maxWidth="max-w-md"
      confirmText="覆盖更新"
      cancelText="取消"
      onConfirm={onConfirmUpdate}
      footerStart={
        // 次要动作降级到页脚左侧：它与「取消」是两回事，但不该和主操作抢视觉权重
        <Button
          variant="ghost"
          size="sm"
          onClick={onConfirmNewInstall}
          icon={<CopyPlus className="w-3 h-3" />}
          className="-ml-3"
        >
          保留旧版，另建一份
        </Button>
      }
    >
      <div className="space-y-4">
        {/* 覆盖目标：只用琥珀表面分层，不再套描边盒子；文件夹名是唯一需要用户确认的对象 */}
        <div className="rounded-xl bg-amber-500/10 px-3.5 py-3 space-y-1.5 dark:bg-amber-400/10">
          <div className="flex items-center gap-1.5">
            <FolderArchive className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 align-neg-125" />
            <span className="text-[10px] font-semibold tracking-wide text-amber-700 dark:text-amber-300">
              本地版本
            </span>
            <Badge variant={existing.enabled ? 'success' : 'default'} className="ml-auto">
              {existing.enabled ? '当前启用' : '当前停用'}
            </Badge>
          </div>
          <code className="block text-xs font-mono font-semibold text-text break-all leading-relaxed">
            {existing.folderName}
          </code>
          {modName && (
            <p className="text-[11px] text-text-muted leading-relaxed break-words">
              <span className="opacity-70">市场版本</span> {modName}
              {fileName ? ` · ${fileName}` : ''}
            </p>
          )}
        </div>

        {/* 两栏承诺：左边是用户最在意的设置保留，右边是失败兜底，直接落在 Modal 表面上 */}
        <div className="grid grid-cols-2 gap-4 px-0.5">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 align-neg-125" />
              更新后保留
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed text-pretty-native">
              启用状态、外观分区、预设引用与自定义设置
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text">
              <ArchiveRestore className="w-3.5 h-3.5 text-primary align-neg-125" />
              安全覆盖
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed text-pretty-native">
              覆盖前自动备份，失败自动回滚
            </p>
          </div>
        </div>

        {duplicates.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 align-neg-125" />
            <span className="overflow-wrap-safe">
              另有{' '}
              <span className="tabular-nums-strict font-semibold">{duplicates.length}</span> 份同源副本
              （如 {duplicates[0]?.folderName}），不会自动删除，安装后可手动清理
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}
