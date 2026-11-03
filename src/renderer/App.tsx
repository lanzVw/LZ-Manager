import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Header } from './components/Header'
import { ModsPage, DEFAULT_MODS_VIEW } from './pages/ModsPage'
import type { ModsViewState } from './pages/ModsPage'
import { ModDetailPage } from './pages/ModDetailPage'
import { GameBananaPage } from './pages/GameBananaPage'
import { PresetsPage } from './pages/PresetsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ImportModal } from './components/ImportModal'
import { UploadCloud } from 'lucide-react'
import { useToast } from './components/ui/Toast'

export default function App() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<string>('mods')
  const [selectedModPath, setSelectedModPath] = useState<string | null>(null)
  const [config, setConfig] = useState<any>(null)
  const [activeGame, setActiveGame] = useState<any>(null)
  const [modsData, setModsData] = useState<Record<string, any[]>>({})
  const [loadingMods, setLoadingMods] = useState<boolean>(false)
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false)
  const [importTarget, setImportTarget] = useState<{ archivePath: string; inspection: any } | null>(null)
  const [marketInitialModId, setMarketInitialModId] = useState<number | null>(null)
  const [marketInitialSearch, setMarketInitialSearch] = useState<string>('')
  const [marketInitialScope, setMarketInitialScope] = useState<'all' | 'author'>('all')

  // 为什么提升到 App：进入 Mod 详情页时 ModsPage 会被卸载，局部 state 随之丢失，
  // 从「蕾米埃尔」分类点进详情再返回就会掉回「全部角色」。这里托管整份视图快照。
  const [modsView, setModsView] = useState<ModsViewState>(DEFAULT_MODS_VIEW)
  // 记录进入详情前的视图快照：详情页内部可能触发扫描/切换，返回时必须回到进入时那一刻的状态
  const modsViewBeforeDetailRef = useRef<ModsViewState | null>(null)

  // 1. 初始化读取配置
  const loadConfig = useCallback(async () => {
    try {
      const cfg = await window.flairx.getConfig()
      setConfig(cfg)
      const visibleGames = (cfg.games || []).filter((g: any) => !g.hidden)
      const current =
        visibleGames.find((g: any) => g.id === cfg.activeGameId) ||
        visibleGames[0] ||
        cfg.games.find((g: any) => g.id === cfg.activeGameId) ||
        cfg.games[0]
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

  // 当主窗口重新激活聚焦时，自动同步最新的 Mod 扫描结果（如悬浮窗切换了 Mod）
  useEffect(() => {
    const handleFocus = () => {
      if (activeGame) {
        scanMods()
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [activeGame, scanMods])

  // 监听前台游戏智能跟随切换事件，主界面实时同步更新游戏及配置
  useEffect(() => {
    const unsub = window.flairx.onGameChanged?.(async (data: any) => {
      if (data && data.game) {
        setSelectedModPath(null)
        setActiveGame(data.game)
        await loadConfig()
      }
    })
    return () => {
      unsub?.()
    }
  }, [loadConfig])

  // 监听来自系统托盘或主进程的页面导航跳转（如托盘菜单点击「系统设置...」）
  useEffect(() => {
    const unsub = window.flairx.onNavigate?.((tab: string) => {
      if (tab) {
        setSelectedModPath(null)
        setActiveTab(tab)
      }
    })
    return () => {
      unsub?.()
    }
  }, [])

  // 全局本地压缩包拖拽导入监听 (.zip / .7z / .rar)
  useEffect(() => {
    // 穿过子元素时 dragenter/dragleave 会成对触发，用计数器避免遮罩闪烁
    let dragDepth = 0

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        dragDepth += 1
        setIsDraggingFile(true)
      }
    }

    const handleDragOver = (e: DragEvent) => {
      // 必须持续阻止默认行为，否则浏览器不会触发 drop
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragDepth = Math.max(0, dragDepth - 1)
      if (dragDepth === 0) {
        setIsDraggingFile(false)
      }
    }

    const resetDragging = () => {
      dragDepth = 0
      setIsDraggingFile(false)
    }

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      resetDragging()

      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0]
        // Electron 32+ 已移除 File.path，必须经 webUtils 获取真实路径
        const filePath = window.lz?.getPathForFile?.(file) || ''
        if (!filePath) {
          toast.error('无法获取拖入文件路径')
          return
        }
        if (filePath.match(/\.(zip|7z|rar)$/i)) {
          try {
            const inspection = await window.lz.inspectArchive(filePath)
            if (inspection.valid) {
              setImportTarget({ archivePath: filePath, inspection })
            } else {
              toast.error('解析压缩包失败', inspection.error)
            }
          } catch (err: any) {
            toast.error('检查压缩包失败', err.message)
          }
        }
      }
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('dragend', resetDragging)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('dragend', resetDragging)
      window.removeEventListener('drop', handleDrop)
    }
  }, [toast])

  // 切换游戏
  const handleSelectGame = async (gameId: string) => {
    setSelectedModPath(null)
    // 换游戏后角色分类完全不同，沿用旧筛选会落到空列表
    setModsView(DEFAULT_MODS_VIEW)
    await window.flairx.setActiveGame(gameId)
    await loadConfig()
  }

  // 列表页筛选变更：逐次合并，保证连续操作（如先选角色再切分区）不互相覆盖
  const handleModsViewChange = useCallback((patch: Partial<ModsViewState>) => {
    setModsView((prev) => ({ ...prev, ...patch }))
  }, [])

  // 进详情前存一份视图快照：详情页里的扫描/启停不能污染返回后的筛选状态
  const handleOpenModDetail = useCallback(
    (modFullPath: string) => {
      modsViewBeforeDetailRef.current = modsView
      setSelectedModPath(modFullPath)
    },
    [modsView]
  )

  // 返回列表：还原进入详情前那一刻的筛选，用户从哪个分类点进去就回到哪个分类
  const handleBackToMods = useCallback(() => {
    const snapshot = modsViewBeforeDetailRef.current
    if (snapshot) {
      setModsView(snapshot)
      modsViewBeforeDetailRef.current = null
    }
    setSelectedModPath(null)
    scanMods()
  }, [scanMods])

  // 切换单个 Mod
  const handleToggleMod = async (charName: string, modName: string, enabled: boolean) => {
    const res = await window.flairx.toggleMod(charName, modName, enabled)
    if (res.success) {
      await scanMods()
    } else {
      toast.error('切换模组状态失败', res.error || '未知错误')
    }
  }

  const [launchingGame, setLaunchingGame] = useState<boolean>(false)

  // 启动游戏
  const handleLaunchGame = async () => {
    if (launchingGame) return
    setLaunchingGame(true)
    try {
      toast.info('正在唤起游戏...', activeGame ? `模式: ${activeGame.launchMode || '自动'} · ${activeGame.name}` : undefined)
      const res = await window.flairx.launchGame()
      if (res && res.success) {
        if (res.message) {
          toast.toast('启动流程就绪', 'success', 6000, res.message)
        } else {
          toast.success(
            '启动指令已下发',
            activeGame ? `正在调起 ${activeGame.name}，请留意任务栏与游戏窗口` : '请留意系统任务栏与游戏窗口'
          )
        }
      } else {
        toast.error('启动游戏失败', res?.error || '未知错误')
      }
    } catch (err: any) {
      toast.error('启动异常', err?.message || '未知错误')
    } finally {
      setTimeout(() => setLaunchingGame(false), 2000)
    }
  }

  // 启动 XXMI 加载器
  const handleLaunchLoader = async () => {
    try {
      toast.info('正在唤起加载器...', '调起独立图形界面')
      const res = await window.flairx.launchLoader()
      if (res && res.success) {
        toast.success('加载器已调起')
      } else {
        toast.error('启动加载器失败', res?.error || '未知错误')
      }
    } catch (err: any) {
      toast.error('调起加载器异常', err?.message || '未知错误')
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
    <div className="h-screen w-screen flex flex-col bg-bg text-text bg-vine-pattern font-sans antialiased overflow-hidden select-none">
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setSelectedModPath(null)
          setActiveTab(tab)
        }}
        activeGame={activeGame}
        games={config?.games || []}
        closeAction={config?.closeAction || 'minimize_to_tray'}
        closePromptRemembered={config?.closePromptRemembered ?? false}
        launchingGame={launchingGame}
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
              activeGame={activeGame}
              onBack={handleBackToMods}
              onDeleteSuccess={handleBackToMods}
              onInstallSuccess={() => scanMods()}
              onRenamed={async (newPath: string) => {
                // 目录已改名，旧路径失效：把导航指向新路径并留在详情页，
                // 同时刷新列表数据，避免返回角色库时看到旧名字
                setSelectedModPath(newPath)
                await scanMods()
              }}
              onToggleActive={async (char, mod, state) => {
                await handleToggleMod(char, mod, state)
              }}
              onNavigateToMarket={(modId, searchKeyword, searchScope) => {
                setSelectedModPath(null)
                setMarketInitialModId(modId || null)
                setMarketInitialSearch(searchKeyword || '')
                setMarketInitialScope(searchKeyword ? searchScope ?? 'all' : 'all')
                setActiveTab('gamebanana')
              }}
            />
          ) : (
            <ModsPage
              modsData={modsData}
              loading={loadingMods}
              onRefresh={scanMods}
              onToggleMod={handleToggleMod}
              onSelectMod={handleOpenModDetail}
              onNavigateTab={(tab) => setActiveTab(tab)}
              activeGame={activeGame}
              viewState={modsView}
              onViewStateChange={handleModsViewChange}
            />
          ))}

        {activeTab === 'gamebanana' && (
          <GameBananaPage
            activeGame={activeGame}
            onInstallSuccess={scanMods}
            initialModId={marketInitialModId}
            initialSearchTerm={marketInitialSearch}
            initialSearchScope={marketInitialScope}
            onClearInitialNav={() => {
              setMarketInitialModId(null)
              setMarketInitialSearch('')
              setMarketInitialScope('all')
            }}
          />
        )}

        {activeTab === 'presets' && (
          <PresetsPage
            activeGame={activeGame}
            modsData={modsData}
            modsLoading={loadingMods}
            onRefreshMods={scanMods}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            activeGame={activeGame}
            onSaveGameConfig={handleSaveGameConfig}
            config={config}
            onSelectGame={handleSelectGame}
            onUpdateAppConfig={async (patch) => {
              await window.lz.updateAppConfig(patch)
              await loadConfig()
            }}
          />
        )}
      </div>

      {/* Full-screen Drag Overlay */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xl border-4 border-dashed border-primary m-4 rounded-card flex flex-col items-center justify-center space-y-4 pointer-events-none animate-in fade-in duration-fast shadow-2xl">
          <div className="p-6 rounded-card bg-surface text-primary border border-border shadow-xl">
            <UploadCloud className="w-14 h-14 animate-bounce stroke-[2]" />
          </div>
          <div className="text-center bg-surface/90 backdrop-blur-md px-8 py-4 rounded-card shadow-lg border border-border">
            <div className="text-xs font-mono tracking-widest text-primary uppercase font-bold mb-1">
              // MOD ARCHIVE IMPORT //
            </div>
            <h3 className="text-2xl font-bold text-text tracking-wide">
              释放以导入 MOD 压缩包
            </h3>
            <p className="text-xs text-text-muted mt-1 font-medium">
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
