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
        setPersistToast(`已成功设定 $${v.name} = ${nextVal} (已热刷新)`)
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
        setPersistToast('已重置该 Mod 全部服装与开关至默认值')
        setTimeout(() => setPersistToast(null), 3000)
      } else {
        setPersistToast(`重置失败: ${res?.error || '未知错误'}`)
        setTimeout(() => setPersistToast(null), 3000)
      }
    } catch (err: any) {
      console.error('Failed to reset mod variables:', err)
    } finally {
      setResettingVars(false)
    }
  }

  const checkConflicts = async (charName: string, modName: string) => {
    try {
      const reps: any = await window.lz.detectConflicts(charName)
      if (reps && reps[charName]?.conflictsByMod?.[modName]?.hasConflict) {
        setConflictSummary(reps[charName].conflictsByMod[modName])
      } else {
        setConflictSummary(null)
      }
    } catch (_) {}
  }

  const handleResolveConflict = async (keepThisMod: boolean) => {
    if (!details || !conflictSummary) return
    setResolvingConflict(true)
    try {
      const keep = keepThisMod ? details.name : conflictSummary.conflictingMods[0]
      const conflicts = keepThisMod ? conflictSummary.conflictingMods : [details.name]

      await window.lz.resolveConflicts(details.characterName, keep, conflicts)
      await loadDetails()
    } finally {
      setResolvingConflict(false)
    }
  }

  useEffect(() => {
    loadDetails()
  }, [modFullPath])

  const handleSelectIni = async (fullPath: string) => {
    setSelectedIni(fullPath)
    try {
      const content = await window.lz.readIni(fullPath)
      setIniContent(content)
    } catch (err) {
      console.error('Failed to read INI file:', err)
    }
  }

  const handleSaveMetadata = async () => {
    setSavingMeta(true)
    setSavedSuccess(false)
    try {
      await window.lz.saveModMetadata(modFullPath, {
        author,
        version,
        description
      })
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2500)
    } catch (err) {
      console.error('Failed to save metadata:', err)
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
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center space-y-3 text-blue-600">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shadow-sm" />
          <span className="text-xs font-mono tracking-widest uppercase text-slate-500">
            // 加载模组数据中 //
          </span>
        </div>
      </div>
    )
  }

  if (!details) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
        <p className="text-sm font-mono text-slate-500">未能找到此 Mod 的目录实体或已被移除</p>
        <button
          onClick={onBack}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs"
        >
          返回模组库
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
    <div className="flex-1 flex flex-col overflow-y-auto text-slate-800 select-none porcelain-scrollbar-light">
      {/* 1. Light Breadcrumb Header Bar */}
      <div className="sticky top-0 z-30 bg-white/85 backdrop-blur-2xl border-b border-blue-100 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3.5">
          <button
            onClick={onBack}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-600 border border-slate-200 hover:border-blue-300 transition text-xs font-semibold active:scale-95 shadow-sm"
            title="返回模组库"
          >
            <ArrowLeft className="w-4 h-4 text-blue-600" />
            <span>返回模组库</span>
          </button>

          <button
            onClick={handleOpenFolder}
            className="p-1.5 rounded-xl bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-600 border border-slate-200 hover:border-blue-300 transition active:scale-95 shadow-sm"
            title="在系统资源管理器中打开文件夹"
          >
            <FolderOpen className="w-4 h-4 text-blue-600" />
          </button>

          <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
            <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
              #{details.characterName}
            </span>
            <h1 className="text-sm font-bold text-slate-900 tracking-wide truncate max-w-sm sm:max-w-md">
              {details.name}
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
              {version}
            </span>
          </div>
        </div>

        {/* Right Action: Equip / Unequip */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`flex items-center space-x-2 px-5 py-2 rounded-2xl text-xs font-bold tracking-wide transition-all shadow-sm active:scale-95 ${
              details.enabled
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
                : 'bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 hover:from-blue-600 hover:to-sky-500 text-white shadow-md shadow-blue-500/20'
            } ${toggling ? 'opacity-50 cursor-wait' : ''}`}
          >
            {toggling ? (
              <RotateCcw className="w-4 h-4 animate-spin" />
            ) : details.enabled ? (
              <>
                <XCircle className="w-4 h-4 text-rose-500" />
                <span>卸下模组</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-white text-white" />
                <span>装备启用</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full p-6 space-y-6">
        {/* Conflict Diagnostic Banner */}
        {conflictSummary && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-xl bg-rose-100 text-rose-600 border border-rose-200 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-rose-800 tracking-wide flex items-center space-x-2">
                  <span>检测到 3DMigoto 资源冲突</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-600 text-white font-mono">
                    {conflictSummary.collisions.length} 处 Hash 重叠
                  </span>
                </h3>
                <p className="text-[11px] text-rose-700/80 mt-1 leading-relaxed">
                  当前 Mod 与已启用的{' '}
                  <span className="font-semibold text-rose-900">
                    {conflictSummary.conflictingMods.join(', ')}
                  </span>{' '}
                  修改了相同游戏模型或贴图，可能导致画面撕裂或崩溃。
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => handleResolveConflict(true)}
                disabled={resolvingConflict}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm transition active:scale-95"
              >
                仅保留此 Mod
              </button>
              <button
                onClick={() => handleResolveConflict(false)}
                disabled={resolvingConflict}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition"
              >
                禁用此 Mod
              </button>
            </div>
          </div>
        )}

        {/* 2. Hero Preview Showcase (白瓷圆角视口) */}
        <div className="space-y-3">
          <div className="relative aspect-[21/9] sm:aspect-[16/7] bg-white border border-blue-100 rounded-3xl overflow-hidden flex items-center justify-center shadow-sm">
            {activeImage ? (
              <img
                src={`file://${activeImage.path}`}
                alt={details.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400">
                <ImageIcon className="w-12 h-12 stroke-[1.2] mb-2" />
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  暂无预览立绘
                </span>
              </div>
            )}

            {/* Floating Navigation Controls */}
            {hasImages && images.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
                  }
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-2xl bg-white/80 hover:bg-white text-slate-700 backdrop-blur-md border border-slate-200 shadow-md transition"
                  title="上一张"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() =>
                    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-2xl bg-white/80 hover:bg-white text-slate-700 backdrop-blur-md border border-slate-200 shadow-md transition"
                  title="下一张"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Floating Utility Capsule */}
            {activeImage && (
              <div className="absolute top-4 right-4 flex items-center space-x-2">
                <div className="flex items-center space-x-1.5 bg-white/90 backdrop-blur-xl border border-blue-100 rounded-2xl p-1.5 shadow-md">
                  {/* Smart Crop Button */}
                  <button
                    onClick={() => {
                      setCropImageSrc(`file://${activeImage.path}`)
                      setIsCropOpen(true)
                    }}
                    className="flex items-center space-x-1 px-3 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition"
                    title="裁切此图片并保存为封面"
                  >
                    <CropIcon className="w-3.5 h-3.5" />
                    <span>裁切封面</span>
                  </button>

                  {/* Set as Cover */}
                  {!activeImage.isCover && (
                    <button
                      onClick={() => handleSetCover(activeImage.path)}
                      className="flex items-center space-x-1 px-3 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold transition"
                      title="直接将此图设为当前 Mod 封面"
                    >
                      <Star className="w-3.5 h-3.5" />
                      <span>设为Mod封面</span>
                    </button>
                  )}

                  {/* Set as Character Avatar */}
                  <button
                    onClick={async () => {
                      if (!details) return
                      const res = await window.lz.setCharacterAvatar(details.characterName, activeImage.path)
                      if (res?.success) {
                        alert(`已成功将此图设为【${details.characterName}】的角色缩略图！`)
                      }
                    }}
                    className="flex items-center space-x-1 px-3 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold transition"
                    title="将此图设为左侧菜单中该角色的代表头像"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>设为角色头像</span>
                  </button>

                  {/* Delete Image */}
                  {images.length > 1 && (
                    <button
                      onClick={() => handleDeleteImage(activeImage.path)}
                      className="p-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
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
            <div className="flex items-center space-x-2.5 overflow-x-auto pb-1 porcelain-scrollbar-light">
              {images.map((img, idx) => (
                <button
                  key={img.path}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={`relative w-20 h-14 rounded-2xl overflow-hidden shrink-0 border transition ${
                    currentImageIndex === idx
                      ? 'border-blue-600 shadow-md ring-2 ring-blue-500/20'
                      : 'border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300'
                  }`}
                >
                  <img src={`file://${img.path}`} alt="" className="w-full h-full object-cover" />
                  {img.isCover && (
                    <div className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-blue-600 shadow-sm" />
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
                <div className="p-2 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase flex items-center space-x-2">
                    <span>模组设定数值调控 (PERSIST BRIDGE)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-blue-50 text-blue-600 border border-blue-200">
                      {persistInfo.variables.length} 个调控变量
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                    实时调节发型、服饰部件与开关，变更立即写回 3DMigoto 并触发游戏热刷新
                  </p>
                </div>
              </div>

              <button
                onClick={handleResetVariables}
                disabled={resettingVars}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-blue-600 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition disabled:opacity-50 active:scale-95 shadow-sm"
                title="将此 Mod 的所有服装与开关数值重置为默认值"
              >
                <RotateCcw className={`w-3.5 h-3.5 text-blue-600 ${resettingVars ? 'animate-spin' : ''}`} />
                <span>重置默认值</span>
              </button>
            </div>

            {persistToast && (
              <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-center space-x-2 animate-in fade-in duration-200 shadow-sm">
                <Zap className="w-4 h-4 text-blue-600 shrink-0 fill-current" />
                <span className="font-semibold">{persistToast}</span>
              </div>
            )}

            <div className="bg-white border border-blue-100 rounded-3xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4 shadow-sm">
              {persistInfo.variables.map((v) => {
                const allowed = v.allowedValues && v.allowedValues.length > 0 ? v.allowedValues : ['0', '1']
                const isBinary = allowed.length === 2 && allowed.includes('0') && allowed.includes('1')
                const isOn = v.currentValue === '1'
                const isUpdating = updatingVar === v.name

                return (
                  <div
                    key={v.name}
                    className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 hover:border-blue-300 transition-all flex flex-col justify-between space-y-3.5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-mono font-bold text-slate-900 tracking-wide">
                            ${v.name}
                          </span>
                          {v.keybind && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                              {v.keybind}
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-slate-500 font-mono mt-0.5">
                          来源: {v.iniFile} · 默认值: {v.defaultValue}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span className="text-[11px] text-slate-500 font-mono">当前:</span>
                        <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-white text-blue-600 border border-blue-200 shadow-sm">
                          {v.currentValue}
                        </span>
                      </div>
                    </div>

                    {/* Interactive Switch or Segmented Cycle */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                      <span className="text-[11px] text-slate-500 font-medium">
                        调控档位:
                      </span>

                      {isBinary ? (
                        <button
                          onClick={() => handleUpdateVariable(v, isOn ? '0' : '1')}
                          disabled={isUpdating}
                          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all active:scale-95 ${
                            isOn
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                          } ${isUpdating ? 'opacity-50 cursor-wait' : ''}`}
                        >
                          {isOn ? (
                            <>
                              <ToggleRight className="w-4 h-4 text-white" />
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
                              className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all active:scale-95 ${
                                v.currentValue === val
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'bg-white text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-300'
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

        {/* 4. Equipment Specifications */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-blue-600" />
            <span>模组规格与元数据</span>
          </h2>

          <div className="bg-white border border-blue-100 rounded-3xl p-5 space-y-4 shadow-sm">
            {/* 检查时间 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-2xl bg-blue-50 text-blue-600">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-800">检查时间</h4>
                  <p className="text-[11px] text-slate-500">上次检索此模组的时间戳</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700">
                  {details.metadata?.checkTime || '2026/10/5'}
                </span>
                <Clock className="w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* 最后更新 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-2xl bg-blue-50 text-blue-600">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-800">最后更新</h4>
                  <p className="text-[11px] text-slate-500">模组文件上次物理写入修改时间</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700">
                  {details.metadata?.lastUpdated || '2026/10/5'}
                </span>
                <Clock className="w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* 作者 (可编辑) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-2xl bg-blue-50 text-blue-600">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-800">创作者</h4>
                  <p className="text-[11px] text-slate-500">模组原作者署名</p>
                </div>
              </div>

              <input
                type="text"
                placeholder="请输入创作者署名..."
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-64 bg-slate-50 border border-slate-200 focus:border-blue-400 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-sans"
              />
            </div>

            {/* 版本号 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-2xl bg-blue-50 text-blue-600">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-800">版本标识</h4>
                  <p className="text-[11px] text-slate-500">模组发布版本编号</p>
                </div>
              </div>

              <input
                type="text"
                placeholder="例如：Version 1.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-64 bg-slate-50 border border-slate-200 focus:border-blue-400 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-sans"
              />
            </div>

            {/* 磁盘路径与体积 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-2xl bg-blue-50 text-blue-600">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-800">物理存储路径</h4>
                  <p className="text-[11px] font-mono text-slate-500 truncate max-w-sm sm:max-w-md">
                    {details.fullPath}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 text-xs font-mono text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200">
                <span className="font-bold text-slate-800">{formatSize(details.totalSize)}</span>
                <span className="text-slate-400">/</span>
                <span>{details.fileCount} 个文件</span>
              </div>
            </div>

            {/* 保存修改按钮 */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveMetadata}
                disabled={savingMeta}
                className={`flex items-center space-x-1.5 px-5 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  savedSuccess
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20'
                }`}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>信息已保存</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>保存信息修改</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 5. INI 配置文件查看器 */}
        {details.iniFiles && details.iniFiles.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase flex items-center space-x-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>3DMIGOTO 配置脚本 ({details.iniFiles.length})</span>
            </h2>

            <div className="bg-white border border-blue-100 rounded-3xl p-5 space-y-3 shadow-sm">
              {/* Tab Selector for INI files */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1 porcelain-scrollbar-light">
                {details.iniFiles.map((ini) => (
                  <button
                    key={ini.fullPath}
                    onClick={() => handleSelectIni(ini.fullPath)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition ${
                      selectedIni === ini.fullPath
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-sky-200 leading-relaxed focus:outline-none resize-y selection:bg-blue-600 selection:text-white"
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
