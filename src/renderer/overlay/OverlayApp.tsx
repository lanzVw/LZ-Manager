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
  ChevronDown
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { Logo } from '../components/Logo'
import { parseIniHotkeys, ParsedHotkey } from './iniParser'
import { ModDetailedInfo, ModPersistVariable } from '../../core/types'

export const OverlayApp: React.FC = () => {
  const { theme, toggleTheme } = useTheme()
  const [config, setConfig] = useState<any>(null)
  const [activeGame, setActiveGame] = useState<any>(null)
  const [modsData, setModsData] = useState<Record<string, any[]>>({})
  const [characters, setCharacters] = useState<string[]>([])
  const [characterAvatars, setCharacterAvatars] = useState<Record<string, string>>({})
  const [selectedCharIndex, setSelectedCharIndex] = useState<number>(0)
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

  // QAQ 核心模式与过滤状态
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [isReverseOrder, setIsReverseOrder] = useState<boolean>(false)
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

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2000)
  }

  // 1. 初始化数据加载
  const loadData = useCallback(async () => {
    try {
      const cfg = await window.lz.getConfig()
      setConfig(cfg)
      const current = cfg.games.find((g: any) => g.id === cfg.activeGameId) || cfg.games[0]
      setActiveGame(current)

      const mods = await window.lz.scanMods()
      setModsData(mods || {})
      const charList = Object.keys(mods || {})
      setCharacters(charList)

      const presetData = await window.lz.getPresets()
      setPresets(presetData.presets || [])
      setActivePresetId(presetData.activePresetId || null)

      const avatars = await window.lz.getCharacterAvatars?.()
      if (avatars) setCharacterAvatars(avatars)
    } catch (err) {
      console.error('Failed to load overlay data:', err)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 显示的角色列表（支持过滤只看有 Mod 角色）
  const displayCharacters = useMemo(() => {
    if (!filterOnlyWithMods) return characters
    return characters.filter((c) => (modsData[c] || []).length > 0)
  }, [characters, modsData, filterOnlyWithMods])

  // 当前选中的角色及其 Mod 列表
  const currentChar = displayCharacters[selectedCharIndex] || characters[0] || null

  const currentMods = useMemo(() => {
    if (!currentChar) return []
    let list = [...(modsData[currentChar] || [])]

    // 状态过滤 (全部 / 装配 / 停用)
    if (statusFilter === 'enabled') {
      list = list.filter((m) => m.enabled)
    } else if (statusFilter === 'disabled') {
      list = list.filter((m) => !m.enabled)
    }

    // 收藏过滤 (♥)
    if (filterFavoritesOnly) {
      list = list.filter((m) => markedMods[m.fullPath])
    }

    // 倒序
    if (isReverseOrder) {
      list.reverse()
    }

    return list
  }, [currentChar, modsData, statusFilter, filterFavoritesOnly, isReverseOrder, markedMods])

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

  // 组件挂载时自动同步上次保存的窗口缩放尺寸
  useEffect(() => {
    const saved = localStorage.getItem('lz-overlay-window-scale') || localStorage.getItem('lz-overlay-scale')
    const s = saved ? parseFloat(saved) : 1.0
    if (s && s !== 1.0) {
      window.lz.setOverlayScale?.(s)
    }
  }, [])

  // 背景透明度滑块
  const handleOpacityChange = (val: number) => {
    setOpacity(val)
    localStorage.setItem('lz-overlay-opacity', val.toString())
  }

  // 切换单个 Mod 状态
  const handleToggleMod = async (mod: any) => {
    if (!currentChar) return
    const nextState = !mod.enabled

    // 单选互斥逻辑
    if (exclusiveMode && nextState) {
      setModsData((prev) => {
        const copy = { ...prev }
        if (copy[currentChar]) {
          copy[currentChar] = copy[currentChar].map((m) =>
            m.name === mod.name ? { ...m, enabled: true } : { ...m, enabled: false }
          )
        }
        return copy
      })
    } else {
      setModsData((prev) => {
        const copy = { ...prev }
        if (copy[currentChar]) {
          copy[currentChar] = copy[currentChar].map((m) =>
            m.name === mod.name ? { ...m, enabled: nextState } : m
          )
        }
        return copy
      })
    }

    try {
      const res = await window.lz.toggleMod(currentChar, mod.name, nextState)
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
    setReloading(true)
    showToast('正在发送热刷新信号 (F10)...')
    try {
      await window.lz.reloadModsF10()
      const updated = await window.lz.scanMods()
      setModsData(updated || {})
      showToast('F10 热刷新成功！')
    } catch {
      showToast('刷新失败')
    } finally {
      setTimeout(() => setReloading(false), 500)
    }
  }

  // 一键应用方案预设
  const handleApplyPreset = async (presetId: string) => {
    showToast('正在部署预设方案...')
    try {
      const res = await window.lz.applyPreset(presetId)
      if (res && res.success) {
        setActivePresetId(presetId)
        const updated = await window.lz.scanMods()
        setModsData(updated || {})
        showToast('方案预设已生效！')
      } else {
        showToast('预设应用失败')
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
      const el = document.getElementById(`mod-card-${idx}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-4', 'ring-primary')
        setTimeout(() => el.classList.remove('ring-4', 'ring-primary'), 1000)
      }
      showToast('已定位至当前生效 Mod')
    } else {
      showToast('当前筛选下暂无生效中的 Mod')
    }
  }

  // 打开 Mod 详情抽屉 (QAQ 侧滑详情)
  const handleOpenDetail = async (mod: any) => {
    setActiveDetailMod(mod)
    setLoadingHotkeys(true)
    try {
      const details = await window.lz.getModDetails(mod.fullPath)
      setActiveModDetails(details)

      // 解析 INI 文件中的 KeyBind
      if (details?.iniFiles && details.iniFiles.length > 0) {
        const fullContent = await window.lz.readIni(details.iniFiles[0].fullPath)
        const hotkeys = parseIniHotkeys(fullContent)
        setParsedHotkeys(hotkeys)
      } else {
        setParsedHotkeys([])
      }
    } catch (err) {
      console.error('Failed to load detail for overlay:', err)
    } finally {
      setLoadingHotkeys(false)
    }
  }

  // 调节 Persist Bridge 参数
  const handleUpdatePersistVar = async (v: ModPersistVariable, targetVal?: string) => {
    if (!activeModDetails) return
    const allowed = v.allowedValues && v.allowedValues.length > 0 ? v.allowedValues : ['0', '1']
    let nextVal = targetVal
    if (nextVal === undefined) {
      const currIdx = allowed.indexOf(v.currentValue)
      nextVal = currIdx >= 0 ? allowed[(currIdx + 1) % allowed.length] : allowed[0]
    }

    try {
      await window.lz.updateModVariable(activeModDetails.fullPath, v.name, nextVal)
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
      showToast(`已更新 $${v.name} = ${nextVal}`)
    } catch {
      showToast('更新参数失败')
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


  // 当上下键或手柄聚焦选中 Mod 改变时，确保其平滑滚动进入视野
  useEffect(() => {
    const el = document.getElementById(`mod-card-${focusedModIndex}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [focusedModIndex])

  // 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        setSelectedCharIndex((prev) => (prev > 0 ? prev - 1 : displayCharacters.length - 1))
        setFocusedModIndex(0)
      } else if (e.key === 'ArrowRight') {
        setSelectedCharIndex((prev) => (prev < displayCharacters.length - 1 ? prev + 1 : 0))
        setFocusedModIndex(0)
      } else if (e.key === 'Enter') {
        if (currentMods[focusedModIndex]) {
          handleToggleMod(currentMods[focusedModIndex])
        }
      } else if (e.key === 'F10') {
        handleReloadF10()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentMods, focusedModIndex, displayCharacters.length, activeDetailMod, isCharDrawerOpen, isSettingsOpen])

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
            setSelectedCharIndex((prev) => (prev > 0 ? prev - 1 : displayCharacters.length - 1))
            setFocusedModIndex(0)
            lastGamepadInputTime.current = now
          } else if (dpadRight) {
            setSelectedCharIndex((prev) => (prev < displayCharacters.length - 1 ? prev + 1 : 0))
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
  }, [currentMods, focusedModIndex, displayCharacters.length, activeDetailMod, isCharDrawerOpen, isSettingsOpen])

  return (
    <div
      className="w-full h-full p-2 flex flex-col select-none antialiased overflow-hidden font-sans text-text relative bg-transparent box-border"
    >
      {/* 悬浮窗面板卡片主体 (QAQ overlay-panel) */}
      <div
        className="w-full h-full min-h-0 flex flex-col rounded-[16px] border border-white/60 dark:border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.2)] overflow-hidden relative box-border"
        style={{
          backgroundColor: `color-mix(in srgb, var(--surface) ${Math.round(opacity * 100)}%, transparent)`,
          backdropFilter: `blur(${Math.max(4, Math.round(opacity * 28))}px)`,
          WebkitBackdropFilter: `blur(${Math.max(4, Math.round(opacity * 28))}px)`
        }}
      >
        {/* Toast 提示浮条 */}
        {toastMsg && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-full bg-primary text-primary-fg text-xs font-semibold shadow-lg animate-in fade-in zoom-in-95 duration-fast pointer-events-none whitespace-nowrap">
            {toastMsg}
          </div>
        )}

        {/* 1. 顶栏：QAQ 风格功能操作 (🎮 Mod 切换 | A- 100% A+ ⚙️ 📌 🌗 🔄 ✕) */}
        <div
          className="h-12 px-3.5 border-b border-border/60 flex items-center justify-between shrink-0 backdrop-blur-md drag-region"
          style={{
            backgroundColor: `color-mix(in srgb, var(--surface) ${Math.round(opacity * 70)}%, transparent)`
          }}
        >
          <div className="flex items-center space-x-2 no-drag">
            <div className="rounded-[6px] shadow-xs overflow-hidden">
              <Logo size={20} />
            </div>
            <span className="font-title font-extrabold text-xs tracking-tight text-text">
              Mod 切换
            </span>
          </div>

          {/* 右侧操作按钮组 */}
          <div className="flex items-center space-x-1 no-drag">
            {/* 窗口大小缩放 (A- / 100% / A+) */}
            <div className="flex items-center bg-surface-2/80 rounded-md border border-border/80 p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => handleScaleChange(-0.1)}
                className="px-1.5 py-0.5 rounded text-text-muted hover:text-text hover:bg-surface font-mono font-bold cursor-pointer transition-colors"
                title="缩小窗口大小 (A-)"
              >
                A-
              </button>
              <button
                type="button"
                onClick={handleResetScale}
                className="px-1.5 py-0.5 rounded text-primary hover:bg-surface font-mono font-bold cursor-pointer transition-colors"
                title="重置窗口大小 (100%)"
              >
                {Math.round(windowScale * 100)}%
              </button>
              <button
                type="button"
                onClick={() => handleScaleChange(0.1)}
                className="px-1.5 py-0.5 rounded text-text-muted hover:text-text hover:bg-surface font-mono font-bold cursor-pointer transition-colors"
                title="放大窗口大小 (A+)"
              >
                A+
              </button>
            </div>

            {/* ⚙️ 设置面板按钮 */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`p-1.5 rounded-md border transition-colors cursor-pointer text-[11px] ${
                isSettingsOpen
                  ? 'bg-primary text-primary-fg border-primary shadow-xs'
                  : 'bg-surface-2/80 text-text-muted hover:text-text border-border/80'
              }`}
              title="设置"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            {/* 📌 锁定置顶按钮 */}
            <button
              type="button"
              onClick={() => {
                setIsPinned(!isPinned)
                showToast(isPinned ? '窗口置顶已解除' : '窗口已锁定置顶')
              }}
              className={`p-1.5 rounded-md border transition-colors cursor-pointer text-[11px] ${
                isPinned
                  ? 'bg-primary/15 text-primary border-primary/40 shadow-2xs font-bold'
                  : 'bg-surface-2/80 text-text-muted border-border/80 hover:text-text'
              }`}
              title="置顶窗口"
            >
              <Pin className="w-3.5 h-3.5" />
            </button>

            {/* 🌗 亮暗主题切换 */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 rounded-md bg-surface-2/80 hover:bg-surface border border-border/80 text-text-muted hover:text-primary transition-colors cursor-pointer text-[11px]"
              title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-primary" />}
            </button>

            {/* 🔄 F10 热刷新 */}
            <button
              type="button"
              onClick={handleReloadF10}
              disabled={reloading}
              className="p-1.5 rounded-md bg-surface-2/80 hover:bg-surface border border-border/80 text-text-muted hover:text-primary transition-colors cursor-pointer text-[11px]"
              title="向游戏发送热刷新信号 (F10)"
            >
              <RotateCw className={`w-3.5 h-3.5 ${reloading ? 'animate-spin' : ''}`} />
            </button>

            {/* ✕ 关闭 */}
            <button
              type="button"
              onClick={() => window.lz.hideOverlay()}
              className="p-1.5 rounded-md bg-surface-2/80 hover:bg-danger text-text-muted hover:text-white transition-colors cursor-pointer text-[11px]"
              title="隐藏悬浮窗 (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 2. 角色胶囊滚动条 (QAQ char-strip: ☰ 气泡按钮 + 横向胶囊条 + ♥ 收藏 + 🎯 过滤) */}
        <div
          onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY }}
          className="px-3 py-1.5 border-b border-border/50 flex items-center space-x-1.5 overflow-x-auto shrink-0 scrollbar-none"
          style={{
            backgroundColor: `color-mix(in srgb, var(--surface) ${Math.round(opacity * 50)}%, transparent)`
          }}
        >
          {/* ☰ 角色全量浏览气泡按钮 */}
          <button
            type="button"
            onClick={() => setIsCharDrawerOpen(!isCharDrawerOpen)}
            className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-2xs ${
              isCharDrawerOpen
                ? 'bg-primary text-primary-fg border-primary shadow-xs'
                : 'bg-surface-2/80 text-text hover:bg-surface border-border/80'
            }`}
            title="全部角色头像菜单"
          >
            <Menu className="w-3.5 h-3.5" />
          </button>

          {/* 角色横向滚动胶囊 */}
          <div className="flex items-center space-x-1 flex-1 overflow-x-auto scrollbar-none">
            {displayCharacters.map((charName, idx) => {
              const isSelected = idx === selectedCharIndex
              const mods = modsData[charName] || []
              const enabledCount = mods.filter((m) => m.enabled).length

              return (
                <button
                  key={charName}
                  type="button"
                  onClick={() => {
                    setSelectedCharIndex(idx)
                    setFocusedModIndex(0)
                  }}
                  className={`px-2.5 py-1 rounded-[6px] text-[11px] font-semibold shrink-0 flex items-center space-x-1.5 transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-surface text-primary border-primary/50 shadow-xs ring-1 ring-primary/20 font-bold'
                      : 'bg-surface-2/60 text-text-muted hover:text-text hover:bg-surface border-transparent'
                  }`}
                >
                  <span className="font-title font-bold tracking-wide truncate max-w-[80px]">{charName}</span>
                  <span
                    className={`text-[9px] font-mono px-1 py-0.2 rounded-full font-bold ${
                      isSelected
                        ? 'bg-primary text-primary-fg'
                        : enabledCount > 0
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        : 'bg-surface/80 text-text-muted'
                    }`}
                  >
                    {enabledCount}/{mods.length}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ♥ 收藏过滤按钮 */}
          <button
            type="button"
            onClick={() => {
              setFilterFavoritesOnly(!filterFavoritesOnly)
              showToast(filterFavoritesOnly ? '已显示全部 Mod' : '仅查看已标记 Mod')
            }}
            className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-2xs ${
              filterFavoritesOnly
                ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                : 'bg-surface-2/80 text-text-muted hover:text-amber-500 border-border/80'
            }`}
            title="只显示已标记 Mod"
          >
            <Heart className={`w-3.5 h-3.5 ${filterFavoritesOnly ? 'fill-current' : ''}`} />
          </button>

          {/* 🎯 只显示有 Mod 角色过滤 */}
          <button
            type="button"
            onClick={() => {
              setFilterOnlyWithMods(!filterOnlyWithMods)
              showToast(filterOnlyWithMods ? '显示所有角色' : '仅显示有 Mod 角色')
            }}
            className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-2xs ${
              filterOnlyWithMods
                ? 'bg-primary/20 text-primary border-primary/40'
                : 'bg-surface-2/80 text-text-muted hover:text-primary border-border/80'
            }`}
            title="只显示有 Mod 的角色"
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 3. 过滤与实用工具条 (QAQ sort-bar: 状态[全部/装配/停用/倒序] + 🎯定位 + 🔘单选 + ⊞画廊) */}
        <div className="px-3 py-1.5 border-b border-border/50 bg-surface-2/50 flex items-center justify-between text-xs shrink-0">
          {/* 状态过滤胶囊行 */}
          <div className="flex items-center space-x-1">
            <span className="text-[10px] text-text-muted mr-0.5">状态:</span>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-all ${
                statusFilter === 'all'
                  ? 'bg-primary text-primary-fg font-bold shadow-2xs'
                  : 'bg-surface/60 text-text-muted hover:text-text border border-border/50'
              }`}
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('enabled')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-all ${
                statusFilter === 'enabled'
                  ? 'bg-primary text-primary-fg font-bold shadow-2xs'
                  : 'bg-surface/60 text-text-muted hover:text-text border border-border/50'
              }`}
            >
              装配
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('disabled')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-all ${
                statusFilter === 'disabled'
                  ? 'bg-primary text-primary-fg font-bold shadow-2xs'
                  : 'bg-surface/60 text-text-muted hover:text-text border border-border/50'
              }`}
            >
              停用
            </button>
            <button
              type="button"
              onClick={() => setIsReverseOrder(!isReverseOrder)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-all ${
                isReverseOrder
                  ? 'bg-primary/20 text-primary border border-primary/40 font-bold'
                  : 'bg-surface/60 text-text-muted hover:text-text border border-border/50'
              }`}
              title="切换倒序排列"
            >
              倒序
            </button>
          </div>

          {/* 快捷工具 (🎯 定位 | 🔘 单选 | ⊞ 画廊) */}
          <div className="flex items-center space-x-1">
            {/* 🎯 定位 */}
            <button
              type="button"
              onClick={handleLocateEnabled}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-surface border border-border/80 text-[10px] font-semibold text-text hover:text-primary transition-all cursor-pointer shadow-2xs"
              title="定位当前生效 Mod"
            >
              <Crosshair className="w-3 h-3 text-primary" />
              <span>定位</span>
            </button>

            {/* 🔘 单选互斥 */}
            <button
              type="button"
              onClick={() => {
                setExclusiveMode(!exclusiveMode)
                showToast(exclusiveMode ? '已切换为：多选并存模式' : '已切换为：单选互斥保护模式')
              }}
              className={`flex items-center space-x-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold transition-all cursor-pointer shadow-2xs ${
                exclusiveMode
                  ? 'bg-primary/15 text-primary border-primary/40 font-bold'
                  : 'bg-surface text-text-muted border-border/80 hover:text-text'
              }`}
              title="点击切换单选互斥模式"
            >
              <span>🔘 单选</span>
            </button>

            {/* ⊞ 画廊 / ☰ 列表视图切换 */}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="px-2 py-0.5 rounded-full bg-primary text-primary-fg font-bold text-[10px] flex items-center space-x-1 shadow-2xs transition-all cursor-pointer hover:brightness-105"
              title="切换列表/画廊视图"
            >
              <span>{viewMode === 'grid' ? '画廊' : '列表'}</span>
            </button>

            {/* 🔼 / 🔽 上下翻页快捷按钮 */}
            <div className="flex items-center space-x-0.5 border-l border-border/50 pl-1">
              <button
                type="button"
                onClick={() => modListContainerRef.current?.scrollBy({ top: -300, behavior: 'smooth' })}
                className="p-1 rounded text-text-muted hover:text-primary hover:bg-surface-2 transition-colors cursor-pointer"
                title="向上翻页 (PageUp / 鼠标滚轮向上)"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => modListContainerRef.current?.scrollBy({ top: 300, behavior: 'smooth' })}
                className="p-1 rounded text-text-muted hover:text-primary hover:bg-surface-2 transition-colors cursor-pointer"
                title="向下翻页 (PageDown / 鼠标滚轮向下)"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 4. 主内容流：自适应画廊网格 / 单列列表 */}
        <div
          ref={modListContainerRef}
          className="flex-1 min-h-0 overflow-y-auto p-2.5 overscroll-contain overlay-scroll"
        >
          {currentMods.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-2">
              <Layers className="w-10 h-10 stroke-[1.2] opacity-40" />
              <p className="text-xs">【{currentChar || '无'}】暂无符合条件的 Mod</p>
            </div>
          ) : viewMode === 'grid' ? (
            /* 严格一排显示 3 个 (grid-cols-3) 4:3 封面 + 右下角悬浮笔标 + 底栏 Mod 名与 iOS Switch */
            <div className="grid grid-cols-3 gap-2">
              {currentMods.map((mod, idx) => {
                const isFocused = idx === focusedModIndex
                const isMarked = !!markedMods[mod.fullPath]

                return (
                  <div
                    id={`mod-card-${idx}`}
                    key={mod.id || mod.name}
                    onClick={() => handleOpenDetail(mod)}
                    className={`group relative rounded-[10px] border flex flex-col justify-between overflow-hidden transition-all cursor-pointer ${
                      mod.enabled
                        ? 'bg-surface border-primary ring-2 ring-primary/40 shadow-md'
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
                        <div className="absolute top-1 left-1 p-0.5 rounded-full bg-amber-500 text-white shadow-xs">
                          <Bookmark className="w-2.5 h-2.5 fill-current" />
                        </div>
                      )}

                      {/* INI 标识 (右上角) */}
                      {mod.hasIni && (
                        <span className="absolute top-1 right-1 px-1 py-0.2 rounded text-[8px] font-mono font-bold bg-black/60 text-white backdrop-blur-xs">
                          INI
                        </span>
                      )}

                      {/* 右下角圆形悬浮笔标 (QAQ 招牌 mod-gallery-mark，点击直达详情) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenDetail(mod)
                        }}
                        className="absolute right-1 bottom-1 w-5 h-5 rounded-full bg-surface/90 hover:bg-primary text-text-muted hover:text-white border border-border/60 flex items-center justify-center shadow-md transition-all cursor-pointer opacity-80 group-hover:opacity-100 hover:scale-110"
                        title="查看 Mod 详情与快捷键"
                      >
                        <Edit3 className="w-2.5 h-2.5" />
                      </button>
                    </div>

                    {/* 卡片底栏 (QAQ mod-gallery-footer: Mod 名字 + iOS Switch) */}
                    <div className="flex items-center justify-between gap-1 px-1.5 py-1 bg-surface/95 border-t border-border/40">
                      <h4
                        className={`text-[10px] font-bold truncate flex-1 leading-snug transition-colors ${
                          mod.enabled ? 'text-primary' : 'text-text'
                        }`}
                        title={mod.name}
                      >
                        {mod.name}
                      </h4>

                      {/* iOS 风格滑动开关 (QAQ Switch) */}
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
            <div className="space-y-1.5">
              {currentMods.map((mod, idx) => {
                const isFocused = idx === focusedModIndex
                const isMarked = !!markedMods[mod.fullPath]

                return (
                  <div
                    id={`mod-card-${idx}`}
                    key={mod.id || mod.name}
                    onClick={() => handleOpenDetail(mod)}
                    className={`rounded-[8px] border p-2 flex items-center justify-between space-x-2.5 transition-all cursor-pointer ${
                      mod.enabled
                        ? 'bg-surface border-primary ring-1 ring-primary/30 shadow-xs'
                        : 'bg-surface/80 border-border/80 hover:border-primary/40'
                    } ${isFocused ? 'ring-2 ring-primary scale-[1.01]' : ''}`}
                  >
                    <div className="w-10 h-10 rounded-md bg-surface-2/60 overflow-hidden shrink-0 flex items-center justify-center border border-border/60">
                      {mod.coverPath ? (
                        <img
                          src={`file://${mod.coverPath}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-text-muted opacity-40" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-1">
                        {isMarked && <Bookmark className="w-3 h-3 text-amber-500 fill-current shrink-0" />}
                        <h4 className={`text-xs font-semibold truncate ${mod.enabled ? 'text-primary font-bold' : 'text-text'}`}>
                          {mod.name}
                        </h4>
                      </div>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className="text-[10px] text-text-muted">
                          {mod.enabled ? '已激活' : '待命'}
                        </span>
                        {mod.hasIni && (
                          <span className="text-[8px] px-1 rounded bg-surface border border-border text-primary font-mono font-semibold">
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
        </div>

        {/* 5. 底部栏 (QAQ preset-section: 📦 预设方案胶囊行 + 快捷提示 + 计数) */}
        <div
          className="border-t border-border/60 backdrop-blur-md p-2 space-y-1 shrink-0"
          style={{
            backgroundColor: `color-mix(in srgb, var(--surface) ${Math.round(opacity * 75)}%, transparent)`
          }}
        >
          {/* 预设方案胶囊行 */}
          {presets.length > 0 && (
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <span className="text-[10px] font-bold text-text-muted shrink-0 flex items-center space-x-1">
                <span>📦</span>
                <span>预设:</span>
              </span>
              {presets.map((p) => {
                const isActive = activePresetId === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleApplyPreset(p.id)}
                    className={`px-2 py-0.5 rounded-[5px] text-[10px] font-semibold shrink-0 border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-primary text-primary-fg border-primary shadow-2xs font-bold'
                        : 'bg-surface hover:bg-surface-2 text-text-muted hover:text-text border-border/60'
                    }`}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* 底部操作提示与角色序号 (QAQ footer-hint) */}
          <div className="flex items-center justify-between text-[10px] text-text-muted pt-0.5">
            <div className="flex items-center space-x-2 truncate">
              <Gamepad2 className={`w-3.5 h-3.5 ${gamepadConnected ? 'text-emerald-500' : 'text-text-muted'}`} />
              <span className="truncate">
                {gamepadConnected
                  ? '[A]开关 [LB/RB]切角色 [Y]刷新'
                  : '←/→ 切换角色 | Esc 隐藏'}
              </span>
            </div>

            <div className="flex items-center space-x-2 font-mono font-bold shrink-0">
              <span>
                {selectedCharIndex + 1} / {displayCharacters.length || 1}
              </span>
            </div>
          </div>
        </div>

        {/* ================= 侧滑抽屉 1: Mod 详情面板 (1:1 QAQ side-panel.html 复刻) ================= */}
        {activeDetailMod && (
          <div className="absolute inset-0 z-40 bg-surface/96 backdrop-blur-2xl flex flex-col animate-in fade-in slide-in-from-left duration-fast overflow-hidden">
            {/* Header: Mod 名字 + 缩小 / 放大 / 关闭 (QAQ side-header) */}
            <div className="h-11 px-3 border-b border-border/60 flex items-center justify-between shrink-0 bg-surface/70">
              <div className="flex items-center space-x-2 flex-1 min-w-0 mr-2">
                <span className="font-title text-sm font-bold text-text truncate">
                  {activeDetailMod.name}
                </span>
              </div>

              <div className="flex items-center space-x-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleScaleChange(-0.1)}
                  className="w-6 h-6 rounded border border-border/60 bg-surface/80 hover:bg-surface text-text-muted hover:text-text flex items-center justify-center cursor-pointer text-[10px]"
                  title="缩小"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleScaleChange(0.1)}
                  className="w-6 h-6 rounded border border-border/60 bg-surface/80 hover:bg-surface text-text-muted hover:text-text flex items-center justify-center cursor-pointer text-[10px]"
                  title="放大"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailMod(null)}
                  className="w-6 h-6 rounded border border-border/60 bg-surface/80 hover:bg-danger text-text-muted hover:text-white flex items-center justify-center cursor-pointer text-[10px] transition-colors"
                  title="关闭"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Body: 预览大图 + 状态 + 标记此 Mod + 快捷键表格 + 部件调节 + 底部大按钮 */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 overlay-scroll">
              {/* 预览大图 (QAQ detail-preview-img) */}
              <div className="relative aspect-[16/9] rounded-[10px] overflow-hidden bg-surface-2/60 border border-border/60 flex items-center justify-center">
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

              {/* 状态与角色 (QAQ 状态条) */}
              <div className="text-[11px] text-text-muted flex items-center justify-between">
                <span>
                  状态: {activeDetailMod.enabled ? '✅ 已启用' : '⬜ 已停用'} | 角色:{' '}
                  <span className="font-title font-bold text-text">{currentChar}</span>
                </span>
              </div>

              {/* 标记按钮 (QAQ detailMarkBtn) */}
              <button
                type="button"
                onClick={() => handleToggleMark(activeDetailMod.fullPath)}
                className={`w-full py-2 rounded-[10px] text-xs font-bold border transition-all cursor-pointer flex items-center justify-center space-x-1.5 shadow-2xs ${
                  markedMods[activeDetailMod.fullPath]
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-surface hover:bg-surface-2 text-text-muted hover:text-text border-border/80'
                }`}
              >
                <span>{markedMods[activeDetailMod.fullPath] ? '🏷️ 取消标记' : '🔖 标记此 Mod'}</span>
              </button>

              {/* ⌨️ 快捷键分区 (QAQ detail-hotkey-section) */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-bold text-text flex items-center space-x-1">
                  <span>⌨️</span>
                  <span>快捷键</span>
                </div>

                {loadingHotkeys ? (
                  <div className="p-3 rounded-[8px] bg-surface-2/60 border border-border/60 text-[10px] text-text-muted text-center">
                    快捷键加载中...
                  </div>
                ) : parsedHotkeys.length === 0 ? (
                  <div className="p-3 rounded-[8px] bg-surface-2/60 border border-border/60 text-[10px] text-text-muted text-center">
                    无专属按键 (可通过游戏原生快捷键控制)
                  </div>
                ) : (
                  <div className="space-y-1">
                    {parsedHotkeys.map((h, idx) => (
                      <div
                        key={idx}
                        onClick={() => showToast(`快捷键 [${h.keys.join('+')}]`)}
                        className="p-2 rounded-[8px] bg-surface-2/60 hover:bg-surface border border-border/60 flex items-center justify-between text-xs transition-colors cursor-pointer"
                        title="点击查看快捷键提示"
                      >
                        <span className="font-semibold text-[11px] text-text truncate mr-2">
                          {h.name}
                        </span>

                        <div className="flex items-center space-x-1 shrink-0">
                          {h.keys.map((k, kIdx) => (
                            <kbd key={kIdx} className="detail-kbd">
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 🎛️ Persist Bridge 服装/部件调控 (如果有) */}
              {activeModDetails?.persistInfo?.hasPersist && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center space-x-1.5 text-[11px] font-bold text-text">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                    <span>服装与部件参数调节</span>
                  </div>

                  <div className="space-y-1.5">
                    {activeModDetails.persistInfo.variables.map((v) => {
                      const allowed = v.allowedValues && v.allowedValues.length > 0 ? v.allowedValues : ['0', '1']
                      const isBinary = allowed.length === 2 && allowed.includes('0') && allowed.includes('1')
                      const isOn = v.currentValue === '1'

                      return (
                        <div
                          key={v.name}
                          className="p-2 rounded-[8px] bg-surface-2/60 border border-border/60 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-mono font-bold text-[11px] text-text">${v.name}</span>
                            <span className="text-[10px] text-text-muted ml-1.5">值: {v.currentValue}</span>
                          </div>

                          {isBinary ? (
                            <button
                              type="button"
                              onClick={() => handleUpdatePersistVar(v, isOn ? '0' : '1')}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer border ${
                                isOn
                                  ? 'bg-primary text-primary-fg border-primary font-bold'
                                  : 'bg-surface text-text-muted border-border'
                              }`}
                            >
                              {isOn ? '开启' : '关闭'}
                            </button>
                          ) : (
                            <div className="flex items-center space-x-1">
                              {allowed.map((val) => (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => handleUpdatePersistVar(v, val)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer border ${
                                    v.currentValue === val
                                      ? 'bg-primary text-primary-fg border-primary'
                                      : 'bg-surface text-text hover:text-primary border-border'
                                  }`}
                                >
                                  {val}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 底部大按钮 (QAQ detailToggleBtn) */}
              <button
                type="button"
                onClick={() => handleToggleMod(activeDetailMod)}
                className={`w-full py-2.5 rounded-[10px] text-xs font-bold transition-all cursor-pointer shadow-md flex items-center justify-center space-x-1.5 ${
                  activeDetailMod.enabled
                    ? 'bg-surface-2 hover:bg-danger text-text-muted hover:text-white border border-border/80'
                    : 'bg-primary text-primary-fg hover:brightness-105'
                }`}
              >
                {activeDetailMod.enabled ? (
                  <>
                    <span>⬜</span>
                    <span>停用此 Mod</span>
                  </>
                ) : (
                  <>
                    <span>✅</span>
                    <span>装配启用此 Mod</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ================= 侧滑抽屉 2: 全部角色网格浏览 (对应 ☰) ================= */}
        {isCharDrawerOpen && (
          <div className="absolute inset-0 z-40 bg-surface/96 backdrop-blur-2xl flex flex-col animate-in fade-in slide-in-from-left duration-fast overflow-hidden">
            <div className="h-11 px-3 border-b border-border/60 flex items-center justify-between shrink-0 bg-surface/70">
              <div className="flex items-center space-x-1.5">
                <Menu className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-xs font-bold text-text">角色全览 ({characters.length})</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCharDrawerOpen(false)}
                className="w-6 h-6 rounded border border-border/60 bg-surface/80 hover:bg-surface text-text-muted hover:text-text flex items-center justify-center cursor-pointer text-[10px]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 搜索框 */}
            <div className="p-2.5 border-b border-border/50">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="搜索角色名..."
                  value={charSearchQuery}
                  onChange={(e) => setCharSearchQuery(e.target.value)}
                  className="w-full bg-surface-2/80 border border-border/80 focus:border-primary rounded-[8px] pl-8 pr-3 py-1.5 text-xs text-text focus:outline-none"
                />
              </div>
            </div>

            {/* 3 列角色头像气泡网格 (QAQ bubble-grid) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 grid grid-cols-3 gap-2.5 overlay-scroll">
              {characters
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
                        const realIdx = displayCharacters.indexOf(name)
                        if (realIdx >= 0) setSelectedCharIndex(realIdx)
                        setIsCharDrawerOpen(false)
                        setFocusedModIndex(0)
                      }}
                      className={`flex flex-col items-center p-2 rounded-[12px] border transition-all text-center cursor-pointer ${
                        isSelected
                          ? 'bg-primary/10 border-primary ring-2 ring-primary/20 shadow-xs'
                          : 'bg-surface hover:bg-surface-2 border-border/60'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden border border-border/80 mb-1.5 relative bg-surface-2/80 flex items-center justify-center shadow-xs">
                        {avatar ? (
                          <img src={`file://${avatar}`} alt="" className="w-full h-full object-cover object-top" />
                        ) : (
                          <span className="font-bold text-xs text-text-muted">{name.slice(0, 1)}</span>
                        )}
                        {enabledCount > 0 && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-surface" />
                        )}
                      </div>
                      <span className="font-title text-xs font-bold text-text truncate max-w-full">
                        {name}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono mt-0.5">
                        {enabledCount}/{mods.length}
                      </span>
                    </button>
                  )
                })}
            </div>
          </div>
        )}

        {/* ================= 侧滑抽屉 3: 设置面板 (对应 ⚙️) ================= */}
        {isSettingsOpen && (
          <div className="absolute inset-0 z-40 bg-surface/96 backdrop-blur-2xl flex flex-col animate-in fade-in slide-in-from-left duration-fast overflow-hidden">
            <div className="h-11 px-3 border-b border-border/60 flex items-center justify-between shrink-0 bg-surface/70">
              <div className="flex items-center space-x-1.5">
                <Settings className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-xs font-bold text-text">⚙️ 悬浮窗设置</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="w-6 h-6 rounded border border-border/60 bg-surface/80 hover:bg-surface text-text-muted hover:text-text flex items-center justify-center cursor-pointer text-[10px]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-xs overlay-scroll">
              {/* 背景透明度调节 */}
              <div className="space-y-1.5">
                <div className="font-bold text-text">背景不透明度</div>
                <div className="flex items-center space-x-3">
                  <span className="text-[10px] text-text-muted">透明</span>
                  <input
                    type="range"
                    min="15"
                    max="100"
                    value={Math.round(opacity * 100)}
                    onChange={(e) => handleOpacityChange(parseInt(e.target.value) / 100)}
                    className="flex-1 accent-primary cursor-pointer"
                  />
                  <span className="font-mono font-bold text-primary w-9 text-right">
                    {Math.round(opacity * 100)}%
                  </span>
                </div>
              </div>

              {/* 单选互斥保护模式 */}
              <div className="flex items-center justify-between p-2.5 rounded-[8px] bg-surface-2/60 border border-border/60">
                <div>
                  <div className="font-bold text-text">单选互斥保护</div>
                  <div className="text-[10px] text-text-muted">启用同角色新 Mod 时自动停用其他 Mod</div>
                </div>
                <button
                  type="button"
                  onClick={() => setExclusiveMode(!exclusiveMode)}
                  className={`qaq-switch ${exclusiveMode ? 'active' : ''}`}
                />
              </div>

              {/* 唤出热键提示 */}
              <div className="space-y-1">
                <div className="font-bold text-text">呼出/隐藏快捷键</div>
                <div className="p-2 rounded-[8px] bg-surface-2/60 border border-border/60 font-mono font-bold text-primary flex items-center justify-between">
                  <span>Ctrl + F / Alt + F</span>
                  <span className="text-[10px] text-text-muted font-normal">系统全局快捷键</span>
                </div>
              </div>

              {/* Persist Bridge 缓存清空 */}
              <div className="pt-2 border-t border-border/60 space-y-1.5">
                <div className="font-bold text-text">维护与重置</div>
                <button
                  type="button"
                  onClick={async () => {
                    await window.lz.clearPersistCache?.()
                    showToast('已清空 Persist Bridge 缓存')
                  }}
                  className="w-full py-1.5 rounded-[8px] bg-surface border border-border/80 hover:bg-surface-2 text-text-muted hover:text-text font-semibold text-xs cursor-pointer"
                >
                  清空 Persist Bridge 缓存
                </button>
              </div>

              {/* 品牌标识 */}
              <div className="pt-2 flex items-center justify-center gap-1.5 opacity-60">
                <Logo size={14} />
                <span className="font-title text-[10px] font-bold tracking-wider text-text-muted">
                  LZ MANAGER
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
