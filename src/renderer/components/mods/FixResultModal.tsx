import React, { useMemo } from 'react'
import { X, Wrench, Terminal, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react'
import { Button } from '../ui/Button'

export interface FixChange {
  from: string
  to: string
  occurrenceCount: number
}

export interface FixFileDetail {
  relativePath: string
  replacementCount: number
  changes: FixChange[]
}

export interface FixResultModalProps {
  isOpen: boolean
  result: any
  scopeLabel?: string
  isWuwa?: boolean
  onClose: () => void
  onOpenIndependent?: () => void
}

function asCount(val: any): number {
  const n = Number(val)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function normalizeFiles(result: any): FixFileDetail[] {
  const candidates = [
    result?.stats?.files,
    result?.files,
    result?.details?.files,
    result?.details
  ]
  const list = candidates.find(Array.isArray) || []
  return list.map((f: any, index: number) => ({
    relativePath: String(f?.relativePath ?? f?.path ?? f?.file ?? `ini-${index + 1}`),
    replacementCount: asCount(f?.replacementCount ?? f?.count),
    changes: (Array.isArray(f?.changes) ? f.changes : []).map((c: any) => ({
      from: String(c?.from ?? c?.oldHash ?? c?.old ?? ''),
      to: String(c?.to ?? c?.newHash ?? c?.next ?? ''),
      occurrenceCount: asCount(c?.occurrenceCount ?? c?.count) || 1
    }))
  }))
}

function getVersion(result: any): string {
  return (
    result?.ruleVersion ||
    result?.toolVersion ||
    result?.gameVersion ||
    (result?.ruleRevision ? `r${result.ruleRevision}` : '当前版本')
  )
}

function getOnlineStatus(result: any, version: string): string {
  const update = result?.update
  if (update?.success === false) return '检查失败，已使用本地规则'
  if (update?.updated) return `更新成功，当前版本 ${version}`
  if (update?.success && update?.checked === false) return '使用已检查的本地规则'
  if (update?.success) return '已是最新'
  return '使用当前本地规则'
}

const TerminalLine: React.FC<{
  tag: string
  tone?: 'default' | 'change' | 'error' | 'success' | 'warning'
  children: React.ReactNode
}> = ({ tag, tone = 'default', children }) => {
  const tagColors = {
    default: 'text-zinc-400 bg-zinc-800/80 border-zinc-700/60',
    change: 'text-cyan-400 bg-cyan-950/60 border-cyan-800/60',
    error: 'text-rose-400 bg-rose-950/60 border-rose-800/60',
    success: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60',
    warning: 'text-amber-400 bg-amber-950/60 border-amber-800/60'
  }

  const textColors = {
    default: 'text-zinc-300',
    change: 'text-cyan-300',
    error: 'text-rose-300',
    success: 'text-emerald-300 font-bold',
    warning: 'text-amber-300'
  }

  return (
    <div className="flex items-start space-x-2 leading-relaxed">
      <span
        className={`shrink-0 px-1.5 py-0.2 text-[10px] font-mono rounded border ${tagColors[tone]}`}
      >
        [{tag}]
      </span>
      <span className={`min-w-0 break-all text-xs font-mono ${textColors[tone]}`}>
        {children}
      </span>
    </div>
  )
}

export const FixResultModal: React.FC<FixResultModalProps> = ({
  isOpen,
  result,
  scopeLabel,
  isWuwa = false,
  onClose,
  onOpenIndependent
}) => {
  const files = useMemo(() => normalizeFiles(result), [result])

  if (!isOpen || !result) return null

  const isBuiltin = result.engine === 'builtin-wuwa'
  const isWuwaExternal = isWuwa && !isBuiltin
  const stats = result.stats || {}
  const version = getVersion(result)
  const modifiedFiles = asCount(stats.modifiedFiles) || files.length
  const replacementCount =
    asCount(stats.replacementCount) ||
    files.reduce((total, file) => total + file.replacementCount, 0)
  const backupCount = asCount(result.preBackup?.count ?? stats.backupCount ?? result.backup?.count)
  const failedFiles = asCount(stats.failedFiles)
  const errors = Array.isArray(stats.errors)
    ? stats.errors.map((error: any) => String(error || '')).filter(Boolean)
    : []

  const titleText = isBuiltin
    ? `Hash 修复 · ${version}`
    : result.exeName || (isWuwaExternal ? '独立修复器' : '修复程序')

  const kickerText = isBuiltin
    ? result.success === false
      ? '部分文件修复失败'
      : '修复完成'
    : isWuwaExternal
    ? '独立修复器已打开'
    : '修复程序已启动'

  const subtitleText = isBuiltin
    ? '若修复失败，请使用独立修复器'
    : isWuwaExternal
    ? '请在独立修复器窗口中继续操作'
    : '终端窗口已弹出，请在其中继续操作'

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-fast"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4 animate-in zoom-in-95 duration-fast text-text select-none outline-none flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-3 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  result.success === false
                    ? 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
                    : 'bg-primary/15 text-primary border border-primary/30'
                }`}
              >
                {kickerText}
              </span>
            </div>
            <h2 className="text-base font-bold text-text flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-primary" />
              <span>{titleText}</span>
            </h2>
            <p className="text-xs text-text-muted">{subtitleText}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="p-1 rounded-control text-text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Terminal Body */}
        <div className="bg-[#141416] border border-zinc-800 rounded-lg p-4 overflow-y-auto space-y-2.5 flex-1 min-h-[220px] shadow-inner select-text">
          {isBuiltin ? (
            <>
              <TerminalLine tag="联网">{getOnlineStatus(result, version)}</TerminalLine>
              {scopeLabel && <TerminalLine tag="范围">{scopeLabel}</TerminalLine>}
              <TerminalLine tag="扫描">{asCount(stats.scannedFiles)} 个 ini</TerminalLine>

              {files.map((file) => (
                <div key={file.relativePath} className="space-y-1 pl-1 border-l-2 border-zinc-700/50 my-1.5">
                  <TerminalLine tag="修改" tone="change">
                    {file.relativePath}
                  </TerminalLine>
                  {file.changes.length > 0 ? (
                    file.changes.map((change, idx) => (
                      <div
                        key={`${file.relativePath}-${change.from}-${change.to}-${idx}`}
                        className="pl-6 text-[11px] font-mono text-zinc-400 flex items-center space-x-1.5"
                      >
                        <span className="text-zinc-300">{change.from || '?'}</span>
                        <span className="text-zinc-500">→</span>
                        <span className="text-emerald-400">{change.to || '?'}</span>
                        <span className="text-zinc-500 ml-1">x{change.occurrenceCount}</span>
                      </div>
                    ))
                  ) : (
                    <div className="pl-6 text-[11px] font-mono text-zinc-500">
                      已替换 {file.replacementCount} 处 Hash
                    </div>
                  )}
                </div>
              ))}

              {modifiedFiles > 0 && files.length === 0 && (
                <TerminalLine tag="明细">当前修复核心未返回逐文件记录</TerminalLine>
              )}

              {failedFiles > 0 && (
                <TerminalLine tag="失败" tone="error">
                  {failedFiles} 个文件处理失败，请检查文件占用或写入权限
                </TerminalLine>
              )}

              {errors.map((err, i) => (
                <TerminalLine key={`${err}-${i}`} tag="错误" tone="error">
                  {err}
                </TerminalLine>
              ))}

              <TerminalLine tag="完成" tone={failedFiles > 0 ? 'warning' : 'success'}>
                修改 {modifiedFiles} 个文件，共 {replacementCount} 处
              </TerminalLine>

              <TerminalLine tag="备份">
                {backupCount > 0
                  ? `${backupCount} 个文件已备份，可在 Mod 详情页中回滚`
                  : '没有需要备份的修改'}
              </TerminalLine>
            </>
          ) : (
            <>
              <TerminalLine tag="启动">
                {result.exeName || (isWuwaExternal ? '独立修复器' : '修复程序')}
              </TerminalLine>
              <TerminalLine tag="目录">{result.workDir || 'Mods 目录'}</TerminalLine>
              {scopeLabel && <TerminalLine tag="范围">{scopeLabel}</TerminalLine>}
              {backupCount > 0 && (
                <TerminalLine tag="备份">
                  {backupCount} 个文件已创建快照备份，可在 Mod 详情页中回滚
                </TerminalLine>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-border shrink-0">
          {isBuiltin && onOpenIndependent && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenIndependent}
              icon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              打开独立修复器
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onClose}>
            完成
          </Button>
        </div>
      </div>
    </div>
  )
}
