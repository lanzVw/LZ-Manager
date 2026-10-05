import React, { useState, useEffect, useCallback } from 'react'
import { Header } from './components/Header'
import { ModsPage } from './pages/ModsPage'
import { ModDetailPage } from './pages/ModDetailPage'
import { GameBananaPage } from './pages/GameBananaPage'
import { PresetsPage } from './pages/PresetsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ImportModal } from './components/ImportModal'
import { UploadCloud } from 'lucide-react'

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('mods')
  const [selectedModPath, setSelectedModPath] = useState<string | null>(null)
  const [config, setConfig] = useState<any>(null)
  const [activeGame, setActiveGame] = useState<any>(null)
  const [modsData, setModsData] = useState<Record<string, any[]>>({})
  const [loadingMods, setLoadingMods] = useState<boolean>(false)
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false)
  const [importTarget, setImportTarget] = useState<{ archivePath: string; inspection: any } | null>(null)

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

  // 全局本地压缩包拖拽导入监听 (.zip / .7z / .rar)
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        setIsDraggingFile(true)
      }
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingFile(false)
    }

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingFile(false)

      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0]
        const filePath = (file as any).path
        if (filePath && filePath.match(/\.(zip|7z|rar)$/i)) {
          try {
            const inspection = await window.lz.inspectArchive(filePath)
            if (inspection.valid) {
              setImportTarget({ archivePath: filePath, inspection })
            } else {
              alert(`无法解析该压缩包: ${inspection.error}`)
            }
          } catch (err: any) {
            alert(`检查压缩包失败: ${err.message}`)
          }
        }
      }
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  // 切换游戏
  const handleSelectGame = async (gameId: string) => {
    setSelectedModPath(null)
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
        setActiveTab={(tab) => {
          setSelectedModPath(null)
          setActiveTab(tab)
        }}
        activeGame={activeGame}
        games={config?.games || []}
        onSelectGame={handleSelectGame}
        onLaunchGame={handleLaunchGame}
        onLaunchLoader={handleLaunchLoader}
        onReloadMods={handleReloadMods}
      />

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'mods' &&
          (selectedModPath ? (
            <ModDetailPage
              modFullPath={selectedModPath}
              onBack={() => setSelectedModPath(null)}
              onToggleActive={async (char, mod, state) => {
                await handleToggleMod(char, mod, state)
              }}
            />
          ) : (
            <ModsPage
              modsData={modsData}
              loading={loadingMods}
              onRefresh={scanMods}
              onToggleMod={handleToggleMod}
              onSelectMod={(path) => setSelectedModPath(path)}
            />
          ))}

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

      {/* Full-screen Drag Overlay */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-blue-950/80 backdrop-blur-md border-4 border-dashed border-blue-400 m-2 rounded-2xl flex flex-col items-center justify-center space-y-3 pointer-events-none animate-in fade-in duration-150">
          <div className="p-4 rounded-full bg-blue-600/30 text-blue-300">
            <UploadCloud className="w-12 h-12 animate-bounce" />
          </div>
          <h3 className="text-base font-bold text-white tracking-wide">
            释放以导入 Mod 压缩包
          </h3>
          <p className="text-xs text-blue-300 font-mono">
            支持 .zip / .7z / .rar 格式，自动识别角色与 INI 配置
          </p>
        </div>
      )}

      {/* Import Confirmation Modal */}
      {importTarget && (
        <ImportModal
          archivePath={importTarget.archivePath}
          inspection={importTarget.inspection}
          onClose={() => setImportTarget(null)}
          onSuccess={async (modPath) => {
            setImportTarget(null)
            await scanMods()
            setSelectedModPath(modPath)
          }}
        />
      )}
    </div>
  )
}
