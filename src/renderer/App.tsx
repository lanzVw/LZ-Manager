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
    <div className="h-screen w-screen flex flex-col bg-porcelain-light text-slate-800 font-sans antialiased overflow-hidden select-none">
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
            config={config}
            onUpdateAppConfig={async (patch) => {
              await window.lz.updateAppConfig(patch)
              await loadConfig()
            }}
          />
        )}
      </div>

      {/* Full-screen Drag Overlay (Porcelain Glass File Ingestion) */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-2xl border-4 border-dashed border-blue-500 m-4 rounded-3xl flex flex-col items-center justify-center space-y-4 pointer-events-none animate-in fade-in duration-200 shadow-2xl">
          <div className="p-6 rounded-3xl bg-white text-blue-600 border border-blue-200 shadow-xl">
            <UploadCloud className="w-14 h-14 animate-bounce stroke-[2]" />
          </div>
          <div className="text-center bg-white/90 backdrop-blur-md px-8 py-4 rounded-2xl shadow-lg border border-blue-100">
            <div className="text-xs font-mono tracking-widest text-blue-600 uppercase font-bold mb-1">
              // MOD ARCHIVE IMPORT //
            </div>
            <h3 className="text-2xl font-bold text-slate-800 tracking-wide">
              释放以导入 MOD 压缩包
            </h3>
            <p className="text-xs text-slate-600 mt-1 font-medium">
              支持 .ZIP / .7Z / .RAR 格式 · 智能识别角色与 3DMigoto 映射
            </p>
          </div>
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
