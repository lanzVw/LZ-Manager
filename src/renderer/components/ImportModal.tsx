import React, { useState } from 'react'
import {
  FileArchive,
  FolderInput,
  AlertCircle,
  RefreshCw,
  X,
  FileCode,
  User,
  Zap
} from 'lucide-react'
import { ArchiveInspectionResult } from '../../core/import-engine'
import { Button } from './ui/Button'
import { HoverHint } from './ui/HoverHint'
import { Input } from './ui/Input'
import { Badge } from './ui/Badge'
import { Switch } from './ui/Switch'
import { Select } from './ui/Select'
import { useEscapeToClose } from '../hooks/useEscape'

interface ImportModalProps {
  archivePath: string
  inspection: ArchiveInspectionResult
  onClose: () => void
  onSuccess: (modPath: string) => void
}

export const ImportModal: React.FC<ImportModalProps> = ({
  archivePath,
  inspection,
  onClose,
  onSuccess
}) => {
  const [targetChar, setTargetChar] = useState<string>(inspection.suggestedCharName || '其他')
  const [modName, setModName] = useState<string>(inspection.suggestedModName)
  const [enableImmediately, setEnableImmediately] = useState<boolean>(true)
  const [importing, setImporting] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 该弹窗由父级条件渲染，挂载即视为打开；导入进行中不响应 Escape（与禁用关闭按钮保持一致）
  useEscapeToClose(!importing, onClose)

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetChar || !modName.trim()) return

    setImporting(true)
    setErrorMsg(null)

    try {
      const res = await window.lz.importArchive({
        archivePath,
        targetCharName: targetChar,
        modName: modName.trim(),
        enableImmediately
      })

      if (res.success) {
        onSuccess(res.modPath!)
      } else {
        setErrorMsg(res.error || '解压导入失败')
      }
    } catch (err: any) {
      setErrorMsg(err.message || '导入过程异常')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-surface border border-border rounded-card p-6 shadow-2xl backdrop-blur-xl space-y-5 animate-in fade-in zoom-in-95 duration-fast">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-control bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shadow-xs">
              <FileArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text">导入 MOD 压缩包</h3>
              <p className="text-[11px] font-mono text-text-muted truncate max-w-xs sm:max-w-sm mt-0.5">
                {archivePath}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="p-1.5 rounded-control text-text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="p-3.5 rounded-control bg-danger/10 border border-danger/30 text-xs text-danger flex items-center space-x-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Inspection Stats */}
        <div className="grid grid-cols-2 gap-3.5 p-3.5 rounded-control bg-surface-2 border border-border text-xs text-text font-mono">
          <div className="flex items-center space-x-2">
            <FolderInput className="w-4 h-4 text-primary" />
            <span>格式: <strong className="uppercase text-primary">{inspection.format}</strong> ({inspection.fileCount} 个文件)</span>
          </div>
          <div className="flex items-center space-x-2">
            <FileCode className="w-4 h-4 text-emerald-500" />
            <span className={inspection.hasIni ? 'text-emerald-600 font-semibold' : 'text-text-muted'}>
              {inspection.hasIni ? '包含 INI 配置文件' : '未检测到独立 INI'}
            </span>
          </div>
        </div>

        {/* Form fields */}
        <form onSubmit={handleImport} className="space-y-4">
          {/* Target Character */}
          <div>
            <label className="block text-xs font-semibold text-text mb-1.5 flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-primary" />
              <HoverHint content="根据 Mod 文件名与 INI 内容自动预测所属角色，可手动更正">
                <span>目标所属角色</span>
              </HoverHint>
            </label>
            <Select
              value={targetChar}
              onChange={(val) => setTargetChar(val)}
              options={inspection.availableCharacters.map((c) => ({
                value: c.name,
                label: c.name,
                icon: <User className="w-3.5 h-3.5 text-primary/70 shrink-0" />
              }))}
              className="w-full"
              popupClassName="w-full"
            />
          </div>

          {/* Mod Folder Name */}
          <div>
            <label className="block text-xs font-semibold text-text mb-1.5">
              Mod 文件夹名称
            </label>
            <Input
              required
              value={modName}
              onChange={(e) => setModName(e.target.value)}
              className="font-mono"
            />
          </div>

          {/* Enable immediately checkbox */}
          <div className="pt-1">
            <Switch
              checked={enableImmediately}
              onChange={setEnableImmediately}
              label="导入后立即启用该 Mod"
              description="单选互斥生效时自动停用同角色其他Mod"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={importing}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={importing}
              icon={<Zap className="w-3.5 h-3.5" />}
            >
              {importing ? '正在规整解压并导入...' : '开始解压导入'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
