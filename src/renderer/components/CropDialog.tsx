import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  Sparkles,
  Crop as CropIcon,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCw,
  Save,
  Undo2,
  Upload,
  Check,
  Image as ImageIcon
} from 'lucide-react'
import { calculateSmartCrop, calculateCenterCrop } from '../../core/crop-algorithm'

interface CropDialogProps {
  isOpen: boolean
  onClose: () => void
  imageSrc: string
  modFullPath: string
  characterName: string
  modName: string
  onCoverSaved?: (newCoverUrl: string) => void
}

interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

const ASPECT_OPTIONS = [
  { label: '3:4 (角色立绘)', value: 3 / 4 },
  { label: '16:10 (标准封面)', value: 16 / 10 },
  { label: '16:9 (横版宽屏)', value: 16 / 9 },
  { label: '1:1 (正方头像)', value: 1 },
  { label: '9:16 (超长立绘)', value: 9 / 16 }
]

const AI_MODES: Array<{ id: 'Smart' | 'Attention' | 'Entropy' | 'Center'; label: string; desc: string }> = [
  { id: 'Smart', label: 'AI 智能主体', desc: '显著性(0.45)+边缘(0.30)+熵(0.15)+中心先验' },
  { id: 'Attention', label: '显著性对比', desc: '基于局部与全局色彩对比度分析' },
  { id: 'Entropy', label: '细节信息熵', desc: '基于 16 档灰度 Shannon 细节信息密度' },
  { id: 'Center', label: '居中裁剪', desc: '标准几何最大内接居中' }
]

