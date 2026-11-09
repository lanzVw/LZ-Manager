import React from 'react'
import { AlertTriangle, ArchiveRestore, CopyPlus, FileArchive, FolderArchive, ShieldCheck } from 'lucide-react'
import type { GameBananaInstallResult } from '../../core/types'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import { HoverHint } from './ui/HoverHint'
import {
  findInstalledCopyByVersion,
  type GameBananaInstalledTarget
} from '../utils/gamebanana-install'

// 待确认的安装请求：两个入口共用同一份状态形状，避免弹窗与安装参数各写一套
export interface PendingOverwriteInstall extends GameBananaInstalledTarget {
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
  target: GameBananaInstalledTarget | null
  onConfirmUpdate: () => void
  onConfirmNewInstall: () => void
  onCancel: () => void
}

// 安装结果反馈的唯一出口：两个入口都走这里，避免「更新」与「新建」文案分叉
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

const DuplicatesWarning: React.FC<{ duplicates: GameBananaInstalledTarget['duplicates'] }> = ({
  duplicates
}) => {
  if (duplicates.length === 0) return null

  return (
    <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 align-neg-125" />
      <span className="overflow-wrap-safe">
        另有{' '}
        <span className="tabular-nums-strict font-semibold">{duplicates.length}</span> 份同源副本
        （如 {duplicates[0]?.folderName}），不会自动删除，安装后可手动清理
      </span>
    </div>
  )
}

// 覆盖更新：用户选的是与本地不同的版本，重点是让他看清「会动哪一份」
const OverwriteBody: React.FC<{
  existing: GameBananaInstalledTarget['existing']
  duplicates: GameBananaInstalledTarget['duplicates']
  modName?: string
  fileName?: string
}> = ({ existing, duplicates, modName, fileName }) => (
  <div className="space-y-4">
    {/* 覆盖目标：只用琥珀表面分层，不再套描边盒子；文件夹名是唯一需要用户确认的对象 */}
    <div className="space-y-1.5 rounded-xl bg-amber-500/10 px-3.5 py-3 dark:bg-amber-400/10">
      <div className="flex items-center gap-1.5">
        <FolderArchive className="h-3.5 w-3.5 shrink-0 text-amber-600 align-neg-125 dark:text-amber-400" />
        <span className="text-[10px] font-semibold tracking-wide text-amber-700 dark:text-amber-300">
          本地版本
        </span>
        <Badge variant={existing.enabled ? 'success' : 'default'} className="ml-auto">
          {existing.enabled ? '当前启用' : '当前停用'}
        </Badge>
      </div>
      <code className="block break-all font-mono text-xs font-semibold leading-relaxed text-text">
        {existing.folderName}
      </code>
      {modName && (
        <p className="break-words text-[11px] leading-relaxed text-text-muted">
          <span className="opacity-70">市场版本</span> {modName}
          {fileName ? ` · ${fileName}` : ''}
        </p>
      )}
    </div>

    {/* 两栏承诺：左边是用户最在意的设置保留，右边是失败兜底，直接落在 Modal 表面上 */}
    <div className="grid grid-cols-2 gap-4 px-0.5">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 align-neg-125" />
          <HoverHint content="启用状态、外观分区、预设引用与自定义设置">更新后保留</HoverHint>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text">
          <ArchiveRestore className="h-3.5 w-3.5 text-primary align-neg-125" />
          <HoverHint content="覆盖前自动备份，失败自动回滚">安全覆盖</HoverHint>
        </div>
      </div>
    </div>

    <DuplicatesWarning duplicates={duplicates} />
  </div>
)

// 重新安装：用户点的就是本地已装的那份文件，只确认「是否重装」，不重复整页更新说明
const ReinstallBody: React.FC<{
  existing: GameBananaInstalledTarget['existing']
  duplicates: GameBananaInstalledTarget['duplicates']
  matchedCopy: GameBananaInstalledTarget['existing']
  fileName?: string
}> = ({ existing, duplicates, matchedCopy, fileName }) => (
  <div className="space-y-3">
    <div className="space-y-1.5 rounded-xl bg-surface-2 px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        <FileArchive className="h-3.5 w-3.5 shrink-0 text-success align-neg-125" />
        <span className="text-[10px] font-semibold tracking-wide text-text-muted">已安装版本</span>
        <Badge variant="success" className="ml-auto">
          已安装
        </Badge>
      </div>
      <code className="block break-all font-mono text-xs font-semibold leading-relaxed text-text">
        {fileName || matchedCopy.version || '未知版本'}
      </code>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-relaxed text-text-muted">
        <span className="opacity-70">本地目录</span>
        <code className="break-all font-mono text-text">{existing.folderName}</code>
        <Badge variant={existing.enabled ? 'success' : 'default'}>
          {existing.enabled ? '当前启用' : '当前停用'}
        </Badge>
      </div>
    </div>

    {matchedCopy.fullPath !== existing.fullPath && (
      <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 align-neg-125" />
        <span className="overflow-wrap-safe">
          该版本位于另一份副本（{matchedCopy.folderName}），本次将覆盖 {existing.folderName}
        </span>
      </div>
    )}

    <DuplicatesWarning duplicates={duplicates} />
  </div>
)

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
  // 由最新 target + fileName 派生，不额外存 mode，避免状态与 target 失配
  const matchedCopy = findInstalledCopyByVersion(target, fileName)
  const isReinstall = Boolean(matchedCopy)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={isReinstall ? '该版本已安装' : '该模组已在本地安装'}
      titleHint={
        isReinstall
          ? '重新安装会用这份市场文件覆盖本地版本；启用状态、外观分区与自定义设置都会保留，覆盖前自动备份。'
          : undefined
      }
      variant={isReinstall ? 'info' : 'warning'}
      maxWidth={isReinstall ? 'max-w-sm' : 'max-w-md'}
      confirmText={isReinstall ? '重新安装' : '覆盖更新'}
      cancelText="取消"
      onConfirm={onConfirmUpdate}
      footerStart={
        // 次要动作降级到页脚左侧：它与「取消」是两回事，但不该和主操作抢视觉权重
        isReinstall ? undefined : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onConfirmNewInstall}
            icon={<CopyPlus className="w-3 h-3" />}
            className="-ml-3"
          >
            保留旧版，另建一份
          </Button>
        )
      }
    >
      {isReinstall && matchedCopy ? (
        <ReinstallBody
          existing={existing}
          duplicates={duplicates}
          matchedCopy={matchedCopy}
          fileName={fileName}
        />
      ) : (
        <OverwriteBody
          existing={existing}
          duplicates={duplicates}
          modName={modName}
          fileName={fileName}
        />
      )}
    </Modal>
  )
}
