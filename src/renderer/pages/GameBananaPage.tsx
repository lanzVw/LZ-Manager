import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Search,
  User,
  Filter,
  RefreshCw,
  ShoppingBag,
  ExternalLink,
  X,
  Calendar,
  Layers,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Check,
  Languages,
  RotateCcw
} from 'lucide-react'
import DOMPurify from 'dompurify'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Select } from '../components/ui/Select'
import { ImageLightbox } from '../components/ui/ImageLightbox'
import { ScrollContainer } from '../components/ui/ScrollContainer'
import { useToast } from '../components/ui/Toast'
import { useEscapeToClose } from '../hooks/useEscape'
import { GameBananaCard } from '../components/gamebanana/GameBananaCard'
import { GameBananaFileList } from '../components/gamebanana/GameBananaFileList'
import {
  GameBananaOverwriteConfirm,
  reportInstallFailure,
  reportInstallResult
} from '../components/GameBananaOverwriteConfirm'
import type { PendingOverwriteInstall } from '../components/GameBananaOverwriteConfirm'
import { useInstalledGameBananaVersions } from '../hooks/useInstalledGameBananaVersions'
import {
  characterNameFromInstallTarget,
  inspectInstalledTarget,
  isGameBananaFileInstalled
} from '../utils/gamebanana-install'
import { formatDate } from '../utils/gamebanana-format'
import { buildAuthorSearchQuery } from '../utils/gamebanana-search'

interface GameBananaPageProps {
  activeGame: any
  onInstallSuccess?: () => void
  initialModId?: number | null
  initialSearchTerm?: string
  onClearInitialNav?: () => void
}

// GameBanana 详情富文本消毒：白名单方式脱掉恶意标签/事件属性，防止 XSS 注入
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

// 统一预览图回退链（此前详情首屏/详情加载完成/安装预览/列表卡片 4 处各写一份推导）
// size:
// - 'full'（默认）：详情大图与安装预览用，不取缩略图档 thumbUrl
// - 'thumb'：列表卡片缩略图用，多回退一档 thumbUrl
// 兜底顺序：previewImage → images[0]（medUrl → thumbUrl? → url）→ previewImages[0]
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

