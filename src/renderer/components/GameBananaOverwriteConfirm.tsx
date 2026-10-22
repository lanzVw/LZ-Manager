import React from 'react'
import { AlertTriangle } from 'lucide-react'
import type { GameBananaInstallResult, ModInstallTarget } from '../../core/types'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'

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
      maxWidth="max-w-lg"
      confirmText="覆盖更新"
      cancelText="取消"
      onConfirm={onConfirmUpdate}
    >
      <div className="space-y-3">
        {/* 覆盖目标：把磁盘上真实文件夹名摆出来，用户才知道会动哪一份 */}
        <div className="rounded-control border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-text">将覆盖本地已有的 Mod</span>
            <code className="text-[11px] font-mono text-amber-600 dark:text-amber-400 break-all">
              {existing.folderName}
            </code>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${
                existing.enabled
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                  : 'bg-surface-2 text-text-muted border-border'
              }`}
            >
              {existing.enabled ? '当前启用' : '当前停用'}
            </span>
          </div>
          {modName && (
            <p className="text-[11px] text-text-muted break-words">
              {`市场版本：${modName}${fileName ? ` · ${fileName}` : ''}`}
            </p>
          )}
        </div>

        {/* 保留项：用户最担心的是"更新后我的设置没了" */}
        <div className="rounded-control border border-border bg-surface-2/60 px-3 py-2.5 space-y-1">
          <p className="text-[11px] font-semibold text-text">以下设置会被保留</p>
          <ul className="text-[11px] text-text-muted leading-relaxed list-disc pl-4 space-y-0.5">
            <li>启用 / 停用状态与原有文件夹名</li>
            <li>外观分区归属</li>
            <li>预设方案里的引用</li>
            <li>变量别名、按键翻译等自定义设置</li>
          </ul>
        </div>

        <p className="text-[11px] text-text-muted leading-relaxed">
          覆盖前会先备份旧目录，任何一步失败都会自动恢复旧版本，不会留下半成品。
        </p>

        {duplicates.length > 0 && (
          <div className="flex items-start gap-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{`本地另有 ${duplicates.length} 份同源旧副本（如 ${duplicates[0]?.folderName}），不会被自动删除，建议安装后手动清理。`}</span>
          </div>
        )}

        {/* 次要动作放在正文里：它和"取消"是两回事，不能混进 footer 的取消按钮 */}
        <div className="pt-2 border-t border-border/70 space-y-1.5">
          <Button variant="secondary" size="sm" className="w-full" onClick={onConfirmNewInstall}>
            仍然新建一份
          </Button>
          <p className="text-[10px] text-text-muted text-center">
            会保留旧版本，安装后本地将同时存在两份副本
          </p>
        </div>
      </div>
    </Modal>
  )
}
