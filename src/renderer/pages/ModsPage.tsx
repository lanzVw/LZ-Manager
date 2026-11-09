import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  XCircle,
  FolderOpen,
  Folder,
  Globe,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  Layers,
  LayoutList,
  LayoutGrid,
  ArrowUpDown,
  Plus,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
  AlertOctagon,
  ArrowUpCircle
} from 'lucide-react'
import { CharacterConflictReport, ModConflictSummary, AppearanceSection, ToggleModResult } from '../../core/types'
import { useTheme } from '../contexts/ThemeContext'
import { extractDominantColor, DEFAULT_PRIMARY_RGB, DEFAULT_DARK_PRIMARY_RGB } from '../utils/colorExtractor'
import { toFileUrl } from '../utils/fileUrl'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { SearchField } from '../components/ui/SearchField'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { HoverHint } from '../components/ui/HoverHint'
import { ScrollContainer } from '../components/ui/ScrollContainer'
import { useToast } from '../components/ui/Toast'
import { MoveModModal } from '../components/MoveModModal'
import { ModCard } from '../components/mods/ModCard'

// 列表页的视图状态：进入 Mod 详情页时本组件会被卸载，只有提升到 App 才能在返回时原样还原
export interface ModsViewState {
  selectedChar: string
  searchChar: string
  searchMod: string
  sidebarMode: 'list' | 'grid'
  charFilter: 'all' | 'hasMods' | 'equipped'
  charSort: 'default' | 'count' | 'name'
  modSort: 'status' | 'character' | 'time' | 'name' | 'default'
  selectedSectionId: string
  conflictFilterOnly: boolean
  brokenFilterOnly: boolean
  updateFilterOnly: boolean
}

export const DEFAULT_MODS_VIEW: ModsViewState = {
  selectedChar: 'all',
  searchChar: '',
  searchMod: '',
  sidebarMode: 'list',
  charFilter: 'all',
  charSort: 'default',
  modSort: 'status',
  selectedSectionId: 'all',
  conflictFilterOnly: false,
  brokenFilterOnly: false,
  updateFilterOnly: false
}

interface ModsPageProps {
  modsData: Record<string, any[]>
  loading: boolean
  onRefresh: () => void
  onToggleMod: (charName: string, modName: string, enabled: boolean) => Promise<ToggleModResult>
  onSelectMod: (modFullPath: string) => void
  onNavigateTab?: (tab: string) => void
  activeGame?: any
  viewState: ModsViewState
  onViewStateChange: (patch: Partial<ModsViewState>) => void
}

