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
  ExternalLink,
  ShoppingBag,
  Sparkles
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
        query: searchTerm.trim() || undefined,
        sort: sortOption
      })
      setMods(res.records || [])
    } catch (err) {
      console.error('Failed to fetch GameBanana mods:', err)
    } finally {
      setLoading(false)
    }
  }, [activeGame, selectedCharId, searchTerm, sortOption, characters])

  useEffect(() => {
    fetchMods()
  }, [fetchMods])

  // 一键下载并安装 Mod
  const handleInstall = async (mod: any) => {
    if (!activeGame) return
    setInstallingId(mod.id)
    setProgressMsg('正在获取下载直链...')
    setProgressPercent(5)

    try {
      // 1. 获取模组详情及下载文件列表
      const details = await window.flairx.getGameBananaDetails({
        itemType: 'Mod',
        itemId: mod.id
      })

      if (!details || !details.files || details.files.length === 0) {
        alert('该模组暂无可下载的有效文件压缩包')
        setInstallingId(null)
        return
      }

      // 默认选择第一个有效压缩包文件进行下载
      const targetFile = details.files[0]

      // 2. 触发下载安装
      const res = await window.flairx.installGameBananaMod({
        gameId: activeGame.id,
        modId: mod.id,
        modName: mod.name,
        characterName: details.characterName || (selectedCharId !== 'all' ? selectedCharId : '通用'),
        downloadUrl: targetFile.downloadUrl,
        fileName: targetFile.fileName,
        previewImages: mod.previewImages || [],
        author: mod.author?.name || 'GameBanana'
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
    <div className="flex-1 flex flex-col overflow-hidden select-none porcelain-scrollbar">
      {/* Filter Header */}
      <div className="p-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3 bg-[#0d1527]/75 backdrop-blur-2xl shrink-0">
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          {/* Character Selector */}
          <div className="flex items-center space-x-2 bg-white/[0.05] border border-white/10 rounded-2xl px-3.5 py-1.5 shadow-sm">
            <Filter className="w-3.5 h-3.5 text-sky-400" />
            <select
              value={selectedCharId}
              onChange={(e) => setSelectedCharId(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-100 focus:outline-none cursor-pointer max-w-[190px]"
            >
              {characters.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#0f172a] text-slate-100 font-medium">
                  {c.name} {c.enName ? `(${c.enName})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Selector */}
          <div className="bg-white/[0.05] border border-white/10 rounded-2xl px-3.5 py-1.5 shadow-sm">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="Generic_Newest" className="bg-[#0f172a] text-slate-100">最新发布</option>
              <option value="Generic_MostDownloaded" className="bg-[#0f172a] text-slate-100">最多下载</option>
              <option value="Generic_MostLiked" className="bg-[#0f172a] text-slate-100">最多喜欢</option>
              <option value="Generic_MostViewed" className="bg-[#0f172a] text-slate-100">最多浏览</option>
            </select>
          </div>
        </div>

        {/* Search Input & Refresh */}
        <div className="flex items-center space-x-2">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索社区 MOD 资源..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchMods()}
              className="w-full bg-white/[0.05] border border-white/10 focus:border-sky-400/60 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none font-sans transition"
            />
          </div>

          <button
            onClick={fetchMods}
            disabled={loading}
            className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/10 hover:border-sky-400/40 transition shadow-sm active:scale-95"
            title="刷新列表"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Install Progress Toast */}
      {installingId !== null && (
        <div className="bg-blue-950/80 border-b border-sky-400/60 px-6 py-3 flex items-center justify-between text-xs text-sky-200 shrink-0 shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center space-x-2.5 font-semibold">
            <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
            <span>{progressMsg || '正在处理传输...'}</span>
          </div>
          <div className="w-56 bg-black/40 border border-white/10 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-600 to-sky-400 h-full transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Mod Grid */}
      <div className="flex-1 overflow-y-auto p-6 porcelain-scrollbar">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-sky-400 space-y-3">
            <RefreshCw className="w-10 h-10 animate-spin" />
            <p className="text-xs font-mono tracking-widest uppercase text-sky-300">
              // 连接 GAMEBANANA 工坊中 //
            </p>
          </div>
        ) : mods.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
            <div className="p-5 rounded-3xl bg-white/[0.04] border border-white/10 text-sky-400/50">
              <ShoppingBag className="w-12 h-12 stroke-[1.2]" />
            </div>
            <div className="text-center">
              <div className="text-xs font-mono tracking-widest text-slate-400 uppercase">
                // NO WORKSHOP ITEMS FOUND //
              </div>
              <p className="text-xs text-slate-400 mt-1">未找到匹配的模组资源，请尝试更换搜索词或角色分类</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {mods.map((mod) => {
              const isInstalling = installingId === mod.id

              return (
                <div
                  key={mod.id}
                  className="group rounded-2xl bg-[#0c1426]/75 border border-white/[0.08] backdrop-blur-xl hover:border-sky-400/50 overflow-hidden flex flex-col justify-between transition-all duration-300 shadow-lg hover:-translate-y-1 hover:shadow-sky-500/10"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-[16/10] bg-[#090e1a] overflow-hidden">
                    {mod.previewImages && mod.previewImages[0] ? (
                      <img
                        src={mod.previewImages[0]}
                        alt={mod.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-106"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-500 font-mono text-xs">
                        无预览图
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e1628] via-transparent to-black/30 pointer-events-none" />

                    {/* Stats pill */}
                    <div className="absolute top-2.5 right-2.5 flex items-center space-x-1.5 bg-black/60 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/10 text-[10px] font-mono text-sky-300">
                      <ThumbsUp className="w-3 h-3 text-sky-400" />
                      <span>{mod.likeCount || 0}</span>
                    </div>
                  </div>

                  {/* Body & Action */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center space-x-1.5 text-[10px] font-medium text-sky-400 mb-1">
                        <User className="w-3 h-3" />
                        <span className="truncate">{mod.author?.name || 'GameBanana'}</span>
                      </div>
                      <h4
                        className="text-xs font-semibold text-white line-clamp-2 leading-relaxed group-hover:text-sky-300 transition"
                        title={mod.name}
                      >
                        {mod.name}
                      </h4>
                    </div>

                    <button
                      onClick={() => handleInstall(mod)}
                      disabled={isInstalling || installingId !== null}
                      className={`w-full py-1.5 rounded-xl text-xs font-bold tracking-wide flex items-center justify-center space-x-1.5 transition-all shadow-sm active:scale-95 ${
                        isInstalling
                          ? 'bg-blue-600/30 text-sky-300 border border-sky-400 cursor-wait'
                          : 'bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 hover:from-blue-600 hover:to-sky-500 text-white shadow-blue-900/30'
                      } ${installingId !== null && !isInstalling ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isInstalling ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5 stroke-[2]" />
                          <span>一键装载</span>
                        </>
                      )}
                    </button>
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
