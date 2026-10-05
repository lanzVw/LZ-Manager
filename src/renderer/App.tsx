import React, { useState, useEffect, useCallback } from 'react'
import { Header } from './components/Header'
import { ModsPage } from './pages/ModsPage'
import { GameBananaPage } from './pages/GameBananaPage'
import { PresetsPage } from './pages/PresetsPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('mods')
  const [config, setConfig] = useState<any>(null)
  const [activeGame, setActiveGame] = useState<any>(null)
  const [modsData, setModsData] = useState<Record<string, any[]>>({})
  const [loadingMods, setLoadingMods] = useState<boolean>(false)

  // 1. 初始化读取配置
  const loadConfig = useCallback(async () => {
    try {
      const cfg = await window.flairx.getConfig()
      setConfig(cfg)
      const current = cfg.games.find((g: any) => g.id === cfg.activeGameId) || cfg.games[0]
      setActiveGame(current)
    } catch (err) {
      console.error('Failed to load config:', err)
    }
  }, [])

  // 2. 扫描当前游戏的 Mod
  const scanMods = useCallback(async () => {
    setLoadingMods(true)
    try {
      const data = await window.flairx.scanMods()
      setModsData(data || {})
    } catch (err) {
      console.error('Failed to scan mods:', err)
    } finally {
      setLoadingMods(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (activeGame) {
      scanMods()
    }
  }, [activeGame, scanMods])

  // 切换游戏
  const handleSelectGame = async (gameId: string) => {
    await window.flairx.setActiveGame(gameId)
    await loadConfig()
  }

  // 切换单个 Mod
  const handleToggleMod = async (charName: string, modName: string, enabled: boolean) => {
    const res = await window.flairx.toggleMod(charName, modName, enabled)
    if (res.success) {
      await scanMods()
    } else {
      alert(`切换失败: ${res.error || '未知错误'}`)
    }
  }

  // 启动游戏
  const handleLaunchGame = async () => {
    const res = await window.flairx.launchGame()
    if (!res.success) {
      alert(`启动游戏失败: ${res.error}`)
    }
  }

  // 启动 XXMI 加载器
  const handleLaunchLoader = async () => {
    const res = await window.flairx.launchLoader()
    if (!res.success) {
      alert(`启动加载器失败: ${res.error}`)
    }
  }

  // 触发 F10 刷新
  const handleReloadMods = async () => {
    await window.flairx.reloadModsF10()
    await scanMods()
  }

  // 更新游戏设置
  const handleSaveGameConfig = async (patch: any) => {
    if (!activeGame) return
    await window.flairx.updateGameConfig(activeGame.id, patch)
    await loadConfig()
    await scanMods()
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 font-sans antialiased overflow-hidden border border-slate-800/80 rounded-lg">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeGame={activeGame}
        games={config?.games || []}
        onSelectGame={handleSelectGame}
        onLaunchGame={handleLaunchGame}
        onLaunchLoader={handleLaunchLoader}
        onReloadMods={handleReloadMods}
      />

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'mods' && (
          <ModsPage
            modsData={modsData}
            loading={loadingMods}
            onRefresh={scanMods}
            onToggleMod={handleToggleMod}
          />
        )}

        {activeTab === 'gamebanana' && (
          <GameBananaPage
            activeGame={activeGame}
            onInstallSuccess={scanMods}
          />
        )}

        {activeTab === 'presets' && (
          <PresetsPage
            activeGame={activeGame}
            onPresetApplied={scanMods}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            activeGame={activeGame}
            onSaveGameConfig={handleSaveGameConfig}
          />
        )}
      </div>
    </div>
  )
}
