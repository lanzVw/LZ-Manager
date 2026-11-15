import React, { useState, useEffect, useRef } from 'react'
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
  Save,
  Check,
  Tag,
  Crop as CropIcon,
  AlertTriangle,
  Sliders,
  RotateCcw,
  ToggleLeft,
  ToggleRight,
  Zap,
  Cpu,
  Globe,
  ExternalLink,
  ShoppingBag,
  Download,
  Layers,
  AlertOctagon,
  ArrowUpCircle,
  RefreshCw,
  Copy,
  FolderInput,
  Languages,
  Edit3,
  Keyboard,
  SlidersHorizontal,
  Wrench,
  History,
  Play,
  Pencil
} from 'lucide-react'
import { parseIniHotkeys, ParsedHotkey } from '../overlay/iniParser'
import { getHotkeyDescription, getHotkeyTypeLabel, isModifierKey, isNonKeyboardHotkey } from '../overlay/hotkeyPresentation'
import { toFileUrl } from '../utils/fileUrl'
import { ModDetailedInfo, ModConflictSummary, ModPersistInfo, ModPersistVariable, AppearanceSection, ToggleModResult } from '../../core/types'
import { CropDialog } from '../components/CropDialog'
import { MoveModModal } from '../components/MoveModModal'
import { FixResultModal } from '../components/mods/FixResultModal'
import { BaseModPanel } from '../components/mods/BaseModPanel'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Select } from '../components/ui/Select'
import { Switch } from '../components/ui/Switch'
import { Modal } from '../components/ui/Modal'
import { HoverHint } from '../components/ui/HoverHint'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { useToast } from '../components/ui/Toast'
import { GameBananaDetailDrawer } from '../components/GameBananaDetailDrawer'

interface ModDetailPageProps {
  modFullPath: string
  activeGame?: any
  onBack: () => void
  onToggleActive: (charName: string, modName: string, enabled: boolean) => Promise<ToggleModResult>
  onNavigateToMarket?: (modId?: number, searchKeyword?: string, searchScope?: 'all' | 'author') => void
  onDeleteSuccess?: () => void
  onInstallSuccess?: (installedPath?: string) => void
  /** 重命名成功后目录路径已变，交给上层更新导航目标 */
  onRenamed?: (newPath: string) => void | Promise<void>
}

