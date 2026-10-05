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
  Zap,
  Sparkles
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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#0B0D14] border border-cyan-500/40 rounded-3xl p-6 shadow-[0_0_50px_rgba(0,240,255,0.25)] space-y-5 animate-in fade-in zoom-in-95 duration-200 acg-corner-markers">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-cyan-500/20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(0,240,255,0.2)]">
              <FileArchive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[9.5px] font-mono tracking-widest text-[#E5FE40] font-black uppercase">
                // EXTERNAL INJECTION PROTOCOL //
              </div>
              <h3 className="text-base font-black text-white mt-0.5">导入 MOD 压缩包实体</h3>
              <p className="text-[11px] font-mono text-cyan-400/80 truncate max-w-xs sm:max-w-sm mt-0.5">
                {archivePath}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={importing}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300 flex items-center space-x-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Inspection Stats */}
        <div className="grid grid-cols-2 gap-3.5 p-3.5 rounded-2xl bg-[#0F121C] border border-cyan-500/20 text-xs text-slate-300 font-mono">
          <div className="flex items-center space-x-2">
            <FolderInput className="w-4 h-4 text-cyan-400" />
            <span>格式: <strong className="uppercase text-[#E5FE40]">{inspection.format}</strong> ({inspection.fileCount} 个文件)</span>
          </div>
          <div className="flex items-center space-x-2">
            <FileCode className="w-4 h-4 text-emerald-400" />
            <span className={inspection.hasIni ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
              {inspection.hasIni ? '包含 INI 配置文件' : '未检测到独立 INI'}
            </span>
          </div>
        </div>

        {/* Form fields */}
        <form onSubmit={handleImport} className="space-y-4">
          {/* Target Character */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-cyan-400" />
              <span>目标所属角色 // TARGET AGENT</span>
              <span className="text-[10px] text-emerald-400 font-normal">(智能预测匹配)</span>
            </label>
            <select
              value={targetChar}
              onChange={(e) => setTargetChar(e.target.value)}
              className="w-full bg-[#121622] border border-cyan-500/30 focus:border-cyan-400 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-sans focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
            >
              {inspection.availableCharacters.map((c) => (
                <option key={c.id} value={c.name} className="bg-[#0f121d] text-slate-100">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mod Folder Name */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Mod 文件夹名称 // DIRECTORY IDENTIFIER
            </label>
            <input
              type="text"
              required
              value={modName}
              onChange={(e) => setModName(e.target.value)}
              className="w-full bg-[#121622] border border-cyan-500/30 focus:border-cyan-400 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
            />
          </div>

          {/* Enable immediately checkbox */}
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="enableImmediately"
              checked={enableImmediately}
              onChange={(e) => setEnableImmediately(e.target.checked)}
              className="w-4 h-4 rounded bg-[#121622] border-cyan-500/40 text-cyan-500 focus:ring-cyan-400 cursor-pointer accent-cyan-400"
            />
            <label
              htmlFor="enableImmediately"
              className="text-xs text-slate-300 cursor-pointer select-none flex items-center space-x-1.5"
            >
              <span className="font-bold text-white">导入后立即装备激活该 Mod</span>
              <span className="text-[10px] text-slate-500">(单选互斥生效时自动停用同角色其他Mod)</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-cyan-500/10">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              取消 // CANCEL
            </button>
            <button
              type="submit"
              disabled={importing}
              className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-[#E5FE40] to-[#A3E635] hover:brightness-110 text-black shadow-[0_0_20px_rgba(229,254,64,0.35)] transition-all active:scale-95 ${
                importing ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {importing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>正在规整解压并导入...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 fill-black text-black" />
                  <span>开始解压规整 // DEPLOY</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