// 侧边栏紧凑型角色缩略头像组件 (56px 针对性优化)
const CompactCharacterAvatar: React.FC<{
  src: string | null
  name: string
  hasActive: boolean
  isSelected: boolean
  hasMods: boolean
  className?: string
}> = ({ src, name, hasActive, isSelected, hasMods, className = 'w-9 h-9' }) => {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [src])

  return (
    <div
      className={`relative ${className} aspect-square rounded-lg overflow-hidden shrink-0 border transition-all duration-fast flex items-center justify-center ${
        isSelected
          ? 'ring-2 ring-primary border-primary'
          : hasActive
          ? 'border-primary/40 ring-1 ring-primary/20'
          : 'border-border'
      } ${!hasMods ? 'opacity-60' : 'opacity-100'}`}
    >
      {src && !hasError ? (
        <img
          src={toFileUrl(src)}
          alt={name}
          className="w-full h-full object-cover object-top select-none pointer-events-none"
          loading="lazy"
          onError={() => setHasError(true)}
        />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center font-bold text-xs select-none ${
            isSelected
              ? 'bg-primary/20 text-primary'
              : hasActive
              ? 'bg-primary/10 text-primary'
              : 'bg-surface-2 text-text-muted'
          }`}
        >
          {name.slice(0, 1)}
        </div>
      )}

      {/* 已装载模组微光角标 */}
      {hasActive && (
        <span
          className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-surface shadow-xs"
          title="该角色当前已有生效的模组"
        />
      )}
    </div>
  )
}

export const ModsPage: React.FC<ModsPageProps> = ({
  modsData,
  loading,
  onRefresh,
  onToggleMod,
  onSelectMod,
  onNavigateTab,
  activeGame,
  viewState,
  onViewStateChange
}) => {
  const { theme } = useTheme()
  // 视图状态由 App 托管：进入详情页时本组件被卸载，只有外部保存才能在返回时还原
  const {
    selectedChar,
    searchChar,
    searchMod,
    sidebarMode,
    charFilter,
    charSort,
    modSort,
    selectedSectionId,
    conflictFilterOnly,
    brokenFilterOnly,
    updateFilterOnly
  } = viewState
  const setSelectedChar = useCallback(
    (value: string) => onViewStateChange({ selectedChar: value }),
    [onViewStateChange]
  )
  const setSearchChar = useCallback(
    (value: string) => onViewStateChange({ searchChar: value }),
    [onViewStateChange]
  )
  const setSearchMod = useCallback(
    (value: string) => onViewStateChange({ searchMod: value }),
    [onViewStateChange]
  )
  const setSidebarMode = useCallback(
    (value: 'list' | 'grid') => onViewStateChange({ sidebarMode: value }),
    [onViewStateChange]
  )
  const setCharFilter = useCallback(
    (value: 'all' | 'hasMods' | 'equipped') => onViewStateChange({ charFilter: value }),
    [onViewStateChange]
  )
  const setCharSort = useCallback(
    (value: 'default' | 'count' | 'name') => onViewStateChange({ charSort: value }),
    [onViewStateChange]
  )
  const setModSort = useCallback(
    (value: 'status' | 'character' | 'time' | 'name' | 'default') =>
      onViewStateChange({ modSort: value }),
    [onViewStateChange]
  )
  const setSelectedSectionId = useCallback(
    (value: string) => onViewStateChange({ selectedSectionId: value }),
    [onViewStateChange]
  )
  const setConflictFilterOnly = useCallback(
    (value: boolean) => onViewStateChange({ conflictFilterOnly: value }),
    [onViewStateChange]
  )
  const setBrokenFilterOnly = useCallback(
    (value: boolean) => onViewStateChange({ brokenFilterOnly: value }),
    [onViewStateChange]
  )
  const setUpdateFilterOnly = useCallback(
    (value: boolean) => onViewStateChange({ updateFilterOnly: value }),
    [onViewStateChange]
  )
  const [characterAvatars, setCharacterAvatars] = useState<Record<string, string>>({})
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [conflictsMap, setConflictsMap] = useState<Record<string, CharacterConflictReport>>({})
  const [updatesMap, setUpdatesMap] = useState<Record<string, any>>({})
  const [checkingUpdates, setCheckingUpdates] = useState<boolean>(false)
  const toast = useToast()
  const [characterAccentRgb, setCharacterAccentRgb] = useState<string>(
    theme === 'dark' ? DEFAULT_DARK_PRIMARY_RGB : DEFAULT_PRIMARY_RGB
  )

  // 外观分区状态 (仿 QAQ 体验)
  const [sections, setSections] = useState<AppearanceSection[]>([])
  const [isCreateSectionOpen, setIsCreateSectionOpen] = useState<boolean>(false)
  const [newSectionName, setNewSectionName] = useState<string>('')
  const [editingSection, setEditingSection] = useState<AppearanceSection | null>(null)
  const [editingName, setEditingName] = useState<string>('')
  const trackRef = useRef<HTMLDivElement>(null)

  // 并发守卫: 每次发起加载自增序号，响应返回时比对序号，过期结果直接丢弃
  const conflictSeqRef = useRef(0)
  const avatarsSeqRef = useRef(0)
  const sectionsSeqRef = useRef(0)
  const conflictDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 供 [modsData] 依赖的 effect 读取最新 selectedChar，避免闭包旧值
  const selectedCharRef = useRef(selectedChar)
  // 记录上一次的角色，用于区分「用户真的换了角色」与「组件重新挂载」
  const prevCharForSectionRef = useRef(selectedChar)

  const loadSections = async (charName: string) => {
    const seq = ++sectionsSeqRef.current
    if (!charName || charName === 'all') {
      setSections([])
      return
    }
    try {
      const list = await window.lz.getAppearanceSections(charName)
      if (seq === sectionsSeqRef.current && list && Array.isArray(list)) {
        setSections(list)
      }
    } catch (err) {
      console.error('Failed to load appearance sections:', err)
    }
  }

  useEffect(() => {
    selectedCharRef.current = selectedChar
    // 为什么比较上一次的角色：本组件在从详情页返回时会重新挂载，此 effect 会跟着跑一次，
    // 若无条件重置就会把刚恢复的外观分区冲掉，用户返回后又变成「全部分区」
    const charChanged = prevCharForSectionRef.current !== selectedChar
    prevCharForSectionRef.current = selectedChar
    if (charChanged) {
      setSelectedSectionId('all')
    }
    loadSections(selectedChar)
  }, [selectedChar, setSelectedSectionId])

  // 扫描检测所有冲突 (400ms 防抖合并密集刷新 + 序号守卫丢弃过期响应)
  const loadConflicts = () => {
    const seq = ++conflictSeqRef.current
    if (conflictDebounceRef.current) {
      clearTimeout(conflictDebounceRef.current)
    }
    conflictDebounceRef.current = setTimeout(async () => {
      try {
        const reps: any = await window.lz.detectConflicts()
        if (seq === conflictSeqRef.current && reps) setConflictsMap(reps)
      } catch (_) {}
    }, 400)
  }

  // 加载全量角色的缩略图/头像映射表 (序号守卫: 仅采纳最新一次结果)
  const loadCharacterAvatars = async () => {
    const seq = ++avatarsSeqRef.current
    try {
      const avatars = await window.lz.getCharacterAvatars?.()
      if (seq === avatarsSeqRef.current && avatars) {
        setCharacterAvatars(avatars)
      }
    } catch (err) {
      console.error('Failed to load character avatars:', err)
    }
  }

  useEffect(() => {
    loadConflicts()
    loadCharacterAvatars()
    const currentChar = selectedCharRef.current
    if (currentChar !== 'all') {
      loadSections(currentChar)
    }
  }, [modsData])

  // 卸载时清理挂起的防抖任务
  useEffect(() => {
    return () => {
      if (conflictDebounceRef.current) {
        clearTimeout(conflictDebounceRef.current)
      }
    }
  }, [])

  // 分区列表刷新后校验恢复的分区是否还存在：分区被删掉时不能让列表静默变空
  useEffect(() => {
    if (selectedSectionId === 'all' || selectedSectionId === 'base') return
    if (sections.length === 0) return
    if (!sections.some((s) => s.sectionId === selectedSectionId)) {
      setSelectedSectionId('all')
    }
  }, [sections, selectedSectionId, setSelectedSectionId])

  const baseSection = useMemo(() => {
    return sections.find((s) => s.sectionId === 'base') || null
  }, [sections])

  const officialSections = useMemo(() => {
    return sections.filter((s) => s.sectionId !== 'base' && (s.kind === 'skin' || s.official))
  }, [sections])

  const customSections = useMemo(() => {
    return sections.filter((s) => s.sectionId !== 'base' && s.kind !== 'skin' && !s.official)
  }, [sections])

  // sectionId -> 分区对象 查找表 (渲染前建一次 Map，避免模组卡片逐个 find)
  const sectionsById = useMemo(() => {
    const map = new Map<string, AppearanceSection>()
    for (const s of sections) {
      map.set(s.sectionId, s)
    }
    return map
  }, [sections])

  const totalCharMods = useMemo(() => {
    if (selectedChar === 'all') return 0
    return (modsData[selectedChar] || []).length
  }, [modsData, selectedChar])

  const scrollTrack = (direction: 'left' | 'right') => {
    if (trackRef.current) {
      const scrollAmount = direction === 'left' ? -260 : 260
      trackRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' })
    }
  }

  const [deletingSection, setDeletingSection] = useState<AppearanceSection | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [moveTargetMod, setMoveTargetMod] = useState<any | null>(null)

  const handleCreateSection = async () => {
    const name = newSectionName.trim()
    if (!name || selectedChar === 'all') return
    try {
      const res = await window.lz.createAppearanceSection(selectedChar, name)
      if (res && res.success) {
        setNewSectionName('')
        setIsCreateSectionOpen(false)
        await loadSections(selectedChar)
        if (res.section) {
          setSelectedSectionId(res.section.sectionId)
        }
        toast.success(`已成功创建外观分区【${name}】`)
      } else {
        toast.error(`创建分区失败: ${res?.error || '未知错误'}`)
      }
    } catch (err: any) {
      toast.error(`创建分区失败: ${err.message}`)
    }
  }

  const handleUpdateSection = async () => {
    if (!editingSection || selectedChar === 'all') return
    const name = editingName.trim()
    if (!name || name === editingSection.name) return
    try {
      const res = await window.lz.updateAppearanceSection(selectedChar, editingSection.sectionId, name)
      if (res && res.success) {
        setEditingSection(null)
        setEditingName('')
        await loadSections(selectedChar)
        toast.success(`已重命名分区为【${name}】`)
      } else {
        toast.error(`重命名分区失败: ${res?.error || '未知错误'}`)
      }
    } catch (err: any) {
      toast.error(`重命名分区失败: ${err.message}`)
    }
  }

  const handleDeleteSection = (sec: AppearanceSection) => {
    if (selectedChar === 'all') return
    setDeletingSection(sec)
  }

  const confirmDeleteSection = async () => {
    if (!deletingSection || selectedChar === 'all') return
    setIsDeleting(true)
    try {
      const res = await window.lz.deleteAppearanceSection(selectedChar, deletingSection.sectionId)
      if (res && res.success) {
        if (selectedSectionId === deletingSection.sectionId) {
          setSelectedSectionId('all')
        }
        toast.success(`已成功删除外观分区【${deletingSection.name}】`)
        setDeletingSection(null)
        onRefresh()
        await loadSections(selectedChar)
      } else {
        toast.error(`删除分区失败: ${res?.error || '未知错误'}`)
      }
    } catch (err: any) {
      toast.error(`删除分区失败: ${err.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleMoveModSection = useCallback(async (mod: any, nextSectionId: string) => {
    try {
      const res = await window.lz.setModAppearanceSection(mod.fullPath, nextSectionId)
      if (res?.success) {
        const targetSec = sections.find((s) => s.sectionId === nextSectionId)
        toast.success(`已将【${mod.name}】移动至【${targetSec?.name || '原角色'}】分区`)
        onRefresh()
        await loadSections(selectedChar)
      }
    } catch (err: any) {
      toast.error(`移动外观分区失败: ${err.message}`)
    }
  }, [sections, selectedChar, onRefresh, toast])

  // 切换角色时动态提取主色作为 --accent，若失败则平滑回退到默认 primary
  useEffect(() => {
    let cancelled = false
    const fallback = theme === 'dark' ? DEFAULT_DARK_PRIMARY_RGB : DEFAULT_PRIMARY_RGB
    const targetArt = baseSection?.coverUrl || characterAvatars[selectedChar]

    if (selectedChar === 'all' || !targetArt) {
      setCharacterAccentRgb(fallback)
      return
    }

    extractDominantColor(targetArt.replace(/^file:\/\//, ''))
      .then((rgb) => {
        if (!cancelled) {
          setCharacterAccentRgb(rgb || fallback)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [selectedChar, characterAvatars, baseSection, theme])

  const getModConflict = (charName: string, modName: string): ModConflictSummary | null => {
    const charReport = conflictsMap[charName]
    if (charReport && charReport.conflictsByMod && charReport.conflictsByMod[modName]?.hasConflict) {
      return charReport.conflictsByMod[modName]
    }
    return null
  }

  const totalConflictsCount = useMemo(() => {
    let count = 0
    for (const rep of Object.values(conflictsMap)) {
      if (rep && rep.allCollisions) {
        count += rep.allCollisions.length
      }
    }
    return count
  }, [conflictsMap])

  // 角色列表统计
  const characters = useMemo(() => {
    return Object.keys(modsData).map((name) => {
      const mods = modsData[name] || []
      const enabledCount = mods.filter((m) => m.enabled).length
      return {
        name,
        total: mods.length,
        enabled: enabledCount,
        avatarPath: characterAvatars[name] || null
      }
    })
  }, [modsData, characterAvatars])

  const charactersWithModsCount = useMemo(() => {
    return characters.filter((c) => c.total > 0).length
  }, [characters])

  const charactersEquippedCount = useMemo(() => {
    return characters.filter((c) => c.enabled > 0).length
  }, [characters])

  const filteredCharacters = useMemo(() => {
    let list = [...characters]

    // 1. 状态筛选
    if (charFilter === 'hasMods') {
      list = list.filter((c) => c.total > 0)
    } else if (charFilter === 'equipped') {
      list = list.filter((c) => c.enabled > 0)
    }

    // 2. 搜索检索
    if (searchChar) {
      const q = searchChar.toLowerCase().trim()
      list = list.filter((c) => c.name.toLowerCase().includes(q))
    }

    // 3. 排序策略
    if (charSort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    } else if (charSort === 'count') {
      list.sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total
        return a.name.localeCompare(b.name, 'zh-Hans-CN')
      })
    } else {
      // 默认排序: 已装备 (enabled > 0) -> 有mod待命 (total > 0) -> 未安装 (total === 0)
      list.sort((a, b) => {
        const tierA = a.enabled > 0 ? 0 : a.total > 0 ? 1 : 2
        const tierB = b.enabled > 0 ? 0 : b.total > 0 ? 1 : 2
        if (tierA !== tierB) return tierA - tierB

        if (tierA === 0) {
          // 已装备组内：优先按已装备数量倒序，再按总模组数倒序，再按名称
          if (b.enabled !== a.enabled) return b.enabled - a.enabled
          if (b.total !== a.total) return b.total - a.total
          return a.name.localeCompare(b.name, 'zh-Hans-CN')
        }
        if (tierA === 1) {
          // 有mod未装备组内：按总模组数倒序，再按名称
          if (b.total !== a.total) return b.total - a.total
          return a.name.localeCompare(b.name, 'zh-Hans-CN')
        }
        // 未安装组内：按中文拼音字母排序
        return a.name.localeCompare(b.name, 'zh-Hans-CN')
      })
    }

    return list
  }, [characters, searchChar, charFilter, charSort])

  // 模组列表筛选与排序
  const displayedMods = useMemo(() => {
    let list: any[] = []
    if (selectedChar === 'all') {
      for (const [charName, mods] of Object.entries(modsData)) {
        list.push(...mods.map((m) => ({ ...m, charName })))
      }
    } else {
      const mods = modsData[selectedChar] || []
      list = mods.map((m) => ({ ...m, charName: selectedChar }))
    }

    if (searchMod) {
      const q = searchMod.toLowerCase()
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.charName.toLowerCase().includes(q)
      )
    }

    if (conflictFilterOnly) {
      list = list.filter((m) => getModConflict(m.charName, m.name) !== null)
    }

    if (brokenFilterOnly) {
      list = list.filter((m) => Boolean(m.modBroken))
    }

    if (updateFilterOnly) {
      list = list.filter((m) => Boolean(updatesMap[m.fullPath]?.hasUpdate))
    }

    // 外观分区筛选 (仅在选中具体角色且不是 'all' 全部分区时过滤)
    if (selectedChar !== 'all' && selectedSectionId !== 'all') {
      if (selectedSectionId === 'base') {
        list = list.filter((m) => !m.appearanceSectionId || m.appearanceSectionId === 'base')
      } else {
        list = list.filter((m) => m.appearanceSectionId === selectedSectionId)
      }
    }

    // 模组排序策略
    if (modSort === 'status') {
      list.sort((a, b) => {
        if (b.enabled !== a.enabled) return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)
        if (b.mtime && a.mtime && b.mtime !== a.mtime) return b.mtime - a.mtime
        return a.name.localeCompare(b.name, 'zh-Hans-CN')
      })
    } else if (modSort === 'character') {
      list.sort((a, b) => {
        const charComp = a.charName.localeCompare(b.charName, 'zh-Hans-CN')
        if (charComp !== 0) return charComp
        if (b.enabled !== a.enabled) return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)
        return a.name.localeCompare(b.name, 'zh-Hans-CN')
      })
    } else if (modSort === 'time') {
      list.sort((a, b) => {
        const timeA = a.mtime || 0
        const timeB = b.mtime || 0
        if (timeB !== timeA) return timeB - timeA
        return a.name.localeCompare(b.name, 'zh-Hans-CN')
      })
    } else if (modSort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    }

    return list
  }, [modsData, selectedChar, searchMod, conflictFilterOnly, brokenFilterOnly, updateFilterOnly, updatesMap, conflictsMap, selectedSectionId, modSort])

  // 失效模组统计
  const brokenModsCount = useMemo(() => {
    let count = 0
    if (selectedChar === 'all') {
      for (const mods of Object.values(modsData)) {
        count += (mods || []).filter((m) => m.modBroken).length
      }
    } else {
      const mods = modsData[selectedChar] || []
      count = mods.filter((m) => m.modBroken).length
    }
    return count
  }, [modsData, selectedChar])

  // 已启用的失效模组统计
  const enabledBrokenModsCount = useMemo(() => {
    let count = 0
    if (selectedChar === 'all') {
      for (const mods of Object.values(modsData)) {
        count += (mods || []).filter((m) => m.modBroken && m.enabled).length
      }
    } else {
      const mods = modsData[selectedChar] || []
      count = mods.filter((m) => m.modBroken && m.enabled).length
    }
    return count
  }, [modsData, selectedChar])

  // 可更新模组统计
  const updatesCount = useMemo(() => {
    let count = 0
    for (const [fullPath, info] of Object.entries(updatesMap)) {
      if (info?.hasUpdate) {
        if (selectedChar === 'all') {
          count++
        } else {
          const charMods = modsData[selectedChar] || []
          if (charMods.some((m) => m.fullPath === fullPath)) count++
        }
      }
    }
    return count
  }, [updatesMap, modsData, selectedChar])

  // 批量检查 GameBanana 更新
  const handleCheckAllUpdates = async () => {
    setCheckingUpdates(true)
    try {
      let targetMods: any[] = []
      if (selectedChar === 'all') {
        for (const mods of Object.values(modsData)) {
          targetMods.push(...mods)
        }
      } else {
        targetMods = modsData[selectedChar] || []
      }

      // 一次 IPC 批量读取全部元数据，替代逐个 getModDetails 的 N+1 串行请求
      const paths = targetMods.map((m) => m.fullPath)
      const batch = paths.length > 0 ? await window.lz.getModsBatchDetails(paths) : {}

      const toCheck: Array<{ fullPath: string; modId: number; lastUpdated?: any; version?: string }> = []
      for (const m of targetMods) {
        const meta = batch?.[m.fullPath]
        if (meta?.modId) {
          toCheck.push({
            fullPath: m.fullPath,
            modId: Number(meta.modId),
            lastUpdated: m.mtime || meta.lastUpdated,
            version: meta.version
          })
        }
      }

      if (toCheck.length === 0) {
        toast.info('未找到可更新的模组', '请确保模组已关联 GameBanana 市场来源')
        return
      }

      toast.info('正在检查更新...', `共 ${toCheck.length} 个模组正在比对线上版本`)
      const res = await window.lz.checkAllModsUpdates(toCheck)
      if (res) {
        setUpdatesMap((prev) => ({ ...prev, ...res }))
        const found = Object.values(res).filter((r: any) => r?.hasUpdate).length
        if (found > 0) {
          toast.success('检查更新完成！', `发现 ${found} 个模组有新版本发布！`)
        } else {
          toast.success('检查更新完成', '所检测模组已均为最新版')
        }
      }
    } catch (err: any) {
      toast.error('检查更新失败', err.message)
    } finally {
      setCheckingUpdates(false)
    }
  }

  // 一键禁用全部失效模组
  const handleDisableAllBroken = async () => {
    let brokenToDisable: Array<{ charName: string; modName: string }> = []
    if (selectedChar === 'all') {
      for (const [charName, mods] of Object.entries(modsData)) {
        for (const m of mods || []) {
          if (m.modBroken && m.enabled) {
            brokenToDisable.push({ charName, modName: m.name })
          }
        }
      }
    } else {
      for (const m of modsData[selectedChar] || []) {
        if (m.modBroken && m.enabled) {
          brokenToDisable.push({ charName: selectedChar, modName: m.name })
        }
      }
    }

    if (brokenToDisable.length === 0) return

    try {
      for (const item of brokenToDisable) {
        await onToggleMod(item.charName, item.modName, false)
      }
      toast.success(`已卸装 ${brokenToDisable.length} 个失效模组`, '已恢复待命状态，防止进游戏报错')
    } catch (err: any) {
      toast.error('操作失败', err.message)
    }
  }

  const handleToggle = useCallback(async (charName: string, modName: string, currentState: boolean) => {
    const id = `${charName}::${modName}`
    setTogglingId(id)
    try {
      await onToggleMod(charName, modName, !currentState)
    } finally {
      setTogglingId(null)
    }
  }, [onToggleMod])

  // 以下回调经 useCallback 稳定引用，供 React.memo 的 ModCard 使用
  const handleCardSelect = useCallback((modFullPath: string) => {
    onSelectMod(modFullPath)
  }, [onSelectMod])

  const handleOpenMoveMod = useCallback((mod: any) => {
    setMoveTargetMod(mod)
  }, [])


  const totalEnabledInAll = useMemo(() => {
    let count = 0
    for (const mods of Object.values(modsData)) {
      count += (mods || []).filter((m) => m.enabled).length
    }
    return count
  }, [modsData])

  const totalModsInAll = useMemo(() => {
    return characters.reduce((acc, c) => acc + c.total, 0)
  }, [characters])

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* 侧边栏：角色列表 (玻璃拟态仅在此局部与弹窗使用，卡片高度压缩到约 56px) */}
      <aside className="w-72 bg-surface/80 border-r border-border backdrop-blur-xl flex flex-col shrink-0 select-none z-10 shadow-xs transition-all duration-fast">
        {/* 侧边栏顶部控制器 */}
        <div className="p-3 border-b border-border space-y-2 bg-surface/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text tracking-wide flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-primary" />
              <span>角色分类</span>
              <Badge variant="primary" size="sm">
                {filteredCharacters.length} / {characters.length}
              </Badge>
            </span>

            {/* 列表 / 网格 视图切换 */}
            <div className="flex items-center bg-surface-2 p-0.5 rounded-control border border-border">
              <button
                type="button"
                onClick={() => setSidebarMode('list')}
                title="图文列表模式"
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  sidebarMode === 'list'
                    ? 'bg-surface text-primary shadow-2xs'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSidebarMode('grid')}
                title="网格头像模式"
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  sidebarMode === 'grid'
                    ? 'bg-surface text-primary shadow-2xs'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 角色检索输入框 */}
          <SearchField
            appearance="subtle"
            value={searchChar}
            onChange={setSearchChar}
            placeholder="快速检索角色..."
            aria-label="快速检索角色"
            className="w-full"
          />

          {/* 筛选与排序条：中性灰底色，选中激活主色 */}
          <div className="flex items-center justify-between gap-1 pt-0.5">
            <div className="flex items-center bg-surface-2 p-0.5 rounded-control border border-border text-[10px] font-medium">
              <button
                type="button"
                onClick={() => setCharFilter('all')}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  charFilter === 'all'
                    ? 'bg-primary/10 text-primary font-bold border border-primary/20 shadow-2xs'
                    : 'text-text-muted hover:text-text border border-transparent'
                }`}
                title="显示所有角色"
              >
                全部
              </button>
              <button
                type="button"
                onClick={() => setCharFilter('hasMods')}
                className={`px-1.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                  charFilter === 'hasMods'
                    ? 'bg-primary/10 text-primary font-bold border border-primary/20 shadow-2xs'
                    : 'text-text-muted hover:text-text border border-transparent'
                }`}
                title="仅显示已安装模组的角色"
              >
                有Mod ({charactersWithModsCount})
              </button>
              <button
                type="button"
                onClick={() => setCharFilter('equipped')}
                className={`px-1.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                  charFilter === 'equipped'
                    ? 'bg-primary/10 text-primary font-bold border border-primary/20 shadow-2xs'
                    : 'text-text-muted hover:text-text border border-transparent'
                }`}
                title="仅显示当前已装备模组的角色"
              >
                已装载 ({charactersEquippedCount})
              </button>
            </div>

            {/* 排序切换 */}
            <button
              type="button"
              onClick={() => {
                if (charSort === 'default') setCharSort('count')
                else if (charSort === 'count') setCharSort('name')
                else setCharSort('default')
              }}
              className="flex items-center space-x-1 px-2 py-1 rounded-control bg-surface-2 hover:bg-surface border border-border text-[10px] font-medium text-text-muted hover:text-text transition-colors cursor-pointer"
              title="切换排序规则：默认(已装备优先) / 数量 / 名称"
            >
              <ArrowUpDown className="w-3 h-3 text-primary" />
              <span>
                {charSort === 'default' ? '默认' : charSort === 'count' ? '数量' : '名称'}
              </span>
            </button>
          </div>
        </div>

        {/* 角色卡片列表 (高度压缩至约 56px) */}
        <ScrollContainer className="flex-1 p-2 space-y-1">
          {/* 全部角色条目 */}
          <button
            type="button"
            onClick={() => setSelectedChar('all')}
            className={`w-full h-11 flex items-center justify-between px-2.5 rounded-control text-xs font-semibold transition-all duration-fast group border text-left cursor-pointer ${
              selectedChar === 'all'
                ? 'bg-primary/10 border-primary text-primary shadow-xs ring-1 ring-primary/25'
                : 'bg-surface hover:bg-surface-2 text-text border-border hover:border-primary/40'
            }`}
          >
            <div className="flex items-center space-x-2.5 truncate">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-transform duration-fast group-hover:scale-105 shadow-2xs ${
                  selectedChar === 'all'
                    ? 'bg-primary text-primary-fg border-primary'
                    : 'bg-surface-2 text-text-muted border-border'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </div>
              <span className="truncate font-bold tracking-wide">
                全部角色
              </span>
            </div>

            <div
              className={`flex items-center space-x-0.5 text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 border ${
                selectedChar === 'all'
                  ? 'bg-primary/15 text-primary border-primary/30 font-bold'
                  : 'bg-surface-2 text-text-muted border-border'
              }`}
              title="已装载 / 总数"
            >
              <span className="font-bold">{totalEnabledInAll}</span>
              <span className="opacity-40">/</span>
              <span>{totalModsInAll}</span>
            </div>
          </button>

          {sidebarMode === 'list' ? (
            /* 1. 紧凑型图文列表 (展示 已装载/总数) */
            <div className="space-y-1 pt-0.5">
              {filteredCharacters.map((c) => {
                const isSelected = selectedChar === c.name
                const hasActive = c.enabled > 0
                const hasMods = c.total > 0

                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setSelectedChar(c.name)}
                    className={`w-full h-11 flex items-center justify-between px-2.5 rounded-control text-xs font-semibold transition-all duration-fast group border text-left cursor-pointer ${
                      isSelected
                        ? 'bg-primary/10 border-primary text-primary shadow-xs ring-1 ring-primary/25'
                        : 'bg-surface hover:bg-surface-2 text-text border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <CompactCharacterAvatar
                        src={c.avatarPath}
                        name={c.name}
                        hasActive={hasActive}
                        isSelected={isSelected}
                        hasMods={hasMods}
                        className="w-8 h-8"
                      />
                      <span className={`truncate tracking-wide font-title font-bold text-xs ${
                        !hasMods && !isSelected ? 'text-text-muted' : ''
                      }`}>
                        {c.name}
                      </span>
                    </div>

                    <div
                      className={`flex items-center space-x-0.5 text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 border ${
                        isSelected
                          ? 'bg-primary/15 text-primary border-primary/30 font-bold'
                          : hasActive
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold'
                          : hasMods
                          ? 'bg-surface-2 text-text-muted border-border'
                          : 'bg-surface-2/60 text-text-muted/60 border-border/50'
                      }`}
                      title="已装载 / 总数"
                    >
                      <span className={hasActive ? 'font-bold' : ''}>{c.enabled}</span>
                      <span className="opacity-40">/</span>
                      <span>{c.total}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            /* 2. 紧凑型头像网格视图 */
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              {filteredCharacters.map((c) => {
                const isSelected = selectedChar === c.name
                const hasActive = c.enabled > 0
                const hasMods = c.total > 0

                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setSelectedChar(c.name)}
                    className={`group relative flex flex-col p-1.5 rounded-control border transition-all text-left cursor-pointer overflow-hidden ${
                      isSelected
                        ? 'bg-primary/10 border-primary ring-1 ring-primary/25 shadow-xs'
                        : 'bg-surface hover:bg-surface-2 border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-surface-2 border border-border">
                      <CompactCharacterAvatar
                        src={c.avatarPath}
                        name={c.name}
                        hasActive={hasActive}
                        isSelected={isSelected}
                        hasMods={hasMods}
                        className="w-full h-full rounded-none border-0"
                      />

                      {/* 计数指示 */}
                      <div
                        className="absolute top-1 right-1 flex items-center space-x-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-slate-900/80 text-white backdrop-blur-xs font-bold"
                        title="已装载 / 总数"
                      >
                        <span className={hasActive ? 'text-amber-300' : ''}>{c.enabled}</span>
                        <span className="opacity-40">/</span>
                        <span>{c.total}</span>
                      </div>
                    </div>

                    <div className="mt-1 px-0.5 flex items-center justify-between">
                      <span className={`text-xs font-title font-bold truncate ${isSelected ? 'text-primary' : 'text-text'}`}>
                        {c.name}
                      </span>
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 ml-1" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollContainer>
      </aside>

      {/* 主展示区：受 --accent 动态强调色驱动，顶部带角色立绘模糊氛围层，列表区纯色底 */}
      <main
        style={{ '--accent': characterAccentRgb } as React.CSSProperties}
        className="flex-1 flex flex-col overflow-hidden bg-transparent relative transition-colors duration-normal"
      >
        {/* 氛围背景层：当前角色立绘模糊并压暗，仅作为顶部视觉衬底 */}
        {selectedChar !== 'all' && (baseSection?.coverUrl || characterAvatars[selectedChar]) && (
          <div className="absolute top-0 left-0 right-0 h-48 overflow-hidden pointer-events-none z-0">
            <img
              src={toFileUrl(baseSection?.coverUrl || characterAvatars[selectedChar])}
              alt=""
              className="w-full h-full object-cover object-top filter blur-3xl opacity-20 dark:opacity-30 scale-125 transition-all duration-slow"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-bg/80 to-bg" />
          </div>
        )}

        {/* 顶部二级导航 / 角色 Banner (单选互斥保护、搜索与操作) */}
        <div className="h-16 px-6 border-b border-border flex items-center justify-between shrink-0 bg-surface/70 backdrop-blur-md relative z-20">
          <div className="flex items-center space-x-3.5">
            {/* 角色微缩预览 */}
            {selectedChar !== 'all' && characterAvatars[selectedChar] ? (
              <div className="w-9 h-9 rounded-control overflow-hidden border border-border shadow-xs shrink-0 bg-surface-2">
                <img
                  src={toFileUrl(characterAvatars[selectedChar])}
                  alt={selectedChar}
                  className="w-full h-full object-cover object-top"
                />
              </div>
            ) : null}

            <div className="flex items-center space-x-2.5">
              <h2 className="text-base font-title font-bold text-text tracking-wide">
                {selectedChar === 'all' ? '全部角色模组' : selectedChar}
              </h2>
              <Badge variant="accent" size="sm">
                {displayedMods.length} 个项目
              </Badge>
            </div>

            {/* 冲突过滤按钮 */}
            {totalConflictsCount > 0 && (
              <button
                type="button"
                onClick={() => setConflictFilterOnly(!conflictFilterOnly)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-control text-xs font-bold transition-colors cursor-pointer ${
                  conflictFilterOnly
                    ? 'bg-danger text-white shadow-xs'
                    : 'bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>冲突过滤 ({totalConflictsCount})</span>
              </button>
            )}

            {/* 失效模组过滤按钮 */}
            {brokenModsCount > 0 && (
              <button
                type="button"
                onClick={() => setBrokenFilterOnly(!brokenFilterOnly)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-control text-xs font-bold transition-colors cursor-pointer ${
                  brokenFilterOnly
                    ? 'bg-danger text-white shadow-xs'
                    : 'bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20'
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>失效 ({brokenModsCount})</span>
              </button>
            )}

            {/* 一键卸装失效模组 */}
            {enabledBrokenModsCount > 0 && (
              <button
                type="button"
                onClick={handleDisableAllBroken}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-control text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
                title="一键卸下所有已启用的失效模组，防止游戏报错或渲染异常"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>卸装失效 ({enabledBrokenModsCount})</span>
              </button>
            )}

            {/* 可更新模组过滤按钮 */}
            {updatesCount > 0 && (
              <button
                type="button"
                onClick={() => setUpdateFilterOnly(!updateFilterOnly)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-control text-xs font-bold transition-colors cursor-pointer ${
                  updateFilterOnly
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                }`}
              >
                <ArrowUpCircle className="w-3.5 h-3.5" />
                <span>可更新 ({updatesCount})</span>
              </button>
            )}
          </div>

          {/* 搜索、模组排序、批量检查更新与目录刷新按钮 */}
          <div className="flex items-center space-x-2.5">
            <div className="w-48">
              <SearchField
                appearance="composer"
                value={searchMod}
                onChange={setSearchMod}
                placeholder="搜索模组名称..."
                aria-label="搜索模组名称"
                className="w-full"
              />
            </div>

            {/* 模组排序下拉 */}
            <div className="w-36">
              <Select
                value={modSort}
                onChange={(val) => setModSort(val as any)}
                size="md"
                prefixIcon={<ArrowUpDown className="w-3.5 h-3.5 text-primary" />}
                options={[
                  { value: 'status', label: '已装备优先' },
                  ...(selectedChar === 'all' ? [{ value: 'character', label: '按所属角色' }] : []),
                  { value: 'time', label: '最新修改' },
                  { value: 'name', label: '名称 A-Z' },
                  { value: 'default', label: '默认顺序' }
                ]}
                className="w-full text-xs"
                popupClassName="w-36"
                title="切换模组列表排序规则"
              />
            </div>

            {/* 批量检查线上更新按钮 */}
            <Button
              variant="secondary"
              onClick={handleCheckAllUpdates}
              disabled={checkingUpdates || loading}
              title="检查 GameBanana 线上模组是否有新版本发布"
              className="px-2.5 py-2 text-xs font-medium"
              icon={
                <ArrowUpCircle
                  className={`w-3.5 h-3.5 text-amber-500 ${
                    checkingUpdates ? 'animate-spin' : ''
                  }`}
                />
              }
            >
              <span className="hidden sm:inline">检查更新</span>
            </Button>

            {/* 全局仅保留此一处 Mod 目录扫描刷新按钮 */}
            <Button
              variant="secondary"
              onClick={() => {
                onRefresh()
                loadConflicts()
              }}
              disabled={loading}
              title="重新扫描 Mod 目录"
              className="p-2"
              icon={
                <RefreshCw
                  className={`w-3.5 h-3.5 text-text-muted hover:text-primary ${
                    loading ? 'animate-spin' : ''
                  }`}
                />
              }
            />
          </div>
        </div>

        {/* 外观分区栏 (仿 QAQ 1:1 设计，仅在进入具体角色后展示) */}
        {selectedChar !== 'all' && (
          <div className="px-6 py-2.5 border-b border-border bg-surface/75 backdrop-blur-md shrink-0 relative z-20 space-y-2">
            {/* 标题栏与统计提示 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-text tracking-wide flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  <span>外观分区</span>
                </span>
                <span className="text-[11px] text-text-muted">
                  共 {sections.length} 个分区
                </span>
                {selectedSectionId !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedSectionId('all')}
                    className="text-[10px] text-primary hover:underline ml-2.5 font-medium cursor-pointer"
                  >
                    显示全部 ({totalCharMods})
                  </button>
                )}
              </div>
            </div>

            {/* 分区横向滚动轨道 */}
            <div className="flex items-center">
              {/* 向左滚动箭头 */}
              <button
                type="button"
                onClick={() => scrollTrack('left')}
                className="w-5 h-14 flex items-center justify-center rounded-control bg-surface-2 hover:bg-surface border border-border text-text-muted hover:text-text transition-colors shrink-0 cursor-pointer shadow-2xs mr-1.5"
                title="向左滚动"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {/* 滚动容器 */}
              <div ref={trackRef} className="flex-1 flex items-center space-x-3 overflow-x-auto scrollbar-none py-1">
                {/* 1. 原角色卡片 */}
                <button
                  type="button"
                  onClick={() => setSelectedSectionId(selectedSectionId === 'base' ? 'all' : 'base')}
                  className={`relative flex items-center space-x-3 px-3 py-2 rounded-card border transition-all text-left cursor-pointer shrink-0 w-48 select-none ${
                    selectedSectionId === 'base'
                      ? 'bg-primary/10 border-primary ring-2 ring-primary/25 shadow-xs text-primary'
                      : 'bg-surface hover:bg-surface-2 border-border hover:border-primary/40 text-text'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border bg-surface-2">
                    {(baseSection?.coverUrl || characterAvatars[selectedChar]) ? (
                      <img
                        src={toFileUrl(baseSection?.coverUrl || characterAvatars[selectedChar])}
                        alt={selectedChar}
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-xs bg-primary/10 text-primary">
                        {selectedChar.slice(0, 1)}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-title font-bold truncate">原角色</span>
                    <span className="text-[10px] text-text-muted">Original</span>
                    <span className="text-[10px] text-text-muted mt-0.5 font-mono">
                      <span className={baseSection && (baseSection.enabledCount || 0) > 0 ? 'font-bold text-emerald-600' : ''}>
                        {baseSection?.enabledCount || 0}
                      </span> 启用
                      <span className="mx-1 opacity-40">/</span>
                      <span>{baseSection?.totalCount || 0} Mod</span>
                    </span>
                  </div>
                </button>

                {/* 2. 官方时装/皮肤卡片列表 */}
                {officialSections.map((sec) => {
                  const isSelected = selectedSectionId === sec.sectionId
                  return (
                    <div
                      key={sec.sectionId}
                      onClick={() => setSelectedSectionId(isSelected ? 'all' : sec.sectionId)}
                      className={`group/sec relative flex items-center space-x-3 px-3 py-2 rounded-card border transition-all text-left cursor-pointer shrink-0 w-48 select-none ${
                        isSelected
                          ? 'bg-primary/10 border-primary ring-2 ring-primary/25 shadow-xs text-primary'
                          : 'bg-surface hover:bg-surface-2 border-border hover:border-primary/40 text-text'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border bg-surface-2 flex items-center justify-center">
                        {sec.coverUrl ? (
                          <img
                            src={toFileUrl(sec.coverUrl)}
                            alt={sec.name}
                            className="w-full h-full object-cover object-top"
                          />
                        ) : (
                          <Sparkles className="w-4 h-4 text-primary" />
                        )}
                      </div>

                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-title font-bold truncate" title={sec.name}>
                          {sec.name}
                        </span>
                        <span className="text-[10px] text-text-muted truncate mt-0.5" title={sec.nameEn || ''}>
                          {sec.nameEn || ''}
                        </span>
                        <span className="text-[10px] text-text-muted mt-0.5 font-mono">
                          <span className={(sec.enabledCount || 0) > 0 ? 'font-bold text-emerald-600' : ''}>
                            {sec.enabledCount || 0}
                          </span> 启用
                          <span className="mx-1 opacity-40">/</span>
                          <span>{sec.totalCount || 0} Mod</span>
                        </span>
                      </div>
                    </div>
                  )
                })}

                {/* 3. 自定义分区卡片列表 */}
                {customSections.map((sec) => {
                  const isSelected = selectedSectionId === sec.sectionId
                  return (
                    <div
                      key={sec.sectionId}
                      onClick={() => setSelectedSectionId(isSelected ? 'all' : sec.sectionId)}
                      className={`group/sec relative flex items-center space-x-3 px-3 py-2 rounded-card border transition-all text-left cursor-pointer shrink-0 w-48 select-none ${
                        isSelected
                          ? 'bg-primary/10 border-primary ring-2 ring-primary/25 shadow-xs text-primary'
                          : 'bg-surface hover:bg-surface-2 border-border hover:border-primary/40 text-text'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border bg-surface-2 flex items-center justify-center">
                        {sec.coverUrl ? (
                          <img
                            src={toFileUrl(sec.coverUrl)}
                            alt={sec.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Sparkles className="w-4 h-4 text-primary" />
                        )}
                      </div>

                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-title font-bold truncate" title={sec.name}>
                          {sec.name}
                        </span>
                        <span className="text-[10px] text-text-muted">自定义分区</span>
                        <span className="text-[10px] text-text-muted mt-0.5 font-mono">
                          <span className={(sec.enabledCount || 0) > 0 ? 'font-bold text-emerald-600' : ''}>
                            {sec.enabledCount || 0}
                          </span> 启用
                          <span className="mx-1 opacity-40">/</span>
                          <span>{sec.totalCount || 0} Mod</span>
                        </span>
                      </div>

                      {/* 悬浮操作按钮 */}
                      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover/sec:opacity-100 transition-opacity flex items-center space-x-0.5 bg-surface/90 backdrop-blur-xs p-0.5 rounded border border-border shadow-xs">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingSection(sec)
                            setEditingName(sec.name)
                          }}
                          className="p-1 text-text-muted hover:text-primary transition-colors cursor-pointer"
                          title="重命名分区"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteSection(sec)
                          }}
                          className="p-1 text-text-muted hover:text-danger transition-colors cursor-pointer"
                          title="删除分区"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* 3. 新增分区卡片 */}
                <button
                  type="button"
                  onClick={() => setIsCreateSectionOpen(true)}
                  className="flex flex-col items-center justify-center px-4 py-2 rounded-card border-2 border-dashed border-border hover:border-primary/60 hover:bg-primary/5 text-text-muted hover:text-primary transition-all cursor-pointer shrink-0 w-36 h-[58px] select-none group/add"
                >
                  <div className="flex items-center space-x-1 font-bold text-xs">
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <HoverHint content="名称与封面自定义">
                      <span>新增分区</span>
                    </HoverHint>
                  </div>
                </button>
              </div>

              {/* 向右滚动箭头 */}
              <button
                type="button"
                onClick={() => scrollTrack('right')}
                className="w-5 h-14 flex items-center justify-center rounded-control bg-surface-2 hover:bg-surface border border-border text-text-muted hover:text-text transition-colors shrink-0 cursor-pointer shadow-2xs ml-1.5"
                title="向右滚动"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 模组展示流 (纯色底，清晰高效，保证内容高可读性) */}
        <ScrollContainer className="flex-1 p-6 bg-surface/50 relative z-10">
          {displayedMods.length === 0 ? (
            /* 空状态 */
            <div className="h-full flex flex-col items-center justify-center text-text-muted p-8 space-y-4">
              {selectedChar !== 'all' && (baseSection?.coverUrl || characterAvatars[selectedChar]) ? (
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-border shadow-md ring-4 ring-primary/10 bg-surface">
                  <img
                    src={toFileUrl(baseSection?.coverUrl || characterAvatars[selectedChar])}
                    alt={selectedChar}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-surface border border-border text-primary shadow-xs">
                  <FolderOpen className="w-10 h-10 stroke-[1.2]" />
                </div>
              )}

              <div className="text-center max-w-md space-y-1.5">
                <div className="text-sm font-bold text-text">
                  {conflictFilterOnly
                    ? '未发现任何资源冲突'
                    : searchMod
                    ? `未找到匹配「${searchMod}」的模组`
                    : selectedChar === 'all'
                    ? '未找到匹配的模组'
                    : `【${selectedChar}】尚未安装任何模组`}
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  {conflictFilterOnly
                    ? '当前角色下的所有模组均正常运行，无文件冲突'
                    : selectedChar === 'all'
                    ? '全库暂无符合条件的模组，可直接拖拽 7z / zip / rar 压缩包到窗口自动导入'
                    : `您可以直接拖拽专属 Mod 压缩包至窗口导入，或前往 Mod 市场搜索下载【${selectedChar}】的外观模组！`}
                </p>
              </div>

              {/* 空状态操作按钮（描边次要样式，去掉多余的重复刷新按键） */}
              <div className="flex items-center gap-3 pt-2">
                {selectedChar !== 'all' && onNavigateTab && (
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => onNavigateTab('gamebanana')}
                    icon={<Globe className="w-3.5 h-3.5" />}
                  >
                    前往 Mod 市场查找
                  </Button>
                )}

                {selectedChar !== 'all' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => window.lz.openCharacterFolder(selectedChar)}
                    icon={<Folder className="w-3.5 h-3.5 text-primary" />}
                  >
                    打开角色模组目录
                  </Button>
                )}
              </div>
            </div>
          ) : (
            /* 模组卡片网格 */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {displayedMods.map((mod) => (
                <ModCard
                  key={`${mod.charName}::${mod.name}`}
                  mod={mod}
                  isToggling={togglingId === `${mod.charName}::${mod.name}`}
                  conflict={getModConflict(mod.charName, mod.name)}
                  updateItem={updatesMap[mod.fullPath]}
                  selectedChar={selectedChar}
                  sections={sections}
                  sectionsById={sectionsById}
                  onSelect={handleCardSelect}
                  onToggle={handleToggle}
                  onMoveSection={handleMoveModSection}
                  onOpenMove={handleOpenMoveMod}
                />
              ))}
            </div>
          )}
        </ScrollContainer>
      </main>

      {/* 新建外观分区模态框 */}

      <Modal
        isOpen={isCreateSectionOpen}
        onClose={() => {
          setIsCreateSectionOpen(false)
          setNewSectionName('')
        }}
        title={
          <span className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-primary" />
            <span>为【{selectedChar}】新建外观分区</span>
          </span>
        }
        confirmText="创建分区"
        cancelText="取消"
        onConfirm={handleCreateSection}
      >
        <div className="space-y-3">
          <label className="text-xs font-semibold text-text">
            分区名称
          </label>
          <Input
            placeholder="例如：泳装 / 赛车娘 / 机甲风"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSection()
            }}
          />

          {/* 常用预设标签推荐 */}
          <div>
            <span className="text-[11px] text-text-muted mb-1.5 block">快捷选择标签：</span>
            <div className="flex flex-wrap gap-1.5">
              {['泳装', '夏日', '睡衣', '礼服', '机甲风', '兔女郎', '同人二创', '官方改色'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setNewSectionName(tag)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                    newSectionName === tag
                      ? 'bg-primary text-primary-fg border-primary font-bold shadow-2xs'
                      : 'bg-surface-2 hover:bg-surface border-border text-text-muted hover:text-text'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* 重命名外观分区模态框 */}
      <Modal
        isOpen={Boolean(editingSection)}
        onClose={() => {
          setEditingSection(null)
          setEditingName('')
        }}
        title={
          <span className="flex items-center space-x-2">
            <Edit2 className="w-4 h-4 text-primary" />
            <span>重命名外观分区</span>
          </span>
        }
        maxWidth="max-w-sm"
        confirmText="保存"
        cancelText="取消"
        onConfirm={handleUpdateSection}
      >
        <div className="space-y-2">
          <label className="text-xs font-semibold text-text">
            新名称
          </label>
          <Input
            placeholder="请输入新分区名称"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleUpdateSection()
            }}
          />
        </div>
      </Modal>

      {/* 删除外观分区确认模态框 (纯主题定制，杜绝 Win 原生确认框) */}
      <Modal
        isOpen={Boolean(deletingSection)}
        onClose={() => setDeletingSection(null)}
        title="确认删除外观分区"
        variant="danger"
        confirmText="确认删除"
        cancelText="取消"
        loading={isDeleting}
        onConfirm={confirmDeleteSection}
        description={`确定要删除外观分区【${deletingSection?.name}】吗？\n删除后该分区下的所有模组将自动回退到【原角色】分区，不会删除任何模组文件。`}
      />

      {/* 模组移动分类弹窗 */}
      {moveTargetMod && (
        <MoveModModal
          isOpen={!!moveTargetMod}
          onClose={() => setMoveTargetMod(null)}
          modName={moveTargetMod.name}
          modFullPath={moveTargetMod.fullPath}
          currentCharacter={moveTargetMod.charName}
          onSuccess={() => {
            onRefresh()
            loadConflicts()
          }}
        />
      )}
    </div>
  )
}
