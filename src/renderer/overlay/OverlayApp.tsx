import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import {
  RotateCw,
  X,
  Sliders,
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
import { HoverHint } from '../components/ui/HoverHint'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { ScrollContainer } from '../components/ui/ScrollContainer'
import { parseIniHotkeys, ParsedHotkey } from './iniParser'
import { getHotkeyDescription, getHotkeyTypeLabel, isModifierKey } from './hotkeyPresentation'
import { ModDetailedInfo, ModPersistVariable, ToggleModResult } from '../../core/types'
import { planPresetApply } from '../../core/preset-plan'
import {
  applyModRenames,
  applyRenameToItem,
  buildToggleRenames,
  remapPinnedMods,
  remapModDetailsPaths,
  samePath,
  setModEnabledByFullPath
} from '../utils/mods-patch'
import { MoveModModal } from '../components/MoveModModal'
import { PersistValueControl } from '../components/PersistValueControl'
import { CharacterAvatar } from './CharacterAvatar'
import {
  computeCenteredScrollLeft,
  normalizeWheelScrollDelta,
  useAnimatedHorizontalScroll
} from './useAnimatedHorizontalScroll'
import {
  filterOverlayCharacterNames,
  OVERLAY_LAST_CHARACTER_STORAGE_KEY,
  parseLastCharacterByGame,
  pickUniqueEnabledOfficialCharacter,
  withLastCharacterForGame
} from './overlay-character-selection'
import {
  getModEnterDelayMs,
  MOD_SWITCH_MOTION_CLEAR_MS,
  resolveCharacterSwitchDirection,
  type CharacterSwitchDirection
} from './overlay-mod-motion'

const compareCharactersForDisplay = (
  a: string,
  b: string,
  modsByCharacter: Record<string, ReadonlyArray<{ enabled?: boolean }> | undefined>
): number => {
  const modsA = modsByCharacter[a] || []
  const modsB = modsByCharacter[b] || []
  const enabledA = modsA.filter((mod) => mod.enabled).length
  const enabledB = modsB.filter((mod) => mod.enabled).length

  const tierA = enabledA > 0 ? 0 : modsA.length > 0 ? 1 : 2
  const tierB = enabledB > 0 ? 0 : modsB.length > 0 ? 1 : 2
  if (tierA !== tierB) return tierA - tierB

  return a.localeCompare(b, 'zh-Hans-CN')
}

const CHAR_STRIP_CENTER_DURATION_MS = 280
const CHAR_STRIP_SNAP_DURATION_MS = 200
const CHAR_STRIP_WHEEL_GESTURE_DELAY_MS = 180
const CHAR_STRIP_EDGE_FADE_PX = 18

type ModSwitchMotion = {
  key: string
  direction: CharacterSwitchDirection
}

const findClosestCharacterButton = (strip: HTMLElement): HTMLButtonElement | null => {
  const stripRect = strip.getBoundingClientRect()
  if (stripRect.width <= 0) return null
  const centerX = stripRect.left + stripRect.width / 2
  let closest: HTMLButtonElement | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const button of strip.querySelectorAll<HTMLButtonElement>('button[data-character-name]')) {
    const rect = button.getBoundingClientRect()
    if (rect.width <= 0) continue
    const distance = Math.abs(rect.left + rect.width / 2 - centerX)
    if (distance < closestDistance) {
      closest = button
      closestDistance = distance
    }
  }

  return closest
}

