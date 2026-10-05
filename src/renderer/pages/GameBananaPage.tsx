import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Download,
  ThumbsUp,
  Eye,
  User,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink
} from 'lucide-react'

interface GameBananaPageProps {
  activeGame: any
  onInstallSuccess?: () => void
}

export const GameBananaPage: React.FC<GameBananaPageProps> = ({
  activeGame,
  onInstallSuccess
}) => {
  const [characters, setCharacters] = useState<any[]>([])
  const [selectedCharId, setSelectedCharId] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [sortOption, setSortOption] = useState<string>('Generic_Newest')
  const [mods, setMods] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [installingId, setInstallingId] = useState<number | null>(null)
  const [progressMsg, setProgressMsg] = useState<string>('')
  const [progressPercent, setProgressPercent] = useState<number>(0)

  // 监听安装进度
  useEffect(() => {
    const unsub = window.flairx.onInstallProgress((data: any) => {
      if (data.stage === 'downloading') {
        const speedMb = (data.speed / (1024 * 1024)).toFixed(1)
        setProgressMsg(`正在下载... ${data.percent}% (${speedMb} MB/s)`)
        setProgressPercent(data.percent)
      } else if (data.stage === 'inspecting') {
        setProgressMsg('校验文件魔数与安全...')
        setProgressPercent(95)
      } else if (data.stage === 'extracting') {
        setProgressMsg('解压并规整 Mod 目录...')
        setProgressPercent(98)
      }
    })
    return () => unsub()
  }, [])

  // 加载当前游戏的角色分类字典
  useEffect(() => {
    if (!activeGame) return
    window.flairx.getGameBananaCharacters(activeGame.id).then((chars: any[]) => {
      setCharacters(chars || [])
      setSelectedCharId('all')
    })
  }, [activeGame])

  // 执行搜索/列表刷新
  const fetchMods = useCallback(async () => {
    if (!activeGame) return
    setLoading(true)
    try {
      const activeChar = characters.find((c) => c.id === selectedCharId)
      const res = await window.flairx.searchGameBanana({
        gameId: activeGame.id,
        character: selectedCharId !== 'all' ? selectedCharId : undefined,
        activeCharGbCatId: activeChar?.gbCatId || undefined,
        activeCharEnName: activeChar?.enName || undefined,
        search: searchTerm.trim() || undefined,
        sort: sortOption,
        page: 1,
        perPage: 30
      })
      setMods(res.records || [])
    } catch (err) {
      console.error('Fetch GB mods error:', err)
    } finally {
      setLoading(false)
    }
  }, [activeGame, characters, selectedCharId, searchTerm, sortOption])

  useEffect(() => {
    fetchMods()
  }, [fetchMods])

  // 一键下载并安装
  const handleInstall = async (mod: any) => {
    setInstallingId(mod.id)
    setProgressMsg('正在获取下载地址...')
    setProgressPercent(10)

    try {
      // 1. 获取完整详情及文件列表
      const details = await window.flairx.getGameBananaDetails({
        gameId: activeGame.id,
        modId: mod.id
      })

      if (!details.files || details.files.length === 0) {
        alert('该 Mod 暂无有效下载文件！')
        return
      }

      // 默认取最新的文件
      const fileToDownload = details.files[0]

      // 2. 发起下载与安装
      const res = await window.flairx.installGameBananaMod({
        downloadUrl: fileToDownload.downloadUrl,
        modName: mod.name,
        expectedMd5: fileToDownload.md5,
        previewImageUrl: mod.previewImage,
        gameId: activeGame.id,
        characterName: selectedCharId !== 'all' ? characters.find((c) => c.id === selectedCharId)?.name : undefined
      })

      if (res.success) {
        setProgressMsg('安装成功！')
        setProgressPercent(100)
        setTimeout(() => {
          setInstallingId(null)
          setProgressMsg('')
          if (onInstallSuccess) onInstallSuccess()
        }, 1500)
      } else {
        alert(`安装失败: ${res.error || '未知错误'}`)
        setInstallingId(null)
      }
    } catch (err: any) {
      alert(`安装过程异常: ${err.message}`)
      setInstallingId(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/40">
      {/* Filter Header */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 shrink-0">
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          {/* Character Selector */}
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={selectedCharId}
              onChange={(e) => setSelectedCharId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[200px]"
            >
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.enName ? `(${c.enName})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Selector */}
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="Generic_Newest">最新发布</option>
            <option value="Generic_MostDownloaded">最多下载</option>
            <option value="Generic_MostLiked">最多喜欢</option>
            <option value="Generic_MostViewed">最多浏览</option>
          </select>
        </div>

        {/* Search Input & Refresh */}
        <div className="flex items-center space-x-2">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索 GameBanana 模组..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchMods()}
              className="w-full bg-slate-950 border border-slate-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={fetchMods}
            disabled={loading}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Install Progress Toast */}
      {installingId !== null && (
        <div className="bg-blue-950/80 border-b border-blue-800/80 px-4 py-2.5 flex items-center justify-between text-xs text-blue-200 shrink-0">
          <div className="flex items-center space-x-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span>{progressMsg || '正在处理...'}</span>
          </div>
          <div className="w-48 bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Mod Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-xs">正在从 GameBanana 检索实时 Mod...</p>
          </div>
        ) : mods.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
            <AlertCircle className="w-10 h-10 stroke-[1.2]" />
            <p className="text-xs">未找到任何符合条件的 GameBanana 模组</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {mods.map((mod) => {
              const isInstalling = installingId === mod.id

              return (
                <div
                  key={mod.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900/90 hover:border-slate-700 transition flex flex-col overflow-hidden group shadow-md"
                >
                  {/* Image */}
                  <div className="relative aspect-[16/10] bg-slate-950 overflow-hidden">
                    {mod.previewImage ? (
                      <img
                        src={mod.previewImage}
                        alt={mod.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">
                        无预览图
                      </div>
                    )}

                    {/* Category badge */}
                    {mod.category && (
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-950/80 text-blue-300 border border-blue-900/60 backdrop-blur-sm">
                          {mod.category}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      <h3
                        className="text-xs font-semibold text-slate-200 line-clamp-2 leading-relaxed"
                        title={mod.name}
                      >
                        {mod.name}
                      </h3>

                      <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 mt-1">
                        <User className="w-3 h-3" />
                        <span className="truncate">{mod.submitter?.name || '未知作者'}</span>
                      </div>
                    </div>

                    {/* Stats & Actions */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                        <span className="flex items-center space-x-0.5">
                          <Download className="w-3 h-3" />
                          <span>{mod.stats?.downloads || 0}</span>
                        </span>
                        <span className="flex items-center space-x-0.5">
                          <ThumbsUp className="w-3 h-3" />
                          <span>{mod.stats?.likes || 0}</span>
                        </span>
                      </div>

                      <button
                        onClick={() => handleInstall(mod)}
                        disabled={isInstalling}
                        className={`px-3 py-1 rounded-md text-xs font-medium flex items-center space-x-1 transition ${
                          isInstalling
                            ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
                        }`}
                      >
                        {isInstalling ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        <span>{isInstalling ? '安装中' : '下载'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