const formatDateTime = (val?: string | number | Date | null): string => {
  if (!val) return '暂无记录'
  let d: Date

  if (val instanceof Date) {
    d = val
  } else if (typeof val === 'number') {
    d = val < 10000000000 ? new Date(val * 1000) : new Date(val)
  } else if (typeof val === 'string') {
    const trimmed = val.trim()
    if (!trimmed) return '暂无记录'
    if (/^\d{10,13}$/.test(trimmed)) {
      const num = Number(trimmed)
      d = num < 10000000000 ? new Date(num * 1000) : new Date(num)
    } else {
      const normalized = trimmed.replace(/(\.\d{3})\d+Z?$/i, '$1Z')
      d = new Date(normalized)
      if (isNaN(d.getTime())) {
        d = new Date(trimmed)
      }
    }
  } else {
    return '暂无记录'
  }

  if (isNaN(d.getTime())) {
    return String(val)
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const Y = d.getFullYear()
  const M = pad(d.getMonth() + 1)
  const D = pad(d.getDate())
  const h = pad(d.getHours())
  const m = pad(d.getMinutes())
  const s = pad(d.getSeconds())

  return `${Y}-${M}-${D} ${h}:${m}:${s}`
}

// 热键元数据合并（persistInfo 有/无两分支此前各写一份约 40 行近似逻辑，现统一入口）
// - persistVariables 有值时：按变量名/热键名匹配 PersistBridge 变量，合并当前值、中文别名与档位表
// - 无论如何：再套用全局 variableAliases / hotkeyTranslations / valueLabels 元数据
// 就地合并并返回 hotkeys（与原实现一致，避免额外复制数组）
const mergeHotkeyMeta = (
  base: {
    hotkeys: ParsedHotkey[]
    variableAliases: Record<string, string>
    hotkeyTranslations: Record<string, string>
    valueLabels: Record<string, string>
  },
  persistVariables?: ModPersistVariable[]
): ParsedHotkey[] => {
  for (const h of base.hotkeys) {
    let pv: ModPersistVariable | undefined
    if (persistVariables && persistVariables.length > 0) {
      const hVar = h.variable?.toLowerCase()
      pv = persistVariables.find(
        (v) =>
          (hVar && (v.canonicalName || '').toLowerCase() === hVar) ||
          (v.name || '').toLowerCase() === h.name.toLowerCase()
      )
    }

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

    if (base.hotkeyTranslations[h.name]) h.chineseName = base.hotkeyTranslations[h.name]
    if (h.variable && base.variableAliases[h.variable]) h.chineseName = base.variableAliases[h.variable]
    if (h.description && base.hotkeyTranslations[h.description]) h.chineseDescription = base.hotkeyTranslations[h.description]
    const varLabelMap = (h.variable && base.valueLabels[h.variable]) || {}
    if (Object.keys(varLabelMap).length > 0) {
      h.valueLabels = { ...(h.valueLabels || {}), ...varLabelMap }
    }
  }

  return base.hotkeys
}

export const ModDetailPage: React.FC<ModDetailPageProps> = ({
  modFullPath,
  activeGame,
  onBack,
  onToggleActive,
  onNavigateToMarket,
  onDeleteSuccess,
  onInstallSuccess,
  onRenamed
}) => {
  const toast = useToast()
  const [details, setDetails] = useState<ModDetailedInfo | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [isMarketDrawerOpen, setIsMarketDrawerOpen] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0)
  // 主图加载失败兜底：裂图时回退到占位块；切换 Mod / 切图 / 重载详情后自动复位
  const [mainImageError, setMainImageError] = useState<boolean>(false)
  const [deleteImageTarget, setDeleteImageTarget] = useState<string | null>(null)
  const [showDeleteModModal, setShowDeleteModModal] = useState<boolean>(false)
  const [deletingMod, setDeletingMod] = useState<boolean>(false)
  const [author, setAuthor] = useState<string>('')
  const [version, setVersion] = useState<string>('Version 1.0')
  const [description, setDescription] = useState<string>('')
  const [sourceUrl, setSourceUrl] = useState<string>('')
  const [copySuccess, setCopySuccess] = useState<boolean>(false)
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
  const [editingVar, setEditingVar] = useState<ModPersistVariable | null>(null)
  const [editingAliasName, setEditingAliasName] = useState<string>('')
  const [savingAlias, setSavingAlias] = useState<boolean>(false)
  const [translatingConfig, setTranslatingConfig] = useState<boolean>(false)
  const [parsedHotkeys, setParsedHotkeys] = useState<ParsedHotkey[]>([])
  const [triggeringHotkey, setTriggeringHotkey] = useState<string | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'config' | 'base'>('overview')

  // 外观分区列表状态
  const [sections, setSections] = useState<AppearanceSection[]>([])
  const [changingSection, setChangingSection] = useState<boolean>(false)

  // 失效状态与原因
  const [isBroken, setIsBroken] = useState<boolean>(false)
  const [brokenReason, setBrokenReason] = useState<string>('')
  const [savingBroken, setSavingBroken] = useState<boolean>(false)

  // 线上作者更新检测
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false)
  const [updateInfo, setUpdateInfo] = useState<any | null>(null)

  // 从市场补全截图时的加载态
  const [fetchingPreviews, setFetchingPreviews] = useState<boolean>(false)

  // 移动模组到其他角色分类弹窗
  const [showMoveModal, setShowMoveModal] = useState<boolean>(false)

  // 重命名 Mod（名称即磁盘目录名）
  const [showRenameModal, setShowRenameModal] = useState<boolean>(false)
  const [renameInput, setRenameInput] = useState<string>('')
  const [renameOriginal, setRenameOriginal] = useState<string>('')
  const [renameBusy, setRenameBusy] = useState<boolean>(false)

  // Mod 修复、重置与回滚状态
  const [fixingMod, setFixingMod] = useState<boolean>(false)
  const [fixResult, setFixResult] = useState<any>(null)
  const [showFixResultModal, setShowFixResultModal] = useState<boolean>(false)
  const [showResetIniConfirm, setShowResetIniConfirm] = useState<boolean>(false)
  const [resettingIni, setResettingIni] = useState<boolean>(false)
  const [showRollbackModal, setShowRollbackModal] = useState<boolean>(false)
  const [loadingBackups, setLoadingBackups] = useState<boolean>(false)
  const [backupsList, setBackupsList] = useState<
    Array<{
      stamp: string
      format: 'qaqm' | 'wuwa-independent'
      sortKey: string
      label: string
      fileCount: number
    }>
  >([])
  const [selectedBackupStamp, setSelectedBackupStamp] = useState<string | null>(null)
  const [restoringBackup, setRestoringBackup] = useState<boolean>(false)

  const loadSections = async (charName: string) => {
    try {
      const list = await window.lz.getAppearanceSections(charName)
      if (list && Array.isArray(list)) {
        setSections(list)
      }
    } catch (err) {
      console.error('Failed to load appearance sections:', err)
    }
  }

  // 加载 Mod 详情（isCancelled: useEffect 注入的竞态守卫，切换 Mod 后过期响应直接丢弃）
  const loadDetails = async (isCancelled?: () => boolean) => {
    setLoading(true)
    // 进入加载时先重置派生状态，避免残留上一条 Mod 的横幅与图片索引
    setUpdateInfo(null)
    setConflictSummary(null)
    setCurrentImageIndex(0)
    try {
      const data = await window.lz.getModDetails(modFullPath)
      if (isCancelled?.()) return
      if (data) {
        setDetails(data)
        setAuthor(data.metadata?.author || '')
        setVersion(data.metadata?.version || 'Version 1.0')
        setDescription(data.metadata?.description || '')
        setSourceUrl(data.metadata?.sourceUrl || data.metadata?.url || data.metadata?.gamebananaUrl || '')
        setPersistInfo(data.persistInfo || null)
        setIsBroken(Boolean(data.metadata?.modBroken))
        setBrokenReason(data.metadata?.brokenReason || '')

        // 加载该角色的外观分区
        await loadSections(data.characterName)
        if (isCancelled?.()) return

        // 解析与智能关联所有 INI 快捷键与档位
        const allHotkeys: ParsedHotkey[] = []
        if (data.iniFiles && data.iniFiles.length > 0) {
          setSelectedIni(data.iniFiles[0].fullPath)
          const firstContent = await window.lz.readIni(data.iniFiles[0].fullPath)
          if (isCancelled?.()) return
          setIniContent(firstContent ?? '')

          for (const ini of data.iniFiles) {
            const raw = ini.fullPath === data.iniFiles[0].fullPath ? firstContent : await window.lz.readIni(ini.fullPath)
            if (isCancelled?.()) return
            if (raw) {
              allHotkeys.push(...parseIniHotkeys(raw))
            }
          }
        } else {
          setIniContent('')
        }

        // 去重
        const seen = new Set<string>()
        const uniqueHotkeys = allHotkeys.filter((item) => {
          const sig = `${item.name}-${item.keys.join('+')}`
          if (seen.has(sig)) return false
          seen.add(sig)
          return true
        })

        // 统一合并热键元数据：persistInfo 变量（若有）+ 全局别名/翻译/档位字典
        mergeHotkeyMeta(
          {
            hotkeys: uniqueHotkeys,
            variableAliases: data?.metadata?.variableAliases || {},
            hotkeyTranslations: data?.metadata?.hotkeyTranslations || {},
            valueLabels: data?.metadata?.valueLabels || {}
          },
          data?.persistInfo?.variables
        )

        setParsedHotkeys(uniqueHotkeys)

        // 检查 3DMigoto 资源冲突
        checkConflicts(data.characterName, data.name, isCancelled)
      }
    } catch (err) {
      console.error('Failed to load mod details:', err)
    } finally {
      if (!isCancelled?.()) {
        setLoading(false)
      }
    }
  }

  // 切换外观分区
  const handleMoveSection = async (nextSecId: string) => {
    if (!details) return
    setChangingSection(true)
    try {
      const res = await window.lz.setModAppearanceSection(details.fullPath, nextSecId)
      if (res?.success) {
        setDetails({ ...details, appearanceSectionId: nextSecId })
        await loadSections(details.characterName)
        toast.success('外观分区更新成功')
      } else {
        toast.error('切换外观分区失败', res?.error || '操作未成功')
      }
    } catch (err: any) {
      toast.error('切换外观分区失败', err.message)
    } finally {
      setChangingSection(false)
    }
  }

  // 一次性提示定时器句柄：重复设置前先清旧定时器（避免旧定时器掐掉新提示），卸载时统一清理
  const toastTimersRef = useRef<{ persist?: number; saved?: number; copied?: number }>({})
  const scheduleToastClear = (key: 'persist' | 'saved' | 'copied', delay: number, clear: () => void) => {
    const prev = toastTimersRef.current[key]
    if (prev) window.clearTimeout(prev)
    toastTimersRef.current[key] = window.setTimeout(() => {
      toastTimersRef.current[key] = undefined
      clear()
    }, delay)
  }

  useEffect(() => {
    return () => {
      const timers = toastTimersRef.current
      Object.values(timers).forEach((id) => {
        if (id) window.clearTimeout(id)
      })
    }
  }, [])

  // 展示 persist 提示条并安排 3s 自动消失（重复提示会重置计时器）
  const showPersistToast = (msg: string) => {
    setPersistToast(msg)
    scheduleToastClear('persist', 3000, () => setPersistToast(null))
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

    const varKey = `${v.namespace || ''}\\${v.name}`
    setUpdatingVar(varKey)
    // 乐观更新状态（同时比对 name 与 namespace 确保同名变量安全性）
    setPersistInfo((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        variables: prev.variables.map((item) =>
          item.name === v.name && item.namespace === v.namespace ? { ...item, currentValue: nextVal! } : item
        )
      }
    })

    try {
      const res = await window.lz.updateModVariable(details.fullPath, v.name, nextVal, v.namespace)
      if (res && res.success) {
        const reloadReasonLabel = res.reloadReason === 'game_not_running'
          ? '游戏未启动'
          : res.reloadReason === 'echo_suppressed'
          ? '操作过于频繁'
          : res.reloadReason === 'no_game'
          ? '未配置游戏'
          : res.reloadReason === 'live_apply_unsupported'
          ? '当前值不支持实时注入'
          : res.reloadReason === 'live_apply_failed'
          ? '参数注入文件生成失败'
          : res.reloadReason === 'live_apply_persist_failed'
          ? '参数持久化写入失败'
          : (res.reloadReason || '请手动按 F10')
        showPersistToast(res.liveApplied === false
          ? `已保存 $${v.name} = ${nextVal}，游戏未刷新（${reloadReasonLabel}）`
          : `已成功设定 $${v.name} = ${nextVal} (已热刷新)`)
      } else {
        setPersistInfo((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            variables: prev.variables.map((item) =>
              item.name === v.name && item.namespace === v.namespace ? { ...item, currentValue: v.currentValue } : item
            )
          }
        })
        showPersistToast(`修改失败: ${res?.error || '未知错误'}`)
      }
    } catch (err: any) {
      setPersistInfo((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          variables: prev.variables.map((item) =>
            item.name === v.name && item.namespace === v.namespace ? { ...item, currentValue: v.currentValue } : item
          )
        }
      })
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
        const reloadReasonLabel = res.reloadReason === 'game_not_running'
          ? '游戏未启动'
          : res.reloadReason === 'echo_suppressed'
          ? '操作过于频繁'
          : res.reloadReason === 'no_game'
          ? '未配置游戏'
          : res.reloadReason === 'live_apply_unsupported'
          ? '当前值不支持实时注入'
          : res.reloadReason === 'live_apply_failed'
          ? '参数注入文件生成失败'
          : res.reloadReason === 'live_apply_persist_failed'
          ? '参数持久化写入失败'
          : (res.reloadReason || '请手动按 F10')
        showPersistToast(res.liveApplied === false
          ? `已重置此 Mod 的所有数值，游戏未刷新（${reloadReasonLabel}）`
          : '已重置此 Mod 的所有服装与开关数值为初始状态')
        // 重新拉取最新信息
        const data = await window.lz.getModDetails(modFullPath)
        if (data?.persistInfo) setPersistInfo(data.persistInfo)
      } else {
        showPersistToast(`重置失败: ${res?.error || '未知错误'}`)
      }
    } catch (err: any) {
      console.error('Failed to reset variables:', err)
    } finally {
      setResettingVars(false)
    }
  }

  // 一键汉化配置与快捷键说明
  const handleTranslateConfig = async () => {
    if (!details) return
    setTranslatingConfig(true)
    try {
      await window.lz.translateConfig(details.fullPath)
      await loadDetails()
      setActiveDetailTab('config')
      toast.success('汉化完成', '已成功为模组的配置变量与快捷键生成中文说明并缓存至本地！')
    } catch (err: any) {
      toast.error('汉化失败', err?.message || '自动翻译遇到异常')
    } finally {
      setTranslatingConfig(false)
    }
  }

  // Mod 修复处理 (优先内置规则，也可拉起独立修复器)
  const handleFixMod = async (mode: 'builtin' | 'external' = 'builtin') => {
    if (!details?.fullPath || fixingMod) return
    setFixingMod(true)
    try {
      const res = await window.flairx.fixRunMod({
        modFullPath: details.fullPath,
        characterName: details.characterName,
        modName: details.name,
        mode
      })
      if (res) {
        setFixResult(res)
        setShowFixResultModal(true)
        if (res.success && res.stats?.modifiedFiles > 0) {
          await loadDetails()
        }
      }
    } catch (err: any) {
      toast.error('修复异常', err?.message || String(err))
    } finally {
      setFixingMod(false)
    }
  }

  // 重置该 Mod 的 INI 文件为初始备份版本 (*.qaqm-persistbak)
  const handleResetIni = async () => {
    if (!details?.fullPath || resettingIni) return
    setResettingIni(true)
    try {
      const res = await window.flairx.resetModIni({
        modFullPath: details.fullPath,
        characterName: details.characterName,
        modName: details.name
      })
      setShowResetIniConfirm(false)
      if (res && res.success) {
        if (res.restoredCount > 0) {
          toast.success(
            '重置完成',
            `已还原 ${res.restoredCount} 个 ini 文件为初始版本，请按 F10 刷新重载`
          )
          await loadDetails()
        } else {
          toast.info('无需重置', '当前 Mod 目录下没有找到 *.qaqm-persistbak 备份文件')
        }
      } else {
        toast.error('重置失败', res?.error || '未知错误')
      }
    } catch (err: any) {
      toast.error('重置异常', err?.message || String(err))
    } finally {
      setResettingIni(false)
    }
  }

  // 打开回滚备份弹窗并读取备份列表
  const handleOpenRollbackModal = async () => {
    if (!details?.fullPath) return
    setShowRollbackModal(true)
    setLoadingBackups(true)
    setSelectedBackupStamp(null)
    try {
      const res = await window.flairx.listModIniBackups({
        modFullPath: details.fullPath,
        characterName: details.characterName,
        modName: details.name
      })
      if (res && res.success) {
        setBackupsList(res.backups || [])
        if (res.backups && res.backups.length > 0) {
          setSelectedBackupStamp(res.backups[0].stamp)
        }
      } else {
        toast.error('读取备份失败', res?.error || '未知错误')
      }
    } catch (err: any) {
      toast.error('读取备份异常', err?.message || String(err))
    } finally {
      setLoadingBackups(false)
    }
  }

  // 确认执行回滚
  const handleConfirmRestoreBackup = async () => {
    if (!details?.fullPath || !selectedBackupStamp || restoringBackup) return
    setRestoringBackup(true)
    try {
      const res = await window.flairx.restoreModIniBackup({
        modFullPath: details.fullPath,
        characterName: details.characterName,
        modName: details.name,
        stamp: selectedBackupStamp
      })
      if (res && (res.success || res.restoreSucceeded)) {
        toast.success(
          '回滚成功',
          `已恢复 ${res.restoredCount || 0} 个文件，请按 F10 重载生效`
        )
        setShowRollbackModal(false)
        await loadDetails()
      } else {
        toast.error('回滚失败', res?.error || '未能完成回滚')
      }
    } catch (err: any) {
      toast.error('回滚异常', err?.message || String(err))
    } finally {
      setRestoringBackup(false)
    }
  }

  // 保存用户自定义变量中文别名
  const handleSaveVarAlias = async () => {
    if (!editingVar || !details || !editingAliasName.trim()) return
    setSavingAlias(true)
    try {
      await window.lz.setVariableAlias(details.fullPath, editingVar.name, editingAliasName.trim())
      if (persistInfo) {
        setPersistInfo({
          ...persistInfo,
          variables: persistInfo.variables.map((v) =>
            v.name === editingVar.name ? { ...v, alias: editingAliasName.trim() } : v
          )
        })
      }
      toast.success('已更新别名', `变量 $${editingVar.name} 的中文名称已设为 "${editingAliasName.trim()}"`)
      setEditingVar(null)
    } catch (err: any) {
      toast.error('保存失败', err?.message || '未知错误')
    } finally {
      setSavingAlias(false)
    }
  }

  // 点击触发按键
  const handleTriggerHotkey = async (h: ParsedHotkey) => {
    setTriggeringHotkey(h.name)
    try {
      const res = await window.lz.triggerHotkey(h.keys)
      if (res && res.success) {
        toast.success('已触发快捷键', `向游戏发送了 [${h.keys.join(' + ')}]`)
      } else if (res && res.reason === 'game_not_running') {
        toast.warning('游戏未启动', '按键未发送，请先启动游戏')
      } else {
        toast.warning('未触发', '请确保游戏已在前台运行')
      }
    } catch (err: any) {
      toast.error('触发异常', err?.message || '未知错误')
    } finally {
      setTriggeringHotkey(null)
    }
  }

  // 点击直选按键档位
  const handleSelectHotkeyVal = async (h: ParsedHotkey, targetVal: string) => {
    const hVar = h.variable?.toLowerCase()
    const pv = persistInfo?.variables?.find(
      (v) => (hVar && (v.canonicalName || '').toLowerCase() === hVar) || (v.name || '').toLowerCase() === h.name.toLowerCase()
    )

    // 1. 如果匹配到可调度的快捷键组合，优先通过模拟按键步进将 3DMigoto 内存变量拨至目标值
    const canUseKeys = h.keys && h.keys.length > 0 && !isNonKeyboardHotkey(h.keys)
    const vals = h.allowedValues || []
    if (canUseKeys && vals.length > 1) {
      const currIdx = vals.indexOf(h.currentValue ?? pv?.currentValue ?? vals[0])
      const targetIdx = vals.indexOf(targetVal)
      if (currIdx !== -1 && targetIdx !== -1) {
        const steps = (targetIdx - currIdx + vals.length) % vals.length
        let sent = 0
        for (let i = 0; i < steps; i++) {
          const res = await window.lz.triggerHotkey(h.keys)
          if (res && res.success === false) break
          sent++
          if (i < steps - 1) await new Promise((r) => setTimeout(r, 60))
        }

        // 如果同时存在持久化变量，同步落盘写回文件确保游戏重启后依然生效
        if (pv && details) {
          await window.lz.updateModVariable(details.fullPath, pv.name, targetVal, pv.namespace)
          setPersistInfo((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              variables: prev.variables.map((v) =>
                v.name === pv.name && v.namespace === pv.namespace ? { ...v, currentValue: targetVal } : v
              )
            }
          })
        }

        const reachedVal = vals[(currIdx + sent) % vals.length]
        setParsedHotkeys((prev) =>
          prev.map((item) => (item.name === h.name ? { ...item, currentValue: reachedVal } : item))
        )
        if (sent < steps) {
          toast.warning('档位未生效', '游戏未启动或未在前台，按键未送达')
        } else {
          toast.success('已切换档位', `${h.chineseName || h.name} 已选定为: ${targetVal}`)
        }
        return
      }
    }

    // 2. 若纯 PersistBridge 变量无快捷键：直接走持久化通道写入并热刷新
    if (pv) {
      await handleUpdateVariable(pv, targetVal)
      setParsedHotkeys((prev) =>
        prev.map((item) => (item.name === h.name ? { ...item, currentValue: targetVal } : item))
      )
      return
    }
  }

  // 检测冲突（isCancelled 同样作为竞态守卫，避免过期响应回写）
  const checkConflicts = async (charName: string, modName: string, isCancelled?: () => boolean) => {
    try {
      const reports = await window.lz.detectConflicts(charName)
      if (isCancelled?.()) return
      if (reports && reports[charName] && reports[charName].conflictsByMod) {
        const modSummary = reports[charName].conflictsByMod[modName]
        if (modSummary && modSummary.hasConflict) {
          setConflictSummary(modSummary)
        } else {
          setConflictSummary(null)
        }
      }
    } catch (_) {}
  }

  // 一键解决冲突
  const handleResolveConflict = async (keepThisMod: boolean) => {
    if (!details || !conflictSummary) return
    setResolvingConflict(true)
    try {
      if (keepThisMod) {
        // 启用当前，停用与其冲突的所有其他 Mod
        await window.lz.resolveConflicts(
          details.characterName,
          details.name,
          conflictSummary.conflictingMods
        )
      } else {
        // 停用当前 Mod：走带基底 Mod 确认的统一切换入口，不能绕过依赖保护
        await onToggleActive(details.characterName, details.name, false)
      }
      await loadDetails()
    } catch (err: any) {
      toast.error('解决冲突失败', err.message)
    } finally {
      setResolvingConflict(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    loadDetails(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [modFullPath])

  // 主图错误态复位：切换图片（索引）、重新加载详情（删除图片后 details 引用更新）时重置
  useEffect(() => {
    setMainImageError(false)
  }, [details, currentImageIndex])

  // 从一个基底 Mod 切到普通 Mod 时，详情页组件可能不卸载，必须把 base tab 收回
  useEffect(() => {
    if (activeDetailTab === 'base' && !details?.baseModInfo?.isBaseMod) {
      setActiveDetailTab('overview')
    }
  }, [activeDetailTab, details])

  // 切换装备状态
  const handleToggle = async () => {
    if (!details) return
    setToggling(true)
    try {
      // onToggleActive 的第三个参数是「目标状态」，不是当前状态；
      // 传反了会让「卸下模组」变成一次幂等的启用请求，基底 Mod 保护也不会触发
      const res = await onToggleActive(details.characterName, details.name, !details.enabled)
      // 基底 Mod 停用会被二次确认拦截；只有真正成功才翻转本地状态
      if (res?.success) {
        setDetails((prev) => (prev ? { ...prev, enabled: !prev.enabled } : prev))
        checkConflicts(details.characterName, details.name)
      }
    } finally {
      setToggling(false)
    }
  }

  // 保存元数据
  const handleSaveMetadata = async () => {
    if (!details) return
    setSavingMeta(true)
    setSavedSuccess(false)
    try {
      await window.lz.saveModMetadata(modFullPath, {
        author,
        version,
        description,
        sourceUrl
      })
      setSavedSuccess(true)
      scheduleToastClear('saved', 2000, () => setSavedSuccess(false))
    } finally {
      setSavingMeta(false)
    }
  }

  // 来源与市场关联计算
  const isGameBanana = Boolean(
    sourceUrl.toLowerCase().includes('gamebanana.com') ||
    details?.metadata?.source === 'GameBanana' ||
    details?.metadata?.modId
  )

  const detectedModId = React.useMemo(() => {
    if (details?.metadata?.modId) return Number(details.metadata.modId)
    const match = sourceUrl.match(/gamebanana\.com\/mods\/(\d+)/i)
    if (match) return parseInt(match[1], 10)
    return null
  }, [details, sourceUrl])

  const hasValidUrl = Boolean(
    sourceUrl && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://'))
  )

  const canOpenMarketDrawer = Boolean(isGameBanana && (detectedModId || details?.name))

  // 外部浏览器打开链接
  const handleOpenExternal = () => {
    if (hasValidUrl) {
      window.lz.openExternalUrl(sourceUrl)
    }
  }

  // 应用内市场联动跳转
  const handleJumpToMarket = () => {
    if (onNavigateToMarket) {
      onNavigateToMarket(detectedModId || undefined, details?.name)
    }
  }

  // 复制链接到剪贴板
  const handleCopyUrl = async () => {
    if (!sourceUrl) return
    try {
      await navigator.clipboard.writeText(sourceUrl)
      setCopySuccess(true)
      scheduleToastClear('copied', 2000, () => setCopySuccess(false))
    } catch (_) {}
  }

  // 检查作者在 GameBanana 上的更新
  const handleCheckUpdate = React.useCallback(async (manual = false) => {
    if (!detectedModId || !details) return
    setCheckingUpdate(true)
    try {
      const res = await window.lz.checkModUpdate({
        modId: detectedModId,
        localDate: details.mtime || details.metadata?.lastUpdated || details.metadata?.dateUpdated,
        localVersion: details.metadata?.version || version
      })
      if (res && res.hasUpdate) {
        setUpdateInfo(res)
        if (manual) toast.success('检测到新版本！', `作者发布了新版本：${res.remoteVersion || '最新版'}`)
      } else {
        setUpdateInfo(null)
        if (manual) toast.info('当前已是最新', '作者在 GameBanana 上暂无更新')
      }
    } catch (err: any) {
      if (manual) toast.error('检查更新失败', err.message)
    } finally {
      setCheckingUpdate(false)
    }
  }, [detectedModId, details, version])

  React.useEffect(() => {
    if (detectedModId && details) {
      handleCheckUpdate(false)
    }
  }, [detectedModId, details?.fullPath])

  // 从市场补全截图：安装时只保存首图，其余截图在这里按需拉取
  const handleFetchMarketPreviews = React.useCallback(async () => {
    if (!detectedModId || !details) return
    setFetchingPreviews(true)
    try {
      const info = await window.lz.getGameBananaDetails({
        itemType: 'Mod',
        itemId: detectedModId,
        modId: detectedModId,
        gameId: activeGame?.id
      })
      const urls: string[] = (info?.previewImages || []).filter(Boolean)
      if (urls.length === 0) {
        toast.info('没有可用截图', '该模组在市场上没有预览图')
        return
      }
      const res = await window.lz.downloadGameBananaPreviews(details.fullPath, urls)
      if (res?.success) {
        const parts: string[] = [`已保存 ${res.saved} 张`]
        if (res.moved) parts.push(`整理旧图 ${res.moved} 张`)
        if (res.skipped) parts.push(`跳过重复 ${res.skipped} 张`)
        toast.success('截图补全完成', parts.join('，'))
        await loadDetails()
      } else {
        // 图片都已存在时不算失败，只是没有新内容
        if (res?.skipped && !res?.failed) {
          const movedHint = res.moved ? `，并整理旧图 ${res.moved} 张` : ''
          toast.info('截图已是最新', `市场截图均已存在${movedHint}`)
          await loadDetails()
          return
        }
        toast.error('补全失败', res?.error || '未能下载截图')
      }
    } catch (err: any) {
      toast.error('补全失败', err.message)
    } finally {
      setFetchingPreviews(false)
    }
  }, [detectedModId, details, activeGame?.id])

  // 切换失效/损坏状态
  const handleToggleBroken = async (nextVal: boolean) => {
    if (!details) return
    setSavingBroken(true)
    try {
      const res = await window.lz.setModBrokenStatus(details.fullPath, nextVal, brokenReason)
      if (res?.success) {
        setIsBroken(nextVal)
        setDetails((prev) => (prev ? {
          ...prev,
          metadata: {
            ...prev.metadata,
            modBroken: nextVal,
            brokenReason: nextVal ? brokenReason : undefined
          }
        } : prev))
        if (nextVal) {
          toast.warning('模组已标记为失效', '若游戏内碎模或报错，建议将其卸装保持待命')
        } else {
          toast.success('已解除失效标记', '模组状态已恢复正常')
        }
      }
    } catch (err: any) {
      toast.error('修改失效状态失败', err.message)
    } finally {
      setSavingBroken(false)
    }
  }

  // 保存失效说明
  const handleSaveBrokenReason = async () => {
    if (!details) return
    setSavingBroken(true)
    try {
      const res = await window.lz.setModBrokenStatus(details.fullPath, isBroken, brokenReason)
      if (res?.success) {
        toast.success('失效原因已保存')
      }
    } catch (err: any) {
      toast.error('保存失败', err.message)
    } finally {
      setSavingBroken(false)
    }
  }

  // 设为封面
  const handleSetCover = async (imagePath: string) => {
    await window.lz.setAsCoverImage(modFullPath, imagePath)
    await loadDetails()
  }

  // 取消自定义封面：删除 _cover.*，回落到按优先级自动选取
  const handleClearCover = async () => {
    const ok = await window.lz.clearCoverImage(modFullPath)
    if (ok) {
      toast.success('已取消自定义封面')
      setCurrentImageIndex(0)
      await loadDetails()
    } else {
      toast.error('取消封面失败')
    }
  }

  // 确认删除图片
  const handleConfirmDeleteImage = async () => {
    if (!deleteImageTarget) return
    try {
      await window.lz.deleteModImage(deleteImageTarget)
      await loadDetails()
      setCurrentImageIndex(0)
      toast.success('预览图已删除')
    } catch (err: any) {
      toast.error('删除预览图失败', err.message)
    } finally {
      setDeleteImageTarget(null)
    }
  }

  // 确认删除整个模组文件夹（移入 Windows 回收站）
  const handleConfirmDeleteMod = async () => {
    if (!details) return
    setDeletingMod(true)
    try {
      const res = await window.lz.deleteMod(modFullPath)
      if (res && res.success) {
        toast.success('模组已删除', `${details.name} 已安全移入系统回收站`)
        setShowDeleteModModal(false)
        if (onDeleteSuccess) {
          onDeleteSuccess()
        } else {
          onBack()
        }
      } else {
        toast.error('删除模组失败', res?.error || '无法删除模组文件夹')
      }
    } catch (err: any) {
      toast.error('删除异常', err.message || '操作失败')
    } finally {
      setDeletingMod(false)
    }
  }

  // 切换查看 INI 内容（请求序号守卫：快速连续点击时丢弃过期响应）
  const iniLoadSeqRef = useRef<number>(0)
  const handleSelectIni = async (iniPath: string) => {
    const seq = ++iniLoadSeqRef.current
    setSelectedIni(iniPath)
    try {
      const content = await window.lz.readIni(iniPath)
      if (seq !== iniLoadSeqRef.current) return
      setIniContent(content ?? '')
    } catch (err) {
      console.error('Failed to read ini:', iniPath, err)
      if (seq === iniLoadSeqRef.current) {
        setIniContent('')
      }
    }
  }

  // 打开物理文件夹
  const handleOpenFolder = () => {
    window.lz.openModFolder(modFullPath)
  }

  // 打开重命名弹窗：名称即目录名，先拉取已记录的作者原名
  const handleOpenRename = async () => {
    if (!details) return
    setRenameInput(details.name || '')
    setRenameOriginal('')
    setRenameBusy(false)
    setShowRenameModal(true)
    try {
      const orig = await window.lz.readOriginalModName(modFullPath)
      setRenameOriginal(orig || '')
    } catch (_) {}
  }

  const handleTranslateTitle = async () => {
    const source = renameInput.trim() || (details?.name || '')
    if (!source) return
    setRenameBusy(true)
    try {
      const res = await window.lz.translateModTitle(source)
      if (res?.success && res.translated) {
        setRenameInput(res.translated)
        toast.success('已生成中文译名', '确认无误后点「保存」才会生效')
      } else {
        toast.error('翻译失败', res?.error || '未取得译名，请手动输入')
      }
    } catch (err: any) {
      toast.error('翻译失败', err?.message)
    } finally {
      setRenameBusy(false)
    }
  }

  const handleConfirmRename = async () => {
    const next = renameInput.trim()
    if (!next) {
      toast.error('名称不能为空')
      return
    }
    if (details && next === details.name) {
      setShowRenameModal(false)
      return
    }
    setRenameBusy(true)
    try {
      const res = await window.lz.renameMod(modFullPath, next)
      if (res?.success) {
        toast.success('重命名成功', next)
        setShowRenameModal(false)
        // 目录已改名：把导航目标切到新路径并留在详情页，
        // 不能停留在旧路径（会加载失败），也不该退出（用户还在看这个 Mod）
        if (res.newPath) {
          await onRenamed?.(res.newPath)
        } else {
          await loadDetails()
        }
      } else {
        toast.error('重命名失败', res?.error || '未知错误')
      }
    } catch (err: any) {
      toast.error('重命名失败', err?.message)
    } finally {
      setRenameBusy(false)
    }
  }

  const handleRestoreOriginalName = async () => {
    setRenameBusy(true)
    try {
      const res = await window.lz.restoreOriginalModName(modFullPath)
      if (res?.success) {
        toast.success('已还原为作者原名', res.restoredName || '')
        setShowRenameModal(false)
        if (res.newPath) {
          await onRenamed?.(res.newPath)
        } else {
          await loadDetails()
        }
      } else {
        toast.error('还原失败', res?.error || '未知错误')
      }
    } catch (err: any) {
      toast.error('还原失败', err?.message)
    } finally {
      setRenameBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center space-y-3 text-primary">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin shadow-xs" />
          <span className="text-xs font-mono tracking-widest uppercase text-text-muted">
            // 加载模组数据中 //
          </span>
        </div>
      </div>
    )
  }

  if (!details) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
        <p className="text-sm font-mono text-text-muted">未能找到此 Mod 的目录实体或已被移除</p>
        <Button variant="secondary" onClick={onBack}>
          返回角色库
        </Button>
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

  const detailTabs: Array<{
    id: 'overview' | 'config' | 'base'
    label: string
    icon: React.ReactNode
    badge?: React.ReactNode
  }> = [
    {
      id: 'overview',
      label: '模组规格与封面',
      icon: <Layers className="w-4 h-4" />
    },
    {
      id: 'config',
      label: '模组配置与脚本',
      icon: <Sliders className="w-4 h-4" />,
      badge:
        ((persistInfo?.variables?.length || 0) + parsedHotkeys.length > 0 || (details.iniFiles?.length || 0) > 0) ? (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-primary/20 text-primary border border-primary/30">
            {(persistInfo?.variables?.length || 0) + parsedHotkeys.length}
          </span>
        ) : undefined
    }
  ]
  if (details.baseModInfo?.isBaseMod) {
    detailTabs.push({
      id: 'base',
      label: '基底 Mod',
      icon: <Cpu className="w-4 h-4" />
    })
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto text-text select-none bg-surface/30">
      {/* 1. Sticky Header Bar with Dedicated Two-Row Layout */}
      <div className="sticky top-0 z-30 bg-surface/85 backdrop-blur-xl border-b border-border shadow-xs">
        {/* Row 1: Breadcrumb Title & Quick Actions */}
        <div className="px-6 py-3 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center space-x-3.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={onBack}
              icon={<ArrowLeft className="w-4 h-4 text-primary" />}
            >
              返回角色库
            </Button>

            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-bold text-text tracking-wide truncate max-w-sm sm:max-w-md">
                {details.name}
              </h1>
            </div>
          </div>

          {/* Right Actions: Open Folder, Move Mod, Delete Mod & Equip / Unequip */}
          <div className="flex items-center space-x-2.5">
            {/* Open Folder Button */}
            <Button
              variant="secondary"
              size="md"
              onClick={handleOpenFolder}
              className="border-border hover:border-primary/50 text-text-muted hover:text-text transition-colors cursor-pointer"
              title="在系统资源管理器中打开此模组文件夹"
              icon={<FolderOpen className="w-4 h-4 text-primary" />}
            >
              <span>打开文件夹</span>
            </Button>

            {/* Rename Mod Button */}
            <Button
              variant="secondary"
              size="md"
              onClick={handleOpenRename}
              className="border-border hover:border-primary/50 text-text-muted hover:text-text transition-colors cursor-pointer"
              title="重命名该模组（会同时改动磁盘目录名）"
              icon={<Pencil className="w-4 h-4 text-primary" />}
            >
              <span>重命名</span>
            </Button>

            {/* Move to Character Button */}
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowMoveModal(true)}
              className="border-border hover:border-primary/50 text-text-muted hover:text-text transition-colors cursor-pointer"
              title="将该模组移动到其他角色分类"
              icon={<FolderInput className="w-4 h-4 text-primary" />}
            >
              <span>移动到其他角色</span>
            </Button>

            {/* Delete Mod Button */}
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowDeleteModModal(true)}
              className="border-border hover:border-danger/40 hover:bg-danger/10 hover:text-danger text-text-muted transition-colors cursor-pointer"
              title="将该模组目录安全移至 Windows 回收站"
              icon={<Trash2 className="w-4 h-4 text-danger/80" />}
            >
              <span>删除模组</span>
            </Button>

            {/* Equip / Unequip */}
            <Button
              variant={details.enabled ? 'danger' : 'secondary'}
              size="md"
              onClick={handleToggle}
              loading={toggling}
              icon={
                details.enabled ? (
                  <XCircle className="w-4 h-4 text-danger" />
                ) : (
                  <Zap className="w-4 h-4 text-primary" />
                )
              }
            >
              {details.enabled ? '卸下模组' : '装备启用'}
            </Button>
          </div>
        </div>

        {/* Row 2: Tab 导航切换栏 (单独第二行/列，置顶吸顶) */}
        <div className="px-6 py-2 bg-surface/50 backdrop-blur-md">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <SegmentedControl
              items={detailTabs}
              value={activeDetailTab}
              onChange={(tab) => setActiveDetailTab(tab as 'overview' | 'config' | 'base')}
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full p-6 space-y-6">
        {/* Tab 1: 模组规格与封面 (主 Tab) */}
        {activeDetailTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-fast">
            {/* Conflict Diagnostic Banner */}
            {conflictSummary && (
          <div className="p-4 rounded-card bg-danger/10 border border-danger/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-control bg-danger/15 text-danger border border-danger/30 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-danger tracking-wide flex items-center space-x-2">
                  <span>检测到 3DMigoto 资源冲突</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-danger text-white font-mono">
                    {conflictSummary.collisions.length} 处 Hash 重叠
                  </span>
                </h3>
                <p className="text-[11px] text-danger/80 mt-1 leading-relaxed">
                  当前 Mod 与已启用的{' '}
                  <span className="font-semibold text-danger">
                    {conflictSummary.conflictingMods.join(', ')}
                  </span>{' '}
                  修改了相同游戏模型或贴图，可能导致画面撕裂或崩溃。
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleResolveConflict(true)}
                disabled={resolvingConflict}
              >
                仅保留此 Mod
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleResolveConflict(false)}
                disabled={resolvingConflict}
              >
                禁用此 Mod
              </Button>
            </div>
          </div>
        )}

        {/* 失效/损坏警示横幅 */}
        {isBroken && (
          <div className="p-4 rounded-card bg-danger/10 border border-danger/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-control bg-danger/20 text-danger shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-danger">此模组已被标记为失效 / 损坏</h4>
                  {brokenReason && (
                    <span className="text-[11px] font-medium text-danger/90 bg-danger/15 px-2 py-0.5 rounded-full border border-danger/25">
                      原因: {brokenReason}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
                  该模组可能在当前游戏版本中存在碎模、黑脸或导致闪退，建议保持待命或等待作者发布修复版本。
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {details.enabled && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleToggle}
                >
                  立即卸装待命
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleToggleBroken(false)}
                disabled={savingBroken}
              >
                恢复正常
              </Button>
            </div>
          </div>
        )}

        {/* 作者新版本更新提醒横幅 */}
        {updateInfo?.hasUpdate && (
          <div className="p-4 rounded-card bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-control bg-amber-500/20 text-amber-500 shrink-0">
                <ArrowUpCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-amber-500">
                    <HoverHint content="将就地覆盖当前模组，保留启用状态与自定义设置">
                      检测到作者已发布新版本！
                    </HoverHint>
                  </h4>
                  <Badge variant="accent" size="sm" className="font-mono text-[10px]">
                    {updateInfo.remoteVersion}
                  </Badge>
                </div>
                <p className="text-[11px] text-text-muted mt-1 leading-relaxed line-clamp-1">
                  {updateInfo.changelog || `线上最新修改于 ${formatDateTime(updateInfo.remoteDate)}`}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <div className="flex flex-col items-end gap-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsMarketDrawerOpen(true)}
                  icon={<ShoppingBag className="w-3.5 h-3.5" />}
                >
                  在市场中获取更新
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Hero Preview Showcase */}
        <div className="space-y-3">
          <Card className="relative aspect-[21/9] sm:aspect-[16/7] overflow-hidden flex items-center justify-center">
            {activeImage && !mainImageError ? (
              <img
                src={toFileUrl(activeImage.path)}
                alt={details.name}
                className="w-full h-full object-contain"
                onError={() => setMainImageError(true)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-text-muted">
                <CropIcon className="w-12 h-12 stroke-[1.2] mb-2 opacity-50" />
                <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
                  暂无预览立绘
                </span>
              </div>
            )}

            {/* Floating Navigation Controls */}
            {hasImages && images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
                  }
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-control bg-surface/85 hover:bg-surface text-text backdrop-blur-md border border-border shadow-md transition cursor-pointer"
                  title="上一张"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-control bg-surface/85 hover:bg-surface text-text backdrop-blur-md border border-border shadow-md transition cursor-pointer"
                  title="下一张"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Floating Utility Capsule */}
            {activeImage && (
              <div className="absolute top-4 right-4 flex items-center space-x-2">
                <div className="flex items-center space-x-1.5 bg-surface/90 backdrop-blur-md border border-border rounded-control p-1.5 shadow-md">
                  {/* Smart Crop Button */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setCropImageSrc(toFileUrl(activeImage.path))
                      setIsCropOpen(true)
                    }}
                    icon={<CropIcon className="w-3.5 h-3.5 text-primary" />}
                  >
                    裁切封面
                  </Button>

                  {/* Set as Cover */}
                  {!activeImage.isCover && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSetCover(activeImage.path)}
                      icon={<Star className="w-3.5 h-3.5 text-amber-500" />}
                    >
                      设为Mod封面
                    </Button>
                  )}

                  {/* 取消自定义封面：清掉 mod.json 的 coverImage 指针后回落到自动选取 */}
                  {activeImage.isCover && Boolean(details?.metadata?.coverImage) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleClearCover}
                      icon={<Star className="w-3.5 h-3.5 text-text-tertiary" />}
                    >
                      取消封面
                    </Button>
                  )}

                  {/* 市场截图补全：安装时只存首图，其余按需拉取 */}
                  {isGameBanana && detectedModId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={fetchingPreviews}
                      onClick={handleFetchMarketPreviews}
                      icon={<Download className="w-3.5 h-3.5 text-primary" />}
                    >
                      {fetchingPreviews ? '补全中...' : '补全市场截图'}
                    </Button>
                  )}

                  {/* Delete Image */}
                  {images.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDeleteImageTarget(activeImage.path)}
                      className="p-1 rounded-control bg-danger/10 hover:bg-danger/20 text-danger transition cursor-pointer"
                      title="删除此图片"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Thumbnails Row */}
          {hasImages && images.length > 1 && (
            <div className="flex items-center space-x-2.5 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={img.path}
                  type="button"
                  onClick={() => setCurrentImageIndex(idx)}
                  className={`relative w-20 h-14 rounded-control overflow-hidden shrink-0 border transition cursor-pointer ${
                    currentImageIndex === idx
                      ? 'border-primary shadow-xs ring-2 ring-primary/25'
                      : 'border-border opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={toFileUrl(img.path)} alt="" className="w-full h-full object-cover" loading="lazy" />
                  {img.isCover && (
                    <div className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-primary shadow-xs" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 4. Equipment Specifications */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-text tracking-wide uppercase flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-primary" />
            <span>模组规格与元数据</span>
          </h2>

          <Card className="p-5 space-y-4">
            {/* 外观分区 (仿 QAQ 体验) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-control bg-primary/10 text-primary">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="flex items-center space-x-2">
                  <h4 className="text-xs font-semibold text-text">外观分区</h4>
                  {details.appearanceSectionId &&
                    details.appearanceSectionId !== 'base' &&
                    !sections.find((s) => s.sectionId === details.appearanceSectionId)?.official && (
                      <Badge variant="default" size="sm" className="text-[10px]">
                        自定义分区
                      </Badge>
                    )}
                </div>
              </div>

              <div className="w-64">
                <Select
                  value={details.appearanceSectionId || 'base'}
                  onChange={(val) => handleMoveSection(val)}
                  disabled={changingSection}
                  options={sections.map((s) => ({
                    value: s.sectionId,
                    label: s.name,
                    description: `${s.enabledCount || 0} 启用 · ${s.totalCount || 0} Mod`
                  }))}
                  className="w-full"
                  popupClassName="w-64"
                  title="只改变显示位置，不改变启用状态"
                />
              </div>
            </div>

            {/* 检查时间 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-control bg-primary/10 text-primary">
                  <Calendar className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-semibold text-text">检查时间</h4>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono bg-surface-2 px-3 py-1.5 rounded-control border border-border text-text">
                  {formatDateTime(details.metadata?.checkTime || details.metadata?.dateChecked)}
                </span>
                <Clock className="w-4 h-4 text-text-muted" />
              </div>
            </div>

            {/* 最后更新 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-control bg-primary/10 text-primary">
                  <Calendar className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-semibold text-text">最后更新</h4>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono bg-surface-2 px-3 py-1.5 rounded-control border border-border text-text">
                  {formatDateTime(details.mtime || details.metadata?.lastUpdated || details.metadata?.dateUpdated)}
                </span>
                <Clock className="w-4 h-4 text-text-muted" />
              </div>
            </div>

            {/* 作者 (可编辑) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-control bg-primary/10 text-primary">
                  <User className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-semibold text-text">创作者</h4>
              </div>

              <div className="w-64">
                <Input
                  placeholder="请输入创作者署名..."
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                />
              </div>
            </div>

            {/* 版本号 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-control bg-primary/10 text-primary">
                  <Tag className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-semibold text-text">版本标识</h4>
              </div>

              <div className="w-64">
                <Input
                  placeholder="例如：Version 1.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </div>
            </div>

            {/* 模组来源与市场链接 */}
            <div className="flex flex-col pb-4 border-b border-border gap-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-control bg-primary/10 text-primary">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-xs font-semibold text-text">模组来源与市场链接</h4>
                    {isGameBanana && (
                      <Badge variant="primary" size="sm" className="text-[10px] font-mono">
                        GameBanana
                      </Badge>
                    )}
                  </div>
                </div>

                {/* 快捷操作按钮组 */}
                <div className="flex items-center space-x-2 shrink-0">
                  {/* 在默认浏览器中打开 */}
                  {hasValidUrl && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleOpenExternal}
                      title={`在浏览器中打开: ${sourceUrl}`}
                      icon={<ExternalLink className="w-3.5 h-3.5 text-primary" />}
                    >
                      浏览器打开
                    </Button>
                  )}

                  {/* 检查更新 */}
                  {detectedModId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCheckUpdate(true)}
                      loading={checkingUpdate}
                      title="联网检查作者在 GameBanana 上是否发布了新版"
                      icon={<RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />}
                    >
                      检查更新
                    </Button>
                  )}

                  {/* 应用内市场联动详情抽屉 */}
                  {canOpenMarketDrawer && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setIsMarketDrawerOpen(true)}
                      title="在 LZ Manager 模组市场中查看该模组详情"
                      icon={<ShoppingBag className="w-3.5 h-3.5" />}
                    >
                      在市场中查看
                    </Button>
                  )}

                  {/* 复制链接 */}
                  {hasValidUrl && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleCopyUrl}
                      title="复制完整链接到剪贴板"
                      icon={
                        copySuccess ? (
                          <Check className="w-3.5 h-3.5 text-success stroke-[2.5]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-text-muted" />
                        )
                      }
                    >
                      {copySuccess ? '已复制' : '复制'}
                    </Button>
                  )}
                </div>
              </div>

              {/* 链接输入框 */}
              <div className="w-full">
                <Input
                  placeholder="例如：https://gamebanana.com/mods/567291"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {/* 模组健康与失效维护 */}
            <div className="flex flex-col pb-4 border-b border-border gap-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-control ${isBroken ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-text-muted'}`}>
                    <AlertOctagon className="w-4 h-4" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-xs font-semibold text-text">标记为失效 / 损坏 (Broken)</h4>
                    {isBroken && (
                      <Badge variant="danger" size="sm" className="text-[10px]">
                        已失效
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Switch
                    checked={isBroken}
                    onChange={handleToggleBroken}
                    disabled={savingBroken}
                  />
                </div>
              </div>

              {/* 失效原因备注输入 */}
              {isBroken && (
                <div className="flex items-center gap-2 pt-1 pl-11">
                  <div className="flex-1">
                    <Input
                      placeholder="请填写失效原因（例如：3.2版本碎模、需要修复补丁...）"
                      value={brokenReason}
                      onChange={(e) => setBrokenReason(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSaveBrokenReason}
                    loading={savingBroken}
                  >
                    保存原因
                  </Button>
                </div>
              )}
            </div>

            {/* 磁盘路径与体积 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-control bg-primary/10 text-primary">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-text">物理存储路径</h4>
                  <p className="text-[11px] font-mono text-text-muted truncate max-w-sm sm:max-w-md">
                    {details.fullPath}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 text-xs font-mono text-primary bg-surface-2 px-3 py-1.5 rounded-control border border-border">
                <span className="font-bold text-text">{formatSize(details.totalSize)}</span>
                <span className="text-text-muted">/</span>
                <span>{details.fileCount} 个文件</span>
              </div>
            </div>

            {/* 保存修改按钮 */}
            <div className="flex justify-end pt-2">
              <Button
                variant={savedSuccess ? 'secondary' : 'primary'}
                size="sm"
                onClick={handleSaveMetadata}
                loading={savingMeta}
                icon={savedSuccess ? <Check className="w-4 h-4 stroke-[2.5]" /> : <Save className="w-4 h-4" />}
              >
                {savedSuccess ? '信息已保存' : '保存信息修改'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    )}

    {/* Tab 2: 基底 Mod */}
    {activeDetailTab === 'base' && details.baseModInfo?.isBaseMod && (
      <div className="space-y-6 animate-in fade-in duration-fast">
        <BaseModPanel
          modFullPath={details.fullPath}
          onToggleBaseMod={(enabled) => onToggleActive(details.characterName, details.name, enabled)}
          onChanged={() => loadDetails()}
        />
      </div>
    )}

    {/* Tab 3: 模组配置与脚本 */}
    {activeDetailTab === 'config' && (
      <div className="space-y-6 animate-in fade-in duration-fast">
        {/* 3. 模组配置与按键调控 (MOD CONFIGURATION & KEYBINDS) */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
                <Sliders className="w-4 h-4" />
              </div>
              <h2 className="text-xs font-bold text-text tracking-wide uppercase flex items-center space-x-2">
                <span>模组配置与按键调控 (MOD CONTROLS)</span>
                {persistInfo && persistInfo.hasPersist && persistInfo.variables.length > 0 && (
                  <Badge variant="primary" size="sm">
                    {persistInfo.variables.length} 个调控变量
                  </Badge>
                )}
                {parsedHotkeys.length > 0 && (
                  <Badge variant="primary" size="sm">
                    {parsedHotkeys.length} 组快捷键
                  </Badge>
                )}
              </h2>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {/* 一键汉化配置说明 */}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTranslateConfig}
                loading={translatingConfig}
                icon={<Languages className="w-3.5 h-3.5 text-primary" />}
                title="自动翻译并规范所有变量与按键名称"
              >
                汉化说明
              </Button>

              {/* 修复 Mod */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleFixMod('builtin')}
                loading={fixingMod}
                icon={<Wrench className="w-3.5 h-3.5 text-primary" />}
                title="修复此 Mod 的 Hash 规则或运行外部修复工具"
              >
                修复 Mod
              </Button>

              {/* 回滚修复备份 */}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleOpenRollbackModal}
                icon={<History className="w-3.5 h-3.5 text-primary" />}
                title="撤销某一次修复 Mod 的改动：按时间点把 ini 恢复到该次修复前的状态（依据修复时自动创建的 .qaqm-inibak 备份）"
              >
                回滚备份
              </Button>

              {/* 重置 ini */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowResetIniConfirm(true)}
                icon={<RotateCcw className="w-3.5 h-3.5 text-primary" />}
                title="把 ini 一步还原为 Mod 最初的原始版本，撤销全部 ini 改动（手动编辑、修复残留、桥接改写），比重置默认值更彻底"
              >
                重置 ini
              </Button>

              {/* 重置默认值 */}
              {persistInfo && persistInfo.hasPersist && persistInfo.variables.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleResetVariables}
                  disabled={resettingVars}
                  icon={<RotateCcw className={`w-3.5 h-3.5 text-primary ${resettingVars ? 'animate-spin' : ''}`} />}
                  title="只把调过的持久化数值拨回默认值，不改动任何 ini 文件（比重置 ini 轻量）"
                >
                  重置默认值
                </Button>
              )}
            </div>
          </div>

          {persistToast && (
            <div className="p-3 rounded-control bg-primary/10 border border-primary/25 text-xs text-primary flex items-center space-x-2 animate-in fade-in duration-fast shadow-xs">
              <Zap className="w-4 h-4 text-primary shrink-0 fill-current" />
              <span className="font-semibold">{persistToast}</span>
            </div>
          )}

          {/* 子块 A: 实时外观参数调控 (Persist Bridge Matrix) */}
          {persistInfo && persistInfo.hasPersist && persistInfo.variables.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-[11px] font-bold text-text-muted flex items-center space-x-1.5 uppercase tracking-wider">
                <SlidersHorizontal className="w-3 h-3 text-primary" />
                <span>持久化记忆变量 (PERSIST BRIDGE)</span>
              </div>
              <Card className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                {persistInfo.variables.map((v) => {
                  const allowed = v.allowedValues && v.allowedValues.length > 0 ? v.allowedValues : ['0', '1']
                  const isBinary = allowed.length === 2 && allowed.includes('0') && allowed.includes('1')
                  const isOn = v.currentValue === '1'
                  const varKey = `${v.namespace || ''}\\${v.name}`
                  const isUpdating = updatingVar === varKey || updatingVar === v.name

                  return (
                    <div
                      key={varKey}
                      className="p-4 rounded-control bg-surface-2 border border-border hover:border-primary/40 transition-colors flex flex-col justify-between space-y-3.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-bold text-text tracking-wide break-all">
                              {v.alias || v.name}
                            </span>
                            {v.alias && v.alias !== v.name && (
                              <span className="text-[11px] font-mono text-text-muted bg-surface px-1.5 py-0.5 rounded border border-border break-all max-w-full">
                                ${v.name}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingVar(v)
                                setEditingAliasName(v.alias || v.name)
                              }}
                              title="自定义中文名称"
                              className="p-1 text-text-muted hover:text-primary transition-colors rounded hover:bg-surface cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {v.keybind && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
                                {v.keybind}
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-text-muted font-mono mt-0.5 break-all">
                            来源: {v.iniFile} · 默认值: {v.defaultValue}
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0 ml-auto">
                          <span className="text-[11px] text-text-muted font-mono">当前:</span>
                          <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-surface text-primary border border-border shadow-xs">
                            {v.currentValue}
                          </span>
                        </div>
                      </div>

                      {/* Interactive Switch or Segmented Cycle */}
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className="text-[11px] text-text-muted font-medium">
                          调控档位:
                        </span>

                        {!v.supported ? (
                          <span className="text-[10px] text-amber-500">不可调节：{v.supportError || '无法解析 namespace'}</span>
                        ) : isBinary ? (
                          <button
                            type="button"
                            onClick={() => handleUpdateVariable(v, isOn ? '0' : '1')}
                            disabled={isUpdating}
                            className={`flex items-center space-x-2 px-3 py-1.5 rounded-control text-xs font-semibold tracking-wide transition-colors cursor-pointer border ${
                              isOn
                                ? 'bg-primary text-primary-fg border-primary shadow-xs'
                                : 'bg-surface text-text border-border hover:bg-surface-2'
                            } ${isUpdating ? 'opacity-50 cursor-wait' : ''}`}
                          >
                            {isOn ? (
                              <>
                                <ToggleRight className="w-4 h-4" />
                                <span>已开启 (1)</span>
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="w-4 h-4 text-text-muted" />
                                <span>已关闭 (0)</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="flex items-center space-x-1 flex-wrap gap-1">
                            {allowed.map((val) => {
                              const isCur = v.currentValue === val
                              const label = v.valueLabels?.[val]
                              return (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => handleUpdateVariable(v, val)}
                                  disabled={isUpdating}
                                  className={`px-2.5 py-1 rounded-control text-xs font-bold transition-colors cursor-pointer border ${
                                    isCur
                                      ? 'bg-primary text-primary-fg border-primary shadow-xs font-extrabold'
                                      : 'bg-surface text-text hover:text-primary border-border hover:border-primary/40'
                                  } ${isUpdating ? 'opacity-50' : ''}`}
                                >
                                  {label ? `${label} (${val})` : val}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </Card>
            </div>
          )}

          {/* 子块 B: 快捷键触发与档位切换 (Author Hotkeys & Direct Value Selector) */}
          {parsedHotkeys.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-[11px] font-bold text-text-muted flex items-center space-x-1.5 uppercase tracking-wider">
                <Keyboard className="w-3 h-3 text-primary" />
                <span>模组快捷键与档位切换 (KEYBINDS & TOGGLES)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-fr gap-3.5">
                {parsedHotkeys.map((h, idx) => {
                  const isTriggering = triggeringHotkey === h.name
                  const desc = getHotkeyDescription(h)
                  const typeLabel = getHotkeyTypeLabel(h.type)
                  const nonKeyboard = isNonKeyboardHotkey(h.keys)
                  const canSimulate = h.keys.length > 0 && !nonKeyboard
                  const showInternalName =
                    Boolean(h.chineseName) &&
                    (h.chineseName || '').trim().toLowerCase() !== h.name.trim().toLowerCase()

                  return (
                    <div
                      key={`${h.name}-${h.keys.join('+')}-${idx}`}
                      className="group h-full min-w-0 p-3.5 rounded-control bg-surface-2 border border-border hover:border-primary/40 transition-colors flex flex-col gap-3"
                    >
                      {/* 名称 / 内部名 / 类型 */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-bold text-text truncate" title={h.chineseName || h.name}>
                            {h.chineseName || h.name}
                          </span>
                          {showInternalName && (
                            <span
                              className="text-[10px] font-mono text-text-muted bg-surface px-1.5 py-0.5 rounded border border-border shrink-0 max-w-[45%] truncate"
                              title={h.name}
                            >
                              {h.name}
                            </span>
                          )}
                          {typeLabel && (
                            <span className="text-[9px] font-semibold text-text-muted bg-surface px-1.5 py-0.5 rounded-full border border-border shrink-0">
                              {typeLabel}
                            </span>
                          )}
                        </div>
                        {/* 固定高度描述槽：无描述也占位，保证同排卡片按键行对齐 */}
                        <div
                          className="mt-1 h-4 text-[11px] leading-4 text-text-muted truncate"
                          title={desc ?? undefined}
                        >
                          {desc}
                        </div>
                      </div>

                      {/* 按键行 + 模拟触发 */}
                      <div className="flex items-center justify-between gap-2 rounded-md bg-surface/70 border border-border/70 px-2.5 py-1.5 min-h-[34px]">
                        <div
                          className="flex flex-wrap items-center gap-1 min-w-0"
                          aria-label={`快捷键 ${h.keys.join(' + ')}`}
                        >
                          {h.keys.length === 0 ? (
                            <span className="text-[10px] text-text-muted">无按键</span>
                          ) : (
                            h.keys.map((k, kIdx) => (
                              <React.Fragment key={`${k}-${kIdx}`}>
                                {kIdx > 0 && (
                                  <span aria-hidden="true" className="text-[10px] text-text-muted/60 select-none">
                                    +
                                  </span>
                                )}
                                <kbd
                                  className={
                                    isModifierKey(k)
                                      ? 'px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-surface text-text-muted border border-border shadow-2xs'
                                      : 'px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/25 shadow-2xs'
                                  }
                                >
                                  {k}
                                </kbd>
                              </React.Fragment>
                            ))
                          )}
                        </div>

                        <span
                          className="shrink-0 inline-flex"
                          title={
                            nonKeyboard
                              ? h.keys.some((k) => k.includes('🎮'))
                                ? '手柄按键请在游戏中使用手柄触发'
                                : '鼠标按键请在游戏中使用鼠标操作'
                              : '在游戏中模拟触发此按键'
                          }
                        >
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleTriggerHotkey(h)}
                            disabled={isTriggering || !canSimulate}
                            className="text-[10px] text-primary hover:bg-primary/10 cursor-pointer"
                            icon={<Play className={`w-3 h-3 fill-current ${isTriggering ? 'animate-spin' : ''}`} />}
                          >
                            模拟按键
                          </Button>
                        </span>
                      </div>

                      {/* 档位 / 单次触发 */}
                      <div className="mt-auto pt-2.5 border-t border-border">
                        {h.allowedValues && h.allowedValues.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] font-semibold text-text-muted mr-1">档位</span>
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
                                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold transition-colors cursor-pointer border ${
                                    isSelected
                                      ? 'bg-primary text-primary-fg border-primary shadow-cds-sm font-bold'
                                      : 'bg-surface text-text-muted hover:text-primary border-border hover:border-primary/40'
                                  }`}
                                  title={`直接切换设定值为: ${val}`}
                                >
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <span className="text-[10.5px] text-text-muted inline-flex items-center gap-1">
                            <Zap className="w-3 h-3 text-primary/60" />
                            单次触发
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 若既无 Persist 也无 Hotkeys */}
          {(!persistInfo || !persistInfo.hasPersist || persistInfo.variables.length === 0) && parsedHotkeys.length === 0 && (
            <Card className="p-6 text-center border-dashed border-border flex flex-col items-center justify-center space-y-2">
              <div className="p-3 rounded-full bg-surface-2 text-text-muted">
                <Sliders className="w-5 h-5 opacity-40" />
              </div>
              <h4 className="text-xs font-semibold text-text">该模组无动态配置项</h4>
              <p className="text-[11px] text-text-muted max-w-sm">
                当前 Mod 属于静态模型/贴图替换，未在 INI 脚本中检测到快捷键或服装调控变量。
              </p>
            </Card>
          )}
        </div>

        {/* 5. INI 配置文件查看器 */}
        {details.iniFiles && details.iniFiles.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-text tracking-wide uppercase flex items-center space-x-2">
              <FileText className="w-4 h-4 text-primary" />
              <span>3DMIGOTO 配置脚本 ({details.iniFiles.length})</span>
            </h2>

            <Card className="p-5 space-y-3">
              {/* Tab Selector for INI files */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                {details.iniFiles.map((ini) => (
                  <button
                    key={ini.fullPath}
                    type="button"
                    onClick={() => handleSelectIni(ini.fullPath)}
                    className={`px-3 py-1.5 rounded-control text-xs font-mono font-semibold transition cursor-pointer border ${
                      selectedIni === ini.fullPath
                        ? 'bg-primary text-primary-fg border-primary shadow-xs'
                        : 'bg-surface-2 text-text-muted hover:text-text border-border'
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
                  className="w-full bg-surface-2 border border-border rounded-control p-4 text-xs font-mono text-text leading-relaxed focus:outline-none resize-y"
                />
              </div>
            </Card>
          </div>
        )}
      </div>
    )}
  </div>

      {/* Smart Crop Modal */}
      {isCropOpen && (
        <CropDialog
          isOpen={isCropOpen}
          onClose={() => setIsCropOpen(false)}
          imageSrc={cropImageSrc || (activeImage ? toFileUrl(activeImage.path) : '')}
          modFullPath={modFullPath}
          characterName={details.characterName}
          modName={details.name}
          onCoverSaved={async () => {
            await loadDetails()
          }}
        />
      )}

      {/* 重命名 Mod：名称即磁盘目录名 */}
      <Modal
        isOpen={showRenameModal}
        onClose={() => !renameBusy && setShowRenameModal(false)}
        onConfirm={handleConfirmRename}
        title={
          <span className="flex items-center space-x-2">
            <Pencil className="w-4 h-4 text-primary" />
            <span>重命名 Mod</span>
          </span>
        }
        titleHint="名称会同时改动磁盘目录（停用状态的前缀会自动保留）。重命名后可从上方「作者原名」一键还原。"
        confirmText={renameBusy ? '处理中...' : '保存'}
        cancelText="取消"
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-text">名称（即磁盘目录名）</label>
            <Input
              placeholder="输入新的 Mod 名称"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              autoFocus
              disabled={renameBusy}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename()
              }}
            />
          </div>

          {/* 作者原名：仅当重命名过才显示，供一键还原 */}
          {renameOriginal && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border">
              <div className="min-w-0">
                <div className="text-[11px] text-text-muted">作者原名</div>
                <div className="text-xs font-mono truncate" title={renameOriginal}>
                  {renameOriginal}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={renameBusy}
                onClick={handleRestoreOriginalName}
                className="shrink-0"
              >
                还原
              </Button>
            </div>
          )}

          {/* 中文译名：在线翻译，只填入输入框，需用户确认 */}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={renameBusy}
              onClick={handleTranslateTitle}
              icon={<Languages className="w-3.5 h-3.5 text-primary" />}
            >
              {renameBusy ? '翻译中...' : '翻译为中文'}
            </Button>
          </div>

        </div>
      </Modal>

      {/* Delete Image Confirmation Modal */}
      <Modal
        isOpen={!!deleteImageTarget}
        onClose={() => setDeleteImageTarget(null)}
        onConfirm={handleConfirmDeleteImage}
        title="删除预览图"
        variant="danger"
        confirmText="确认删除"
        cancelText="取消"
      >
        <p className="text-sm text-slate-300">
          确定要从磁盘删除这张预览图吗？此操作无法撤销。
        </p>
      </Modal>

      {/* Delete Mod Confirmation Modal */}
      <Modal
        isOpen={showDeleteModModal}
        onClose={() => !deletingMod && setShowDeleteModModal(false)}
        onConfirm={handleConfirmDeleteMod}
        title="确认删除该模组？"
        variant="danger"
        confirmText={deletingMod ? "正在删除..." : "移入回收站"}
        cancelText="取消"
      >
        <div className="space-y-3">
          <p className="text-sm text-text leading-relaxed">
            确定要删除模组 <strong className="text-primary font-bold font-mono">{details?.name}</strong> 吗？
          </p>
          <div className="p-3 rounded-control bg-surface-2 border border-border text-xs text-text-muted space-y-1 font-mono">
            <div>角色：{details?.characterName}</div>
            <div className="truncate">路径：{modFullPath}</div>
          </div>
          <p className="text-xs text-amber-500/90 flex items-center space-x-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>模组文件将安全移至系统回收站，若误删可随时从回收站还原。</span>
          </p>
        </div>
      </Modal>

      {/* Move Mod Modal */}
      {details && (
        <MoveModModal
          isOpen={showMoveModal}
          onClose={() => setShowMoveModal(false)}
          modName={details.name}
          modFullPath={details.fullPath}
          currentCharacter={details.characterName}
          onSuccess={() => {
            if (onDeleteSuccess) {
              onDeleteSuccess()
            } else {
              onBack()
            }
          }}
        />
      )}

      {/* Edit Variable Chinese Alias Modal */}
      <Modal
        isOpen={!!editingVar}
        onClose={() => !savingAlias && setEditingVar(null)}
        onConfirm={handleSaveVarAlias}
        loading={savingAlias}
        confirmText="保存名称"
        cancelText="取消"
        title="自定义配置项中文名称"
        titleHint={
          <>
            为原作者变量{' '}
            <span className="font-mono text-primary font-bold">${editingVar?.name}</span>{' '}
            设定直观易懂的中文别名。保存后将同步写入配置并在游戏内悬浮窗实时生效：
          </>
        }
        maxWidth="max-w-sm"
      >
        <div className="space-y-3 py-2">
          <Input
            value={editingAliasName}
            onChange={(e) => setEditingAliasName(e.target.value)}
            placeholder="例如: 外套开关, 短发, 连裤袜..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveVarAlias()
            }}
          />
        </div>
      </Modal>

      {/* 鸣潮修复结果展示弹窗 */}
      <FixResultModal
        isOpen={showFixResultModal}
        result={fixResult}
        onClose={() => setShowFixResultModal(false)}
        onOpenIndependent={() => handleFixMod('external')}
      />

      {/* 重置 Mod ini 确认弹窗 */}
      <Modal
        isOpen={showResetIniConfirm}
        onClose={() => !resettingIni && setShowResetIniConfirm(false)}
        onConfirm={handleResetIni}
        loading={resettingIni}
        confirmText="确认重置"
        cancelText="取消"
        title="重置 Mod 配置 (ini)"
        maxWidth="max-w-md"
      >
        <div className="space-y-3 py-2 text-sm text-text-secondary">
          <p>
            将从备份文件（<code className="text-primary font-mono text-xs">*.qaqm-persistbak</code>）中还原初始配置，清除所有被修改的数值与开关。
          </p>
          <p className="text-xs text-amber-400 bg-amber-500/10 p-2.5 rounded border border-amber-500/20">
            ⚠️ 提示：若该 Mod 从未经过持久化配置，可能不存在备份文件。重置后请按 F10 重新加载生效。
          </p>
        </div>
      </Modal>

      {/* 回滚修复备份弹窗 */}
      <Modal
        isOpen={showRollbackModal}
        onClose={() => !restoringBackup && setShowRollbackModal(false)}
        onConfirm={handleConfirmRestoreBackup}
        loading={restoringBackup}
        confirmText="回滚至选中备份"
        cancelText="取消"
        title="回滚 Mod 修复备份"
        titleHint="选择一次修复时自动生成的 ini 备份快照进行恢复："
        maxWidth="max-w-lg"
      >
        <div className="space-y-3 py-2 text-sm text-text-secondary">
          {loadingBackups ? (
            <div className="py-8 text-center text-xs text-text-muted">正在读取备份记录...</div>
          ) : backupsList.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted bg-surface-secondary/30 rounded border border-border/50">
              未找到该 Mod 的任何 ini 修复备份记录
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {backupsList.map((b) => {
                const isSelected = selectedBackupStamp === b.stamp
                return (
                  <div
                    key={b.stamp}
                    onClick={() => setSelectedBackupStamp(b.stamp)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-primary/10 border-primary text-text-primary'
                        : 'bg-surface-secondary/40 border-border/60 hover:bg-surface-secondary text-text-secondary'
                    }`}
                  >
                    <div>
                      <div className="font-medium text-xs text-text-primary flex items-center gap-2">
                        <span>{b.label}</span>
                        {b.format === 'wuwa-independent' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">独立修复器</span>
                        )}
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5 font-mono">
                        标识: {b.stamp}
                      </div>
                    </div>
                    <div className="text-xs font-mono px-2 py-1 rounded bg-surface-primary/50 text-text-muted">
                      {b.fileCount} 个文件
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Modal>

      <GameBananaDetailDrawer
        isOpen={isMarketDrawerOpen}
        onClose={() => setIsMarketDrawerOpen(false)}
        modId={detectedModId}
        modName={details?.name}
        activeGame={activeGame}
        defaultCharacterName={details?.characterName}
        onInstallSuccess={async (installedPath) => {
          await loadDetails()
          onInstallSuccess?.(installedPath)
        }}
        onNavigateToMarketAuthor={(authorName) => {
          setIsMarketDrawerOpen(false)
          if (onNavigateToMarket) {
            onNavigateToMarket(undefined, authorName, 'author')
          }
        }}
      />
    </div>
  )
}
