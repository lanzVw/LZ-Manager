import React, { useState, useEffect } from 'react'
import {
  ArrowLeft,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Star,
  Trash2,
  Calendar,
  Clock,
  User,
  HardDrive,
  FileText,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Save,
  Check,
  Tag,
  Crop as CropIcon,
  AlertTriangle,
  Sparkles,
  Sliders,
  RotateCcw,
  ToggleLeft,
  ToggleRight,
  Zap,
  Cpu
} from 'lucide-react'
import { ModDetailedInfo, ModConflictSummary, ModPersistInfo, ModPersistVariable } from '../../core/types'
import { CropDialog } from '../components/CropDialog'

interface ModDetailPageProps {
  modFullPath: string
  onBack: () => void
  onToggleActive: (charName: string, modName: string, enabled: boolean) => Promise<void>
}

export const ModDetailPage: React.FC<ModDetailPageProps> = ({
  modFullPath,
  onBack,
  onToggleActive
}) => {
  const [details, setDetails] = useState<ModDetailedInfo | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0)
  const [author, setAuthor] = useState<string>('')
  const [version, setVersion] = useState<string>('Version 1.0')
  const [description, setDescription] = useState<string>('')
  const [savingMeta, setSavingMeta] = useState<boolean>(false)
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false)
  const [selectedIni, setSelectedIni] = useState<string | null>(null)
  const [iniContent, setIniContent] = useState<string>('')
  const [toggling, setToggling] = useState<boolean>(false)

  // Smart Crop Workshop State
  const [isCropOpen, setIsCropOpen] = useState<boolean>(false)
  const [cropImageSrc, setCropImageSrc] = useState<string>('')

  // Mod Conflict Diagnostic State
  const [conflictSummary, setConflictSummary] = useState<ModConflictSummary | null>(null)
  const [resolvingConflict, setResolvingConflict] = useState<boolean>(false)

  // Mod Persist Bridge Variables State
  const [persistInfo, setPersistInfo] = useState<ModPersistInfo | null>(null)
  const [updatingVar, setUpdatingVar] = useState<string | null>(null)
  const [resettingVars, setResettingVars] = useState<boolean>(false)
  const [persistToast, setPersistToast] = useState<string | null>(null)

  // 加载 Mod 详情
  const loadDetails = async () => {
    setLoading(true)
    try {
      const data = await window.lz.getModDetails(modFullPath)
      if (data) {
        setDetails(data)
        setAuthor(data.metadata?.author || '')
        setVersion(data.metadata?.version || 'Version 1.0')
        setDescription(data.metadata?.description || '')
        setPersistInfo(data.persistInfo || null)

        // 默认选中第一个 ini 文件
        if (data.iniFiles && data.iniFiles.length > 0) {
          setSelectedIni(data.iniFiles[0].fullPath)
          const content = await window.lz.readIni(data.iniFiles[0].fullPath)
          setIniContent(content)
        }

        // 检查 3DMigoto 资源冲突
        checkConflicts(data.characterName, data.name)
      }
    } catch (err) {
      console.error('Failed to load mod details:', err)
    } finally {
      setLoading(false)
    }
  }

  // 切换/循环修改 Mod 变量数值
  const handleUpdateVariable = async (v: ModPersistVariable, targetVal?: string) => {
    if (!details) return
    const allowed = v.allowedValues && v.allowedValues.length > 0 ? v.allowedValues : ['0', '1']
    let nextVal = targetVal
    if (nextVal === undefined) {
      const currIdx = allowed.indexOf(v.currentValue)
      nextVal = currIdx >= 0 ? allowed[(currIdx + 1) % allowed.length] : allowed[0]
    }

    setUpdatingVar(v.name)
    // 乐观更新状态
    setPersistInfo((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        variables: prev.variables.map((item) =>
          item.name === v.name ? { ...item, currentValue: nextVal! } : item
        )
      }
    })

    try {
      const res = await window.lz.updateModVariable(details.fullPath, v.name, nextVal)
      if (res && res.success) {
        setPersistToast(`已成功设定 $${v.name} = ${nextVal} (已触发 F10 热刷新)`)
        setTimeout(() => setPersistToast(null), 3000)
      } else {
        setPersistToast(`修改失败: ${res?.error || '未知错误'}`)
        setTimeout(() => setPersistToast(null), 3000)
      }
    } catch (err: any) {
      console.error('Failed to update mod variable:', err)
    } finally {
      setUpdatingVar(null)
    }
  }

  // 重置该 Mod 全部设定数值为默认值
  const handleResetVariables = async () => {
    if (!details || !persistInfo) return
    setResettingVars(true)
    try {
      const res = await window.lz.resetModVariables(details.fullPath)
      if (res && res.success) {
        setPersistInfo((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            variables: prev.variables.map((item) => ({ ...item, currentValue: item.defaultValue }))
          }
        })
        setPersistToast(`已成功将 ${res.resetCount} 项设定数值重置为默认值！`)
        setTimeout(() => setPersistToast(null), 3500)
      }
    } catch (err: any) {
      console.error('Failed to reset mod variables:', err)
    } finally {
      setResettingVars(false)
    }
  }

  // 检查 Mod 冲突
  const checkConflicts = async (charName: string, modName: string) => {
    try {
      const rep: any = await window.lz.detectConflicts(charName)
      if (rep && rep.conflictsByMod && rep.conflictsByMod[modName]?.hasConflict) {
        setConflictSummary(rep.conflictsByMod[modName])
      } else {
        setConflictSummary(null)
      }
    } catch (err) {
      console.warn('Conflict detection error:', err)
    }
  }

  // 解决冲突：仅保留此 Mod，禁用冲突项
  const handleResolveConflicts = async () => {
    if (!details || !conflictSummary) return
    setResolvingConflict(true)
    try {
      await window.lz.resolveConflicts(
        details.characterName,
        details.name,
        conflictSummary.conflictingMods
      )
      await loadDetails()
    } finally {
      setResolvingConflict(false)
    }
  }

  // 全局 Ctrl+V 截图直接进入裁剪工坊
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return
      }
      if (e.clipboardData && e.clipboardData.items) {
        for (const item of e.clipboardData.items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              const reader = new FileReader()
              reader.onload = (event) => {
                const dataUrl = event.target?.result as string
                if (dataUrl) {
                  setCropImageSrc(dataUrl)
                  setIsCropOpen(true)
                }
              }
              reader.readAsDataURL(file)
              e.preventDefault()
              break
            }
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  useEffect(() => {
    loadDetails()
  }, [modFullPath])

  const handleSelectIni = async (fullPath: string) => {
    setSelectedIni(fullPath)
    try {
      const content = await window.lz.readIni(fullPath)
      setIniContent(content)
    } catch (err) {
      console.error('Failed to read INI:', err)
    }
  }

  const handleSaveMetadata = async () => {
    if (!details) return
    setSavingMeta(true)
    try {
      await window.lz.saveModMetadata(modFullPath, {
        author: author.trim(),
        version: version.trim(),
        description: description.trim()
      })
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2000)
    } finally {
      setSavingMeta(false)
    }
  }

  const handleOpenFolder = () => {
    window.lz.openModFolder(modFullPath)
  }

  const handleSetCover = async (imagePath: string) => {
    await window.lz.setAsCoverImage(modFullPath, imagePath)
    await loadDetails()
  }

  const handleDeleteImage = async (imagePath: string) => {
    if (!confirm('确定要删除这张预览图吗？')) return
    await window.lz.deleteModImage(imagePath)
    if (currentImageIndex > 0) {
      setCurrentImageIndex((prev) => prev - 1)
    }
    await loadDetails()
  }

  const handleToggle = async () => {
    if (!details) return
    setToggling(true)
    try {
      await onToggleActive(details.characterName, details.name, !details.enabled)
      await loadDetails()
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#07090F]/90">
        <div className="flex flex-col items-center space-y-3 text-cyan-400">
          <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(0,240,255,0.4)]" />
          <span className="text-xs font-mono tracking-widest uppercase text-cyan-300">
            // LOADING MOD TELEMETRY //
          </span>
        </div>
      </div>
    )
  }

  if (!details) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#07090F] p-6 space-y-4">
        <p className="text-sm font-mono text-slate-400">未能找到此 Mod 的目录实体或已被移除</p>
        <button
          onClick={onBack}
          className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-black font-extrabold rounded-xl text-xs uppercase tracking-wider"
        >
          返回名册 // RETURN
        </button>
      </div>
    )
  }

  const images = details.images || []
  const hasImages = images.length > 0
  const activeImage = hasImages ? images[currentImageIndex] || images[0] : null

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#07090E] text-slate-100 select-none">
      {/* 1. Tactical HUD Header Bar */}
      <div className="sticky top-0 z-30 bg-[#0B0D14]/95 backdrop-blur-xl border-b border-cyan-500/20 px-6 py-3 flex items-center justify-between shadow-2xl">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#121622] hover:bg-[#1A2033] text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-400 transition text-xs font-bold active:scale-95"
            title="返回名册"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回名册</span>
          </button>

          <button
            onClick={handleOpenFolder}
            className="p-1.5 rounded-xl bg-[#121622] hover:bg-[#1A2033] text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-400 transition active:scale-95"
            title="在系统资源管理器中打开文件夹"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          <div className="flex items-center space-x-2 pl-2 border-l border-cyan-500/20">
            <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded-md border border-cyan-800/50">
              #{details.characterName}
            </span>
            <h1 className="text-sm font-black text-white tracking-wide truncate max-w-sm sm:max-w-md">
              {details.name}
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 font-semibold border border-slate-700/60">
              {version}
            </span>
          </div>
        </div>

        {/* Right Action: Equip / Unequip Tactical Trigger */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-black tracking-wider uppercase transition-all shadow-lg active:scale-95 ${
              details.enabled
                ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 hover:border-rose-400 shadow-rose-950/30'
                : 'bg-gradient-to-r from-[#E5FE40] via-[#CCFF00] to-[#84CC16] hover:brightness-110 text-black shadow-[0_0_20px_rgba(229,254,64,0.4)]'
            } ${toggling ? 'opacity-50 cursor-wait' : ''}`}
          >
            {toggling ? (
              <RotateCcw className="w-4 h-4 animate-spin" />
            ) : details.enabled ? (
              <>
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>卸下脱除 // EJECT</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-black text-black" />
                <span>装备启用 // EQUIP</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full p-6 space-y-6">
        {/* 1.5 冲突诊断预警条 (Conflict Warning Banner) */}
        {conflictSummary && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/80 via-rose-900/40 to-slate-900 border border-rose-500/60 shadow-[0_0_25px_rgba(244,63,94,0.25)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-black text-rose-200 tracking-wide flex items-center space-x-2">
                  <span>检测到 3DMIGOTO 资源冲突</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-600 text-white font-mono">
                    {conflictSummary.collisions.length} 处 Hash 重叠
                  </span>
                </h3>
                <p className="text-[11px] text-rose-300/80 mt-1 leading-relaxed">
                  当前 Mod 与已启用的{' '}
                  <span className="font-bold text-white underline underline-offset-2">
                    {conflictSummary.conflictingMods.join(', ')}
                  </span>{' '}
                  修改了相同的人物模型材质或 Shader，同时开启会导致游戏内模型拉丝撕裂或闪退。
                </p>
              </div>
            </div>

            <button
              onClick={handleResolveConflicts}
              disabled={resolvingConflict}
              className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-lg shadow-rose-600/30 transition shrink-0 active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{resolvingConflict ? '正在排除冲突...' : '一键排除冲突 (仅保留此 Mod)'}</span>
            </button>
          </div>
        )}

        {/* 2. Anime Hero Equipment Showcase Frame */}
        <div className="relative rounded-3xl bg-[#0B0D14]/90 border border-cyan-500/30 overflow-hidden shadow-2xl p-5 space-y-4 acg-corner-markers">
          {/* Main Visual Display */}
          <div className="relative aspect-[16/9] w-full bg-[#07090F] rounded-2xl overflow-hidden flex items-center justify-center border border-cyan-500/20 shadow-inner group">
            {activeImage ? (
              <img
                src={`file://${activeImage.path}`}
                alt={activeImage.name}
                className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-102"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-600 space-y-2">
                <ImageIcon className="w-12 h-12 stroke-[1.2] text-cyan-500/30" />
                <span className="text-xs font-mono text-cyan-400/50 uppercase tracking-widest">
                  // NO VISUAL ASSET ARCHIVED //
                </span>
                <span className="text-[11px] text-slate-500">
                  支持按 Ctrl+V 粘贴系统截图直接存为封面
                </span>
              </div>
            )}

            {/* Left/Right Carousel Nav */}
            {hasImages && images.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
                  }
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-cyan-500/30 text-white border border-cyan-500/30 backdrop-blur-md opacity-0 group-hover:opacity-100 transition shadow-lg"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() =>
                    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-cyan-500/30 text-white border border-cyan-500/30 backdrop-blur-md opacity-0 group-hover:opacity-100 transition shadow-lg"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Floating Image Tools Overlay */}
            {activeImage && (
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity bg-black/75 backdrop-blur-md px-4 py-2.5 rounded-xl border border-cyan-500/30">
                <span className="text-xs font-mono font-bold text-cyan-300 truncate max-w-xs">
                  {activeImage.name}
                </span>

                <div className="flex items-center space-x-2">
                  {/* Smart Crop Workshop Button */}
                  <button
                    onClick={() => {
                      setCropImageSrc(`file://${activeImage.path}`)
                      setIsCropOpen(true)
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-[#E5FE40]/20 hover:bg-[#E5FE40]/30 text-[#E5FE40] border border-[#E5FE40]/50 transition"
                    title="在智能裁剪工坊微调比例并保存为高清封面"
                  >
                    <CropIcon className="w-3.5 h-3.5" />
                    <span>裁剪封面</span>
                  </button>

                  <button
                    onClick={() => handleSetCover(activeImage.path)}
                    disabled={activeImage.isCover}
                    className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                      activeImage.isCover
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
                    }`}
                  >
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>{activeImage.isCover ? '默认封面' : '设为封面'}</span>
                  </button>

                  {images.length > 1 && (
                    <button
                      onClick={() => handleDeleteImage(activeImage.path)}
                      className="p-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 transition"
                      title="删除此图片"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Thumbnails Row */}
          {hasImages && images.length > 1 && (
            <div className="flex items-center space-x-2 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={img.path}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={`relative w-20 h-14 rounded-xl overflow-hidden shrink-0 border transition ${
                    currentImageIndex === idx
                      ? 'border-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.4)] scale-105 ring-1 ring-cyan-400'
                      : 'border-slate-800 opacity-60 hover:opacity-100 hover:border-slate-600'
                  }`}
                >
                  <img src={`file://${img.path}`} alt="" className="w-full h-full object-cover" />
                  {img.isCover && (
                    <div className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-[#E5FE40] shadow-[0_0_6px_rgba(229,254,64,0.8)]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. Mod 设定数值记忆与调节 (Persist Bridge Matrix) */}
        {persistInfo && persistInfo.hasPersist && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs font-black text-white tracking-wider uppercase flex items-center space-x-2">
                    <span>Mod 设定数值记忆与调节 // VARIABLE MATRIX</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#E5FE40]/20 text-[#E5FE40] border border-[#E5FE40]/40">
                      {persistInfo.variables.length} PARAMS ACTIVE
                    </span>
                  </h2>
                  <p className="text-[11px] text-cyan-400/80 font-mono mt-0.5">
                    // 实时调整发型、衣服开关、湿身度，点击立即写回 3DMigoto 并触发热刷新
                  </p>
                </div>
              </div>

              <button
                onClick={handleResetVariables}
                disabled={resettingVars}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-[#121622] hover:bg-[#1A2033] border border-cyan-500/30 hover:border-cyan-400 transition disabled:opacity-50 active:scale-95 shadow-sm"
                title="将此 Mod 的所有服装与开关数值重置为默认值"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${resettingVars ? 'animate-spin' : ''}`} />
                <span>重置默认值 // RECALIBRATE</span>
              </button>
            </div>

            {persistToast && (
              <div className="p-3 rounded-xl bg-cyan-950/80 border border-cyan-400/80 text-xs text-cyan-200 flex items-center space-x-2 animate-in fade-in duration-200 shadow-[0_0_20px_rgba(0,240,255,0.25)]">
                <Zap className="w-4 h-4 text-[#E5FE40] shrink-0 fill-current" />
                <span className="font-medium">{persistToast}</span>
              </div>
            )}

            <div className="bg-[#0B0D14]/90 border border-cyan-500/20 rounded-3xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4 shadow-xl">
              {persistInfo.variables.map((v) => {
                const allowed = v.allowedValues && v.allowedValues.length > 0 ? v.allowedValues : ['0', '1']
                const isBinary = allowed.length === 2 && allowed.includes('0') && allowed.includes('1')
                const isOn = v.currentValue === '1'
                const isUpdating = updatingVar === v.name

                return (
                  <div
                    key={v.name}
                    className="p-4 rounded-2xl bg-[#0F121C] border border-cyan-500/20 hover:border-cyan-400/60 transition-all flex flex-col justify-between space-y-3.5 shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-mono font-black text-white tracking-wide">
                            ${v.name}
                          </span>
                          {v.keybind && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#131326] text-fuchsia-300 border border-fuchsia-500/40 shadow-sm">
                              {v.keybind}
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-slate-400 font-mono mt-0.5">
                          来源: {v.iniFile} · 默认值: {v.defaultValue}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span className="text-[11px] text-slate-400 font-mono">VAL:</span>
                        <span className="text-xs font-mono font-black px-2.5 py-0.5 rounded-lg bg-[#07090F] text-[#E5FE40] border border-[#E5FE40]/40 shadow-sm">
                          {v.currentValue}
                        </span>
                      </div>
                    </div>

                    {/* Interactive Switch or Segmented Cycle */}
                    <div className="flex items-center justify-between pt-2 border-t border-cyan-500/10">
                      <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                        // TUNING CONTROL:
                      </span>

                      {isBinary ? (
                        <button
                          onClick={() => handleUpdateVariable(v, isOn ? '0' : '1')}
                          disabled={isUpdating}
                          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-black tracking-wider uppercase transition-all active:scale-95 ${
                            isOn
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.3)] hover:bg-cyan-500/30'
                              : 'bg-slate-800/60 text-slate-400 border border-slate-700/60 hover:bg-slate-800'
                          } ${isUpdating ? 'opacity-50 cursor-wait' : ''}`}
                        >
                          {isOn ? (
                            <>
                              <ToggleRight className="w-4 h-4 text-cyan-400" />
                              <span>已开启 (1)</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-4 h-4 text-slate-400" />
                              <span>已关闭 (0)</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="flex items-center space-x-1.5">
                          {allowed.map((val) => (
                            <button
                              key={val}
                              onClick={() => handleUpdateVariable(v, val)}
                              disabled={isUpdating}
                              className={`px-3 py-1 rounded-lg text-xs font-mono font-black transition-all active:scale-95 ${
                                v.currentValue === val
                                  ? 'bg-[#E5FE40] text-black shadow-[0_0_15px_rgba(229,254,64,0.5)] scale-105'
                                  : 'bg-[#121622] text-slate-400 hover:text-white border border-cyan-500/20 hover:border-cyan-400'
                              } ${isUpdating ? 'opacity-50' : ''}`}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 4. Details Section (Equipment Specifications) */}
        <div className="space-y-4">
          <h2 className="text-xs font-black text-cyan-400/90 tracking-widest uppercase flex items-center space-x-2">
            <Cpu className="w-4 h-4" />
            <span>模组技术规格 // MOD SPECIFICATIONS</span>
          </h2>

          <div className="bg-[#0B0D14]/90 border border-cyan-500/20 rounded-3xl p-5 space-y-4 shadow-xl">
            {/* 检查时间 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-cyan-500/10 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">检查时间 // CHECK TIME</h4>
                  <p className="text-[11px] text-slate-500">您上次检查此模组的时间戳</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono bg-[#07090F] px-3 py-1.5 rounded-lg border border-cyan-500/20 text-slate-300">
                  {details.metadata?.checkTime || '2026/10/5'}
                </span>
                <Clock className="w-4 h-4 text-cyan-500/60" />
              </div>
            </div>

            {/* 最后更新 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-cyan-500/10 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">最后更新 // LAST UPDATED</h4>
                  <p className="text-[11px] text-slate-500">此模组文件上次物理写入修改时间</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono bg-[#07090F] px-3 py-1.5 rounded-lg border border-cyan-500/20 text-slate-300">
                  {details.metadata?.lastUpdated || '2026/10/5'}
                </span>
                <Clock className="w-4 h-4 text-cyan-500/60" />
              </div>
            </div>

            {/* 作者 (可编辑) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-cyan-500/10 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">创作者 // AUTHOR</h4>
                  <p className="text-[11px] text-slate-500">模组原作者署名</p>
                </div>
              </div>

              <input
                type="text"
                placeholder="请输入创作者署名..."
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-64 bg-[#07090F] border border-cyan-500/30 focus:border-cyan-400 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-sans"
              />
            </div>

            {/* 版本号 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-cyan-500/10 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">版本标识 // REVISION</h4>
                  <p className="text-[11px] text-slate-500">模组发布版本编号</p>
                </div>
              </div>

              <input
                type="text"
                placeholder="例如：Version 1.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-64 bg-[#07090F] border border-cyan-500/30 focus:border-cyan-400 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-sans"
              />
            </div>

            {/* 磁盘路径与体积 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">物理存储路径 // STORAGE</h4>
                  <p className="text-[11px] font-mono text-slate-400 truncate max-w-sm sm:max-w-md">
                    {details.fullPath}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 text-xs font-mono text-cyan-300 bg-[#07090F] px-3 py-1.5 rounded-xl border border-cyan-500/20">
                <span className="font-bold text-[#E5FE40]">{formatSize(details.totalSize)}</span>
                <span className="text-slate-600">/</span>
                <span>{details.fileCount} 个文件</span>
              </div>
            </div>

            {/* 保存修改按钮 */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveMetadata}
                disabled={savingMeta}
                className={`flex items-center space-x-1.5 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 ${
                  savedSuccess
                    ? 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(52,211,153,0.5)]'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-black shadow-lg shadow-cyan-600/30'
                }`}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>元数据已固化！</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>保存信息修改 // COMMIT</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 5. INI 配置文件查看器 (Technical Console) */}
        {details.iniFiles && details.iniFiles.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-black text-cyan-400/90 tracking-widest uppercase flex items-center space-x-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>3DMIGOTO 配置脚本 // INI DESCRIPTORS ({details.iniFiles.length})</span>
            </h2>

            <div className="bg-[#0B0D14]/90 border border-cyan-500/20 rounded-3xl p-5 space-y-3 shadow-xl">
              {/* Tab Selector for INI files */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                {details.iniFiles.map((ini) => (
                  <button
                    key={ini.fullPath}
                    onClick={() => handleSelectIni(ini.fullPath)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition ${
                      selectedIni === ini.fullPath
                        ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                        : 'bg-[#121622] text-slate-400 hover:text-white border border-cyan-500/20'
                    }`}
                  >
                    {ini.name}
                  </button>
                ))}
              </div>

              {/* Code viewer */}
              <div className="relative">
                <textarea
                  readOnly
                  value={iniContent}
                  rows={10}
                  className="w-full bg-[#07090F] border border-cyan-500/20 rounded-2xl p-4 text-xs font-mono text-cyan-300 leading-relaxed focus:outline-none resize-y selection:bg-cyan-500 selection:text-black"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Smart Crop Modal */}
      {isCropOpen && (
        <CropDialog
          isOpen={isCropOpen}
          onClose={() => setIsCropOpen(false)}
          imageSrc={cropImageSrc || (activeImage ? `file://${activeImage.path}` : '')}
          modFullPath={modFullPath}
          characterName={details.characterName}
          modName={details.name}
          onCoverSaved={async () => {
            await loadDetails()
          }}
        />
      )}
    </div>
  )
}
