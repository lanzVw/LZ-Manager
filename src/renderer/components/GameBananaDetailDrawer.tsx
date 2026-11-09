import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  User,
  Layers,
  ExternalLink,
  RefreshCw,
  Languages,
  RotateCcw,
  Search,
  AlertCircle
} from 'lucide-react'
import DOMPurify from 'dompurify'
import { Button } from './ui/Button'
import { HoverHint } from './ui/HoverHint'
import { Input } from './ui/Input'
import { ImageLightbox } from './ui/ImageLightbox'
import { useToast } from './ui/Toast'
import { GameBananaFileList } from './gamebanana/GameBananaFileList'
import { useEscapeToClose } from '../hooks/useEscape'
import { useInstalledGameBananaVersions } from '../hooks/useInstalledGameBananaVersions'
import {
  GameBananaOverwriteConfirm,
  reportInstallFailure,
  reportInstallResult
} from './GameBananaOverwriteConfirm'
import type { PendingOverwriteInstall } from './GameBananaOverwriteConfirm'
import {
  characterNameFromInstallTarget,
  inspectInstalledTarget,
  isGameBananaFileInstalled
} from '../utils/gamebanana-install'
import { formatDate } from '../utils/gamebanana-format'

export interface GameBananaDetailDrawerProps {
  isOpen: boolean
  onClose: () => void
  modId?: number | null
  modName?: string
  activeGame?: any
  defaultCharacterName?: string
  onInstallSuccess?: () => void
  onNavigateToMarketAuthor?: (authorName: string) => void
}

// GameBanana 详情富文本消毒：白名单方式脱掉恶意标签与事件属性，防止 XSS 注入
const sanitizeModHtml = (raw?: string): string => {
  if (!raw) return ''
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'div', 'span', 'ul', 'ol', 'li',
      'img', 'a', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'style'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'svg', 'video', 'audio'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
  })
}

// 统一预览图回退链：兜底顺序 previewImage → images[0] → previewImages[0]
const pickPreviewUrl = (mod: any, size: 'full' | 'thumb' = 'full'): string => {
  if (!mod) return ''
  const firstImg = mod.images?.[0]
  const previewHead =
    Array.isArray(mod.previewImages) && mod.previewImages.length > 0 ? mod.previewImages[0] : ''
  if (size === 'thumb') {
    return mod.previewImage || firstImg?.medUrl || firstImg?.thumbUrl || firstImg?.url || previewHead || ''
  }
  return mod.previewImage || firstImg?.medUrl || firstImg?.url || previewHead || ''
}