export const GameBananaPage: React.FC<GameBananaPageProps> = ({
  activeGame,
  onInstallSuccess,
  initialModId,
  initialSearchTerm,
  onClearInitialNav
}) => {
  const toast = useToast()
  const [characters, setCharacters] = useState<any[]>([])
  const [selectedCharId, setSelectedCharId] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [sortOption, setSortOption] = useState<string>('Generic_Newest')
  const [mods, setMods] = useState<any[]>([])
  const [totalRecords, setTotalRecords] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const perPage = 30

  const [loading, setLoading] = useState<boolean>(false)
  const [installingFileId, setInstallingFileId] = useState<number | string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [progressMsg, setProgressMsg] = useState<string>('')
  const [progressPercent, setProgressPercent] = useState<number>(0)
  const [pendingInstallTarget, setPendingInstallTarget] = useState<{ modInfo: any; targetFile: any } | null>(null)
  const [charPickerSearch, setCharPickerSearch] = useState<string>('')

  // 安装前预检命中本地同源 Mod 时的覆盖确认状态
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwriteInstall | null>(null)
  // 预检是异步的，用 ref 挡住连点造成的并发预检（此时进度条还没起，没有其它互斥）
  const precheckingRef = useRef<boolean>(false)

  // 模组详情抽屉状态
  const [detailMod, setDetailMod] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false)
  const [activePreviewImg, setActivePreviewImg] = useState<string>('')
  const [activeFullImg, setActiveFullImg] = useState<string>('')
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false)

  // 抽屉打开时查一次本地同源副本，安装成功后刷新「已安装」标记
  const {
    target: installedTarget,
    versions: installedVersions,
    refresh: refreshInstalledVersions
  } = useInstalledGameBananaVersions(detailMod?.id)

  // 简介中文翻译状态与单次运行内存缓存
  const [autoTranslate, setAutoTranslate] = useState<boolean>(() => {
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

  // 监听安装进度
  useEffect(() => {
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
  }, [])

  // 加载当前游戏的角色分类字典
  useEffect(() => {
    if (!activeGame) return
    window.flairx.getGameBananaCharacters(activeGame.id).then((chars: any[]) => {
      setCharacters(chars || [])
      setSelectedCharId('all')
    }).catch((err) => {
      // 角色字典加载失败不应静默：至少把错误落到控制台便于定位
      console.error('加载角色列表失败:', err)
    })
  }, [activeGame])

  // 搜索防抖：关键字停稳 400ms 后才写入 debouncedQuery，避免每次按键都重建请求
  const [debouncedQuery, setDebouncedQuery] = useState<string>('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchTerm), 400)
    return () => clearTimeout(timer)
  }, [searchTerm])
  const searchSeqRef = useRef<number>(0)
  const detailSeqRef = useRef<number>(0)

  // 执行搜索/列表刷新（请求序号守卫：快速翻页/切换过滤时丢弃过期响应）
  const fetchMods = useCallback(
    async (pageToLoad = 1) => {
      if (!activeGame) return
      const seq = ++searchSeqRef.current
      setLoading(true)
      try {
        const activeChar = characters.find((c) => c.id === selectedCharId)
        const res = await window.flairx.searchGameBanana({
          gameId: activeGame.id,
          characterGbCatId: activeChar?.gbCatId || null,
          searchQuery: debouncedQuery.trim() || undefined,
          sort: sortOption,
          page: pageToLoad,
          perPage
        })
        if (seq !== searchSeqRef.current) return

        const records = res?.records || []
        setMods(records)
        setTotalRecords(res?.total || records.length || 0)
        setCurrentPage(pageToLoad)
      } catch (err) {
        console.error('Failed to search GameBanana:', err)
        toast.error('搜索失败，请检查网络', err instanceof Error ? err.message : '请稍后重试')
      } finally {
        if (seq === searchSeqRef.current) {
          setLoading(false)
        }
      }
    },
    [activeGame, characters, selectedCharId, debouncedQuery, sortOption]
  )

  useEffect(() => {
    fetchMods(1)
  }, [fetchMods])

  // 后台平滑执行翻译核心（seq: 关联的详情请求序号，过期响应不回写）
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

  // 切换当前详情的中英文显示（仅影响本次打开的详情，不写全局自动翻译偏好；
  // “自动翻译”总开关仍由设置项独立控制，在下次打开详情时按偏好自动生效）
  const handleToggleTranslate = async () => {
    if (!detailMod) return
    if (isTranslated) {
      setIsTranslated(false)
      return
    }

    await triggerTranslate(detailMod, detailSeqRef.current)
  }

  // 打开模组详情抽屉（detailSeqRef 序号守卫：快速切换详情时丢弃过期响应）
  const openDetailDrawer = useCallback(
    async (mod: any) => {
      const seq = ++detailSeqRef.current
      // 打开新详情时重置旧详情状态（详情/文件清单一并替换为安全初值，翻译态清零）
      setDetailMod({
        ...mod,
        loading: true
      })
      setLoadingDetail(true)
      setIsTranslating(false)
      setIsTranslated(false)
      setLightboxOpen(false)

      // 记忆模式：若开启自动翻译偏好且已在当前内存中，秒出中文
      const modKey = String(mod.id)
      if (autoTranslate && translatedMap[modKey]) {
        setIsTranslated(true)
      } else {
        setIsTranslated(false)
      }

      // 默认大图
      const initialThumb = pickPreviewUrl(mod)
      setActivePreviewImg(initialThumb)
      setActiveFullImg(mod.images?.[0]?.url || initialThumb)

      try {
        const details = await window.flairx.getGameBananaDetails({
          itemType: mod.itemType || 'Mod',
          itemId: mod.id,
          modId: mod.id,
          gameId: activeGame.id
        })
        if (seq !== detailSeqRef.current) return

        if (details) {
          setDetailMod(details)
          const firstImg = pickPreviewUrl(details, 'thumb') || initialThumb
          setActivePreviewImg(firstImg)
          setActiveFullImg(details.images?.[0]?.url || firstImg)

          // 记忆模式：打开任何模组详情时自动平滑翻译为中文
          if (autoTranslate) {
            triggerTranslate(details, seq)
          }
        }
      } catch (err) {
        console.error('Failed to load mod details:', err)
      } finally {
        if (seq === detailSeqRef.current) {
          setLoadingDetail(false)
        }
      }
    },
    [autoTranslate, translatedMap, activeGame, triggerTranslate]
  )

  // 关闭详情抽屉
  const closeDetailDrawer = useCallback(() => {
    setDetailMod(null)
    setLoadingDetail(false)
    setLightboxOpen(false)
  }, [])

  // Esc 关闭注册：详情抽屉 / 角色指认弹窗（仅各自打开时注册监听）
  // 覆盖确认弹窗由 Modal 自己处理 Esc，这里不注册，避免一次 Esc 连详情抽屉一起关掉
  useEscapeToClose(!!detailMod && !pendingOverwrite && !lightboxOpen, closeDetailDrawer)
  const closeCharPicker = useCallback(() => setPendingInstallTarget(null), [])
  useEscapeToClose(!!pendingInstallTarget, closeCharPicker)
  const cancelOverwrite = useCallback(() => setPendingOverwrite(null), [])

  // 联动跳转：若从模组详情页携带 modId 或搜索词跳转过来，自动联动
  useEffect(() => {
    if (initialModId) {
      openDetailDrawer({ id: initialModId })
      onClearInitialNav?.()
    } else if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm)
      // 直接冲刷防抖值，让列表用该关键字立即查询
      setDebouncedQuery(initialSearchTerm)
      onClearInitialNav?.()
    }
  }, [initialModId, initialSearchTerm])

  // 按作者快捷搜索
  const handleSearchByAuthor = useCallback(
    (authorName: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation()
      if (!authorName || authorName === '未知作者') return
      const query = buildAuthorSearchQuery(authorName)
      if (!query) return
      closeDetailDrawer()
      // 「所有模组」不应被当前角色分类收窄，重置到全部角色
      setSelectedCharId('all')
      setSearchTerm(query)
      // 立即冲刷防抖值，查询改由 debouncedQuery 驱动的 effect 执行（绕开 400ms 等待）
      setDebouncedQuery(query)
    },
    [closeDetailDrawer]
  )

  // 实际执行安装流水线
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
          gameId: activeGame.id,
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
            if (onInstallSuccess) onInstallSuccess()
          }, 1500)
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
    [installingFileId, activeGame, onInstallSuccess, refreshInstalledVersions, toast]
  )

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

  // 触发安装单个指定文件 (智能自动识别目标角色，若无法识别则弹窗供用户指认)
  const executeInstallFile = useCallback(
    async (modInfo: any, targetFile: any) => {
      if (installingFileId !== null) return

      // 1. 尝试从 Mod 详情及分类智能推断归属角色
      let targetChar: string | null = null
      try {
        targetChar = await window.flairx.detectGameBananaCharacter(modInfo, activeGame.id)
      } catch (_) {}

      // 2. 若未自动匹配，且当前页面正处于某个具体角色的分类筛选下，沿用该角色
      if (!targetChar && selectedCharId !== 'all') {
        const match = characters.find(c => c.id === selectedCharId)
        if (match && match.name) {
          targetChar = match.name
        }
      }

      // 3. 仍未匹配到明确角色：弹出对话框让用户快速指定 (或选“通用”)
      if (!targetChar) {
        setPendingInstallTarget({ modInfo, targetFile })
        setCharPickerSearch('')
        return
      }

      // 4. 已精准识别到角色，先预检覆盖再开始流式下载并安装到对应角色目录
      await startInstall(modInfo, targetFile, targetChar)
    },
    [installingFileId, activeGame, selectedCharId, characters, startInstall]
  )

  // 文件行点击：已安装的版本跳过角色识别，直接交给 startInstall 弹重装确认；
  // 未安装或本地缓存缺失时保持原来的角色识别链路
  const handleFileInstall = useCallback(
    async (modInfo: any, targetFile: any) => {
      if (installingFileId !== null) return

      if (isGameBananaFileInstalled(targetFile?.fileName, installedVersions) && installedTarget?.existing) {
        const selectedChar =
          selectedCharId !== 'all'
            ? characters.find((c) => c.id === selectedCharId)?.name || ''
            : ''
        const fallbackChar =
          characterNameFromInstallTarget(installedTarget.existing) || selectedChar || '通用'
        await startInstall(modInfo, targetFile, fallbackChar)
        return
      }

      await executeInstallFile(modInfo, targetFile)
    },
    [
      installingFileId,
      installedVersions,
      installedTarget,
      selectedCharId,
      characters,
      startInstall,
      executeInstallFile
    ]
  )

  // 用户在弹窗中选择确认角色
  const handleConfirmInstallWithCharacter = async (chosenChar: string) => {
    if (!pendingInstallTarget) return
    const { modInfo, targetFile } = pendingInstallTarget
    setPendingInstallTarget(null)
    await startInstall(modInfo, targetFile, chosenChar)
  }

  const totalPages = Math.ceil(totalRecords / perPage) || 1

  return (
    <div className="flex-1 flex flex-col overflow-hidden select-none bg-surface/30 relative">
      {/* 顶部过滤工具栏 */}
      <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-surface/80 backdrop-blur-md shrink-0 relative z-20">
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          {/* 角色类别选择器 */}
          <Select
            value={selectedCharId}
            onChange={(val) => setSelectedCharId(val)}
            options={[
              { value: 'all', label: '全部角色 (All Characters)', searchText: '全部角色 all characters qbjs' },
              ...characters
                .filter((c) => c.id !== 'all')
                .map((c) => ({
                  value: c.id,
                  label: `${c.name} ${c.enName ? `(${c.enName})` : ''}`,
                  searchText: [c.name, c.enName, c.pinyin].filter(Boolean).join(' ')
                }))
            ]}
            searchable
            searchPlaceholder="搜索角色 / 英文 / 拼音..."
            prefixIcon={<Filter className="w-3.5 h-3.5 text-primary shrink-0" />}
            size="sm"
            className="w-56 font-semibold"
            popupClassName="w-64"
          />

          {/* 排序方式选择器 */}
          <Select
            value={sortOption}
            onChange={(val) => setSortOption(val)}
            options={[
              { value: 'Generic_Newest', label: '最新发布' },
              { value: 'Generic_MostDownloaded', label: '最多下载' },
              { value: 'Generic_MostLiked', label: '最多喜欢' },
              { value: 'Generic_MostViewed', label: '最多浏览' }
            ]}
            size="sm"
            className="w-32 font-semibold"
            popupClassName="w-36"
          />
        </div>

        {/* 搜索框 & 刷新 */}
        <div className="flex items-center space-x-2">
          <div className="w-64">
            <Input
              placeholder="搜索 Mod 或输入 user:作者名..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                if (searchTerm.trim() !== debouncedQuery.trim()) {
                  // 输入尚未停稳：冲刷防抖值，查询由 debouncedQuery 驱动的 effect 执行
                  setDebouncedQuery(searchTerm)
                } else {
                  fetchMods(1)
                }
              }}
              prefixIcon={<Search className="w-3.5 h-3.5" />}
            />
          </div>

          <Button
            variant="secondary"
            onClick={() => fetchMods(1)}
            disabled={loading}
            title="刷新列表"
            className="p-2"
            icon={<RefreshCw className={`w-3.5 h-3.5 text-primary ${loading ? 'animate-spin' : ''}`} />}
          />
        </div>
      </div>

      {/* 详情抽屉 z-50 的 backdrop-blur 会糊掉页内进度条，且滚动无关，所以改成固定浮层保证下载期间始终可读 */}
      {installingFileId !== null && (
        <div className="fixed left-6 bottom-6 z-[60] w-80 rounded-control border border-border bg-surface/95 backdrop-blur-md shadow-lg px-4 py-3 space-y-2 text-xs text-primary animate-in fade-in duration-200">
          <div className="flex items-center space-x-2 font-semibold">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
            <span>{progressMsg || '正在处理模组下载与安全解压...'}</span>
            <Button variant="ghost" size="xs" onClick={handleCancelInstall} disabled={cancelling} className="ml-auto shrink-0">取消</Button>
          </div>
          <div className="w-full bg-surface-2 border border-border rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Mod 瀑布流/网格展示 */}
      <ScrollContainer className="flex-1 p-6">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-primary space-y-3">
            <RefreshCw className="w-9 h-9 animate-spin" />
            <p className="text-xs font-mono tracking-widest uppercase text-text-muted">
              // 正在连接 GameBanana 模组市场 //
            </p>
          </div>
        ) : mods.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-3">
            <div className="p-4 rounded-2xl bg-surface border border-border text-primary shadow-xs">
              <ShoppingBag className="w-10 h-10 stroke-[1.2]" />
            </div>
            <div className="text-center">
              <div className="text-xs font-mono tracking-widest text-text-muted uppercase">
                // 未找到匹配的模组资源 //
              </div>
              <p className="text-xs text-text-muted mt-1">请尝试更换搜索关键字、角色分类或重置筛选</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {mods.map((mod) => {
              return (
                <GameBananaCard
                  key={mod.id}
                  mod={mod}
                  previewUrl={pickPreviewUrl(mod, 'thumb')}
                  onOpenDetail={openDetailDrawer}
                  onSearchByAuthor={handleSearchByAuthor}
                />
              )
            })}
          </div>
        )}
      </ScrollContainer>

      {/* 分页控制器 */}
      {totalPages > 1 && !loading && (
        <div className="p-3 border-t border-border bg-surface/80 backdrop-blur-md flex items-center justify-between shrink-0 px-6">
          <div className="text-xs text-text-muted font-mono">
            第 {currentPage} / {totalPages} 页 · 共 {totalRecords} 个模组资源
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage <= 1 || loading}
              onClick={() => fetchMods(currentPage - 1)}
              icon={<ChevronLeft className="w-4 h-4" />}
            >
              上一页
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage >= totalPages || loading}
              onClick={() => fetchMods(currentPage + 1)}
              icon={<ChevronRight className="w-4 h-4" />}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 模组详情侧滑抽屉 (1:1 FlairX 体验) */}
      {detailMod && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
          onClick={closeDetailDrawer}
        >
          <div
            className="w-full max-w-xl h-full bg-surface border-l border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-fast"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 抽屉顶栏 */}
            <div className="p-4 border-b border-border flex items-start justify-between bg-surface/90 backdrop-blur-md shrink-0">
              <div className="pr-4 flex-1">
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
              </div>
              <button
                type="button"
                onClick={closeDetailDrawer}
                className="p-1.5 rounded-full hover:bg-surface-2 text-text-muted hover:text-text transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 抽屉主体内容 */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
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
                    <button
                      type="button"
                      onClick={() => handleSearchByAuthor(detailMod.submitter?.name || detailMod.author)}
                      className="text-[10px] text-primary hover:underline cursor-pointer font-medium mt-0.5"
                    >
                      查看作者的所有模组 →
                    </button>
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

              {/* 可安装文件清单 (核心 FlairX 机制) */}
              <GameBananaFileList
                files={detailMod.files}
                loading={loadingDetail}
                installingFileId={installingFileId}
                progressPercent={progressPercent}
                installedVersions={installedVersions}
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
          </div>
        </div>
      )}

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
                  <h3 className="text-sm font-bold text-text">选择目标角色安装目录</h3>
                  <p className="text-[11px] text-text-muted mt-0.5">该模组未包含明确角色标签，请指定解压目标文件夹</p>
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

            {/* 角色列表列表 */}
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
                    c.name?.toLowerCase().includes(q) ||
                    c.enName?.toLowerCase().includes(q) ||
                    c.pinyin?.toLowerCase().includes(q)
                  )
                })
                .map((c) => (
                  <button
                    key={c.id || c.name}
                    type="button"
                    onClick={() => handleConfirmInstallWithCharacter(c.name)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-control hover:bg-primary/10 hover:text-primary transition-colors text-xs font-semibold border border-transparent hover:border-primary/20 cursor-pointer text-left"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-primary/60" />
                      <span>{c.name}</span>
                      {c.enName && <span className="text-[10px] text-text-muted font-normal">({c.enName})</span>}
                    </div>
                    <span className="text-[10px] font-mono text-text-muted">Mods/{c.name}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 安装前覆盖确认弹窗（与详情抽屉共用同一组件，文案不会分叉） */}
      <GameBananaOverwriteConfirm
        isOpen={!!pendingOverwrite}
        modName={pendingOverwrite?.modInfo?.name}
        fileName={pendingOverwrite?.targetFile?.fileName}
        target={pendingOverwrite}
        onConfirmUpdate={handleConfirmOverwriteUpdate}
        onConfirmNewInstall={handleConfirmNewInstall}
        onCancel={cancelOverwrite}
      />
    </div>
  )
}

export default GameBananaPage