export const CropDialog: React.FC<CropDialogProps> = ({
  isOpen,
  onClose,
  imageSrc: initialImageSrc,
  modFullPath,
  characterName,
  modName,
  onCoverSaved
}) => {
  const [currentImageSrc, setCurrentImageSrc] = useState(initialImageSrc)
  const [aspect, setAspect] = useState<number>(3 / 4)
  const [aiMode, setAiMode] = useState<'Smart' | 'Attention' | 'Entropy' | 'Center'>('Smart')
  const [zoom, setZoom] = useState<number>(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [rotation, setRotation] = useState<number>(0) // 0, 90, 180, 270

  const [cropBox, setCropBox] = useState<CropRect>({ x: 0, y: 0, width: 300, height: 400 })
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)
  const [statusMsg, setStatusMsg] = useState<string>('')
  const [hasBackup, setHasBackup] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const isDraggingCrop = useRef<boolean>(false)
  const isDraggingImage = useRef<boolean>(false)
  const dragStart = useRef<{ mouseX: number; mouseY: number; boxX: number; boxY: number; panX: number; panY: number }>({
    mouseX: 0,
    mouseY: 0,
    boxX: 0,
    boxY: 0,
    panX: 0,
    panY: 0
  })

  // 检查是否存在历史备份
  useEffect(() => {
    if (isOpen && modFullPath && (window as any).lz?.hasCoverBackup) {
      ;(window as any).lz.hasCoverBackup(modFullPath).then((has: boolean) => {
        setHasBackup(!!has)
      })
    }
  }, [isOpen, modFullPath])

  // 当外部传入新图片或打开时更新
  useEffect(() => {
    if (isOpen) {
      setCurrentImageSrc(initialImageSrc)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setRotation(0)
    }
  }, [isOpen, initialImageSrc])

  // 监听全局 Ctrl+V 粘贴图片事件
  useEffect(() => {
    if (!isOpen) return

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile()
          if (blob) {
            const reader = new FileReader()
            reader.onload = (event) => {
              if (event.target?.result) {
                setCurrentImageSrc(event.target.result as string)
                setStatusMsg('📋 已从剪贴板粘贴截图！')
              }
            }
            reader.readAsDataURL(blob)
            e.preventDefault()
            break
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [isOpen])

  // 计算并应用 AI 推荐裁剪框
  const runAiAnalysis = useCallback(
    (img: HTMLImageElement, currentAspect: number, currentMode: 'Smart' | 'Attention' | 'Entropy' | 'Center') => {
      if (!img || img.naturalWidth === 0) return
      setIsAnalyzing(true)
      setStatusMsg(`🤖 运行 ${currentMode} 算法构图中...`)

      setTimeout(() => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          ctx.drawImage(img, 0, 0)
          const imgData = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight)

          const result = calculateSmartCrop(
            imgData.data,
            img.naturalWidth,
            img.naturalHeight,
            currentAspect,
            currentMode
          )

          const [rx, ry, rw, rh] = result.rect
          setCropBox({ x: rx, y: ry, width: rw, height: rh })
          setStatusMsg(`✨ 已应用 ${currentMode} 智能推荐框 [${rw}×${rh}]`)
        } catch (err: any) {
          console.error('AI crop error:', err)
          setStatusMsg(`算法执行回退至居中: ${err.message}`)
          const [cx, cy, cw, ch] = calculateCenterCrop(img.naturalWidth, img.naturalHeight, currentAspect)
          setCropBox({ x: cx, y: cy, width: cw, height: ch })
        } finally {
          setIsAnalyzing(false)
        }
      }, 50)
    },
    []
  )

  // 图片加载完成时初始化尺寸并运行 AI 裁剪
  const handleImageLoaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    imgRef.current = img
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    runAiAnalysis(img, aspect, aiMode)
  }

  // 比例切换
  const handleAspectChange = (newAspect: number) => {
    setAspect(newAspect)
    if (imgRef.current) {
      runAiAnalysis(imgRef.current, newAspect, aiMode)
    }
  }

  // 算法模式切换
  const handleModeChange = (newMode: 'Smart' | 'Attention' | 'Entropy' | 'Center') => {
    setAiMode(newMode)
    if (imgRef.current) {
      runAiAnalysis(imgRef.current, aspect, newMode)
    }
  }

  // 滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 0.1 : -0.1
    setZoom((prev) => Math.min(4, Math.max(0.5, Number((prev + delta).toFixed(2)))))
  }

  // 鼠标拖拽移动裁剪框或画布
  const handleMouseDown = (e: React.MouseEvent, type: 'crop' | 'canvas') => {
    e.preventDefault()
    if (type === 'crop') {
      isDraggingCrop.current = true
    } else {
      isDraggingImage.current = true
    }

    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: cropBox.x,
      boxY: cropBox.y,
      panX: pan.x,
      panY: pan.y
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - dragStart.current.mouseX
      const dy = moveEvent.clientY - dragStart.current.mouseY

      if (isDraggingCrop.current && imgRef.current && containerRef.current) {
        // 计算缩放比例映射
        const container = containerRef.current.getBoundingClientRect()
        const scaleFactor = imgRef.current.naturalWidth / (container.width * 0.8 * zoom)

        const newX = Math.max(
          0,
          Math.min(
            imgRef.current.naturalWidth - cropBox.width,
            dragStart.current.boxX + dx * scaleFactor
          )
        )
        const newY = Math.max(
          0,
          Math.min(
            imgRef.current.naturalHeight - cropBox.height,
            dragStart.current.boxY + dy * scaleFactor
          )
        )
        setCropBox((prev) => ({ ...prev, x: Math.round(newX), y: Math.round(newY) }))
      } else if (isDraggingImage.current) {
        setPan({
          x: dragStart.current.panX + dx,
          y: dragStart.current.panY + dy
        })
      }
    }

    const handleMouseUp = () => {
      isDraggingCrop.current = false
      isDraggingImage.current = false
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // 本地文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setCurrentImageSrc(ev.target.result as string)
          setStatusMsg(`📂 已加载本地文件: ${file.name}`)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  // 保存裁剪后的封面
  const handleSaveCrop = async () => {
    if (!imgRef.current || !modFullPath) return
    setIsSaving(true)
    setStatusMsg('💾 正在生成高保真封面并写入事务...')

    try {
      const img = imgRef.current
      const canvas = document.createElement('canvas')
      
      // 输出高分辨率规范尺寸
      const targetHeight = Math.max(600, Math.min(1200, cropBox.height))
      const targetWidth = Math.round(targetHeight * aspect)

      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('无法创建 Canvas 2D 绘图环境')

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      // 裁剪源区域 -> 目标画布
      ctx.drawImage(
        img,
        cropBox.x,
        cropBox.y,
        cropBox.width,
        cropBox.height,
        0,
        0,
        targetWidth,
        targetHeight
      )

      const dataUrl = canvas.toDataURL('image/png', 0.95)

      const res = await (window as any).lz?.saveModCover(modFullPath, dataUrl)
      if (res && res.success) {
        setStatusMsg('✅ 封面保存成功！已创建版本备份。')
        setHasBackup(true)
        if (onCoverSaved) {
          onCoverSaved(`${res.coverPath}?t=${Date.now()}`)
        }
        setTimeout(() => {
          setIsSaving(false)
          onClose()
        }, 600)
      } else {
        throw new Error(res?.error || '保存失败')
      }
    } catch (err: any) {
      console.error('Save crop error:', err)
      setStatusMsg(`❌ 保存失败: ${err.message}`)
      setIsSaving(false)
    }
  }

  // 恢复历史备份
  const handleRollback = async () => {
    if (!confirm('确认恢复到上一个版本的备份封面？')) return
    setIsSaving(true)
    setStatusMsg('🔄 正在还原历史封面备份...')
    try {
      const res = await (window as any).lz?.rollbackModCover(modFullPath)
      if (res && res.success) {
        setStatusMsg('✅ 备份封面恢复成功！')
        if (onCoverSaved) {
          onCoverSaved(`file:///${modFullPath.replace(/\\/g, '/')}/preview.png?t=${Date.now()}`)
        }
        setTimeout(() => {
          setIsSaving(false)
          onClose()
        }, 600)
      } else {
        throw new Error(res?.error || '还原失败')
      }
    } catch (err: any) {
      setStatusMsg(`❌ 还原失败: ${err.message}`)
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  // 计算视口中预览图和裁剪框的显示百分比
  const naturalW = naturalSize.width || 1
  const naturalH = naturalSize.height || 1
  const cropLeftPct = (cropBox.x / naturalW) * 100
  const cropTopPct = (cropBox.y / naturalH) * 100
  const cropWidthPct = (cropBox.width / naturalW) * 100
  const cropHeightPct = (cropBox.height / naturalH) * 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-6 select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl h-[90vh] bg-[#0B0D14] border border-cyan-500/30 rounded-3xl shadow-[0_0_50px_rgba(0,240,255,0.2)] flex flex-col overflow-hidden acg-corner-markers">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-[#07090F]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
              <CropIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-wide">智能封面裁剪工坊 // AI WORKSHOP</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#E5FE40]/20 text-[#E5FE40] border border-[#E5FE40]/40 font-bold">
                  AI Saliency Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {characterName} / <span className="text-cyan-300 font-bold">{modName}</span>
                {naturalSize.width > 0 && ` • 原图规格 ${naturalSize.width} × ${naturalSize.height} px`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-200 bg-[#121622] hover:bg-[#1A2033] hover:text-white rounded-xl cursor-pointer transition border border-cyan-500/30">
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              选择新图片
              <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            </label>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Workspace Center */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Main Canvas Viewport */}
          <div
            ref={containerRef}
            className="flex-1 relative bg-black/90 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onMouseDown={(e) => handleMouseDown(e, 'canvas')}
          >
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

            {/* Display Image & Crop Area */}
            <div
              className="relative transition-transform duration-75 ease-out"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                maxWidth: '85%',
                maxHeight: '85%'
              }}
            >
              <img
                src={currentImageSrc}
                alt="Crop Target"
                onLoad={handleImageLoaded}
                className="max-h-[65vh] object-contain shadow-2xl rounded pointer-events-none select-none"
                draggable={false}
              />

              {/* Crop Box Frame Overlay */}
              {naturalSize.width > 0 && (
                <div
                  className="absolute border-2 border-indigo-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] cursor-move transition-[box-shadow]"
                  style={{
                    left: `${cropLeftPct}%`,
                    top: `${cropTopPct}%`,
                    width: `${cropWidthPct}%`,
                    height: `${cropHeightPct}%`
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    handleMouseDown(e, 'crop')
                  }}
                >
                  {/* Rule of Thirds Grid */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                    <div className="border-r border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div className="border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div className="border-b border-white/60" />
                    <div className="border-r border-white/60" />
                    <div className="border-r border-white/60" />
                    <div />
                  </div>

                  {/* Corner Accent Handles */}
                  <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-indigo-400 rounded-sm" />
                  <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-indigo-400 rounded-sm" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-indigo-400 rounded-sm" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-indigo-400 rounded-sm" />

                  {/* Crop Dimension Badge */}
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-indigo-300 pointer-events-none">
                    {cropBox.width} × {cropBox.height}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Floating Controls (Zoom / Rotate) */}
            <div className="absolute bottom-4 left-6 flex items-center gap-2 bg-gray-900/90 backdrop-blur-md border border-gray-700/80 px-3 py-1.5 rounded-xl shadow-lg">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.2).toFixed(1))))}
                className="p-1 text-gray-400 hover:text-white transition"
                title="缩小"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-24 accent-indigo-500 h-1 bg-gray-700 rounded cursor-pointer"
              />
              <button
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.2).toFixed(1))))}
                className="p-1 text-gray-400 hover:text-white transition"
                title="放大"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono text-gray-400 w-10 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <div className="w-[1px] h-4 bg-gray-700 mx-1" />
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-1 text-gray-400 hover:text-indigo-400 transition"
                title="顺时针旋转 90 度"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setZoom(1)
                  setPan({ x: 0, y: 0 })
                  setRotation(0)
                  if (imgRef.current) runAiAnalysis(imgRef.current, aspect, aiMode)
                }}
                className="p-1 text-gray-400 hover:text-indigo-400 transition"
                title="重置缩放与位置"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Hint Badge */}
            <div className="absolute top-4 left-6 text-xs text-gray-400 bg-gray-900/80 px-3 py-1.5 rounded-lg border border-gray-800">
              💡 提示: 支持直接 <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-200 font-mono">Ctrl+V</kbd> 粘贴游戏截图，可拖动画布与裁剪框
            </div>
          </div>

          {/* Right Sidebar Control Panel */}
          <div className="w-80 border-l border-gray-800 bg-gray-900/40 p-5 flex flex-col gap-6 overflow-y-auto">
            
            {/* Target Aspect Ratio */}
            <div>
              <label className="text-xs font-semibold text-gray-300 tracking-wider uppercase mb-2.5 block">
                封面画幅比例
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {ASPECT_OPTIONS.map((opt) => {
                  const isSelected = Math.abs(aspect - opt.value) < 0.01
                  return (
                    <button
                      key={opt.label}
                      onClick={() => handleAspectChange(opt.value)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                          : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* AI Smart Mode */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-semibold text-gray-300 tracking-wider uppercase flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  AI 智能裁切模式
                </label>
                {isAnalyzing && (
                  <span className="text-[10px] text-indigo-400 animate-pulse">分析中...</span>
                )}
              </div>
              <div className="space-y-2">
                {AI_MODES.map((m) => {
                  const isSelected = aiMode === m.id
                  return (
                    <div
                      key={m.id}
                      onClick={() => handleModeChange(m.id)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition ${
                        isSelected
                          ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-200'
                          : 'bg-gray-800/40 border-gray-800 hover:border-gray-700 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{m.label}</span>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{m.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="pt-2 border-t border-gray-800 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  if (imgRef.current) runAiAnalysis(imgRef.current, aspect, aiMode)
                }}
                disabled={isAnalyzing}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-gray-700 text-indigo-300 hover:text-indigo-200 rounded-xl text-xs font-medium border border-indigo-500/30 transition disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-indigo-400" />
                重新运行 AI 构图推荐
              </button>

              {hasBackup && (
                <button
                  onClick={handleRollback}
                  disabled={isSaving}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-xl text-xs font-medium border border-amber-500/20 transition disabled:opacity-50"
                >
                  <Undo2 className="w-4 h-4" />
                  还原上一版备份封面
                </button>
              )}
            </div>

            {/* Status Feedback */}
            {statusMsg && (
              <div className="mt-auto p-3 rounded-xl bg-gray-800/60 border border-gray-700/60 text-xs text-gray-300 leading-relaxed break-words">
                {statusMsg}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-cyan-500/20 bg-[#07090F]">
          <div className="text-xs text-slate-400 flex items-center gap-2 font-mono">
            <ImageIcon className="w-4 h-4 text-cyan-400" />
            <span>
              裁剪规格: <span className="font-bold text-[#E5FE40]">{cropBox.width} × {cropBox.height} px</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-5 py-2 text-xs font-bold text-slate-400 hover:text-white bg-[#121622] hover:bg-slate-800 rounded-xl transition"
            >
              取消 // CANCEL
            </button>
            <button
              onClick={handleSaveCrop}
              disabled={isSaving || isAnalyzing}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#E5FE40] to-[#A3E635] hover:brightness-110 text-black font-black uppercase tracking-wider rounded-xl text-xs shadow-[0_0_20px_rgba(229,254,64,0.35)] transition disabled:opacity-50 active:scale-95"
            >
              <Save className="w-4 h-4" />
              {isSaving ? '正在生成封面...' : '确认并固化为 MOD 封面 // COMMIT'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