export const OverlayApp: React.FC = () => {
  const { theme, toggleTheme, palette } = useTheme()
  const [config, setConfig] = useState<any>(null)
  const [activeGame, setActiveGame] = useState<any>(null)
  const [modsData, setModsData] = useState<Record<string, any[]>>({})
  const [characters, setCharacters] = useState<string[]>([])
  const [officialCharacters, setOfficialCharacters] = useState<string[]>([])
  const [characterAvatars, setCharacterAvatars] = useState<Record<string, string>>({})
  const [selectedCharName, setSelectedCharName] = useState<string | null>(null)
  const [charScrollEdges, setCharScrollEdges] = useState({ left: false, right: false })
  const [focusedModIndex, setFocusedModIndex] = useState<number>(0)
  const [modSwitchMotion, setModSwitchMotion] = useState<ModSwitchMotion | null>(null)
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
  const [filterPinnedOnly, setFilterPinnedOnly] = useState<boolean>(false)
  const [filterOnlyWithMods, setFilterOnlyWithMods] = useState<boolean>(true)
  const [exclusiveMode, setExclusiveMode] = useState<boolean>(true)

  // 抽屉状态 (全部角色网格、Mod 详情面板、设置面板)
  const [isCharDrawerOpen, setIsCharDrawerOpen] = useState<boolean>(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
  const [charSearchQuery, setCharSearchQuery] = useState<string>('')
  const [activeDetailMod, setActiveDetailMod] = useState<any | null>(null)
  const [activeModDetails, setActiveModDetails] = useState<ModDetailedInfo | null>(null)
  const [parsedHotkeys, setParsedHotkeys] = useState<ParsedHotkey[]>([])
  const [preparingPersistHotkeys, setPreparingPersistHotkeys] = useState<boolean>(false)
  const [showMoveModal, setShowMoveModal] = useState<boolean>(false)
  const [pinnedMods, setPinnedMods] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('lz-overlay-pinned-mods')
      if (saved) return JSON.parse(saved)

      // 旧版本用收藏实现排序，升级后迁移一次，避免已有条目丢失
      const legacy = localStorage.getItem('lz-marked-mods')
      if (!legacy) return {}
      const migrated = JSON.parse(legacy)
      localStorage.setItem('lz-overlay-pinned-mods', JSON.stringify(migrated))
      localStorage.removeItem('lz-marked-mods')
      return migrated
    } catch {
      return {}
    }
  })

  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const lastGamepadInputTime = useRef<number>(0)
  const modListContainerRef = useRef<HTMLDivElement>(null)
  const charStripRef = useRef<HTMLDivElement>(null)
  const selectedCharBtnRef = useRef<HTMLButtonElement | null>(null)
  const charSelectionPinnedRef = useRef<boolean>(true)
  const charUserScrollActiveRef = useRef<boolean>(false)
  const charWheelGestureLockedRef = useRef<boolean>(false)
  const charWheelGestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentCharRef = useRef<string | null>(null)
  const displayCharactersRef = useRef<string[]>([])
  const scrollSelectionRef = useRef<string | null>(null)
  const isDraggingCharStrip = useRef<boolean>(false)
  const dragStartX = useRef<number>(0)
  const dragScrollLeft = useRef<number>(0)
  const dragDistance = useRef<number>(0)
  const loadSeqRef = useRef<number>(0)
  const selectionEpochRef = useRef<number>(0)
  const activeGameIdRef = useRef<string | null>(null)
  const filterOnlyWithModsRef = useRef<boolean>(filterOnlyWithMods)
  const detailLoadSeqRef = useRef<number>(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSelfDispatchTime = useRef<number>(0)
  // 同一 Mod 连点会触发两次 rename，第二次的旧路径已经失效；用稳定 id 做单飞锁
  const toggleInFlightRef = useRef<Set<string>>(new Set())
  const [isDraggingStrip, setIsDraggingStrip] = useState<boolean>(false)
  const {
    scrollTo: scrollCharStripTo,
    stop: stopCharStripScroll
  } = useAnimatedHorizontalScroll(charStripRef)

  useEffect(() => {
    activeGameIdRef.current = activeGame?.id || null
  }, [activeGame?.id])

  useEffect(() => {
    filterOnlyWithModsRef.current = filterOnlyWithMods
  }, [filterOnlyWithMods])

  const rememberCharacterForGame = useCallback((gameId: string | null | undefined, charName: string) => {
    if (!gameId || !charName) return
    try {
      const map = parseLastCharacterByGame(
        localStorage.getItem(OVERLAY_LAST_CHARACTER_STORAGE_KEY)
      )
      localStorage.setItem(
        OVERLAY_LAST_CHARACTER_STORAGE_KEY,
        JSON.stringify(withLastCharacterForGame(map, gameId, charName))
      )
    } catch (_) {
      /* localStorage 不可用时不影响角色切换 */
    }
  }, [])

  const readLastCharacterForGame = useCallback((gameId: string | null | undefined): string | null => {
    if (!gameId) return null
    try {
      return parseLastCharacterByGame(
        localStorage.getItem(OVERLAY_LAST_CHARACTER_STORAGE_KEY)
      )[gameId] || null
    } catch (_) {
      return null
    }
  }, [])

  const selectCharacter = useCallback((charName: string | null, gameId?: string | null) => {
    const previousCharacter = currentCharRef.current
    if (!charName) {
      setModSwitchMotion(null)
    } else if (charName !== previousCharacter) {
      const targetGameId = gameId ?? activeGameIdRef.current
      setModSwitchMotion({
        key: `${targetGameId || 'none'}:${charName}`,
        direction: resolveCharacterSwitchDirection(
          previousCharacter,
          charName,
          displayCharactersRef.current
        )
      })
    }

    // 手动点选会递增代次，异步加载中的自动选择据此让位给用户。
    selectionEpochRef.current += 1
    currentCharRef.current = charName
    setSelectedCharName(charName)
    if (charName) {
      rememberCharacterForGame(gameId ?? activeGameIdRef.current, charName)
    }
  }, [rememberCharacterForGame])

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
  const loadData = useCallback(async (forcedGameId?: string, autoSelect = false) => {
    const seq = ++loadSeqRef.current
    const selectionEpoch = selectionEpochRef.current
    try {
      const cfg = await window.lz.getConfig()
      if (seq !== loadSeqRef.current) return
      setConfig(cfg)
      setExclusiveMode(cfg.enableOptionAExclusive ?? true)
      const targetId = forcedGameId || cfg.activeGameId
      const visibleGames = (cfg.games || []).filter((g: any) => !g.hidden)
      const current =
        visibleGames.find((g: any) => g.id === targetId) ||
        visibleGames[0] ||
        (cfg.games || []).find((g: any) => g.id === targetId) ||
        cfg.games?.[0]
      setActiveGame(current)

      const gameKey = String(current?.id || '').toLowerCase()
      const isZzz = gameKey === 'zzz' || gameKey === '19567'
      // 名单与扫描并行，避免为了自动选择额外串行等待一次 IPC。
      const rosterPromise: Promise<any[]> =
        typeof window.lz.getGameBananaCharacters === 'function'
          ? window.lz.getGameBananaCharacters(current.id)
              .then((list) => (Array.isArray(list) ? list : []))
              .catch((err) => {
                console.warn('Failed to load official character roster:', err)
                return []
              })
          : Promise.resolve([])

      const [mods, roster] = await Promise.all([window.lz.scanMods(), rosterPromise])
      if (seq !== loadSeqRef.current) return
      setModsData(mods || {})
      const charList = Object.keys(mods || {})
      setCharacters(charList)
      const officialNames = roster
        .filter((c: any) => c && c.id !== 'all' && typeof c.name === 'string' && c.name.trim())
        .map((c: any) => c.name as string)
      setOfficialCharacters(officialNames)
      const overlayCharacterNames = filterOverlayCharacterNames(charList, officialNames)

      if (autoSelect && seq === loadSeqRef.current && selectionEpochRef.current === selectionEpoch) {
        // 名单请求期间用户可能已经手动点选；此时自动选择必须让位。
        if (selectionEpochRef.current === selectionEpoch) {
          const uniqueChar = isZzz
            ? pickUniqueEnabledOfficialCharacter(mods || {}, officialNames)
            : null

          const storedChar = readLastCharacterForGame(current?.id)
          const storedMods = storedChar ? mods?.[storedChar] : undefined
          const canRestoreStored =
            Boolean(storedChar && overlayCharacterNames.includes(storedChar)) &&
            Array.isArray(storedMods) &&
            (!filterOnlyWithModsRef.current || storedMods.length > 0)

          const firstVisibleChar =
            [...overlayCharacterNames]
              .filter(
                (name) =>
                  !filterOnlyWithModsRef.current || (mods?.[name] || []).length > 0
              )
              .sort((a, b) => compareCharactersForDisplay(a, b, mods || {}))[0] || null

          const nextChar =
            uniqueChar ||
            (canRestoreStored ? storedChar : null) ||
            firstVisibleChar
          if (nextChar) {
            selectCharacter(nextChar, current?.id)
            setFocusedModIndex(0)
          }
        }
      }

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
  }, [readLastCharacterForGame, selectCharacter])

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
    loadData(undefined, true)

    const unsubGame = window.lz.onGameChanged?.(async (data: any) => {
      if (data && data.gameId) {
        const isGameSwitch = data.gameId !== activeGameIdRef.current
        if (isGameSwitch) {
          selectCharacter(null, data.gameId)
          setFocusedModIndex(0)
          setCharSearchQuery('')
          setStatusFilter('all')
          setActiveDetailMod(null)
          setActiveModDetails(null)
        }
        // 修复、重置等操作也会广播 game:changed；同游戏刷新不能移动当前角色。
        await loadData(data.gameId, isGameSwitch)
      }
    })

    const unsubShow = window.lz.onOverlayShown?.(async () => {
      await loadData(undefined, true)
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
  }, [loadData, refreshPresets, selectCharacter])

  // 智能三梯队角色排序：已启用(enabledCount > 0) -> 已安装(total > 0) -> 空角色(total === 0)，同梯队按拼音 A-Z 排序
  const sortedCharacters = useMemo(() => {
    const list = filterOverlayCharacterNames(characters, officialCharacters)
    list.sort((a, b) => compareCharactersForDisplay(a, b, modsData))
    return list
  }, [characters, modsData, officialCharacters])

  // 显示的角色列表（结合 filterOnlyWithMods 过滤）
  const displayCharacters = useMemo(() => {
    if (!filterOnlyWithMods) return sortedCharacters
    return sortedCharacters.filter((c) => (modsData[c] || []).length > 0)
  }, [sortedCharacters, modsData, filterOnlyWithMods])

  useEffect(() => {
    displayCharactersRef.current = displayCharacters
  }, [displayCharacters])

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

  useEffect(() => {
    currentCharRef.current = currentChar
  }, [currentChar])

  useLayoutEffect(() => {
    const container = modListContainerRef.current
    if (container) container.scrollTop = 0
  }, [currentChar, activeGame?.id])

  useEffect(() => {
    if (!modSwitchMotion) return
    const timer = setTimeout(() => setModSwitchMotion(null), MOD_SWITCH_MOTION_CLEAR_MS)
    return () => clearTimeout(timer)
  }, [modSwitchMotion])

  const stepCharacterSelection = useCallback((direction: -1 | 1) => {
    const nextIndex = selectedCharIndex + direction
    const nextChar = displayCharacters[nextIndex]
    if (!nextChar) return

    stopCharStripScroll()
    charUserScrollActiveRef.current = false
    charSelectionPinnedRef.current = true
    selectCharacter(nextChar)
    setFocusedModIndex(0)
  }, [displayCharacters, selectedCharIndex, selectCharacter, stopCharStripScroll])

  const updateCharScrollEdges = useCallback(() => {
    const el = charStripRef.current
    if (!el) {
      setCharScrollEdges((prev) => (prev.left || prev.right ? { left: false, right: false } : prev))
      return
    }

    const maxScroll = el.scrollWidth - el.clientWidth
    const next = {
      left: el.scrollLeft > 2,
      right: el.scrollLeft < maxScroll - 2
    }
    setCharScrollEdges((prev) =>
      prev.left === next.left && prev.right === next.right ? prev : next
    )
  }, [])

  const scrollCharacterButtonToCenter = useCallback((
    button: HTMLButtonElement | null,
    durationMs = CHAR_STRIP_CENTER_DURATION_MS
  ) => {
    const container = charStripRef.current
    if (!container || !button || !button.isConnected) return

    const target = computeCenteredScrollLeft(
      container.clientWidth,
      button.offsetLeft,
      button.offsetWidth,
      container.scrollWidth - container.clientWidth
    )
    scrollCharStripTo(target, durationMs)
  }, [scrollCharStripTo])

  const finishCharStripScroll = useCallback(() => {
    const strip = charStripRef.current
    const closest = strip ? findClosestCharacterButton(strip) : null
    const charName = closest?.dataset.characterName || null

    charUserScrollActiveRef.current = false
    charSelectionPinnedRef.current = true
    if (!closest || !charName) return

    scrollSelectionRef.current = charName
    if (closest.getAttribute('aria-pressed') !== 'true') {
      selectCharacter(charName)
      return
    }

    scrollCharacterButtonToCenter(closest, CHAR_STRIP_SNAP_DURATION_MS)
  }, [scrollCharacterButtonToCenter, selectCharacter])

  const beginCharStripScroll = useCallback(() => {
    if (!charUserScrollActiveRef.current) {
      stopCharStripScroll()
      scrollSelectionRef.current = currentCharRef.current
      charUserScrollActiveRef.current = true
      charSelectionPinnedRef.current = false
    }
  }, [stopCharStripScroll])

  const syncCenteredCharacterFromScroll = useCallback(() => {
    const strip = charStripRef.current
    const closest = strip ? findClosestCharacterButton(strip) : null
    const charName = closest?.dataset.characterName || null
    if (!closest || !charName || charName === scrollSelectionRef.current) return

    scrollSelectionRef.current = charName
    if (closest.getAttribute('aria-pressed') !== 'true') {
      selectCharacter(charName)
    }
  }, [selectCharacter])

  const releaseCharWheelGesture = useCallback(() => {
    if (charWheelGestureTimerRef.current !== null) {
      clearTimeout(charWheelGestureTimerRef.current)
    }
    charWheelGestureTimerRef.current = setTimeout(() => {
      charWheelGestureTimerRef.current = null
      charWheelGestureLockedRef.current = false
    }, CHAR_STRIP_WHEEL_GESTURE_DELAY_MS)
  }, [])

  const applyCharStripWheel = useCallback((deltaX: number, deltaY: number, deltaMode: number) => {
    const strip = charStripRef.current
    if (!strip || isDraggingCharStrip.current) return
    const delta = normalizeWheelScrollDelta(deltaX, deltaY, deltaMode, strip.clientWidth)
    if (delta === 0) return

    if (charWheelGestureLockedRef.current) {
      releaseCharWheelGesture()
      return
    }

    charWheelGestureLockedRef.current = true
    releaseCharWheelGesture()
    stepCharacterSelection(delta > 0 ? 1 : -1)
  }, [releaseCharWheelGesture, stepCharacterSelection])

  const handleCharStripWheel = (e: React.WheelEvent) => {
    e.stopPropagation()
    applyCharStripWheel(e.deltaX, e.deltaY, e.deltaMode)
  }

  // React 的 wheel 监听是被动的，无法阻止浏览器原生横滚；原生监听避免动画与默认滚动叠加。
  useEffect(() => {
    const strip = charStripRef.current
    if (!strip) return

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      applyCharStripWheel(event.deltaX, event.deltaY, event.deltaMode)
    }

    strip.addEventListener('wheel', handleNativeWheel, { passive: false })
    return () => strip.removeEventListener('wheel', handleNativeWheel)
  }, [applyCharStripWheel])

  const handleCharStripMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !charStripRef.current) return
    stopCharStripScroll()
    charUserScrollActiveRef.current = false
    charSelectionPinnedRef.current = true
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
    if (Math.abs(dx) > 3 && !charUserScrollActiveRef.current) {
      beginCharStripScroll()
    }
    charStripRef.current.scrollLeft = dragScrollLeft.current - dx
  }

  const handleCharStripMouseUp = () => {
    if (!isDraggingCharStrip.current) return
    isDraggingCharStrip.current = false
    setIsDraggingStrip(false)
    if (charUserScrollActiveRef.current) finishCharStripScroll()
  }

  const handleCharStripMouseLeave = () => {
    if (!isDraggingCharStrip.current) return
    isDraggingCharStrip.current = false
    setIsDraggingStrip(false)
    if (charUserScrollActiveRef.current) finishCharStripScroll()
  }

  const handleCharStripScroll = useCallback(() => {
    updateCharScrollEdges()
    if (charUserScrollActiveRef.current) syncCenteredCharacterFromScroll()
  }, [syncCenteredCharacterFromScroll, updateCharScrollEdges])

  const charStripMaskImage = useMemo(() => {
    const leftFade = charScrollEdges.left ? CHAR_STRIP_EDGE_FADE_PX : 0
    const rightFade = charScrollEdges.right ? CHAR_STRIP_EDGE_FADE_PX : 0
    return `linear-gradient(to right, transparent 0, black ${leftFade}px, black calc(100% - ${rightFade}px), transparent 100%)`
  }, [charScrollEdges.left, charScrollEdges.right])

  const centerSelectedCharacter = useCallback((durationMs = CHAR_STRIP_CENTER_DURATION_MS) => {
    scrollCharacterButtonToCenter(selectedCharBtnRef.current, durationMs)
  }, [scrollCharacterButtonToCenter])

  // 选中项变化时在轨道内部居中；滚动选角期间由滚动轴自行接管
  useEffect(() => {
    if (charUserScrollActiveRef.current) return
    charSelectionPinnedRef.current = true
    const frame = requestAnimationFrame(() => {
      if (
        charSelectionPinnedRef.current &&
        !charUserScrollActiveRef.current &&
        !isDraggingCharStrip.current
      ) {
        centerSelectedCharacter()
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [centerSelectedCharacter, currentChar, displayCharacters])

  useEffect(() => {
    updateCharScrollEdges()
  }, [displayCharacters, updateCharScrollEdges])

  useEffect(() => {
    const strip = charStripRef.current
    if (!strip) return

    const handleResize = () => {
      updateCharScrollEdges()
      if (charSelectionPinnedRef.current) centerSelectedCharacter(CHAR_STRIP_SNAP_DURATION_MS)
    }

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(handleResize)
      observer.observe(strip)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [centerSelectedCharacter, updateCharScrollEdges])

  useEffect(() => {
    return () => {
      if (charWheelGestureTimerRef.current !== null) {
        clearTimeout(charWheelGestureTimerRef.current)
        charWheelGestureTimerRef.current = null
      }
    }
  }, [])

  const currentMods = useMemo(() => {
    if (!currentChar) return []
    let list = [...(modsData[currentChar] || [])]

    // 1. 状态过滤 (全部 / 已启用 / 已停用)
    if (statusFilter === 'enabled') {
      list = list.filter((m) => m.enabled)
    } else if (statusFilter === 'disabled') {
      list = list.filter((m) => !m.enabled)
    }

    // 2. 置顶过滤
    if (filterPinnedOnly) {
      list = list.filter((m) => pinnedMods[m.fullPath])
    }

    // 3. 核心排序计算
    list.sort((a, b) => {
      // 置顶优先于所有排序模式，点击置顶后立即出现在最前
      const pinDiff = (pinnedMods[b.fullPath] ? 1 : 0) - (pinnedMods[a.fullPath] ? 1 : 0)
      if (pinDiff !== 0) return pinDiff

      if (modSortMode === 'default') {
        // 复合排序：已启用(enabled) > 修改时间(mtime 降序) > 名称拼音
        const enabledDiff = (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)
        if (enabledDiff !== 0) return enabledDiff

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

    // 4. 升/降序翻转；置顶项始终留在最前，只反转各自分组内部
    if (isReverseOrder) {
      const pinned: typeof list = []
      const rest: typeof list = []
      for (const item of list) {
        if (pinnedMods[item.fullPath]) {
          pinned.push(item)
        } else {
          rest.push(item)
        }
      }
      pinned.reverse()
      rest.reverse()
      list = [...pinned, ...rest]
    }

    return list
  }, [currentChar, modsData, statusFilter, filterPinnedOnly, modSortMode, isReverseOrder, pinnedMods])

  const modContentKey = `${activeGame?.id || 'none'}:${currentChar || 'empty'}`
  const activeModSwitchMotion =
    modSwitchMotion?.key === modContentKey ? modSwitchMotion : null
  const modEnterDirectionClass = activeModSwitchMotion
    ? activeModSwitchMotion.direction > 0
      ? 'overlay-mod-enter-next'
      : activeModSwitchMotion.direction < 0
        ? 'overlay-mod-enter-prev'
        : 'overlay-mod-enter-neutral'
    : ''
  const modEnterItemClass = activeModSwitchMotion ? 'overlay-mod-enter-item' : ''

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

  // 单选互斥是主进程配置，不是悬浮窗本地开关：写回 enableOptionAExclusive 后
  // config:updateApp 会同步 ModEngine.setOptionAExclusive，两个入口行为才一致
  const handleToggleExclusiveMode = async () => {
    const next = !exclusiveMode
    setExclusiveMode(next)
    try {
      const res = await window.lz.updateAppConfig({ enableOptionAExclusive: next })
      if (!res?.success) throw new Error('updateAppConfig failed')
      showToast(next ? '已切换为：单选互斥保护模式' : '已切换为：多选并存模式')
    } catch (err) {
      console.error('Failed to update exclusive mode:', err)
      setExclusiveMode(!next)
      showToast('单选互斥设置失败')
    }
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
    if (!targetChar || !mod.fullPath) return

    const lockKey = String(mod.id || mod.name)
    if (toggleInFlightRef.current.has(lockKey)) return
    toggleInFlightRef.current.add(lockKey)

    const nextState = !mod.enabled
    lastSelfDispatchTime.current = Date.now()

    // 详情抽屉内同步响应开关状态
    if (activeDetailMod && (activeDetailMod.fullPath === mod.fullPath || activeDetailMod.id === mod.id)) {
      setActiveDetailMod((prev: any) => (prev ? { ...prev, enabled: nextState } : null))
    }

    // 乐观更新只翻目标开关：按 fullPath 跨桶查找，避免别名角色目录的 raw
    // characterName 与 canonical 桶键不一致导致更新静默失效。
    // Option-A 的兄弟停用不再靠本地 exclusiveMode 猜测，改由主进程结果补丁回填。
    setModsData((prev) => setModEnabledByFullPath(prev, mod.fullPath, nextState) ?? prev)

    try {
      const res = await window.lz.toggleMod(targetChar, mod.name, nextState)
      if (res && res.success) {
        showToast(`${mod.name} ${nextState ? '已启用' : '已停用'}`)
        await applyToggleResultPatch(mod, res, nextState)
      } else {
        showToast(`切换失败: ${res?.error || '未知错误'}`)
        // 上面是乐观更新；失败（例如基底 Mod 需要主界面二次确认）必须回读磁盘纠正状态
        try {
          const updated = await window.lz.scanMods()
          setModsData(updated || {})
          const refreshed = Object.values(updated || {})
            .flat()
            .find((m: any) => samePath(m.fullPath, mod.fullPath))
          if (refreshed) setActiveDetailMod(refreshed)
        } catch (_) {}
      }
    } catch {
      showToast('切换异常')
    } finally {
      toggleInFlightRef.current.delete(lockKey)
    }
  }

  /**
   * 成功切换后只补丁变化的条目，不再全量 scanMods：
   * 目录改名只影响 enabled / folderName / fullPath 与目录内的图片路径，
   * 元数据、INI 内容都没变。补丁按 fullPath 匹配；万一没命中就保持原状态，
   * 下次 loadData / overlay:shown 会自然修正。
   */
  const applyToggleResultPatch = async (mod: any, res: ToggleModResult, nextState: boolean) => {
    if (!res.newFullPath) {
      const updated = await window.lz.scanMods()
      setModsData(updated || {})
      return
    }

    const renames = buildToggleRenames(mod.fullPath, res, nextState)
    setModsData((prev) => applyModRenames(prev, renames))
    setPinnedMods((prev) => {
      const next = remapPinnedMods(prev, renames)
      if (next !== prev) {
        try { localStorage.setItem('lz-overlay-pinned-mods', JSON.stringify(next)) } catch (_) {}
      }
      return next
    })
    setActiveDetailMod((prev: any) => {
      if (!prev) return prev
      const rename = renames.find((item) => samePath(item.oldFullPath, prev.fullPath))
      return rename ? applyRenameToItem(prev, rename) : prev
    })
    setActiveModDetails((prev) => {
      if (!prev) return prev
      const rename = renames.find((item) => samePath(item.oldFullPath, prev.fullPath))
      return rename ? remapModDetailsPaths(prev, rename.oldFullPath, rename.newFullPath) : prev
    })
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
      // F10 不改任何文件，无需重扫列表
      showToast('F10 热刷新成功！')
    } catch {
      showToast('刷新失败')
    } finally {
      setTimeout(() => setReloading(false), 500)
    }
  }

  // 悬浮窗固定走严格还原，和主窗一键应用保持同一语义，避免两个入口行为分叉
  const handleApplyPreset = async (presetId: string) => {
    showToast('正在应用预设方案...')
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
    setPreparingPersistHotkeys(false)
    try {
      const details = await window.lz.getModDetails(mod.fullPath)
      if (seq !== detailLoadSeqRef.current) return
      setActiveModDetails(details)

      if (details?.persistInfo?.hasPersist) {
        setPreparingPersistHotkeys(true)
        try {
          const prepared = await window.lz.prepareOverlayHotkeys(details.fullPath)
          if (seq !== detailLoadSeqRef.current) return
          if (!prepared.success) {
            showToast(`即时调节准备失败，将使用 F10：${prepared.error || '未知错误'}`)
          }
        } catch (err) {
          if (seq !== detailLoadSeqRef.current) return
          console.warn('Failed to prepare overlay persist hotkeys:', err)
          showToast('即时调节准备失败，将使用 F10')
        } finally {
          if (seq === detailLoadSeqRef.current) {
            setPreparingPersistHotkeys(false)
          }
        }
      }

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
    }
  }

  // 调节 Persist Bridge 参数
  const handleUpdatePersistVar = async (v: ModPersistVariable, targetVal?: string) => {
    if (!activeModDetails) return
    lastSelfDispatchTime.current = Date.now()
    const allowed = v.allowedValues && v.allowedValues.length > 0 ? v.allowedValues : []
    let nextVal = targetVal
    if (nextVal === undefined) {
      if (allowed.length === 0) return
      const currIdx = allowed.indexOf(v.currentValue)
      nextVal = currIdx >= 0 ? allowed[(currIdx + 1) % allowed.length] : allowed[0]
    }

    try {
      const res = await window.lz.updateModVariable(
        activeModDetails.fullPath,
        v.name,
        nextVal,
        v.namespace,
        { preferHotkeyBridge: true }
      )
      if (res && res.success === false) {
        setActiveModDetails((prev) => prev && prev.persistInfo ? {
          ...prev,
          persistInfo: { ...prev.persistInfo, variables: prev.persistInfo.variables.map((item) => item.name === v.name && item.namespace === v.namespace ? { ...item, currentValue: v.currentValue } : item) }
        } : prev)
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
              item.name === v.name && item.namespace === v.namespace ? { ...item, currentValue: nextVal! } : item
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

      const reloadReasonLabel = res?.reloadReason === 'game_not_running'
        ? '游戏未启动'
        : res?.reloadReason === 'echo_suppressed'
        ? '操作过于频繁'
        : res?.reloadReason === 'no_game'
        ? '未配置游戏'
        : res?.reloadReason === 'live_apply_unsupported'
        ? '当前值不支持实时注入'
        : res?.reloadReason === 'live_apply_failed'
        ? '参数注入文件生成失败'
        : res?.reloadReason === 'live_apply_persist_failed'
        ? '参数持久化写入失败'
        : (res?.reloadReason || '请手动按 F10')

      showToast(
        res?.applyMode === 'hotkey'
          ? `已即时更新 $${v.name} = ${nextVal}`
          : res?.liveApplied === false
            ? `已保存 $${v.name} = ${nextVal}，游戏未刷新（${reloadReasonLabel}）`
            : `已更新 $${v.name} = ${nextVal}`
      )
    } catch {
      setActiveModDetails((prev) => prev && prev.persistInfo ? {
        ...prev,
        persistInfo: { ...prev.persistInfo, variables: prev.persistInfo.variables.map((item) => item.name === v.name && item.namespace === v.namespace ? { ...item, currentValue: v.currentValue } : item) }
      } : prev)
      showToast('更新参数失败')
    }
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

  // 置顶此 Mod
  const handleTogglePin = (modFullPath: string) => {
    const willPin = !pinnedMods[modFullPath]
    setPinnedMods((prev) => {
      const next = { ...prev }
      if (next[modFullPath]) {
        delete next[modFullPath]
      } else {
        next[modFullPath] = true
      }
      try {
        localStorage.setItem('lz-overlay-pinned-mods', JSON.stringify(next))
      } catch (_) {}
      return next
    })
    showToast(willPin ? '已置顶' : '已取消置顶')
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
          selectCharacter(displayCharacters[prevIdx])
        }
        setFocusedModIndex(0)
      } else if (e.key === 'ArrowRight') {
        const nextIdx = selectedCharIndex < displayCharacters.length - 1 ? selectedCharIndex + 1 : 0
        if (displayCharacters[nextIdx]) {
          selectCharacter(displayCharacters[nextIdx])
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
  }, [currentMods, focusedModIndex, displayCharacters, selectedCharIndex, activeDetailMod, isCharDrawerOpen, isSettingsOpen, selectCharacter])

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
              selectCharacter(displayCharacters[prevIdx])
            }
            setFocusedModIndex(0)
            lastGamepadInputTime.current = now
          } else if (dpadRight) {
            const nextIdx = selectedCharIndex < displayCharacters.length - 1 ? selectedCharIndex + 1 : 0
            if (displayCharacters[nextIdx]) {
              selectCharacter(displayCharacters[nextIdx])
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
  }, [currentMods, focusedModIndex, displayCharacters, selectedCharIndex, activeDetailMod, isCharDrawerOpen, isSettingsOpen, selectCharacter])

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

        {/* 2. 角色头像轨道 */}
        <div
          onWheel={handleCharStripWheel}
          className="px-2.5 py-1.5 border-b border-border/50 flex items-center gap-1.5 shrink-0 select-none"
          style={{
            backgroundColor: `color-mix(in srgb, var(--surface) ${Math.round(opacity * 50)}%, transparent)`
          }}
        >
          {/* 全部角色入口 */}
          <button
            type="button"
            onClick={() => setIsCharDrawerOpen(!isCharDrawerOpen)}
            aria-pressed={isCharDrawerOpen}
            aria-label="全部角色"
            className="group w-12 max-[420px]:w-10 shrink-0 flex flex-col items-center gap-1 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-[16px]"
            title="全部角色头像菜单"
          >
            <span
              className={`w-10 h-10 max-[420px]:w-8 max-[420px]:h-8 p-[2px] rounded-[14px] max-[420px]:rounded-[11px] transition-colors duration-150 ${
                isCharDrawerOpen ? 'bg-primary shadow-cds-sm' : 'bg-border/50 group-hover:bg-primary/40'
              }`}
            >
              <span
                className={`w-full h-full rounded-[12px] max-[420px]:rounded-[9px] bg-surface-2 flex items-center justify-center transition-colors ${
                  isCharDrawerOpen ? 'text-primary' : 'text-text-muted group-hover:text-primary'
                }`}
              >
                <LayoutGrid className="w-4 h-4 max-[420px]:w-3.5 max-[420px]:h-3.5 align-neg-125" />
              </span>
            </span>
            <span
              className={`text-[10px] max-[420px]:text-[9px] leading-none font-title ${
                isCharDrawerOpen ? 'text-primary font-semibold' : 'text-text-muted group-hover:text-text'
              }`}
            >
              全部
            </span>
          </button>

          {/* 横向头像轨道 */}
          <div className="relative flex-1 min-w-0">
            <div
              ref={charStripRef}
              onScroll={handleCharStripScroll}
              onMouseDown={handleCharStripMouseDown}
              onMouseMove={handleCharStripMouseMove}
              onMouseUp={handleCharStripMouseUp}
              onMouseLeave={handleCharStripMouseLeave}
              className={`flex items-start gap-1.5 overflow-x-auto scrollbar-none relative py-1 ${
                isDraggingStrip ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              style={{
                WebkitMaskImage: charStripMaskImage,
                maskImage: charStripMaskImage
              }}
            >
              {displayCharacters.length === 0 ? (
                <div className="h-14 max-[420px]:h-11 flex items-center gap-2 px-1 text-[10px] text-text-muted">
                  <span>暂无角色</span>
                  <button
                    type="button"
                    onClick={() => setFilterOnlyWithMods(false)}
                    className="text-primary hover:underline cursor-pointer font-medium"
                  >
                    显示全部
                  </button>
                </div>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="shrink-0 w-[calc(50%_-_30px)] max-[420px]:w-[calc(50%_-_26px)]"
                  />
                  {displayCharacters.map((charName, idx) => {
                    const isSelected = idx === selectedCharIndex
                    const mods = modsData[charName] || []
                    const enabledCount = mods.filter((m) => m.enabled).length

                    return (
                      <button
                        key={charName}
                        ref={isSelected ? selectedCharBtnRef : undefined}
                        data-character-name={charName}
                        type="button"
                        onClick={() => {
                          if (dragDistance.current > 6) return
                          selectCharacter(charName)
                          setFocusedModIndex(0)
                        }}
                        aria-pressed={isSelected}
                        aria-label={`${charName}，已启用 ${enabledCount} / 共 ${mods.length} 个 Mod`}
                        title={`${charName} · 已启用 ${enabledCount}/${mods.length}`}
                        className={`group w-12 max-[420px]:w-10 shrink-0 flex flex-col items-center gap-1 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-[16px] ${
                          mods.length === 0 ? 'opacity-60' : ''
                        }`}
                      >
                        <CharacterAvatar
                          name={charName}
                          src={characterAvatars[charName]}
                          size="sm"
                          selected={isSelected}
                          enabledCount={enabledCount}
                          totalCount={mods.length}
                          eager={isSelected}
                          emphasizeSelected
                        />
                        <span
                          className={`w-full text-center truncate font-title text-[10px] max-[420px]:text-[9px] leading-none pointer-events-none ${
                            isSelected ? 'text-primary font-semibold' : 'text-text-muted group-hover:text-text'
                          }`}
                        >
                          {charName}
                        </span>
                      </button>
                    )
                  })}
                  <span
                    aria-hidden="true"
                    className="shrink-0 w-[calc(50%_-_30px)] max-[420px]:w-[calc(50%_-_26px)]"
                  />
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => stepCharacterSelection(-1)}
              disabled={!charScrollEdges.left}
              aria-hidden={!charScrollEdges.left}
              aria-label="向左滚动角色列表"
              tabIndex={charScrollEdges.left ? 0 : -1}
              className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full border border-border/70 bg-surface/95 text-text-muted hover:text-primary shadow-cds-sm flex items-center justify-center cursor-pointer transition-all duration-200 ease-out motion-reduce:transition-none ${
                charScrollEdges.left
                  ? 'opacity-100 scale-100'
                  : 'pointer-events-none opacity-0 scale-90'
              }`}
              title="向左滚动角色列表"
            >
              <ChevronLeft className="w-3.5 h-3.5 align-neg-125" />
            </button>

            <button
              type="button"
              onClick={() => stepCharacterSelection(1)}
              disabled={!charScrollEdges.right}
              aria-hidden={!charScrollEdges.right}
              aria-label="向右滚动角色列表"
              tabIndex={charScrollEdges.right ? 0 : -1}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full border border-border/70 bg-surface/95 text-text-muted hover:text-primary shadow-cds-sm flex items-center justify-center cursor-pointer transition-all duration-200 ease-out motion-reduce:transition-none ${
                charScrollEdges.right
                  ? 'opacity-100 scale-100'
                  : 'pointer-events-none opacity-0 scale-90'
              }`}
              title="向右滚动角色列表"
            >
              <ChevronRight className="w-3.5 h-3.5 align-neg-125" />
            </button>
          </div>

          {/* 右侧工具按钮 */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setFilterPinnedOnly(!filterPinnedOnly)
                showToast(filterPinnedOnly ? '已显示全部 Mod' : '仅查看已置顶 Mod')
              }}
              className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 transition-all duration-100 cursor-pointer shadow-2xs active:scale-95 ${
                filterPinnedOnly
                  ? 'bg-primary/20 text-primary border-primary/40 shadow-cds-sm font-bold'
                  : 'bg-surface-2/80 text-text-muted hover:text-primary border-border/80 hover:bg-surface'
              }`}
              title="只显示已置顶 Mod"
            >
              <Pin className={`w-3.5 h-3.5 align-neg-125 ${filterPinnedOnly ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterOnlyWithMods(!filterOnlyWithMods)
                showToast(filterOnlyWithMods ? '显示所有角色' : '仅显示已安装 Mod 的角色')
              }}
              className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 transition-all duration-100 cursor-pointer shadow-2xs active:scale-95 ${
                filterOnlyWithMods
                  ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                  : 'bg-surface-2/80 text-text-muted hover:text-primary border-border/80 hover:bg-surface'
              }`}
              title="只显示已安装 Mod 的角色"
            >
              <Filter className="w-3.5 h-3.5 align-neg-125" />
            </button>
          </div>
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
                { id: 'enabled', label: '已启用' },
                { id: 'disabled', label: '已停用' }
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
                modSortMode === 'default' ? '默认 (已启用优先)' : modSortMode === 'time' ? '最新修改优先' : '名称拼音排序'
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
              onClick={handleToggleExclusiveMode}
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
          className="flex-1 min-h-0 p-2.5 overscroll-contain overflow-x-hidden"
        >
          {currentMods.length === 0 ? (
            <div
              key={`empty:${modContentKey}`}
              className={`h-full flex flex-col items-center justify-center text-text-muted space-y-2 ${modEnterDirectionClass} ${modEnterItemClass}`}
            >
              <Layers className="w-10 h-10 stroke-[1.2] opacity-40" />
              <p className="text-xs">【{currentChar || '无'}】暂无符合条件的 Mod</p>
            </div>
          ) : viewMode === 'grid' ? (
            /* 严格一排显示 3 个 (grid-cols-3) 4:3 封面 + 底栏 Mod 名与 Switch */
            <div
              key={`grid:${modContentKey}`}
              className={`grid grid-cols-3 gap-2.5 ${modEnterDirectionClass}`}
            >
              {currentMods.map((mod, idx) => {
                const isFocused = idx === focusedModIndex
                const isPinned = !!pinnedMods[mod.fullPath]

                return (
                  <div
                    id={`mod-card-${idx}`}
                    key={mod.id || mod.name}
                    onClick={() => handleOpenDetail(mod)}
                    className={`group relative rounded-xl border flex flex-col justify-between overflow-hidden transition-all duration-150 cursor-pointer ${
                      mod.enabled
                        ? 'bg-surface border-primary ring-2 ring-primary/30 shadow-cds-sm'
                        : 'bg-surface/80 border-border/80 hover:border-primary/50 hover:-translate-y-0.5 shadow-2xs'
                    } ${isFocused ? 'scale-[1.01]' : ''} ${modEnterItemClass}`}
                    style={{ '--overlay-mod-enter-delay': `${getModEnterDelayMs(idx)}ms` } as React.CSSProperties}
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

                      {/* 置顶徽标 (左上角) */}
                      {isPinned && (
                        <div className="absolute top-1.5 left-1.5 p-1 rounded-full bg-primary text-primary-fg shadow-xs">
                          <Pin className="w-2.5 h-2.5 fill-current" />
                        </div>
                      )}

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
                        title={mod.enabled ? '点击停用' : '点击启用'}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* 单列紧凑列表视图 */
            <div
              key={`list:${modContentKey}`}
              className={`space-y-2 ${modEnterDirectionClass}`}
            >
              {currentMods.map((mod, idx) => {
                const isFocused = idx === focusedModIndex
                const isPinned = !!pinnedMods[mod.fullPath]

                return (
                  <div
                    id={`mod-card-${idx}`}
                    key={mod.id || mod.name}
                    onClick={() => handleOpenDetail(mod)}
                    className={`rounded-xl border p-2.5 flex items-center justify-between space-x-2.5 transition-all duration-150 cursor-pointer ${
                      mod.enabled
                        ? 'bg-surface border-primary ring-2 ring-primary/25 shadow-cds-sm'
                        : 'bg-surface/80 border-border/80 hover:border-primary/40 hover:bg-surface'
                    } ${isFocused ? 'ring-2 ring-primary scale-[1.01]' : ''} ${modEnterItemClass}`}
                    style={{ '--overlay-mod-enter-delay': `${getModEnterDelayMs(idx)}ms` } as React.CSSProperties}
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
                        {isPinned && <Pin className="w-3 h-3 text-primary fill-current shrink-0 align-neg-125" />}
                        <h4 className={`text-xs font-semibold truncate ${mod.enabled ? 'text-primary font-bold' : 'text-text'}`}>
                          {mod.name}
                        </h4>
                      </div>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          mod.enabled ? 'bg-primary/10 text-primary' : 'bg-surface-2 text-text-muted'
                        }`}>
                          {mod.enabled ? '已启用' : '已停用'}
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

            {/* Body: 预览大图 + 置顶此 Mod + 快捷键表格 + 部件调节 */}
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

              {/* 置顶按钮 + 移动到其他角色 */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleTogglePin(activeDetailMod.fullPath)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center space-x-1.5 shadow-2xs active:scale-95 ${
                    pinnedMods[activeDetailMod.fullPath]
                      ? 'bg-primary text-primary-fg border-primary shadow-cds-sm font-bold'
                      : 'bg-surface-2/70 hover:bg-surface text-text-muted hover:text-text border-border/80'
                  }`}
                >
                  <Pin className={`w-3.5 h-3.5 align-neg-125 ${pinnedMods[activeDetailMod.fullPath] ? 'fill-current' : ''}`} />
                  <span>{pinnedMods[activeDetailMod.fullPath] ? '取消置顶' : '置顶'}</span>
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
              {parsedHotkeys.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-bold text-text flex items-center space-x-1.5">
                    <Sliders className="w-3.5 h-3.5 text-primary align-neg-125" />
                    <span>快捷键</span>
                  </div>
                  <div className="space-y-2">
                    {parsedHotkeys.map((h, idx) => {
                      const isGamepad = h.keys.some((k) => k.includes('🎮'))
                      const isMouse = h.keys.some((k) => k.includes('鼠标') || k.includes('键'))
                      const desc = getHotkeyDescription(h)
                      const typeLabel = getHotkeyTypeLabel(h.type)
                      return (
                        <div
                          key={`${h.name}-${h.keys.join('+')}-${idx}`}
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
                                {typeLabel && (
                                  <span className="text-[9px] font-semibold text-text-muted bg-surface/80 px-1 py-0.2 rounded-full border border-border/40 shrink-0">
                                    {typeLabel}
                                  </span>
                                )}
                              </div>
                              {desc && (
                                <span className="text-[10px] text-text-muted truncate max-w-[200px] mt-0.5" title={desc}>
                                  {desc}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {h.keys.map((k, kIdx) => (
                                <React.Fragment key={`${k}-${kIdx}`}>
                                  {kIdx > 0 && (
                                    <span aria-hidden="true" className="text-[9px] text-text-muted/60 select-none">
                                      +
                                    </span>
                                  )}
                                  <kbd
                                    className={`detail-kbd group-hover:border-primary/40 transition-colors ${
                                      isModifierKey(k) ? 'opacity-60' : ''
                                    }`}
                                  >
                                    {k}
                                  </kbd>
                                </React.Fragment>
                              ))}
                            </div>
                          </div>

                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 🎛️ Persist Bridge 服装/部件调控 (如果有) */}
              {activeModDetails?.persistInfo?.hasPersist && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-text">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-primary align-neg-125" />
                    <span>服装与部件参数调节</span>
                    {preparingPersistHotkeys && (
                      <span className="text-[10px] font-normal text-text-muted">即时调节准备中…</span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {activeModDetails.persistInfo.variables.map((v) => {
                      return (
                        <div
                          key={`${v.namespace || ''}\\${v.name}`}
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

                          <PersistValueControl
                            variable={v}
                            compact
                            disabled={preparingPersistHotkeys}
                            onChange={(value) => handleUpdatePersistVar(v, value)}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

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
                        selectCharacter(name)
                        if (filterOnlyWithMods && (!modsData[name] || modsData[name].length === 0)) {
                          setFilterOnlyWithMods(false)
                        }
                        setIsCharDrawerOpen(false)
                        setFocusedModIndex(0)
                      }}
                      aria-pressed={isSelected}
                      aria-label={`${name}，已启用 ${enabledCount} / 共 ${mods.length} 个 Mod`}
                      title={`${name} · 已启用 ${enabledCount}/${mods.length}`}
                      className={`flex flex-col items-center p-2.5 rounded-xl border transition-all duration-150 text-center cursor-pointer shadow-2xs ${
                        isSelected
                          ? 'bg-primary/10 border-primary shadow-cds-sm font-bold'
                          : 'bg-surface hover:bg-surface-2 border-border/70 hover:border-primary/40'
                      }`}
                    >
                      <CharacterAvatar
                        name={name}
                        src={avatar}
                        size="lg"
                        selected={isSelected}
                        enabledCount={enabledCount}
                        totalCount={mods.length}
                        eager={isSelected}
                        className="mb-2"
                      />
                      <span className="font-title text-xs font-bold text-text truncate max-w-full">
                        {name}
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
                  <div className="font-bold text-text text-xs">
                    <HoverHint content="启用同角色新 Mod 时自动停用其他 Mod">单选互斥保护</HoverHint>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleExclusiveMode}
                  className={`qaq-switch ${exclusiveMode ? 'active' : ''}`}
                />
              </div>

              {/* 仅在游戏界面显示 (智能跟随) */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-2/40 border border-border/70 shadow-2xs">
                <div>
                  <div className="font-bold text-text text-xs">
                    <HoverHint content="切出游戏时自动隐藏，切回游戏自动恢复">仅在游戏界面显示</HoverHint>
                  </div>
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
                  <div className="font-bold text-text text-xs">
                    <HoverHint content="前台智能识别跟随">当前关联游戏</HoverHint>
                  </div>
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
                          selectCharacter(null, g.id)
                          await window.lz.setActiveGame(g.id)
                          await loadData(g.id, true)
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
                  <div className="font-bold text-text text-xs">
                    <HoverHint content="系统全局监听">呼出/隐藏快捷键</HoverHint>
                  </div>
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
