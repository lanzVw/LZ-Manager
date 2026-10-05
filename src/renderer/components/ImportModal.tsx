import React, { useState } from 'react'
import {
  FileArchive,
  FolderInput,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  FileCode,
  User,
  Zap
} from 'lucide-react'
import { ArchiveInspectionResult } from '../../core/import-engine'

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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <FileArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">导入 Mod 压缩包</h3>
              <p className="text-[11px] text-slate-400 truncate max-w-xs sm:max-w-sm">
                {archivePath}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={importing}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Inspection Stats */}
        <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300">
          <div className="flex items-center space-x-2">
            <FolderInput className="w-4 h-4 text-blue-400" />
            <span>格式: <strong className="uppercase text-slate-100">{inspection.format}</strong> ({inspection.fileCount} 个文件)</span>
          </div>
          <div className="flex items-center space-x-2">
            <FileCode className="w-4 h-4 text-emerald-400" />
            <span>{inspection.hasIni ? '包含 INI 配置文件' : '未检测到独立 INI'}</span>
          </div>
        </div>

        {/* Form fields */}
        <form onSubmit={handleImport} className="space-y-4">
          {/* Target Character */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span>目标所属角色</span>
              <span className="text-[10px] text-emerald-400 font-normal">(智能预测匹配)</span>
            </label>
            <select
              value={targetChar}
              onChange={(e) => setTargetChar(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {inspection.availableCharacters.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mod Folder Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Mod 文件夹名称
            </label>
            <input
              type="text"
              required
              value={modName}
              onChange={(e) => setModName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
          </div>

          {/* Enable immediately checkbox */}
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="enableImmediately"
              checked={enableImmediately}
              onChange={(e) => setEnableImmediately(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <label
              htmlFor="enableImmediately"
              className="text-xs text-slate-300 cursor-pointer select-none flex items-center space-x-1"
            >
              <span>导入后立即激活该 Mod</span>
              <span className="text-[10px] text-slate-500">(单选互斥生效时自动停用同角色其他Mod)</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={importing}
              className={`flex items-center space-x-1.5 px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 transition ${
                importing ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {importing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>正在解压规整并导入...</span>
                </>
              ) : (
                <>
                  <FolderInput className="w-3.5 h-3.5" />
                  <span>开始解压导入</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