export const GameBananaDetailDrawer: React.FC<GameBananaDetailDrawerProps> = ({
  isOpen,
  onClose,
  modId,
  modName,
  activeGame,
  defaultCharacterName,
  onInstallSuccess,
  onNavigateToMarketAuthor
}) => {
  const toast = useToast()

  const [detailMod, setDetailMod] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [activePreviewImg, setActivePreviewImg] = useState<string>('')
  const [activeFullImg, setActiveFullImg] = useState<string>('')
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false)

  // 抽屉打开时查一次本地同源副本，安装成功后刷新「已安装」标记
  const {
    target: installedTarget,
    versions: installedVersions,
    refresh: refreshInstalledVersions
  } = useInstalledGameBananaVersions(isOpen ? modId ?? detailMod?.id ?? null : null)

  // 翻译状态与单次会话缓存
  const [autoTranslate] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('lz-auto-translate')
      return saved === null ? true : saved === 'true'
    } catch {
      return true
    }
  })
  const [isTranslated, setIsTranslated] = useState<boolean>(false)
  const [isTranslating, setIsTranslating] = useState<boolean>(false)
  const [translatedMap, setTranslatedMap] = useState<
    Record<
      string,
      {
        translatedTitle: string
        translatedDescription: string
        translatedText: string
      }
    >
  >({})

  // 下载与安装进度
  const [installingFileId, setInstallingFileId] = useState<number | string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [progressMsg, setProgressMsg] = useState<string>('')
  const [progressPercent, setProgressPercent] = useState<number>(0)

  // 角色指认弹窗状态（仅在无法自动识别且无 defaultCharacterName 时启用）
  const [pendingInstallTarget, setPendingInstallTarget] = useState<{
    modInfo: any
    targetFile: any
  } | null>(null)
  const [characters, setCharacters] = useState<any[]>([])
  const [charPickerSearch, setCharPickerSearch] = useState<string>('')

  // 安装前预检命中本地同源 Mod 时的覆盖确认状态
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwriteInstall | null>(null)
  // 预检是异步的，用 ref 挡住连点造成的并发预检（此时进度条还没起，没有其它互斥）
  const precheckingRef = useRef<boolean>(false)

  // 序号守卫：网络响应延迟时丢弃已作废请求的返回结果
  const detailSeqRef = useRef<number>(0)

  // 监听安装进度
  useEffect(() => {
    if (!isOpen) return
    const unsub = window.flairx?.onInstallProgress?.((data: any) => {
      if (data.stage === 'downloading') {
        const speedMb = data.speed ? (data.speed / (1024 * 1024)).toFixed(1) : '0.0'
        setProgressMsg(`正在下载... ${data.percent || 0}% (${speedMb} MB/s)`)
        setProgressPercent(data.percent || 0)
      } else if (data.stage === 'inspecting') {
        setProgressMsg('校验文件魔数与安全...')
        setProgressPercent(92)
      } else if (data.stage === 'extracting') {
        setProgressMsg('解压并规整 Mod 目录...')
        setProgressPercent(97)
      }
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [isOpen])

  // Esc 快捷键关闭注册：覆盖确认/角色指认弹窗优先响应，其余情况关闭详情抽屉
  const closeCharPicker = useCallback(() => setPendingInstallTarget(null), [])
  const cancelOverwrite = useCallback(() => setPendingOverwrite(null), [])
  useEscapeToClose(isOpen && !pendingInstallTarget && !pendingOverwrite && !lightboxOpen, onClose)
  useEscapeToClose(!!pendingInstallTarget, closeCharPicker)
  // Modal 自己会响应 Esc，这里不再重复注册，否则一次 Esc 会连抽屉一起关掉

  // 触发翻译
  const triggerTranslate = useCallback(
    async (targetMod: any, seq?: number) => {
      if (!targetMod) return
      const modKey = String(targetMod.id)
      if (translatedMap[modKey]) {
        setIsTranslated(true)
        return
      }

      setIsTranslating(true)
      try {
        const res = await window.flairx.translateText({
          title: targetMod.name || '',
          description: targetMod.description || '',
          text: targetMod.text || ''
        })
        if (seq !== undefined && seq !== detailSeqRef.current) return

        if (res) {
          setTranslatedMap((prev) => ({
            ...prev,
            [modKey]: res
          }))
          setIsTranslated(true)
        }
      } catch (err: any) {
        console.warn('[AutoTranslate] 翻译请求失败或超时:', err)
      } finally {
        if (seq === undefined || seq === detailSeqRef.current) {
          setIsTranslating(false)
        }
      }
    },
    [translatedMap]
  )

  const handleToggleTranslate = async () => {
    if (!detailMod) return
    if (isTranslated) {
      setIsTranslated(false)
      return
    }
    await triggerTranslate(detailMod, detailSeqRef.current)
  }

  // 加载模组详情
  useEffect(() => {
    if (!isOpen) {
      setDetailMod(null)
      setLoadingDetail(false)
      setErrorMessage('')
      setInstallingFileId(null)
      setProgressMsg('')
      setProgressPercent(0)
      setPendingInstallTarget(null)
      setPendingOverwrite(null)
      setLightboxOpen(false)
      precheckingRef.current = false
      return
    }

    const seq = ++detailSeqRef.current
    setLoadingDetail(true)
    setErrorMessage('')
    setIsTranslating(false)
    setIsTranslated(false)

    const fetchDetail = async () => {
      try {
        let targetId = modId
        let initialName = modName

        // 若无直接 modId，先按 modName 在当前游戏类目下进行首条检索
        if (!targetId && modName) {
          const searchRes = await window.flairx.searchGameBanana({
            gameId: activeGame?.id,
            searchQuery: modName,
            perPage: 1
          })
          if (seq !== detailSeqRef.current) return

          const firstRecord = searchRes?.records?.[0]
          if (firstRecord?.id) {
            targetId = firstRecord.id
            if (!initialName) initialName = firstRecord.name
          } else {
            setErrorMessage('未在 GameBanana 市场上匹配到相关模组')
            return
          }
        }

        if (!targetId) {
          setErrorMessage('缺少模组 ID 或检索关键字')
          return
        }

        const details = await window.flairx.getGameBananaDetails({
          itemType: 'Mod',
          itemId: targetId,
          modId: targetId,
          gameId: activeGame?.id
        })

        if (seq !== detailSeqRef.current) return

        if (details) {
          setDetailMod(details)
          const firstImg = pickPreviewUrl(details, 'thumb')
          setActivePreviewImg(firstImg)
          setActiveFullImg(details.images?.[0]?.url || firstImg)

          if (autoTranslate) {
            triggerTranslate(details, seq)
          }
        } else {
          setErrorMessage('获取模组详情返回为空')
        }
      } catch (err: any) {
        if (seq !== detailSeqRef.current) return
        console.error('Failed to load GameBanana detail:', err)
        setErrorMessage(err?.message || '获取模组详情失败，请检查网络')
      } finally {
        if (seq === detailSeqRef.current) {
          setLoadingDetail(false)
        }
      }
    }

    fetchDetail()
  }, [isOpen, modId, modName, activeGame?.id, autoTranslate, triggerTranslate])

  // 取消安装
  const handleCancelInstall = useCallback(async () => {
    if (cancelling) return
    setCancelling(true)
    setProgressMsg('正在取消安装...')
    try {
      const r: any = await window.flairx.cancelGameBananaInstall()
      if (!r?.success) {
        toast.error('无法取消安装', r?.error || '未知错误')
        setCancelling(false)
      }
    } catch (err: any) {
      toast.error('取消失败', err.message)
      setCancelling(false)
    }
  }, [cancelling, toast])

  // 执行具体安装逻辑
  const doInstall = useCallback(
    async (
      modInfo: any,
      targetFile: any,
      targetCharacter: string,
      forceNewInstall = false
    ) => {
      if (installingFileId !== null) return
      setInstallingFileId(targetFile.id)
      setProgressMsg(`准备下载: ${targetFile.fileName || 'Mod 文件'}...`)
      setProgressPercent(5)

      const previewUrl = pickPreviewUrl(modInfo)
      const finalSourceUrl =
        modInfo.profileUrl || (modInfo.id ? `https://gamebanana.com/mods/${modInfo.id}` : '')

      try {
        const res = await window.flairx.installGameBananaMod({
          gameId: activeGame?.id,
          modId: modInfo.id,
          modName: modInfo.name,
          characterName: targetCharacter || '通用',
          downloadUrl: targetFile.downloadUrl,
          fileName: targetFile.fileName,
          previewImageUrl: previewUrl,
          previewImages: modInfo.previewImages || (previewUrl ? [previewUrl] : []),
          author: modInfo.submitter?.name || modInfo.author || 'GameBanana',
          sourceUrl: finalSourceUrl,
          profileUrl: finalSourceUrl,
          version: targetFile.fileName || 'Version 1.0',
          description: modInfo.description || '',
          forceNewInstall
        })

        if (res && res.success) {
          setProgressMsg(res.action === 'update' ? '更新成功！' : '安装成功！')
          setProgressPercent(100)
          reportInstallResult(toast, res, targetCharacter)
          refreshInstalledVersions()
          setTimeout(() => {
            setInstallingFileId(null)
            setProgressMsg('')
            setCancelling(false)
            onInstallSuccess?.()
          }, 1200)
        } else if (res?.cancelled) {
          toast.info('已取消安装', '未对 Mod 目录做任何改动')
          setInstallingFileId(null)
          setProgressMsg('')
          setCancelling(false)
        } else {
          reportInstallFailure(toast, res)
          setInstallingFileId(null)
          setCancelling(false)
        }
      } catch (err: any) {
        toast.error('安装过程异常', err.message)
        setInstallingFileId(null)
        setCancelling(false)
      }
    },
    [installingFileId, activeGame?.id, onInstallSuccess, refreshInstalledVersions, toast]
  )

  // 安装前预检：命中本地同源 Mod 时先让用户确认「覆盖更新」还是「仍然新建一份」
  // 预检本身失败/旧版 preload 时 inspectInstalledTarget 返回 null，直接走原来的安装流程
  const startInstall = useCallback(
    async (modInfo: any, targetFile: any, targetCharacter: string) => {
      if (precheckingRef.current) return
      precheckingRef.current = true
      try {
        const hit = await inspectInstalledTarget(modInfo?.id)
        if (hit) {
          setPendingOverwrite({ modInfo, targetFile, targetCharacter, ...hit })
          return
        }
      } finally {
        precheckingRef.current = false
      }
      await doInstall(modInfo, targetFile, targetCharacter, false)
    },
    [doInstall]
  )

  const handleConfirmOverwriteUpdate = useCallback(async () => {
    const pending = pendingOverwrite
    if (!pending) return
    setPendingOverwrite(null)
    await doInstall(pending.modInfo, pending.targetFile, pending.targetCharacter, false)
  }, [pendingOverwrite, doInstall])

  const handleConfirmNewInstall = useCallback(async () => {
    const pending = pendingOverwrite
    if (!pending) return
    setPendingOverwrite(null)
    await doInstall(pending.modInfo, pending.targetFile, pending.targetCharacter, true)
  }, [pendingOverwrite, doInstall])

  // 触发安装文件：优先 defaultCharacterName，其次 detect，再其次弹窗指认
  const executeInstallFile = useCallback(
    async (modInfo: any, targetFile: any) => {
      if (installingFileId !== null) return

      let targetChar = defaultCharacterName?.trim() || null

      if (!targetChar) {
        try {
          targetChar = await window.flairx.detectGameBananaCharacter(modInfo, activeGame?.id)
        } catch (_) {}
      }

      if (!targetChar) {
        if (characters.length === 0 && activeGame?.id) {
          try {
            const chars = await window.flairx.getGameBananaCharacters(activeGame.id)
            setCharacters(chars || [])
          } catch (err) {
            console.error('加载角色列表失败:', err)
          }
        }
        setPendingInstallTarget({ modInfo, targetFile })
        setCharPickerSearch('')
        return
      }

      await startInstall(modInfo, targetFile, targetChar)
    },
    [installingFileId, defaultCharacterName, activeGame?.id, characters.length, startInstall]
  )

  // 文件行点击：已安装的版本跳过角色识别，直接交给 startInstall 弹重装确认；
  // 未安装或本地缓存缺失时保持原来的角色识别链路
  const handleFileInstall = useCallback(
    async (modInfo: any, targetFile: any) => {
      if (installingFileId !== null) return

      if (isGameBananaFileInstalled(targetFile?.fileName, installedVersions) && installedTarget?.existing) {
        const fallbackChar =
          characterNameFromInstallTarget(installedTarget.existing) ||
          defaultCharacterName?.trim() ||
          '通用'
        await startInstall(modInfo, targetFile, fallbackChar)
        return
      }

      await executeInstallFile(modInfo, targetFile)
    },
    [
      installingFileId,
      installedVersions,
      installedTarget,
      defaultCharacterName,
      startInstall,
      executeInstallFile
    ]
  )

  const handleConfirmInstallWithCharacter = async (chosenChar: string) => {
    if (!pendingInstallTarget) return
    const { modInfo, targetFile } = pendingInstallTarget
    setPendingInstallTarget(null)
    await startInstall(modInfo, targetFile, chosenChar)
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end animate-in fade-in duration-200 select-none"
        onClick={onClose}
      >
        <div
          className="w-full max-w-xl h-full bg-surface border-l border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-fast select-text"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 抽屉顶栏 */}
          <div className="p-4 border-b border-border flex items-start justify-between bg-surface/90 backdrop-blur-md shrink-0 select-none">
            <div className="pr-4 flex-1">
              {detailMod ? (
                <>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h2 className="text-base font-title font-extrabold text-text leading-snug">
                      {isTranslated && translatedMap[String(detailMod.id)]?.translatedTitle
                        ? translatedMap[String(detailMod.id)].translatedTitle
                        : detailMod.name}
                    </h2>
                    {isTranslated && translatedMap[String(detailMod.id)]?.translatedTitle && (
                      <span className="text-[10px] text-text-muted font-normal italic">
                        ({detailMod.name})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-text-muted mt-1.5 font-mono">
                    <span>📅 {formatDate(detailMod.dateAdded)}</span>
                    <span>👍 {detailMod.stats?.likes ?? detailMod.likesCount ?? 0} 喜欢</span>
                    <span>📥 {detailMod.stats?.downloads ?? 0} 下载</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center space-x-2">
                  <span className="text-base font-title font-extrabold text-text">市场模组详情</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-surface-2 text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 抽屉主体 */}
          {loadingDetail ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3 text-text-muted select-none">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs font-mono tracking-wider">
                正在从 GameBanana 拉取模组原帖详情...
              </span>
            </div>
          ) : errorMessage ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3 text-text-muted select-none">
              <AlertCircle className="w-10 h-10 text-amber-500/80" />
              <span className="text-sm font-semibold text-text">{errorMessage}</span>
              <Button variant="secondary" size="sm" onClick={onClose} className="mt-2">
                关闭抽屉
              </Button>
            </div>
          ) : detailMod ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
              {/* 作者与类别信息卡片 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-control bg-surface-2/70 border border-border flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                    {detailMod.submitter?.avatarUrl ? (
                      <img
                        src={detailMod.submitter.avatarUrl}
                        alt="author"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          ;(e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <User className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-text-muted font-semibold">发布作者</div>
                    <div className="text-xs font-bold text-text truncate">
                      {detailMod.submitter?.name || detailMod.author || '未知作者'}
                    </div>
                    {onNavigateToMarketAuthor && (
                      <button
                        type="button"
                        onClick={() => {
                          const author = detailMod.submitter?.name || detailMod.author
                          if (author && author !== '未知作者') {
                            onNavigateToMarketAuthor(author)
                          }
                        }}
                        className="text-[10px] text-primary hover:underline cursor-pointer font-medium mt-0.5"
                      >
                        查看作者的所有模组 →
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-control bg-surface-2/70 border border-border flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <Layers className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-text-muted font-semibold">所属类别</div>
                    <div className="text-xs font-bold text-text truncate">
                      {typeof detailMod.category === 'object'
                        ? detailMod.category?.name
                        : detailMod.category || '通用模组'}
                    </div>
                    <a
                      href={detailMod.profileUrl || `https://gamebanana.com/mods/${detailMod.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-primary hover:underline font-medium inline-flex items-center gap-1 mt-0.5"
                    >
                      GameBanana 原帖 <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              </div>

              {/* 截图画廊 */}
              {activePreviewImg && (
                <div className="space-y-2">
                  <div className="relative aspect-video rounded-control overflow-hidden border border-border bg-black/5 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      title="查看原图"
                      aria-label="查看原图"
                      className="w-full h-full p-0 bg-transparent cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <img
                        src={activePreviewImg}
                        alt="Preview"
                        className="w-full h-full object-contain"
                      />
                    </button>
                  </div>

                  {/* 缩略图轮播行 */}
                  {Array.isArray(detailMod.images) && detailMod.images.length > 1 && (
                    <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                      {detailMod.images.map((img: any, idx: number) => {
                        const thumb = img.thumbUrl || img.medUrl || img.url
                        const full = img.url || thumb
                        const isActive = activePreviewImg === (img.medUrl || thumb)

                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              setActivePreviewImg(img.medUrl || thumb)
                              setActiveFullImg(full)
                            }}
                            className={`w-16 h-11 rounded-[6px] overflow-hidden border cursor-pointer shrink-0 transition-all ${
                              isActive
                                ? 'border-primary ring-2 ring-primary/30'
                                : 'border-border/80 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={thumb} alt={`thumb-${idx}`} className="w-full h-full object-cover" />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 可安装文件清单 */}
              <GameBananaFileList
                files={detailMod.files}
                loading={loadingDetail}
                installingFileId={installingFileId}
                progressPercent={progressPercent}
                installedVersions={installedVersions}
                installedVersion={installedTarget?.existing?.version}
                remoteVersion={detailMod.version}
                busy={installingFileId !== null}
                onInstall={(file) => void handleFileInstall(detailMod, file)}
              />

              {/* 详细说明描述 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-title font-extrabold text-text uppercase tracking-wider flex items-center gap-1.5">
                    <span>📝 Mod 详细说明</span>
                    {isTranslating ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-normal animate-pulse flex items-center gap-1">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" /> 自动翻译中...
                      </span>
                    ) : isTranslated ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-normal">
                        已自动译为中文
                      </span>
                    ) : null}
                  </h3>

                  {/* 翻译 / 查看原文切换按钮 */}
                  <button
                    type="button"
                    disabled={isTranslating}
                    onClick={handleToggleTranslate}
                    className={`px-2.5 py-1 rounded-control text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                      isTranslated
                        ? 'bg-primary/10 border-primary text-primary hover:bg-primary/20'
                        : 'bg-surface hover:bg-surface-2 border-border text-text hover:text-primary shadow-2xs'
                    }`}
                    title={
                      isTranslated
                        ? '切回英文原文（仅影响本次详情显示）'
                        : '翻译为中文（仅影响本次详情显示）'
                    }
                  >
                    {isTranslating ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                        <span>翻译中...</span>
                      </>
                    ) : isTranslated ? (
                      <>
                        <RotateCcw className="w-3 h-3 text-primary" />
                        <span>查看原文</span>
                      </>
                    ) : (
                      <>
                        <Languages className="w-3 h-3 text-primary" />
                        <span>翻译为中文</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3.5 rounded-control bg-surface-2/40 border border-border text-xs text-text leading-relaxed select-text space-y-2">
                  {((isTranslated && translatedMap[String(detailMod.id)]?.translatedDescription) || detailMod.description) && (
                    <p className="font-semibold text-text">
                      {isTranslated && translatedMap[String(detailMod.id)]?.translatedDescription
                        ? translatedMap[String(detailMod.id)].translatedDescription
                        : detailMod.description}
                    </p>
                  )}
                  {((isTranslated && translatedMap[String(detailMod.id)]?.translatedText) || detailMod.text) ? (
                    <div
                      className="prose prose-sm max-w-none break-words text-text-muted space-y-1.5"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeModHtml(
                          isTranslated && translatedMap[String(detailMod.id)]?.translatedText
                            ? translatedMap[String(detailMod.id)].translatedText
                            : detailMod.text
                        )
                      }}
                    />
                  ) : (
                    <p className="text-text-muted italic">暂无更多说明文档</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* 抽屉底部下载与解压进度反馈条 */}
          {installingFileId !== null && (
            <div className="p-3 bg-surface-2/95 border-t border-border shrink-0 space-y-2 animate-in slide-in-from-bottom duration-200 select-none">
              <div className="flex items-center justify-between text-xs text-primary font-semibold">
                <div className="flex items-center space-x-2 truncate">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-primary" />
                  <span className="truncate">{progressMsg || '正在处理模组下载与安全解压...'}</span>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleCancelInstall}
                  disabled={cancelling}
                  className="ml-2 shrink-0 text-xs"
                >
                  {cancelling ? '正在取消...' : '取消安装'}
                </Button>
              </div>
              <div className="w-full bg-surface border border-border rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 原图灯箱：必须放在抽屉遮罩之外，portal 的事件仍按 React 树冒泡 */}
      <ImageLightbox
        isOpen={lightboxOpen}
        src={activeFullImg || activePreviewImg}
        alt={detailMod?.name || '原图预览'}
        onClose={() => setLightboxOpen(false)}
      />

      {/* 智能选择/确认归属角色弹窗 */}
      {pendingInstallTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 select-none"
          onClick={closeCharPicker}
        >
          <div
            className="bg-surface border border-border rounded-card shadow-2xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-fast"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-control bg-primary/10 text-primary">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text">
                    <HoverHint content="该模组未包含明确角色标签，请指定解压目标文件夹" focusable>
                      选择目标角色安装目录
                    </HoverHint>
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingInstallTarget(null)}
                className="p-1.5 rounded-control text-text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 当前准备安装的 Mod 简介 */}
            <div className="p-2.5 rounded-control bg-surface-2 border border-border flex items-center space-x-3">
              {pickPreviewUrl(pendingInstallTarget.modInfo, 'thumb') ? (
                <img
                  src={pickPreviewUrl(pendingInstallTarget.modInfo, 'thumb')}
                  alt=""
                  className="w-12 h-12 rounded-control object-cover border border-border shrink-0"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-text truncate">
                  {pendingInstallTarget.modInfo.name}
                </h4>
                <p className="text-[11px] font-mono text-text-muted truncate mt-0.5">
                  {pendingInstallTarget.targetFile.fileName}
                </p>
              </div>
            </div>

            {/* 角色搜索框 */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                placeholder="搜索角色名称 / 英文..."
                value={charPickerSearch}
                onChange={(e) => setCharPickerSearch(e.target.value)}
                className="pl-8 text-xs h-8"
                autoFocus
              />
            </div>

            {/* 角色列表 */}
            <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {/* 通用模组选项 */}
              <button
                type="button"
                onClick={() => handleConfirmInstallWithCharacter('通用')}
                className="w-full flex items-center justify-between px-3 py-2 rounded-control bg-surface-2 hover:bg-primary/10 hover:text-primary transition-colors text-xs font-semibold border border-border cursor-pointer text-left"
              >
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>通用模组 (全局 / 全角色)</span>
                </div>
                <span className="text-[10px] font-mono text-text-muted">Mods/通用</span>
              </button>

              {characters
                .filter((c) => c.id !== 'all')
                .filter((c) => {
                  if (!charPickerSearch.trim()) return true
                  const q = charPickerSearch.trim().toLowerCase()
                  return (
                    (c.name && c.name.toLowerCase().includes(q)) ||
                    (c.enName && c.enName.toLowerCase().includes(q))
                  )
                })
                .map((char) => (
                  <button
                    key={char.id}
                    type="button"
                    onClick={() => handleConfirmInstallWithCharacter(char.name)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-control bg-surface-2 hover:bg-primary/10 hover:text-primary transition-colors text-xs font-semibold border border-border cursor-pointer text-left"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-primary/60" />
                      <span>{char.name}</span>
                      {char.enName && (
                        <span className="text-[10px] text-text-muted font-normal">
                          ({char.enName})
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-text-muted">
                      Mods/{char.name}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 安装前覆盖确认弹窗（与市场列表页共用同一组件，文案不会分叉） */}
      <GameBananaOverwriteConfirm
        isOpen={!!pendingOverwrite}
        modName={pendingOverwrite?.modInfo?.name}
        fileName={pendingOverwrite?.targetFile?.fileName}
        target={pendingOverwrite}
        onConfirmUpdate={handleConfirmOverwriteUpdate}
        onConfirmNewInstall={handleConfirmNewInstall}
        onCancel={cancelOverwrite}
      />
    </>
  )
}
