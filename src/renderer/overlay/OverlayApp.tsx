import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  RotateCw,
  X,
  Sliders,
  CheckCircle2,
  XCircle,
  Gamepad2,
  ChevronDown,
  Layers,
  Sparkles,
  Zap,
  ShieldCheck,
  Image as ImageIcon
} from 'lucide-react'

export const OverlayApp: React.FC = () => {
  const [config, setConfig] = useState<any>(null)
  const [activeGame, setActiveGame] = useState<any>(null)
  const [modsData, setModsData] = useState<Record<string, any[]>>({})
  const [characters, setCharacters] = useState<string[]>([])
  const [selectedCharIndex, setSelectedCharIndex] = useState<number>(0)
  const [focusedModIndex, setFocusedModIndex] = useState<number>(0)
  const [presets, setPresets] = useState<any[]>([])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [reloading, setReloading] = useState<boolean>(false)
  const [gamepadConnected, setGamepadConnected] = useState<boolean>(false)
  const [uiScale, setUiScale] = useState<number>(1)
  const [opacity, setOpacity] = useState<number>(0.92)

  const lastGamepadInputTime = useRef<number>(0)

  // 1. 加载配置与数据
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
    } catch (err) {
      console.error('Failed to load overlay data:', err)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 当前选中的角色及其 Mod
  const currentChar = characters[selectedCharIndex] || null
  const currentMods = currentChar ? modsData[currentChar] || [] : []

  // 切换 Mod
  const handleToggleMod = async (mod: any) => {
    if (!currentChar) return
    const res = await window.lz.toggleMod(currentChar, mod.name, !mod.enabled)
    if (res.success) {
      const updated = await window.lz.scanMods()
      setModsData(updated || {})
    }
  }

  // 触发 F10
  const handleReloadF10 = async () => {
    setReloading(true)
    await window.lz.reloadModsF10()
    const updated = await window.lz.scanMods()
    setModsData(updated || {})
    setTimeout(() => setReloading(false), 600)
  }

  // 应用预设
  const handleApplyPreset = async (presetId: string) => {
    const res = await window.lz.applyPreset(presetId)
    if (res.success) {
      setActivePresetId(presetId)
      const updated = await window.lz.scanMods()
      setModsData(updated || {})
    }
  }

  // 键盘 Esc 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.lz.hideOverlay()
      } else if (e.key === 'ArrowUp') {
        setFocusedModIndex((prev) => Math.max(0, prev - 1))
      } else if (e.key === 'ArrowDown') {
        setFocusedModIndex((prev) => Math.min(currentMods.length - 1, prev + 1))
      } else if (e.key === 'ArrowLeft') {
        setSelectedCharIndex((prev) => (prev > 0 ? prev - 1 : characters.length - 1))
        setFocusedModIndex(0)
      } else if (e.key === 'ArrowRight') {
        setSelectedCharIndex((prev) => (prev < characters.length - 1 ? prev + 1 : 0))
        setFocusedModIndex(0)
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (currentMods[focusedModIndex]) {
          handleToggleMod(currentMods[focusedModIndex])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentMods, focusedModIndex, characters.length])

  // 2. 原生 Gamepad 手柄 API 轮询
  useEffect(() => {
    const onConnect = () => setGamepadConnected(true)
    const onDisconnect = () => setGamepadConnected(false)
    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)

    let animId: number
    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
      const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3]

      if (gp && gp.connected) {
        setGamepadConnected(true)
        const now = Date.now()

        // 节流处理 (180ms 防止按键疯狂滚动)
        if (now - lastGamepadInputTime.current > 180) {
          const dpadUp = gp.buttons[12]?.pressed || gp.axes[1] < -0.5
          const dpadDown = gp.buttons[13]?.pressed || gp.axes[1] > 0.5
          const dpadLeft = gp.buttons[14]?.pressed || gp.axes[0] < -0.5 || gp.buttons[4]?.pressed // LB
          const dpadRight = gp.buttons[15]?.pressed || gp.axes[0] > 0.5 || gp.buttons[5]?.pressed // RB
          const btnA = gp.buttons[0]?.pressed // A (Xbox) / Cross (PS)
          const btnB = gp.buttons[1]?.pressed // B (Xbox) / Circle (PS)
          const btnY = gp.buttons[3]?.pressed // Y (Xbox) / Triangle (PS)
          const btnStart = gp.buttons[9]?.pressed

          if (dpadUp) {
            setFocusedModIndex((prev) => Math.max(0, prev - 1))
            lastGamepadInputTime.current = now
          } else if (dpadDown) {
            setFocusedModIndex((prev) => Math.min(currentMods.length - 1, prev + 1))
            lastGamepadInputTime.current = now
          } else if (dpadLeft) {
            setSelectedCharIndex((prev) => (prev > 0 ? prev - 1 : characters.length - 1))
            setFocusedModIndex(0)
            lastGamepadInputTime.current = now
          } else if (dpadRight) {
            setSelectedCharIndex((prev) => (prev < characters.length - 1 ? prev + 1 : 0))
            setFocusedModIndex(0)
            lastGamepadInputTime.current = now
          } else if (btnA) {
            if (currentMods[focusedModIndex]) {
              handleToggleMod(currentMods[focusedModIndex])
              lastGamepadInputTime.current = now + 100
            }
          } else if (btnB || btnStart) {
            window.lz.hideOverlay()
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
  }, [currentMods, focusedModIndex, characters.length])

  return (
    <div
      className="w-full h-screen flex flex-col border-l border-white/10 shadow-2xl select-none antialiased overflow-hidden"
      style={{
        backgroundColor: `rgba(3, 7, 18, ${opacity})`,
        backdropFilter: 'blur(24px)',
        zoom: uiScale
      }}
    >
      {/* 1. Header Bar */}
      <div className="h-14 px-4 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-900/60 drag-region">
        <div className="flex items-center space-x-2 no-drag">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-md">
            LZ
          </div>
          <div>
            <div className="text-xs font-bold text-slate-100 flex items-center space-x-1.5">
              <span>{activeGame?.name || '游戏悬浮窗'}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950 text-blue-400 border border-blue-800/50">
                HUD
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2 no-drag">
          {/* F10 Reload */}
          <button
            onClick={handleReloadF10}
            disabled={reloading}
            title="刷新 3DMigoto Mod (F10)"
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/40 text-xs font-medium transition"
          >
            <RotateCw className={`w-3.5 h-3.5 ${reloading ? 'animate-spin' : ''}`} />
            <span>刷新 (F10)</span>
          </button>

          {/* Close */}
          <button
            onClick={() => window.lz.hideOverlay()}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-600 text-slate-400 hover:text-white transition"
            title="关闭悬浮窗 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Preset Quick Bar */}
      {presets.length > 0 && (
        <div className="px-4 py-2 border-b border-slate-800/60 bg-slate-950/40 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400">
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px]">方案预设:</span>
          </div>

          <select
            value={activePresetId || ''}
            onChange={(e) => handleApplyPreset(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[200px]"
          >
            <option value="" disabled>选择预设方案...</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 3. Character Bubble Strip */}
      <div className="px-3 py-2.5 border-b border-slate-800/80 bg-slate-900/40 flex items-center space-x-2 overflow-x-auto shrink-0 scrollbar-none">
        {characters.map((charName, idx) => {
          const isSelected = idx === selectedCharIndex
          const mods = modsData[charName] || []
          const enabledCount = mods.filter((m) => m.enabled).length

          return (
            <button
              key={charName}
              onClick={() => {
                setSelectedCharIndex(idx)
                setFocusedModIndex(0)
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 flex items-center space-x-1.5 transition ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-2 ring-blue-400/40'
                  : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700/80'
              }`}
            >
              <span>{charName}</span>
              {enabledCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  isSelected ? 'bg-white text-blue-600' : 'bg-emerald-500 text-slate-950'
                }`}>
                  {enabledCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 4. Mod Cards List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {currentMods.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
            <Layers className="w-10 h-10 stroke-[1.2]" />
            <p className="text-xs">该角色暂无任何 Mod</p>
          </div>
        ) : (
          currentMods.map((mod, idx) => {
            const isFocused = idx === focusedModIndex

            return (
              <div
                key={mod.id}
                onClick={() => {
                  setFocusedModIndex(idx)
                  handleToggleMod(mod)
                }}
                className={`rounded-xl border p-3 flex items-center justify-between space-x-3 transition cursor-pointer ${
                  mod.enabled
                    ? 'bg-slate-900/90 border-blue-500/60 shadow-lg shadow-blue-500/10'
                    : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700 opacity-80'
                } ${isFocused ? 'ring-2 ring-blue-400 scale-[1.01]' : ''}`}
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg bg-slate-950 overflow-hidden shrink-0 flex items-center justify-center border border-slate-800">
                  {mod.coverPath ? (
                    <img
                      src={`file://${mod.coverPath}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-600" />
                  )}
                </div>

                {/* Mod Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-slate-100 truncate leading-snug">
                    {mod.name}
                  </h4>
                  <div className="flex items-center space-x-2 mt-1">
                    {mod.enabled ? (
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500 text-slate-950 flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3 fill-current" />
                        <span>已激活</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-medium">
                        未启用
                      </span>
                    )}
                    {mod.hasIni && (
                      <span className="text-[9px] px-1 rounded bg-slate-800 text-blue-400 border border-blue-900/40">
                        INI
                      </span>
                    )}
                  </div>
                </div>

                {/* Switch Action Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggleMod(mod)
                  }}
                  className={`p-2 rounded-lg transition ${
                    mod.enabled
                      ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border border-rose-500/30'
                      : 'bg-blue-600 text-white hover:bg-blue-500 shadow-md shadow-blue-600/20'
                  }`}
                >
                  {mod.enabled ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* 5. Footer: Gamepad Prompts & Scale / Opacity Slider */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
        <div className="flex items-center space-x-2">
          <Gamepad2 className={`w-4 h-4 ${gamepadConnected ? 'text-emerald-400' : 'text-slate-600'}`} />
          {gamepadConnected ? (
            <span className="text-[10px] text-emerald-400 font-medium">
              [A]开关 [LB/RB]切角色 [Y]刷新 [B]退出
            </span>
          ) : (
            <span className="text-[10px] text-slate-500">
              按 Ctrl+F 唤起/收起
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Opacity slider */}
          <div className="flex items-center space-x-1" title="背景透明度">
            <span className="text-[10px] text-slate-500">透明度</span>
            <input
              type="range"
              min="0.5"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-16 accent-blue-500 h-1 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
