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
  Tag
} from 'lucide-react'
import { ModDetailedInfo } from '../../core/types'

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

        // 默认选中第一个 ini 文件
        if (data.iniFiles && data.iniFiles.length > 0) {
          setSelectedIni(data.iniFiles[0].fullPath)
          const content = await window.lz.readIni(data.iniFiles[0].fullPath)
          setIniContent(content)
        }
      }
    } catch (err) {
      console.error('Failed to load mod details:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetails()
  }, [modFullPath])

  // 切换 ini 查看
  const handleSelectIni = async (iniPath: string) => {
    setSelectedIni(iniPath)
    const content = await window.lz.readIni(iniPath)
    setIniContent(content)
  }

  // 保存元数据 (作者、版本、描述)
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

  // 打开所在文件夹
  const handleOpenFolder = () => {
    window.lz.openModFolder(modFullPath)
  }

  // 设为封面
  const handleSetCover = async (imagePath: string) => {
    await window.lz.setAsCoverImage(modFullPath, imagePath)
    await loadDetails()
  }

  // 删除当前图片
  const handleDeleteImage = async (imagePath: string) => {
    if (!confirm('确定要删除这张预览图吗？')) return
    await window.lz.deleteModImage(imagePath)
    if (currentImageIndex > 0) {
      setCurrentImageIndex((prev) => prev - 1)
    }
    await loadDetails()
  }

  // 切换启停
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
      <div className="flex-1 flex items-center justify-center bg-slate-950/60">
        <div className="flex flex-col items-center space-y-2 text-slate-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">加载 Mod 详细信息...</span>
        </div>
      </div>
    )
  }

  if (!details) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-6 space-y-3">
        <p className="text-sm text-slate-400">未能找到此 Mod 的目录或文件已被移除</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs"
        >
          返回列表
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
    <div className="flex-1 flex flex-col overflow-y-auto bg-slate-950 text-slate-100">
      {/* 1. Header Toolbar */}
      <div className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition"
            title="返回列表"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <button
            onClick={handleOpenFolder}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition"
            title="在资源管理器中打开文件夹"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          <div className="flex items-center space-x-2">
            <h1 className="text-sm font-bold text-slate-100">{details.name}</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-medium">
              {version}
            </span>
            <span className="text-xs text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-900/40">
              {details.characterName}
            </span>
          </div>
        </div>

        {/* Toggle Active Button */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
              details.enabled
                ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            {details.enabled ? (
              <>
                <CheckCircle2 className="w-4 h-4 fill-current" />
                <span>已激活</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                <span>未启用 (点击激活)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="max-w-5xl mx-auto w-full p-6 space-y-8">
        {/* 2. Preview Section ("预览") */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-300 tracking-wider uppercase flex items-center space-x-2">
              <span>预览</span>
              <span className="text-slate-500 font-normal">
                ({images.length} 张图片)
              </span>
            </h2>

            {/* Navigation Arrows */}
            {images.length > 1 && (
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() =>
                    setCurrentImageIndex((prev) =>
                      prev > 0 ? prev - 1 : images.length - 1
                    )
                  }
                  className="p-1.5 rounded-md bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-400 font-mono px-1">
                  {currentImageIndex + 1} / {images.length}
                </span>
                <button
                  onClick={() =>
                    setCurrentImageIndex((prev) =>
                      prev < images.length - 1 ? prev + 1 : 0
                    )
                  }
                  className="p-1.5 rounded-md bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Main Large Image Display */}
          <div className="relative w-full aspect-[16/9] max-h-[500px] bg-slate-950 rounded-2xl border border-slate-800/80 overflow-hidden flex items-center justify-center shadow-2xl group">
            {activeImage ? (
              <img
                src={`file://${activeImage.path}`}
                alt={details.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-600 space-y-2">
                <FolderOpen className="w-12 h-12 stroke-[1.2]" />
                <span className="text-xs">该 Mod 目录内暂无预览图片</span>
              </div>
            )}

            {/* Current Index Badge */}
            {hasImages && (
              <div className="absolute bottom-4 right-4 px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md text-xs font-mono text-slate-300 border border-slate-800">
                {currentImageIndex + 1}/{images.length}
              </div>
            )}

            {/* Cover indicator */}
            {activeImage?.isCover && (
              <div className="absolute top-4 left-4 px-2.5 py-1 rounded-lg bg-blue-600/90 backdrop-blur-md text-white text-xs font-semibold flex items-center space-x-1 shadow-lg">
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>默认主封面</span>
              </div>
            )}
          </div>

          {/* Image Toolbar */}
          {activeImage && (
            <div className="flex items-center justify-between px-2 pt-1 text-xs text-slate-400">
              <span className="truncate text-slate-500 font-mono text-[11px]">
                {activeImage.name}
              </span>

              <div className="flex items-center space-x-2">
                {!activeImage.isCover && (
                  <button
                    onClick={() => handleSetCover(activeImage.path)}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
                  >
                    <Star className="w-3 h-3 text-amber-400" />
                    <span>设为封面</span>
                  </button>
                )}

                <button
                  onClick={() => handleDeleteImage(activeImage.path)}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 transition"
                  title="删除当前图片"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>删除图片</span>
                </button>
              </div>
            </div>
          )}

          {/* Thumbnail Carousel Strip */}
          {images.length > 1 && (
            <div className="flex items-center space-x-2 overflow-x-auto py-2">
              {images.map((img, idx) => (
                <button
                  key={img.path}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={`relative w-20 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition ${
                    idx === currentImageIndex
                      ? 'border-blue-500 scale-105 shadow-md shadow-blue-500/20'
                      : 'border-slate-800 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img
                    src={`file://${img.path}`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {img.isCover && (
                    <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-amber-400 shadow" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. Details Section ("详情") */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold text-slate-300 tracking-wider uppercase">
            详情
          </h2>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            {/* 检查时间 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-slate-800 text-blue-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">检查时间</h4>
                  <p className="text-[11px] text-slate-500">您上次检查此模组的时间</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
                  {details.metadata?.checkTime || '2026/10/4'}
                </span>
                <Clock className="w-4 h-4 text-slate-500" />
              </div>
            </div>

            {/* 最后更新 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-slate-800 text-blue-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">最后更新</h4>
                  <p className="text-[11px] text-slate-500">此模组上次更新时间</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
                  {details.metadata?.lastUpdated || '2026/10/4'}
                </span>
                <Clock className="w-4 h-4 text-slate-500" />
              </div>
            </div>

            {/* 作者 (可编辑) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-slate-800 text-blue-400">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">作者</h4>
                  <p className="text-[11px] text-slate-500">此模组的创作者</p>
                </div>
              </div>

              <input
                type="text"
                placeholder="Enter author name"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-64 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* 版本号 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-slate-800 text-blue-400">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">版本号</h4>
                  <p className="text-[11px] text-slate-500">模组当前发布的版本号</p>
                </div>
              </div>

              <input
                type="text"
                placeholder="例如：Version 1.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-64 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* 磁盘路径与体积 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-slate-800 text-blue-400">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">占用空间与路径</h4>
                  <p className="text-[11px] text-slate-500 truncate max-w-sm sm:max-w-md">
                    {details.fullPath}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
                <span>{formatSize(details.totalSize)}</span>
                <span className="text-slate-600">/</span>
                <span>{details.fileCount} 个文件</span>
              </div>
            </div>

            {/* 保存修改按钮 */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveMetadata}
                disabled={savingMeta}
                className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition ${
                  savedSuccess
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20'
                }`}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>已保存元数据！</span>
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

        {/* 4. INI 配置文件查看器 */}
        {details.iniFiles && details.iniFiles.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-300 tracking-wider uppercase flex items-center space-x-2">
              <FileText className="w-4 h-4 text-blue-400" />
              <span>INI 配置文件 ({details.iniFiles.length})</span>
            </h2>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              {/* Tab Selector for INI files */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                {details.iniFiles.map((ini) => (
                  <button
                    key={ini.fullPath}
                    onClick={() => handleSelectIni(ini.fullPath)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition ${
                      selectedIni === ini.fullPath
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-300 leading-relaxed focus:outline-none resize-y"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
