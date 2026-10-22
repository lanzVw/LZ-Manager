import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  RotateCw,
  X,
  Sliders,
  CheckCircle2,
  XCircle,
  Gamepad2,
  Layers,
  Zap,
  Image as ImageIcon,
  Sun,
  Moon,
  Menu,
  Pin,
  Crosshair,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ArrowUpDown,
  Command,
  SlidersHorizontal,
  Settings,
  Search,
  Heart,
  Edit3,
  Filter,
  Check,
  Minus,
  Plus,
  ChevronUp,
  ChevronDown,
  FolderInput,
  LayoutGrid,
  List
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { Logo } from '../components/Logo'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { ScrollContainer } from '../components/ui/ScrollContainer'
import { parseIniHotkeys, ParsedHotkey } from './iniParser'
import { ModDetailedInfo, ModPersistVariable } from '../../core/types'
import { planPresetApply } from '../../core/preset-plan'
import { MoveModModal } from '../components/MoveModModal'

export const OverlayApp: React.FC = () => {
  const { theme, toggleTheme, palette } = useTheme()
  const [config, setConfig] = useState<any>(null)
  const [activeGame, setActiveGame] = useState<any>(null)
  const [modsData, setModsData] = useState<Record<string, any[]>>({})
  const [characters, setCharacters] = useState<string[]>([])
  const [characterAvatars, setCharacterAvatars] = useState<Record<string, string>>({})
  const [selectedCharName, setSelectedCharName] = useState<string | null>(null)
  const [focusedModIndex, setFocusedModIndex] = useState<number>(0)
  const [presets, setPresets] = useState<any[]>([])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [reloading, setReloading] = useState<boolean>(false)
  const [gamepadConnected, setGamepadConnected] = useState<boolean>(false)

  // 视口与外观设置 (整个悬浮窗窗口缩放比例，范围 60% ~ 150%)
  const [windowScale, setWindowScale] = useState<number>(() => {
    const saved = localStorage.getItem('lz-overlay-window-scale') || localStorage.getItem('lz-overlay-scale')
    return saved ? parseFloat(saved) : 1.0
  })
  const [opacity, setOpacity] = useState<number>(() => {
    const saved = localStorage.getItem('lz-overlay-opacity')
    return saved ? parseFloat(saved) : 0.92
  })
  const [isPinned, setIsPinned] = useState<boolean>(true)
  const [onlyShowInGame, setOnlyShowInGame] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('lz-overlay-only-in-game')
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })

  // QAQ 核心模式与过滤状态
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  type ModSortMode = 'default' | 'time' | 'name'
  const [modSortMode, setModSortMode] = useState<ModSortMode>(() => {
    return (localStorage.getItem('lz-overlay-mod-sort-mode') as ModSortMode) || 'default'
  })
  const [isReverseOrder, setIsReverseOrder] = useState<boolean>(() => {
    return localStorage.getItem('lz-overlay-mod-sort-reverse') === 'true'
  })

  const cycleSortMode = () => {
    setModSortMode((prev) => {
      const next: ModSortMode = prev === 'default' ? 'time' : prev === 'time' ? 'name' : 'default'
      localStorage.setItem('lz-overlay-mod-sort-mode', next)
      return next
    })
  }

  const toggleReverseOrder = () => {
    setIsReverseOrder((prev) => {
      const next = !prev
      localStorage.setItem('lz-overlay-mod-sort-reverse', String(next))
      return next
    })
  }
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState<boolean>(false)
  const [filterOnlyWithMods, setFilterOnlyWithMods] = useState<boolean>(true)
  const [exclusiveMode, setExclusiveMode] = useState<boolean>(true)

  // 抽屉状态 (全部角色网格、Mod 详情面板、设置面板)
  const [isCharDrawerOpen, setIsCharDrawerOpen] = useState<boolean>(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
  const [charSearchQuery, setCharSearchQuery] = useState<string>('')
  const [activeDetailMod, setActiveDetailMod] = useState<any | null>(null)
  const [activeModDetails, setActiveModDetails] = useState<ModDetailedInfo | null>(null)
  const [parsedHotkeys, setParsedHotkeys] = useState<ParsedHotkey[]>([])
  const [loadingHotkeys, setLoadingHotkeys] = useState<boolean>(false)
  const [showMoveModal, setShowMoveModal] = useState<boolean>(false)
  const [markedMods, setMarkedMods] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('lz-marked-mods')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const lastGamepadInputTime = useRef<number>(0)
  const modListContainerRef = useRef<HTMLDivElement>(null)
  const charStripRef = useRef<HTMLDivElement>(null)
  const selectedCharBtnRef = useRef<HTMLButtonElement | null>(null)
  const isDraggingCharStrip = useRef<boolean>(false)
  const dragStartX = useRef<number>(0)
  const dragScrollLeft = useRef<number>(0)
  const dragDistance = useRef<number>(0)
  const loadSeqRef = useRef<number>(0)
  const detailLoadSeqRef = useRef<number>(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSelfDispatchTime = useRef<number>(0)
  const [isDraggingStrip, setIsDraggingStrip] = useState<boolean>(false)

  // 角色胶囊条鼠标滚轮横向滚动（将滚轮 deltaY 转换为横向 scrollLeft）
  const handleCharStripWheel = (e: React.WheelEvent) => {
    if (!charStripRef.current) return
    e.stopPropagation()
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    charStripRef.current.scrollLeft += delta
  }

  // 角色胶囊条鼠标按住抓取拖拽滑动 (Drag to scroll)
  const handleCharStripMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !charStripRef.current) return
    isDraggingCharStrip.current = true
    setIsDraggingStrip(true)
    dragStartX.current = e.clientX
    dragScrollLeft.current = charStripRef.current.scrollLeft
    dragDistance.current = 0
  }

  const handleCharStripMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingCharStrip.current || !charStripRef.current) return
    const dx = e.clientX - dragStartX.current
    dragDistance.current += Math.abs(dx)
    charStripRef.current.scrollLeft = dragScrollLeft.current - dx
  }

  const handleCharStripMouseUp = () => {
    isDraggingCharStrip.current = false
    setIsDraggingStrip(false)
  }

  const handleCharStripMouseLeave = () => {
    isDraggingCharStrip.current = false
    setIsDraggingStrip(false)
  }

  // 严格杜绝 window / document 级滚动，防止任何子元素导致悬浮窗整体布局外移
  useEffect(() => {
    const lockWindowScroll = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0)
      }
    }
    window.addEventListener('scroll', lockWindowScroll)
    return () => window.removeEventListener('scroll', lockWindowScroll)
  }, [])

  const showToast = (msg: string) => {
    // 先清掉上一次的定时器，避免每次提示各自起 timer 互相掐灭
    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current)
    }
    setToastMsg(msg)
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2000)
  }

  // 监听主进程发送过来的悬浮窗 Toast 提示
  useEffect(() => {
    const remove = window.lz.onShowToast?.((msg: string) => {
      showToast(msg)
    })
    return () => {
      remove?.()
    }
  }, [])

  // 组件卸载时清理 toast 定时器
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  // 1. 初始化及刷新数据加载（loadSeqRef 序号守卫：onGameChanged 与 onOverlayShown 并发触发时丢弃过期段）
  const loadData = useCallback(async (forcedGameId?: string) => {
    const seq = ++loadSeqRef.current
    try {
      const cfg = await window.lz.getConfig()
      if (seq !== loadSeqRef.current) return
      setConfig(cfg)
      const targetId = forcedGameId || cfg.activeGameId
      const visibleGames = (cfg.games || []).filter((g: any) => !g.hidden)
      const current =
        visibleGames.find((g: any) => g.id === targetId) ||
        visibleGames[0] ||
        (cfg.games || []).find((g: any) => g.id === targetId) ||
        cfg.games?.[0]
      setActiveGame(current)

      const mods = await window.lz.scanMods()
      if (seq !== loadSeqRef.current) return
      setModsData(mods || {})
      const charList = Object.keys(mods || {})
      setCharacters(charList)

      const presetData = await window.lz.getPresets()
      if (seq !== loadSeqRef.current) return
      setPresets(presetData.presets || [])
      setActivePresetId(presetData.activePresetId || null)

      const avatars = await window.lz.getCharacterAvatars?.(current?.id)
      // 应用最终 state 前再校验一次序号
      if (seq !== loadSeqRef.current) return
      if (avatars) setCharacterAvatars(avatars)
    } catch (err) {
      console.error('Failed to load overlay data:', err)
    }
  }, [])

  // 预设变更只影响方案列表与激活标识，走 loadData 会连带重扫头像与配置，代价过高
  const refreshPresets = useCallback(async () => {
    try {
      const presetData = await window.lz.getPresets()
      setPresets(presetData.presets || [])
      setActivePresetId(presetData.activePresetId || null)
    } catch (err) {
      console.error('Failed to refresh overlay presets:', err)
    }
  }, [])

  useEffect(() => {
    loadData()

    const unsubGame = window.lz.onGameChanged?.(async (data: any) => {
      if (data && data.gameId) {
        setSelectedCharName(null)
        setFocusedModIndex(0)
        setCharSearchQuery('')
        setStatusFilter('all')
        setActiveDetailMod(null)
        setActiveModDetails(null)
        await loadData(data.gameId)
      }
    })

    const unsubShow = window.lz.onOverlayShown?.(async () => {
      await loadData()
    })

    const unsubPresets = window.lz.onPresetsChanged?.(async () => {
      // 主窗应用或编辑方案后磁盘启停状态可能已变，悬浮窗不跟着重扫就会与主窗显示分叉
      await refreshPresets()
      try {
        const updated = await window.lz.scanMods()
        setModsData(updated || {})
      } catch (err) {
        console.error('Failed to refresh overlay mods after preset change:', err)
      }
    })

    return () => {
      unsubGame?.()
      unsubShow?.()
      unsubPresets?.()
    }
  }, [loadData, refreshPresets])

  // 智能三梯队角色排序：已装配(enabledCount > 0) -> 有Mod(total > 0) -> 空角色(total === 0)，同梯队按拼音A-Z排序
  const sortedCharacters = useMemo(() => {
    const list = [...characters]
    list.sort((a, b) => {
      const modsA = modsData[a] || []
      const modsB = modsData[b] || []
      const enabledA = modsA.filter((m) => m.enabled).length
      const enabledB = modsB.filter((m) => m.enabled).length

      const tierA = enabledA > 0 ? 0 : modsA.length > 0 ? 1 : 2
      const tierB = enabledB > 0 ? 0 : modsB.length > 0 ? 1 : 2
      if (tierA !== tierB) return tierA - tierB

      return a.localeCompare(b, 'zh-Hans-CN')
    })
    return list
  }, [characters, modsData])

  // 显示的角色列表（结合 filterOnlyWithMods 过滤）
  const displayCharacters = useMemo(() => {
    if (!filterOnlyWithMods) return sortedCharacters
    return sortedCharacters.filter((c) => (modsData[c] || []).length > 0)
  }, [sortedCharacters, modsData, filterOnlyWithMods])

  // 当前选中的角色：以 selectedCharName 作为不可动摇的核心锚点，只要该角色还在列表中就绝不更换！
  const currentChar = useMemo(() => {
    if (displayCharacters.length === 0) {
      return sortedCharacters[0] || null
    }
    if (selectedCharName && displayCharacters.includes(selectedCharName)) {
      return selectedCharName
    }
    return displayCharacters[0]
  }, [displayCharacters, sortedCharacters, selectedCharName])

  // 当前选中角色在 displayCharacters 中的实际索引（派生计算，永远与 currentChar 实时同步，无延迟无撕裂）
  const selectedCharIndex = useMemo(() => {
    if (!currentChar) return 0
    const idx = displayCharacters.indexOf(currentChar)
    return idx >= 0 ? idx : 0
  }, [displayCharacters, currentChar])

  // 当选中角色改变或列表重排时，只在横向胶囊容器内部平滑居中滚动当前角色胶囊，绝不触发 window / 页面级抖动
  useEffect(() => {
    const container = charStripRef.current
    const btn = selectedCharBtnRef.current
    if (!container || !btn || isDraggingCharStrip.current) return

    const containerWidth = container.clientWidth
    const btnLeft = btn.offsetLeft
    const btnWidth = btn.offsetWidth
    const targetLeft = btnLeft - containerWidth / 2 + btnWidth / 2

    container.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: 'smooth'
    })
  }, [currentChar])

  const currentMods = useMemo(() => {
    if (!currentChar) return []
    let list = [...(modsData[currentChar] || [])]

    // 1. 状态过滤 (全部 / 装配 / 停用)
    if (statusFilter === 'enabled') {
      list = list.filter((m) => m.enabled)
    } else if (statusFilter === 'disabled') {
      list = list.filter((m) => !m.enabled)
    }

    // 2. 收藏过滤 (♥)
    if (filterFavoritesOnly) {
      list = list.filter((m) => markedMods[m.fullPath])
    }

    // 3. 核心排序计算
    list.sort((a, b) => {
      if (modSortMode === 'default') {
        // 复合装配优先：已装配(enabled) > 收藏标记(marked) > 修改时间(mtime 降序) > 名称拼音
        const enabledDiff = (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)
        if (enabledDiff !== 0) return enabledDiff

        const markA = markedMods[a.fullPath] ? 1 : 0
        const markB = markedMods[b.fullPath] ? 1 : 0
        const markDiff = markB - markA
        if (markDiff !== 0) return markDiff

        const timeA = a.mtime || 0
        const timeB = b.mtime || 0
        if (timeB !== timeA) return timeB - timeA

        return a.name.localeCompare(b.name, 'zh-Hans-CN')
      } else if (modSortMode === 'time') {
        // 最新修改/添加优先 (mtime 降序)
        const timeA = a.mtime || 0
        const timeB = b.mtime || 0
        if (timeB !== timeA) return timeB - timeA

        return a.name.localeCompare(b.name, 'zh-Hans-CN')
      } else if (modSortMode === 'name') {
        // 严格按名称拼音字母正序
        return a.name.localeCompare(b.name, 'zh-Hans-CN')
      }
      return 0
    })

    // 4. 升/降序翻转 (在排序好的基础上一键倒序)
    if (isReverseOrder) {
      list.reverse()
    }

    return list
  }, [currentChar, modsData, statusFilter, filterFavoritesOnly, modSortMode, isReverseOrder, markedMods])

  // 整个悬浮窗窗口大小缩放调节 (A- / 100% / A+)
  const handleScaleChange = async (delta: number) => {
    const next = Math.max(0.6, Math.min(1.5, Math.round((windowScale + delta) * 10) / 10))
    setWindowScale(next)
    localStorage.setItem('lz-overlay-window-scale', next.toString())
    await window.lz.setOverlayScale?.(next)
    showToast(`窗口大小: ${Math.round(next * 100)}%`)
  }

  const handleResetScale = async () => {
    setWindowScale(1.0)
    localStorage.setItem('lz-overlay-window-scale', '1.0')
    await window.lz.setOverlayScale?.(1.0)
    showToast('已恢复窗口默认大小 (100%)')
  }

  // 切换“仅在游戏界面显示”
  const handleToggleOnlyShowInGame = async () => {
    const next = !onlyShowInGame
    setOnlyShowInGame(next)
    localStorage.setItem('lz-overlay-only-in-game', next.toString())
    await window.lz.setOverlayOnlyInGame?.(next)
    showToast(next ? '已开启：仅在游戏前台显示' : '已关闭：可在任何窗口呼出')
  }

  // 📌 切换窗口置顶并同步到主进程（失败时回滚本地状态并提示）
  const handleTogglePinned = async () => {
    const nextValue = !isPinned
    setIsPinned(nextValue)
    showToast(nextValue ? '窗口已锁定置顶' : '窗口置顶已解除')
    try {
      await window.lz.setOverlayPinned(nextValue)
    } catch (err) {
      console.error('Failed to set overlay pinned:', err)
      setIsPinned(!nextValue)
      showToast('置顶状态设置失败')
    }
  }

  // 组件挂载时自动同步上次保存的窗口缩放尺寸和仅游戏显示配置
  useEffect(() => {
    const saved = localStorage.getItem('lz-overlay-window-scale') || localStorage.getItem('lz-overlay-scale')
    const s = saved ? parseFloat(saved) : 1.0
    if (s && s !== 1.0) {
      window.lz.setOverlayScale?.(s)
    }

    const savedOnlyInGame = localStorage.getItem('lz-overlay-only-in-game')
    const onlyInGameVal = savedOnlyInGame !== null ? savedOnlyInGame === 'true' : true
    window.lz.setOverlayOnlyInGame?.(onlyInGameVal)
  }, [])

  // 背景透明度滑块
  const handleOpacityChange = (val: number) => {
    setOpacity(val)
    localStorage.setItem('lz-overlay-opacity', val.toString())
  }

  // 切换单个 Mod 状态
  const handleToggleMod = async (mod: any) => {
    const targetChar = mod.characterName || mod.character || currentChar
    if (!targetChar) return
    const nextState = !mod.enabled
    lastSelfDispatchTime.current = Date.now()

    // 详情抽屉内同步响应开关状态
    if (activeDetailMod && (activeDetailMod.name === mod.name || activeDetailMod.id === mod.id)) {
      setActiveDetailMod((prev: any) => (prev ? { ...prev, enabled: nextState } : null))
    }

    // 单选互斥逻辑
    if (exclusiveMode && nextState) {
      setModsData((prev) => {
        const copy = { ...prev }
        if (copy[targetChar]) {
          copy[targetChar] = copy[targetChar].map((m) =>
            m.name === mod.name ? { ...m, enabled: true } : { ...m, enabled: false }
          )
        }
        return copy
      })
    } else {
      setModsData((prev) => {
        const copy = { ...prev }
        if (copy[targetChar]) {
          copy[targetChar] = copy[targetChar].map((m) =>
            m.name === mod.name ? { ...m, enabled: nextState } : m
          )
        }
        return copy
      })
    }

    try {
      const res = await window.lz.toggleMod(targetChar, mod.name, nextState)
      if (res && res.success) {
        showToast(`${mod.name} ${nextState ? '已装配' : '已停用'}`)
        const updated = await window.lz.scanMods()
        setModsData(updated || {})
      } else {
        showToast(`切换失败: ${res?.error || '未知错误'}`)
      }
    } catch {
      showToast('切换异常')
    }
  }

  // 触发 F10 热刷新
  const handleReloadF10 = async () => {
    // 派发出去的 F10 会落回本窗口的全局快捷键监听，若此时游戏未运行，
    // 主进程会拒绝派发；这里再加一道重入锁，避免连点堆起一串刷新
    if (reloading) return
    setReloading(true)
    lastSelfDispatchTime.current = Date.now()
    showToast('正在发送热刷新信号 (F10)...')
    try {
      const res = await window.lz.reloadModsF10()
      if (res && res.success === false) {
        if (res.reason === 'echo_suppressed') {
          // 刚已执行过热刷新，回声守卫正常吸收，静默视为已执行
          return
        }
        showToast(res.reason === 'game_not_running' ? '游戏未启动，已跳过热刷新' : '热刷新未执行')
        return
      }
      const updated = await window.lz.scanMods()
      setModsData(updated || {})
      showToast('F10 热刷新成功！')
    } catch {
      showToast('刷新失败')
    } finally {
      setTimeout(() => setReloading(false), 500)
    }
  }

  // 悬浮窗固定走严格还原，和主窗一键应用保持同一语义，避免两个入口行为分叉
  const handleApplyPreset = async (presetId: string) => {
    showToast('正在部署预设方案...')
    try {
      const res = await window.lz.applyPreset(presetId, { mode: 'replace' })
      if (res && res.success) {
        setActivePresetId(presetId)
        await refreshPresets()
        const updated = await window.lz.scanMods()
        setModsData(updated || {})
        const skipped = res.missing.length > 0 ? ` · 跳过 ${res.missing.length} 项失效引用` : ''
        showToast(`已生效：启用 ${res.enabled} 项 · 停用 ${res.disabled} 项${skipped}`)
      } else {
        // 部分失败时引擎已给出「N 项成功 / M 项失败」的具体原因，优先透传
        showToast(res?.message || '预设应用失败')
      }
    } catch {
      showToast('预设切换异常')
    }
  }

  // 🎯 一键定位当前生效的 Mod
  const handleLocateEnabled = () => {
    const idx = currentMods.findIndex((m) => m.enabled)
    if (idx !== -1) {
      setFocusedModIndex(idx)
      const container = modListContainerRef.current
      const el = document.getElementById(`mod-card-${idx}`)
      if (container && el) {
        const targetTop = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2
        container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
        el.classList.add('ring-4', 'ring-primary')
        setTimeout(() => el.classList.remove('ring-4', 'ring-primary'), 1000)
      }
      showToast('已定位至当前生效 Mod')
    } else {
      showToast('当前筛选下暂无生效中的 Mod')
    }
  }

  // 打开 Mod 详情抽屉 (QAQ 侧滑详情, detailLoadSeqRef 序号守卫防止过期详情回写)
  const handleOpenDetail = async (mod: any) => {
    const seq = ++detailLoadSeqRef.current
    setActiveDetailMod(mod)
    // 打开新详情时重置旧详情状态
    setActiveModDetails(null)
    setParsedHotkeys([])
    setLoadingHotkeys(true)
    try {
      const details = await window.lz.getModDetails(mod.fullPath)
      if (seq !== detailLoadSeqRef.current) return
      setActiveModDetails(details)

      // 解析 INI 文件中的 KeyBind（支持扫描所有相关 INI 文件）
      if (details?.iniFiles && details.iniFiles.length > 0) {
        let allHotkeys: ParsedHotkey[] = []
        for (const ini of details.iniFiles) {
          try {
            const content = await window.lz.readIni(ini.fullPath)
            if (seq !== detailLoadSeqRef.current) return
            const keys = parseIniHotkeys(content)
            allHotkeys.push(...keys)
          } catch (e) {
            console.error('Failed to read/parse ini:', ini.fullPath, e)
          }
        }
        // 去重
        const seen = new Set<string>()
        const uniqueHotkeys = allHotkeys.filter((item) => {
          const sig = `${item.name}-${item.keys.join('+')}`
          if (seen.has(sig)) return false
          seen.add(sig)
          return true
        })

        // 智能关联 PersistBridge 变量与当前生效值，并合并元数据翻译
        const vAliases = details?.metadata?.variableAliases || {}
        const hTrans = details?.metadata?.hotkeyTranslations || {}
        const vLabels = details?.metadata?.valueLabels || {}

        if (details?.persistInfo?.variables) {
          for (const h of uniqueHotkeys) {
            const hVar = h.variable?.toLowerCase()
            const pv = details.persistInfo.variables.find(
              (v) => (hVar && v.canonicalName.toLowerCase() === hVar) || v.name.toLowerCase() === h.name.toLowerCase()
            )
            if (pv) {
              h.currentValue = pv.currentValue
              if (pv.alias) h.chineseName = pv.alias
              if (!h.allowedValues || h.allowedValues.length === 0) {
                h.allowedValues = pv.allowedValues
              }
              if (pv.valueLabels) {
                h.valueLabels = { ...(h.valueLabels || {}), ...pv.valueLabels }
              }
            } else if (h.allowedValues && h.allowedValues.length > 0 && !h.currentValue) {
              h.currentValue = h.allowedValues[0]
            }

            // 合并外部自定义与持久化翻译
            if (hTrans[h.name]) h.chineseName = hTrans[h.name]
            if (h.variable && vAliases[h.variable]) h.chineseName = vAliases[h.variable]
            if (h.description && hTrans[h.description]) h.chineseDescription = hTrans[h.description]
            const varLabelMap = (h.variable && vLabels[h.variable]) || {}
            if (Object.keys(varLabelMap).length > 0) {
              h.valueLabels = { ...(h.valueLabels || {}), ...varLabelMap }
            }
          }
        } else {
          for (const h of uniqueHotkeys) {
            if (h.allowedValues && h.allowedValues.length > 0 && !h.currentValue) {
              h.currentValue = h.allowedValues[0]
            }
            if (hTrans[h.name]) h.chineseName = hTrans[h.name]
            if (h.variable && vAliases[h.variable]) h.chineseName = vAliases[h.variable]
            if (h.description && hTrans[h.description]) h.chineseDescription = hTrans[h.description]
            const varLabelMap = (h.variable && vLabels[h.variable]) || {}
            if (Object.keys(varLabelMap).length > 0) {
              h.valueLabels = { ...(h.valueLabels || {}), ...varLabelMap }
            }
          }
        }

        setParsedHotkeys(uniqueHotkeys)
      } else {
        setParsedHotkeys([])
      }
    } catch (err) {
      // 失败分支同样先比对序号：过期请求的错误不做任何处理
      if (seq !== detailLoadSeqRef.current) return
      console.error('Failed to load detail for overlay:', err)
    } finally {
      if (seq === detailLoadSeqRef.current) {
        setLoadingHotkeys(false)
      }
    }
  }

  // 调节 Persist Bridge 参数
  const handleUpdatePersistVar = async (v: ModPersistVariable, targetVal?: string) => {
    if (!activeModDetails) return
    lastSelfDispatchTime.current = Date.now()
    const allowed = v.allowedValues && v.allowedValues.length > 0 ? v.allowedValues : ['0', '1']
    let nextVal = targetVal
    if (nextVal === undefined) {
      const currIdx = allowed.indexOf(v.currentValue)
      nextVal = currIdx >= 0 ? allowed[(currIdx + 1) % allowed.length] : allowed[0]
    }

    try {
      const res = await window.lz.updateModVariable(activeModDetails.fullPath, v.name, nextVal)
      if (res && res.success === false) {
        showToast(`更新失败: ${res.error || '未知错误'}`)
        return
      }
      setActiveModDetails((prev) => {
        if (!prev || !prev.persistInfo) return prev
        return {
          ...prev,
          persistInfo: {
            ...prev.persistInfo,
            variables: prev.persistInfo.variables.map((item) =>
              item.name === v.name ? { ...item, currentValue: nextVal! } : item
            )
          }
        }
      })

      // 同步更新 parsedHotkeys 列表中对应变量的当前显示值（通过持久化与 F10 刷新，无需冗余按键模拟）
      setParsedHotkeys((prev) =>
        prev.map((item) => {
          const isMatch =
            (item.variable && item.variable.toLowerCase() === v.canonicalName.toLowerCase()) ||
            item.name.toLowerCase() === v.name.toLowerCase()
          return isMatch ? { ...item, currentValue: nextVal! } : item
        })
      )

      showToast(`已更新 $${v.name} = ${nextVal}`)
    } catch {
      showToast('更新参数失败')
    }
  }

  // 直接选择快捷键的设定数值（免去盲目多次单步循环点击）
  const handleSelectHotkeyVal = async (h: ParsedHotkey, targetVal: string) => {
    lastSelfDispatchTime.current = Date.now()
    const hVar = h.variable?.toLowerCase()
    const pv = activeModDetails?.persistInfo?.variables?.find(
      (v) => (hVar && v.canonicalName.toLowerCase() === hVar) || v.name.toLowerCase() === h.name.toLowerCase()
    )

    // 1. 如果匹配到可调度的快捷键组合，优先通过模拟按键步进将 3DMigoto 内存变量拨至目标值
    const canUseKeys = h.keys && h.keys.length > 0 && !h.keys.some((k) => k.includes('🎮') || k.includes('鼠标') || k.includes('Button'))
    if (canUseKeys && h.allowedValues && h.allowedValues.length > 1) {
      const currVal = h.currentValue || pv?.currentValue || h.allowedValues[0]
      const currIdx = h.allowedValues.indexOf(currVal)
      const targetIdx = h.allowedValues.indexOf(targetVal)

      if (currIdx >= 0 && targetIdx >= 0) {
        const steps = (targetIdx - currIdx + h.allowedValues.length) % h.allowedValues.length
        let sent = 0
        if (steps > 0) {
          showToast(`正在切换至设定值 ${targetVal}...`)
          for (let s = 0; s < steps; s++) {
            const res = await window.lz.triggerHotkey(h.keys)
            if (res && res.success === false) break
            sent++
            if (s < steps - 1) await new Promise((r) => setTimeout(r, 60))
          }
        }

        // 如果同时存在持久化变量，同步落盘写回文件确保游戏重启后依然生效
        if (pv && activeModDetails) {
          await window.lz.updateModVariable(activeModDetails.fullPath, pv.name, targetVal)
          setActiveModDetails((prev) => {
            if (!prev || !prev.persistInfo) return prev
            return {
              ...prev,
              persistInfo: {
                ...prev.persistInfo,
                variables: prev.persistInfo.variables.map((item) =>
                  item.name === pv.name ? { ...item, currentValue: targetVal } : item
                )
              }
            }
          })
        }

        const reachedIdx = (currIdx + sent) % h.allowedValues.length
        const reachedVal = h.allowedValues[reachedIdx]
        setParsedHotkeys((prev) =>
          prev.map((item) => (item === h || item.name === h.name ? { ...item, currentValue: reachedVal } : item))
        )
        if (sent < steps) {
          showToast('游戏未启动，档位切换未生效')
        } else {
          showToast(`已切换 [${h.name}] 至设定值: ${targetVal}`)
        }
        return
      }
    }

    // 2. 若无对应按键而是纯持久化变量：走持久化写入 + F10 热刷新通道
    if (pv) {
      await handleUpdatePersistVar(pv, targetVal)
      setParsedHotkeys((prev) =>
        prev.map((item) => (item === h || item.name === h.name ? { ...item, currentValue: targetVal } : item))
      )
      showToast(`已直接设定 [${h.name}] = ${targetVal}`)
      return
    }

    // 3. 兜底直接发送一次按键
    await handleTriggerHotkey(h)
  }

  // 点击快捷键卡片向游戏窗口触发对应按键
  const handleTriggerHotkey = async (h: ParsedHotkey) => {
    if (h.keys.some((k) => k.includes('🎮'))) {
      showToast('手柄按键请直接使用游戏手柄操作')
      return
    }
    if (h.keys.some((k) => k.includes('鼠标') || k.includes('键') || k.includes('Button'))) {
      showToast('鼠标类按键请直接在游戏中使用鼠标操作')
      return
    }

    try {
      showToast(`正在发送 [${h.keys.join(' + ')}]...`)
      // 不传进程名：主进程统一从当前游戏配置推导，避免这里猜错窗口
      const res = await window.lz.triggerHotkey(h.keys)
      if (res && res.success) {
        showToast(`已触发快捷键 [${h.keys.join(' + ')}]`)
      } else if (res && res.reason === 'game_not_running') {
        showToast('游戏未启动，按键未发送')
      } else {
        showToast('按键发送失败')
      }
    } catch (err) {
      console.error('Trigger hotkey error:', err)
      showToast('触发快捷键失败')
    }
  }

  // 标记/收藏此 Mod
  const handleToggleMark = (modFullPath: string) => {
    setMarkedMods((prev) => {
      const next = { ...prev, [modFullPath]: !prev[modFullPath] }
      localStorage.setItem('lz-marked-mods', JSON.stringify(next))
      return next
    })
    showToast(markedMods[modFullPath] ? '已取消标记' : '已加入标记')
  }


  // 当上下键或手柄聚焦选中 Mod 改变时，确保其在列表容器内平滑滚动进入视野（绝不影响页面主体）
  useEffect(() => {
    const container = modListContainerRef.current
    const el = document.getElementById(`mod-card-${focusedModIndex}`)
    if (container && el) {
      const cTop = container.scrollTop
      const cHeight = container.clientHeight
      const elTop = el.offsetTop
      const elHeight = el.offsetHeight

      if (elTop < cTop) {
        container.scrollTo({ top: elTop, behavior: 'smooth' })
      } else if (elTop + elHeight > cTop + cHeight) {
        container.scrollTo({ top: elTop + elHeight - cHeight, behavior: 'smooth' })
      }
    }
  }, [focusedModIndex])

  // 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 输入控件聚焦时（搜索框/输入框/可编辑区域）不触发全局快捷键，避免误触
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        if (e.key === 'Escape') target.blur()
        return
      }
      if (e.key === 'Escape') {
        if (activeDetailMod) {
          setActiveDetailMod(null)
        } else if (isCharDrawerOpen) {
          setIsCharDrawerOpen(false)
        } else if (isSettingsOpen) {
          setIsSettingsOpen(false)
        } else {
          window.lz.hideOverlay()
        }
      } else if (e.key === 'ArrowUp') {
        setFocusedModIndex((prev) => Math.max(0, prev - 1))
      } else if (e.key === 'ArrowDown') {
        setFocusedModIndex((prev) => Math.min(currentMods.length - 1, prev + 1))
      } else if (e.key === 'PageDown') {
        modListContainerRef.current?.scrollBy({ top: 320, behavior: 'smooth' })
      } else if (e.key === 'PageUp') {
        modListContainerRef.current?.scrollBy({ top: -320, behavior: 'smooth' })
      } else if (e.key === 'ArrowLeft') {
        const prevIdx = selectedCharIndex > 0 ? selectedCharIndex - 1 : displayCharacters.length - 1
        if (displayCharacters[prevIdx]) {
          setSelectedCharName(displayCharacters[prevIdx])
        }
        setFocusedModIndex(0)
      } else if (e.key === 'ArrowRight') {
        const nextIdx = selectedCharIndex < displayCharacters.length - 1 ? selectedCharIndex + 1 : 0
        if (displayCharacters[nextIdx]) {
          setSelectedCharName(displayCharacters[nextIdx])
        }
        setFocusedModIndex(0)
      } else if (e.key === 'Enter') {
        if (currentMods[focusedModIndex]) {
          handleToggleMod(currentMods[focusedModIndex])
        }
      } else if (e.key === 'F10') {
        e.preventDefault()
        if (Date.now() - lastSelfDispatchTime.current < 800) {
          // 忽略刚发出的 F10 模拟按键在当前窗口触发的自激回声
          return
        }
        handleReloadF10()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentMods, focusedModIndex, displayCharacters, selectedCharIndex, activeDetailMod, isCharDrawerOpen, isSettingsOpen])

  // 手柄 Gamepad API 轮询
  useEffect(() => {
    let animId: number
    const onConnect = () => setGamepadConnected(true)
    const onDisconnect = () => setGamepadConnected(false)

    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
      const gp = gamepads[0]

      if (gp) {
        setGamepadConnected(true)
        const now = Date.now()

        if (now - lastGamepadInputTime.current > 180) {
          const dpadUp = gp.buttons[12]?.pressed
          const dpadDown = gp.buttons[13]?.pressed
          const dpadLeft = gp.buttons[14]?.pressed || gp.buttons[4]?.pressed // LB
          const dpadRight = gp.buttons[15]?.pressed || gp.buttons[5]?.pressed // RB
          const btnA = gp.buttons[0]?.pressed
          const btnB = gp.buttons[1]?.pressed
          const btnY = gp.buttons[3]?.pressed
          const btnStart = gp.buttons[9]?.pressed

          if (dpadUp) {
            setFocusedModIndex((prev) => Math.max(0, prev - 1))
            lastGamepadInputTime.current = now
          } else if (dpadDown) {
            setFocusedModIndex((prev) => Math.min(currentMods.length - 1, prev + 1))
            lastGamepadInputTime.current = now
          } else if (dpadLeft) {
            const prevIdx = selectedCharIndex > 0 ? selectedCharIndex - 1 : displayCharacters.length - 1
            if (displayCharacters[prevIdx]) {
              setSelectedCharName(displayCharacters[prevIdx])
            }
            setFocusedModIndex(0)
            lastGamepadInputTime.current = now
          } else if (dpadRight) {
            const nextIdx = selectedCharIndex < displayCharacters.length - 1 ? selectedCharIndex + 1 : 0
            if (displayCharacters[nextIdx]) {
              setSelectedCharName(displayCharacters[nextIdx])
            }
            setFocusedModIndex(0)
            lastGamepadInputTime.current = now
          } else if (btnA) {
            if (currentMods[focusedModIndex]) {
              handleToggleMod(currentMods[focusedModIndex])
              lastGamepadInputTime.current = now + 100
            }
          } else if (btnB || btnStart) {
            if (activeDetailMod) {
              setActiveDetailMod(null)
            } else if (isCharDrawerOpen) {
              setIsCharDrawerOpen(false)
            } else if (isSettingsOpen) {
              setIsSettingsOpen(false)
            } else {
              window.lz.hideOverlay()
            }
            lastGamepadInputTime.current = now + 300
          } else if (btnY) {
            handleReloadF10()
            lastGamepadInputTime.current = now + 300
          }
        }
      }

      animId = requestAnimationFrame(pollGamepad)
    }

    animId = requestAnimationFrame(pollGamepad)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('gamepadconnected', onConnect)
      window.removeEventListener('gamepaddisconnected', onDisconnect)
    }
  }, [currentMods, focusedModIndex, displayCharacters, selectedCharIndex, activeDetailMod, isCharDrawerOpen, isSettingsOpen])

  return (
    <div
      className="w-full h-full p-2 flex flex-col select-none antialiased overflow-hidden font-sans text-text relative bg-transparent box-border"
    >
      {/* 悬浮窗面板卡片主体 (CDS Popover Shell) */}
      <div
        className="w-full h-full min-h-0 flex flex-col rounded-2xl border border-border/80 dark:border-white/10 shadow-popover overflow-hidden relative box-border"
        style={{
          backgroundColor: `color-mix(in srgb, var(--surface) ${Math.round(opacity * 100)}%, transparent)`,
          backdropFilter: `blur(${Math.max(8, Math.round(opacity * 28))}px)`,
          WebkitBackdropFilter: `blur(${Math.max(8, Math.round(opacity * 28))}px)`
        }}
      >
        {/* Toast 提示浮条 */}
        {toastMsg && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-primary text-primary-fg text-xs font-semibold shadow-cds-md animate-in fade-in zoom-in-95 duration-fast pointer-events-none whitespace-nowrap">
            {toastMsg}
          </div>
        )}

        {/* 1. 顶栏：CDS 风格紧凑控制 (Logo + 游戏名 | 缩放 ⚙️ 📌 🌗 🔄 ✕) */}
        <div
          className="h-12 px-3.5 border-b border-border/60 flex items-center justify-between shrink-0 backdrop-blur-md drag-region"
          style={{
            backgroundColor: `color-mix(in srgb, var(--surface) ${Math.round(opacity * 70)}%, transparent)`
          }}
        >
          <div className="flex items-center space-x-2.5 no-drag min-w-0">
            <div className="rounded-lg shadow-2xs overflow-hidden shrink-0 border border-border/40">
              <Logo size={20} />
            </div>
            <div className="flex items-center min-w-0">
              <span className="font-title font-bold text-xs tracking-tight text-text truncate max-w-[160px]" title={activeGame?.name || 'Mod 切换'}>
                {activeGame?.name || 'Mod 切换'}
              </span>
            </div>
          </div>

          {/* 右侧操作按钮组 */}
          <div className="flex items-center space-x-1.5 no-drag">
            {/* 窗口大小缩放 */}
            <div className="flex items-center bg-surface-2/80 rounded-full border border-border/80 px-1 py-0.5 text-[10px] shadow-2xs">
              <button
                type="button"
                onClick={() => handleScaleChange(-0.1)}
                className="w-5 h-5 flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-surface font-mono font-bold cursor-pointer transition-colors"
                title="缩小窗口大小 (A-)"
              >
                -
              </button>
              <button
                type="button"
                onClick={handleResetScale}
                className="px-1 text-primary hover:underline font-mono font-bold cursor-pointer transition-colors tabular-nums-strict"
                title="重置窗口大小 (100%)"
              >
                {Math.round(windowScale * 100)}%
              </button>
              <button
                type="button"
                onClick={() => handleScaleChange(0.1)}
                className="w-5 h-5 flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-surface font-mono font-bold cursor-pointer transition-colors"
                title="放大窗口大小 (A+)"
              >
                +
              </button>
            </div>

            {/* ⚙️ 设置面板按钮 */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`w-7 h-7 aspect-square rounded-lg flex items-center justify-center border transition-all duration-100 cursor-pointer shadow-2xs active:scale-95 ${
                isSettingsOpen
                  ? 'bg-primary text-primary-fg border-primary shadow-cds-sm'
                  : 'bg-surface-2/80 text-text-muted hover:text-text hover:bg-surface border-border/80'
              }`}
              title="悬浮窗设置"
            >
              <Settings className="w-3.5 h-3.5 align-neg-125" />
            </button>

            {/* 📌 锁定置顶按钮 */}
            <button
              type="button"
              onClick={handleTogglePinned}
              className={`w-7 h-7 aspect-square rounded-lg flex items-center justify-center border transition-all duration-100 cursor-pointer shadow-2xs active:scale-95 ${
                isPinned
                  ? 'bg-primary/15 text-primary border-primary/40 shadow-2xs font-bold'
                  : 'bg-surface-2/80 text-text-muted hover:text-text hover:bg-surface border-border/80'
              }`}
              title={isPinned ? '取消置顶' : '置顶窗口'}
            >
              <Pin className="w-3.5 h-3.5 align-neg-125" />
            </button>

            {/* 🌗 亮暗主题切换 */}
            <button
              type="button"
              onClick={toggleTheme}
              className="w-7 h-7 aspect-square rounded-lg bg-surface-2/80 hover:bg-surface border border-border/80 text-text-muted hover:text-primary transition-all duration-100 cursor-pointer shadow-2xs active:scale-95 flex items-center justify-center"
              title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400 align-neg-125" /> : <Moon className="w-3.5 h-3.5 text-primary align-neg-125" />}
            </button>

            {/* 🔄 F10 热刷新 */}
            <button
              type="button"
              onClick={handleReloadF10}
              disabled={reloading}
              className="w-7 h-7 aspect-square rounded-lg bg-surface-2/80 hover:bg-surface border border-border/80 text-text-muted hover:text-primary transition-all duration-100 cursor-pointer shadow-2xs active:scale-95 flex items-center justify-center disabled:opacity-40"
              title="向游戏发送热刷新信号 (F10)"
            >
              <RotateCw className={`w-3.5 h-3.5 align-neg-125 ${reloading ? 'animate-spin' : ''}`} />
            </button>

            {/* ✕ 关闭 */}
            <button
              type="button"
              onClick={() => window.lz.hideOverlay()}
              className="w-7 h-7 aspect-square rounded-lg bg-surface-2/80 hover:bg-danger hover:border-danger text-text-muted hover:text-white transition-all duration-100 cursor-pointer shadow-2xs active:scale-95 flex items-center justify-center"
              title="隐藏悬浮窗 (Esc)"
            >
              <X className="w-3.5 h-3.5 align-neg-125" />
            </button>
          </div>
        </div>

        {/* 2. 角色胶囊滚动条 (CDS 跑道胶囊滑块) */}
        <div
          onWheel={handleCharStripWheel}
          className="px-2.5 py-1.5 border-b border-border/50 flex items-center space-x-1 shrink-0 select-none"
          style={{
            backgroundColor: `color-mix(in srgb, var(--surface) ${Math.round(opacity * 50)}%, transparent)`
          }}
        >
          {/* ☰ 角色全量浏览气泡按钮 */}
          <button
            type="button"
            onClick={() => setIsCharDrawerOpen(!isCharDrawerOpen)}
            className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all duration-100 shrink-0 cursor-pointer shadow-2xs mr-0.5 active:scale-95 ${
              isCharDrawerOpen
                ? 'bg-primary text-primary-fg border-primary shadow-cds-sm'
                : 'bg-surface-2/80 text-text-muted hover:text-text hover:bg-surface border-border/80'
            }`}
            title="全部角色头像菜单"
          >
            <Menu className="w-3.5 h-3.5 align-neg-125" />
          </button>

          {/* ◀ 左滚动微调按钮 */}
          <button
            type="button"
            onClick={() => charStripRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
            className="w-5 h-7 rounded-md hover:bg-surface-2/80 text-text-muted hover:text-primary flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            title="向左滚动角色列表"
          >
            <ChevronLeft className="w-3.5 h-3.5 align-neg-125" />
          </button>

          {/* 角色横向滚动胶囊容器 */}
          <div
            ref={charStripRef}
            onWheel={handleCharStripWheel}
            onMouseDown={handleCharStripMouseDown}
            onMouseMove={handleCharStripMouseMove}
            onMouseUp={handleCharStripMouseUp}
            onMouseLeave={handleCharStripMouseLeave}
            className={`flex items-center space-x-1.5 flex-1 overflow-x-auto scrollbar-none relative py-0.5 ${
              isDraggingStrip ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            {displayCharacters.map((charName, idx) => {
              const isSelected = idx === selectedCharIndex
              const mods = modsData[charName] || []
              const enabledCount = mods.filter((m) => m.enabled).length

              return (
                <button
                  key={charName}
                  ref={isSelected ? selectedCharBtnRef : undefined}
                  type="button"
                  onClick={() => {
                    if (dragDistance.current > 6) return
                    setSelectedCharName(charName)
                    setFocusedModIndex(0)
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 flex items-center space-x-1.5 transition-all duration-150 border cursor-pointer select-none ${
                    isSelected
                      ? 'bg-primary text-primary-fg border-primary shadow-cds-sm font-semibold'
                      : 'bg-surface-2/70 text-text-muted hover:text-text hover:bg-surface border-border/60 shadow-2xs'
                  }`}
                >
                  <span className="font-title tracking-wide truncate max-w-[80px] pointer-events-none">{charName}</span>
                  <span
                    className={`text-[10px] font-mono tabular-nums-strict px-1.5 py-0.2 rounded-full font-bold pointer-events-none ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : enabledCount > 0
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-surface/80 text-text-muted'
                    }`}
                  >
                    {enabledCount}/{mods.length}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ▶ 右滚动微调按钮 */}
          <button
            type="button"
            onClick={() => charStripRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
            className="w-5 h-7 rounded-md hover:bg-surface-2/80 text-text-muted hover:text-primary flex items-center justify-center shrink-0 cursor-pointer transition-colors mr-0.5"
            title="向右滚动角色列表"
          >
            <ChevronRight className="w-3.5 h-3.5 align-neg-125" />
          </button>

          {/* ♥ 收藏过滤按钮 */}
          <button
            type="button"
            onClick={() => {
              setFilterFavoritesOnly(!filterFavoritesOnly)
              showToast(filterFavoritesOnly ? '已显示全部 Mod' : '仅查看已标记 Mod')
            }}
            className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 transition-all duration-100 cursor-pointer shadow-2xs active:scale-95 ${
              filterFavoritesOnly
                ? 'bg-amber-500 text-white border-amber-500 shadow-cds-sm'
                : 'bg-surface-2/80 text-text-muted hover:text-amber-500 border-border/80 hover:bg-surface'
            }`}
            title="只显示已标记 Mod"
          >
            <Heart className={`w-3.5 h-3.5 align-neg-125 ${filterFavoritesOnly ? 'fill-current' : ''}`} />
          </button>

          {/* 🎯 只显示有 Mod 角色过滤 */}
          <button
            type="button"
            onClick={() => {
              setFilterOnlyWithMods(!filterOnlyWithMods)
              showToast(filterOnlyWithMods ? '显示所有角色' : '仅显示有 Mod 角色')
            }}
            className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 transition-all duration-100 cursor-pointer shadow-2xs active:scale-95 ${
              filterOnlyWithMods
                ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                : 'bg-surface-2/80 text-text-muted hover:text-primary border-border/80 hover:bg-surface'
            }`}
            title="只显示有 Mod 的角色"
          >
            <Filter className="w-3.5 h-3.5 align-neg-125" />
          </button>
        </div>

        {/* 3. 过滤与实用工具条 (SegmentedControl + 排序 + 互斥 + 视图) */}
        <div className="px-3 py-1.5 border-b border-border/50 bg-surface-2/40 flex items-center justify-between gap-2 text-xs shrink-0 select-none overflow-x-auto scrollbar-none">
          {/* 状态过滤胶囊滑块 + 排序 */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <SegmentedControl
              size="sm"
              className="shrink-0"
              items={[
                { id: 'all', label: '全部' },
                { id: 'enabled', label: '已装配' },
                { id: 'disabled', label: '待命' }
              ]}
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as any)}
            />

            {/* 排序维度循环切换 */}
            <button
              type="button"
              onClick={cycleSortMode}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-surface-2/80 hover:bg-surface text-[11px] font-medium text-text-muted hover:text-text border border-border/70 cursor-pointer transition shadow-2xs ml-0.5 shrink-0"
              title={`当前排序: ${
                modSortMode === 'default' ? '默认 (装配优先)' : modSortMode === 'time' ? '最新修改优先' : '名称拼音排序'
              } (点击循环切换)`}
            >
              <ArrowUpDown className="w-3 h-3 text-primary align-neg-125" />
              <span>{modSortMode === 'default' ? '默认' : modSortMode === 'time' ? '最新' : '名称'}</span>
            </button>

            {/* 独立升降序翻转 */}
            <button
              type="button"
              onClick={toggleReverseOrder}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] cursor-pointer transition shadow-2xs border shrink-0 ${
                isReverseOrder
                  ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                  : 'bg-surface-2/80 text-text-muted hover:text-text border-border/70 hover:bg-surface'
              }`}
              title={isReverseOrder ? '当前: 倒序 (点击切为正序)' : '当前: 正序 (点击切为倒序)'}
            >
              {isReverseOrder ? <ChevronUp className="w-3 h-3 align-neg-125" /> : <ChevronDown className="w-3 h-3 align-neg-125" />}
            </button>
          </div>

          {/* 快捷工具 (定位 | 单选互斥 | 画廊/列表切换 | 翻页) */}
          <div className="flex items-center space-x-1.5 shrink-0">
            {/* 🎯 定位 */}
            <button
              type="button"
              onClick={handleLocateEnabled}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-surface-2/80 hover:bg-surface border border-border/70 text-[11px] font-medium text-text-muted hover:text-primary transition shadow-2xs cursor-pointer active:scale-95 shrink-0"
              title="定位当前生效 Mod"
            >
              <Crosshair className="w-3 h-3 text-primary align-neg-125" />
              <span>定位</span>
            </button>

            {/* 🔘 单选互斥 */}
            <button
              type="button"
              onClick={() => {
                setExclusiveMode(!exclusiveMode)
                showToast(exclusiveMode ? '已切换为：多选并存模式' : '已切换为：单选互斥保护模式')
              }}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition shadow-2xs cursor-pointer active:scale-95 shrink-0 ${
                exclusiveMode
                  ? 'bg-primary/10 text-primary border-primary/40 font-bold'
                  : 'bg-surface-2/80 text-text-muted border-border/70 hover:text-text hover:bg-surface'
              }`}
              title="点击切换单选互斥模式"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${exclusiveMode ? 'bg-primary' : 'bg-text-muted/60'}`} />
              <span>单选互斥</span>
            </button>

            {/* ⊞ 画廊 / ☰ 列表视图切换 */}
            <SegmentedControl
              size="sm"
              className="shrink-0"
              items={[
                { id: 'grid', label: <LayoutGrid className="w-3.5 h-3.5 align-neg-125" /> },
                { id: 'list', label: <List className="w-3.5 h-3.5 align-neg-125" /> }
              ]}
              value={viewMode}
              onChange={(v) => setViewMode(v as any)}
            />

            {/* 🔼 / 🔽 上下翻页快捷按钮 */}
            <div className="flex items-center space-x-0.5 border-l border-border/50 pl-1 shrink-0">
              <button
                type="button"
                onClick={() => modListContainerRef.current?.scrollBy({ top: -300, behavior: 'smooth' })}
                className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-primary hover:bg-surface-2 transition-colors cursor-pointer"
                title="向上翻页 (PageUp)"
              >
                <ChevronUp className="w-3.5 h-3.5 align-neg-125" />
              </button>
              <button
                type="button"
                onClick={() => modListContainerRef.current?.scrollBy({ top: 300, behavior: 'smooth' })}
                className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-primary hover:bg-surface-2 transition-colors cursor-pointer"
                title="向下翻页 (PageDown)"
              >
                <ChevronDown className="w-3.5 h-3.5 align-neg-125" />
              </button>
            </div>
          </div>
        </div>

        {/* 4. 主内容流：自适应画廊网格 / 单列列表 (接入 CDS ScrollContainer 7阶非线性渐隐) */}
        <ScrollContainer
          containerRef={modListContainerRef}
          className="flex-1 min-h-0 p-2.5 overscroll-contain"
        >
          {currentMods.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-2">
              <Layers className="w-10 h-10 stroke-[1.2] opacity-40" />
              <p className="text-xs">【{currentChar || '无'}】暂无符合条件的 Mod</p>
            </div>
          ) : viewMode === 'grid' ? (
            /* 严格一排显示 3 个 (grid-cols-3) 4:3 封面 + 右下角悬浮笔标 + 底栏 Mod 名与 Switch */
            <div className="grid grid-cols-3 gap-2.5">
              {currentMods.map((mod, idx) => {
                const isFocused = idx === focusedModIndex
                const isMarked = !!markedMods[mod.fullPath]

                return (
                  <div
                    id={`mod-card-${idx}`}
                    key={mod.id || mod.name}
                    onClick={() => handleOpenDetail(mod)}
                    className={`group relative rounded-xl border flex flex-col justify-between overflow-hidden transition-all duration-150 cursor-pointer ${
                      mod.enabled
                        ? 'bg-surface border-primary ring-2 ring-primary/30 shadow-cds-sm'
                        : 'bg-surface/80 border-border/80 hover:border-primary/50 hover:-translate-y-0.5 shadow-2xs'
                    } ${isFocused ? 'scale-[1.01]' : ''}`}
                  >
                    {/* 4:3 封面大图 */}
                    <div className="relative aspect-[4/3] bg-surface-2/60 overflow-hidden flex items-center justify-center">
                      {mod.coverPath ? (
                        <img
                          src={`file://${mod.coverPath}`}
                          alt=""
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <ImageIcon className="w-7 h-7 text-text-muted opacity-35" />
                      )}

                      {/* 标记徽标 (左上角) */}
                      {isMarked && (
                        <div className="absolute top-1.5 left-1.5 p-1 rounded-full bg-amber-500 text-white shadow-xs">
                          <Bookmark className="w-2.5 h-2.5 fill-current" />
                        </div>
                      )}

                      {/* INI 标识 (右上角) */}
                      {mod.hasIni && (
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.2 rounded-md text-[9px] font-mono font-bold bg-black/60 text-white backdrop-blur-xs">
                          INI
                        </span>
                      )}

                      {/* 右下角圆形悬浮笔标 */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenDetail(mod)
                        }}
                        className="absolute right-1.5 bottom-1.5 w-6 h-6 rounded-full bg-surface/90 hover:bg-primary text-text-muted hover:text-white border border-border/60 flex items-center justify-center shadow-md transition-all cursor-pointer opacity-80 group-hover:opacity-100 hover:scale-105"
                        title="查看 Mod 详情与快捷键"
                      >
                        <Edit3 className="w-3 h-3 align-neg-125" />
                      </button>
                    </div>

                    {/* 卡片底栏 (Mod 名字 + Switch) */}
                    <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-surface/95 border-t border-border/50">
                      <h4
                        className={`text-xs font-semibold truncate flex-1 leading-snug transition-colors ${
                          mod.enabled ? 'text-primary font-bold' : 'text-text'
                        }`}
                        title={mod.name}
                      >
                        {mod.name}
                      </h4>

                      {/* Switch */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleMod(mod)
                        }}
                        className={`qaq-switch scale-90 origin-right ${mod.enabled ? 'active' : ''}`}
                        title={mod.enabled ? '点击禁用' : '点击装配'}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* 单列紧凑列表视图 */
            <div className="space-y-2">
              {currentMods.map((mod, idx) => {
                const isFocused = idx === focusedModIndex
                const isMarked = !!markedMods[mod.fullPath]

                return (
                  <div
                    id={`mod-card-${idx}`}
                    key={mod.id || mod.name}
                    onClick={() => handleOpenDetail(mod)}
                    className={`rounded-xl border p-2.5 flex items-center justify-between space-x-2.5 transition-all duration-150 cursor-pointer ${
                      mod.enabled
                        ? 'bg-surface border-primary ring-2 ring-primary/25 shadow-cds-sm'
                        : 'bg-surface/80 border-border/80 hover:border-primary/40 hover:bg-surface'
                    } ${isFocused ? 'ring-2 ring-primary scale-[1.01]' : ''}`}
                  >
                    <div className="w-11 h-11 rounded-lg bg-surface-2/60 overflow-hidden shrink-0 flex items-center justify-center border border-border/60">
                      {mod.coverPath ? (
                        <img
                          src={`file://${mod.coverPath}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-text-muted opacity-40" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-1.5">
                        {isMarked && <Bookmark className="w-3 h-3 text-amber-500 fill-current shrink-0 align-neg-125" />}
                        <h4 className={`text-xs font-semibold truncate ${mod.enabled ? 'text-primary font-bold' : 'text-text'}`}>
                          {mod.name}
                        </h4>
                      </div>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          mod.enabled ? 'bg-primary/10 text-primary' : 'bg-surface-2 text-text-muted'
                        }`}>
                          {mod.enabled ? '已激活' : '待命'}
                        </span>
                        {mod.hasIni && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-surface border border-border/70 text-primary font-mono font-semibold">
                            INI
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleMod(mod)
                      }}
                      className={`qaq-switch ${mod.enabled ? 'active' : ''}`}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </ScrollContainer>

        {/* 5. 底部栏 (预设方案胶囊行 + 快捷提示 + 计数) */}
        <div
          className="border-t border-border/60 backdrop-blur-md p-2.5 space-y-1.5 shrink-0"
          style={{
            backgroundColor: `color-mix(in srgb, var(--surface) ${Math.round(opacity * 75)}%, transparent)`
          }}
        >
          {/* 预设方案胶囊行 */}
          {presets.length > 0 && (
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <span className="text-[11px] font-bold text-text-muted shrink-0 flex items-center space-x-1 mr-1">
                <Bookmark className="w-3 h-3 text-primary align-neg-125" />
                <span>预设:</span>
              </span>
              {presets.map((p) => {
                // 选中态按磁盘实时比对：应用后手动改动任一 Mod 会立即取消高亮；
                // 首屏 modsData 还没到时无法比对，退回方案激活标记，避免全部胶囊误显示为未选中
                const isActive =
                  Object.keys(modsData).length > 0
                    ? planPresetApply(p, modsData, 'replace').match
                    : activePresetId === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleApplyPreset(p.id)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium shrink-0 border transition-all cursor-pointer shadow-2xs ${
                      isActive
                        ? 'bg-primary text-primary-fg border-primary shadow-cds-sm font-bold'
                        : 'bg-surface hover:bg-surface-2 text-text-muted hover:text-text border-border/70'
                    }`}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* 底部操作提示与角色序号 */}
          <div className="flex items-center justify-between text-[11px] text-text-muted pt-0.5">
            <div className="flex items-center space-x-2 truncate">
              <Gamepad2 className={`w-3.5 h-3.5 align-neg-125 ${gamepadConnected ? 'text-emerald-500' : 'text-text-muted'}`} />
              <span className="truncate">
                {gamepadConnected
                  ? '[A]开关 [LB/RB]切角色 [Y]刷新'
                  : '←/→ 切换角色 | Esc 隐藏'}
              </span>
            </div>

            <div className="flex items-center space-x-2 font-mono font-bold shrink-0 tabular-nums-strict">
              <span>
                {selectedCharIndex + 1} / {displayCharacters.length || 1}
              </span>
            </div>
          </div>
        </div>

        {/* ================= 侧滑抽屉 1: Mod 详情面板 (CDS 质感抽屉) ================= */}
        {activeDetailMod && (
          <div className="absolute inset-0 z-40 bg-surface/98 backdrop-blur-2xl flex flex-col animate-in fade-in slide-in-from-left duration-fast overflow-hidden">
            {/* Header: Mod 名字 + 缩小 / 放大 / 关闭 */}
            <div className="h-12 px-3.5 border-b border-border/60 flex items-center justify-between shrink-0 bg-surface/80 backdrop-blur-md">
              <div className="flex items-center space-x-2 flex-1 min-w-0 mr-2">
                <span className="font-title text-sm font-bold text-text truncate">
                  {activeDetailMod.name}
                </span>
              </div>

              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleScaleChange(-0.1)}
                  className="w-7 h-7 rounded-lg border border-border/80 bg-surface-2/80 hover:bg-surface text-text-muted hover:text-text flex items-center justify-center cursor-pointer shadow-2xs active:scale-95 transition"
                  title="缩小"
                >
                  <Minus className="w-3.5 h-3.5 align-neg-125" />
                </button>
                <button
                  type="button"
                  onClick={() => handleScaleChange(0.1)}
                  className="w-7 h-7 rounded-lg border border-border/80 bg-surface-2/80 hover:bg-surface text-text-muted hover:text-text flex items-center justify-center cursor-pointer shadow-2xs active:scale-95 transition"
                  title="放大"
                >
                  <Plus className="w-3.5 h-3.5 align-neg-125" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailMod(null)}
                  className="w-7 h-7 rounded-lg border border-border/80 bg-surface-2/80 hover:bg-danger text-text-muted hover:text-white flex items-center justify-center cursor-pointer shadow-2xs active:scale-95 transition"
                  title="关闭"
                >
                  <X className="w-3.5 h-3.5 align-neg-125" />
                </button>
              </div>
            </div>

            {/* Body: 预览大图 + 状态 + 标记此 Mod + 快捷键表格 + 部件调节 + 底部大按钮 */}
            <ScrollContainer className="flex-1 min-h-0 p-3.5 space-y-3.5 overflow-y-auto">
              {/* 预览大图 */}
              <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-surface-2/60 border border-border/70 flex items-center justify-center shadow-2xs">
                {activeDetailMod.coverPath ? (
                  <img
                    src={`file://${activeDetailMod.coverPath}`}
                    alt=""
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <ImageIcon className="w-8 h-8 text-text-muted opacity-40" />
                )}
              </div>

              {/* 状态与角色 */}
              <div className="text-xs text-text-muted flex items-center justify-between px-1">
                <span className="flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${activeDetailMod.enabled ? 'bg-primary' : 'bg-text-muted/40'}`} />
                  <span className="font-medium text-text">{activeDetailMod.enabled ? '已装备运行' : '待命中 (已停用)'}</span>
                </span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-surface-2 border border-border/60">
                  {currentChar}
                </span>
              </div>

              {/* 标记按钮 + 移动到其他角色 */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleMark(activeDetailMod.fullPath)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center space-x-1.5 shadow-2xs active:scale-95 ${
                    markedMods[activeDetailMod.fullPath]
                      ? 'bg-amber-500 text-white border-amber-500 shadow-cds-sm font-bold'
                      : 'bg-surface-2/70 hover:bg-surface text-text-muted hover:text-text border-border/80'
                  }`}
                >
                  <Bookmark className={`w-3.5 h-3.5 align-neg-125 ${markedMods[activeDetailMod.fullPath] ? 'fill-current' : ''}`} />
                  <span>{markedMods[activeDetailMod.fullPath] ? '取消标记' : '标记此 Mod'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowMoveModal(true)}
                  className="py-2 rounded-xl text-xs font-semibold border border-border/80 bg-surface-2/70 hover:bg-surface text-text-muted hover:text-text transition-all cursor-pointer flex items-center justify-center space-x-1.5 shadow-2xs active:scale-95"
                  title="将该模组移动到其他角色分类"
                >
                  <FolderInput className="w-3.5 h-3.5 text-primary align-neg-125" />
                  <span>移动分类</span>
                </button>
              </div>

              {/* ⌨️ 快捷键分区 */}
              <div className="space-y-2 pt-1">
                <div className="text-xs font-bold text-text flex items-center space-x-1.5">
                  <Sliders className="w-3.5 h-3.5 text-primary align-neg-125" />
                  <span>快捷键与设定值</span>
                </div>

                {loadingHotkeys ? (
                  <div className="p-3.5 rounded-xl bg-surface-2/60 border border-border/60 text-xs text-text-muted text-center">
                    快捷键加载中...
                  </div>
                ) : parsedHotkeys.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-surface-2/60 border border-border/60 text-xs text-text-muted text-center">
                    无专属按键 (可通过游戏原生快捷键控制)
                  </div>
                ) : (
                  <div className="space-y-2">
                    {parsedHotkeys.map((h, idx) => {
                      const isGamepad = h.keys.some((k) => k.includes('🎮'))
                      const isMouse = h.keys.some((k) => k.includes('鼠标') || k.includes('键'))
                      return (
                        <div
                          key={idx}
                          onClick={() => handleTriggerHotkey(h)}
                          className="p-2.5 rounded-xl bg-surface-2/50 hover:bg-surface hover:border-primary/40 border border-border/70 text-xs transition-all cursor-pointer active:scale-[0.99] select-none group shadow-2xs"
                          title={
                            isGamepad
                              ? `${h.name} (手柄按键，请使用手柄触发)`
                              : isMouse
                              ? `${h.name} (鼠标按键，请在游戏中使用鼠标操作)`
                              : `点击向游戏发送 [${h.keys.join(' + ')}]`
                          }
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 mr-2 flex flex-col">
                              <div className="flex items-center space-x-1.5 truncate">
                                <span className="font-semibold text-xs text-text group-hover:text-primary transition-colors truncate">
                                  {h.chineseName || h.name}
                                </span>
                                {h.chineseName && h.chineseName !== h.name && (
                                  <span className="text-[9px] font-mono text-text-muted bg-surface/80 px-1 py-0.2 rounded border border-border/40 shrink-0">
                                    {h.name}
                                  </span>
                                )}
                              </div>
                              {(h.chineseDescription || (h.description && h.description !== h.name)) && (
                                <span className="text-[10px] text-text-muted truncate max-w-[200px] mt-0.5">
                                  {h.chineseDescription || h.description}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-1 shrink-0">
                              {h.keys.map((k, kIdx) => (
                                <kbd key={kIdx} className="detail-kbd group-hover:border-primary/40 transition-colors">
                                  {k}
                                </kbd>
                              ))}
                            </div>
                          </div>

                          {/* 作者设置的直接数值选项行 (可直接点击选定值) */}
                          {h.allowedValues && h.allowedValues.length > 0 && (
                            <div
                              className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-[10px] text-text-muted shrink-0 mr-1.5 flex items-center space-x-1">
                                <SlidersHorizontal className="w-3 h-3 text-primary align-neg-125" />
                                <span>设定值:</span>
                              </span>

                              <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none py-0.5">
                                {h.allowedValues.map((val) => {
                                  const isSelected = (h.currentValue ?? h.allowedValues?.[0]) === val
                                  const label =
                                    h.valueLabels?.[val] ||
                                    (h.allowedValues!.length === 2 && val === '0'
                                      ? '关'
                                      : h.allowedValues!.length === 2 && val === '1'
                                      ? '开'
                                      : val)

                                  return (
                                    <button
                                      key={val}
                                      type="button"
                                      onClick={() => handleSelectHotkeyVal(h, val)}
                                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 border transition-all cursor-pointer shadow-2xs ${
                                        isSelected
                                          ? 'bg-primary text-primary-fg border-primary shadow-cds-sm font-extrabold'
                                          : 'bg-surface hover:bg-surface-2 text-text-muted hover:text-text border-border/70'
                                      }`}
                                      title={`直接设定为: ${val}`}
                                    >
                                      {label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 🎛️ Persist Bridge 服装/部件调控 (如果有) */}
              {activeModDetails?.persistInfo?.hasPersist && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-text">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-primary align-neg-125" />
                    <span>服装与部件参数调节</span>
                  </div>

                  <div className="space-y-2">
                    {activeModDetails.persistInfo.variables.map((v) => {
                      const allowed = v.allowedValues && v.allowedValues.length > 0 ? v.allowedValues : ['0', '1']
                      const isBinary = allowed.length === 2 && allowed.includes('0') && allowed.includes('1')
                      const isOn = v.currentValue === '1'

                      return (
                        <div
                          key={v.name}
                          className="p-2.5 rounded-xl bg-surface-2/50 border border-border/70 flex items-center justify-between text-xs shadow-2xs"
                        >
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-xs text-text">
                                {v.alias || v.name}
                              </span>
                              {v.alias && v.alias !== v.name && (
                                <span className="font-mono text-[9px] text-text-muted bg-surface/70 px-1 rounded border border-border/40">
                                  ${v.name}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-text-muted mt-0.5 block">当前值: {v.currentValue}</span>
                          </div>

                          {isBinary ? (
                            <button
                              type="button"
                              onClick={() => handleUpdatePersistVar(v, isOn ? '0' : '1')}
                              className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer border transition-all ${
                                isOn
                                  ? 'bg-primary text-primary-fg border-primary font-bold shadow-cds-sm'
                                  : 'bg-surface text-text-muted border-border hover:bg-surface-2'
                              }`}
                            >
                              {isOn ? '开启' : '关闭'}
                            </button>
                          ) : (
                            <div className="flex items-center space-x-1">
                              {allowed.map((val) => {
                                const isCur = v.currentValue === val
                                const label = v.valueLabels?.[val] || val
                                return (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() => handleUpdatePersistVar(v, val)}
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer border transition-all ${
                                      isCur
                                        ? 'bg-primary text-primary-fg border-primary shadow-2xs font-extrabold'
                                        : 'bg-surface text-text hover:text-primary border-border hover:bg-surface-2'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 底部大按钮 */}
              <button
                type="button"
                onClick={() => handleToggleMod(activeDetailMod)}
                className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-cds-sm flex items-center justify-center space-x-2 active:scale-[0.98] ${
                  activeDetailMod.enabled
                    ? 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30'
                    : 'bg-primary hover:brightness-105 text-primary-fg'
                }`}
              >
                {activeDetailMod.enabled ? (
                  <>
                    <XCircle className="w-4 h-4 align-neg-125" />
                    <span>停用此 Mod</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 align-neg-125" />
                    <span>装配启用此 Mod</span>
                  </>
                )}
              </button>
            </ScrollContainer>
          </div>
        )}

        {/* ================= 侧滑抽屉 2: 全部角色网格浏览 (对应 ☰) ================= */}
        {isCharDrawerOpen && (
          <div className="absolute inset-0 z-40 bg-surface/98 backdrop-blur-2xl flex flex-col animate-in fade-in slide-in-from-left duration-fast overflow-hidden">
            <div className="h-12 px-3.5 border-b border-border/60 flex items-center justify-between shrink-0 bg-surface/80 backdrop-blur-md">
              <div className="flex items-center space-x-2">
                <Menu className="w-3.5 h-3.5 text-primary align-neg-125" />
                <h3 className="text-xs font-bold text-text">角色全览 ({sortedCharacters.length})</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCharDrawerOpen(false)}
                className="w-7 h-7 rounded-lg border border-border/80 bg-surface-2/80 hover:bg-surface text-text-muted hover:text-text flex items-center justify-center cursor-pointer shadow-2xs active:scale-95 transition"
                title="关闭"
              >
                <X className="w-3.5 h-3.5 align-neg-125" />
              </button>
            </div>

            {/* 搜索框 */}
            <div className="p-3 border-b border-border/50 bg-surface-2/30">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="搜索角色名..."
                  value={charSearchQuery}
                  onChange={(e) => setCharSearchQuery(e.target.value)}
                  className="w-full bg-surface-2/80 border border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-text focus:outline-none transition shadow-2xs"
                />
              </div>
            </div>

            {/* 3 列角色头像气泡网格 */}
            <ScrollContainer className="flex-1 min-h-0 p-3 grid grid-cols-3 gap-2.5">
              {sortedCharacters
                .filter((name) => !charSearchQuery || name.toLowerCase().includes(charSearchQuery.toLowerCase()))
                .map((name) => {
                  const isSelected = currentChar === name
                  const avatar = characterAvatars[name]
                  const mods = modsData[name] || []
                  const enabledCount = mods.filter((m) => m.enabled).length

                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setSelectedCharName(name)
                        if (filterOnlyWithMods && (!modsData[name] || modsData[name].length === 0)) {
                          setFilterOnlyWithMods(false)
                        }
                        setIsCharDrawerOpen(false)
                        setFocusedModIndex(0)
                      }}
                      className={`flex flex-col items-center p-2.5 rounded-xl border transition-all duration-150 text-center cursor-pointer shadow-2xs ${
                        isSelected
                          ? 'bg-primary/10 border-primary ring-2 ring-primary/25 shadow-cds-sm font-bold'
                          : 'bg-surface hover:bg-surface-2 border-border/70 hover:border-primary/40'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden border border-border/80 mb-1.5 relative bg-surface-2/80 flex items-center justify-center shadow-2xs">
                        {avatar ? (
                          <img src={`file://${avatar}`} alt="" className="w-full h-full object-cover object-top" />
                        ) : (
                          <span className="font-bold text-xs text-text-muted">{name.slice(0, 1)}</span>
                        )}
                        {enabledCount > 0 && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-surface shadow-xs" />
                        )}
                      </div>
                      <span className="font-title text-xs font-bold text-text truncate max-w-full">
                        {name}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono mt-0.5 tabular-nums-strict">
                        {enabledCount}/{mods.length}
                      </span>
                    </button>
                  )
                })}
            </ScrollContainer>
          </div>
        )}

        {/* ================= 侧滑抽屉 3: 设置面板 (对应 ⚙️) ================= */}
        {isSettingsOpen && (
          <div className="absolute inset-0 z-40 bg-surface/98 backdrop-blur-2xl flex flex-col animate-in fade-in slide-in-from-left duration-fast overflow-hidden">
            <div className="h-12 px-3.5 border-b border-border/60 flex items-center justify-between shrink-0 bg-surface/80 backdrop-blur-md">
              <div className="flex items-center space-x-2">
                <Settings className="w-3.5 h-3.5 text-primary align-neg-125" />
                <h3 className="text-xs font-bold text-text">悬浮窗设置</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="w-7 h-7 rounded-lg border border-border/80 bg-surface-2/80 hover:bg-surface text-text-muted hover:text-text flex items-center justify-center cursor-pointer shadow-2xs active:scale-95 transition"
                title="关闭"
              >
                <X className="w-3.5 h-3.5 align-neg-125" />
              </button>
            </div>

            <ScrollContainer className="flex-1 min-h-0 p-4 space-y-3.5 text-xs">
              {/* 背景透明度调节 */}
              <div className="p-3.5 rounded-xl bg-surface-2/40 border border-border/70 space-y-2 shadow-2xs">
                <div className="font-bold text-text text-xs">背景不透明度</div>
                <div className="flex items-center space-x-3">
                  <span className="text-[11px] text-text-muted">透明</span>
                  <input
                    type="range"
                    min="15"
                    max="100"
                    value={Math.round(opacity * 100)}
                    onChange={(e) => handleOpacityChange(parseInt(e.target.value) / 100)}
                    className="flex-1 accent-primary cursor-pointer"
                  />
                  <span className="font-mono font-bold text-primary w-10 text-right tabular-nums-strict">
                    {Math.round(opacity * 100)}%
                  </span>
                </div>
              </div>

              {/* 单选互斥保护模式 */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-2/40 border border-border/70 shadow-2xs">
                <div>
                  <div className="font-bold text-text text-xs">单选互斥保护</div>
                  <div className="text-[11px] text-text-muted mt-0.5">启用同角色新 Mod 时自动停用其他 Mod</div>
                </div>
                <button
                  type="button"
                  onClick={() => setExclusiveMode(!exclusiveMode)}
                  className={`qaq-switch ${exclusiveMode ? 'active' : ''}`}
                />
              </div>

              {/* 仅在游戏界面显示 (智能跟随) */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-2/40 border border-border/70 shadow-2xs">
                <div>
                  <div className="font-bold text-text text-xs">仅在游戏界面显示</div>
                  <div className="text-[11px] text-text-muted mt-0.5">切出游戏时自动隐藏，切回游戏自动恢复</div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleOnlyShowInGame}
                  className={`qaq-switch ${onlyShowInGame ? 'active' : ''}`}
                />
              </div>

              {/* 当前关联游戏 (智能跟随或手动切换) */}
              <div className="p-3.5 rounded-xl bg-surface-2/40 border border-border/70 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-text text-xs">当前关联游戏</div>
                  <span className="text-[10px] text-text-muted">前台智能识别跟随</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(config?.games || [])
                    .filter((g: any) => !g.hidden)
                    .map((g: any) => {
                    const isCur = activeGame?.id === g.id
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={async () => {
                          await window.lz.setActiveGame(g.id)
                          await loadData(g.id)
                          showToast(`已切换至: ${g.name}`)
                        }}
                        className={`p-2.5 rounded-lg border text-left flex items-center space-x-2 transition-all cursor-pointer shadow-2xs ${
                          isCur
                            ? 'bg-primary/15 border-primary text-primary font-bold shadow-2xs ring-1 ring-primary/30'
                            : 'bg-surface hover:bg-surface-2 border-border/80 text-text-muted hover:text-text'
                        }`}
                      >
                        <span className="text-xs truncate flex-1">{g.shortName || g.name}</span>
                        {isCur && <Check className="w-3.5 h-3.5 text-primary shrink-0 align-neg-125" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 唤出热键提示 */}
              <div className="p-3.5 rounded-xl bg-surface-2/40 border border-border/70 flex items-center justify-between shadow-2xs">
                <div>
                  <div className="font-bold text-text text-xs">呼出/隐藏快捷键</div>
                  <div className="text-[10px] text-text-muted mt-0.5">系统全局监听</div>
                </div>
                <kbd className="detail-kbd text-xs px-2.5 py-1">Ctrl + F</kbd>
              </div>

              {/* Persist Bridge 缓存清空 */}
              <div className="p-3.5 rounded-xl bg-surface-2/40 border border-border/70 space-y-2 shadow-2xs">
                <div className="font-bold text-text text-xs">维护与重置</div>
                <button
                  type="button"
                  onClick={async () => {
                    await window.lz.clearPersistCache?.()
                    showToast('已清空 Persist Bridge 缓存')
                  }}
                  className="w-full py-2 rounded-lg bg-surface border border-border/80 hover:bg-surface-2 text-text font-semibold text-xs cursor-pointer shadow-2xs transition active:scale-[0.99]"
                >
                  清空 Persist Bridge 缓存
                </button>
              </div>

              {/* 品牌标识 */}
              <div className="pt-2 flex items-center justify-center gap-1.5 opacity-60">
                <Logo size={16} />
                <span className="font-title text-[10px] font-bold tracking-wider text-text-muted">
                  LZ Manager
                </span>
              </div>
            </ScrollContainer>
          </div>
        )}

        {/* 模组移动分类弹窗 */}
        {activeDetailMod && (
          <MoveModModal
            isOpen={showMoveModal}
            onClose={() => setShowMoveModal(false)}
            modName={activeDetailMod.name}
            modFullPath={activeDetailMod.fullPath}
            currentCharacter={currentChar}
            onToast={showToast}
            onSuccess={async () => {
              setActiveDetailMod(null)
              setShowMoveModal(false)
              if (activeGame?.id) {
                await loadData(activeGame.id)
              }
              showToast('模组已成功移动到新角色')
            }}
          />
        )}
      </div>
    </div>
  )
}
