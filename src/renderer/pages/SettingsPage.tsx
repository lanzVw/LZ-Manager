import React, { useState } from 'react'
import { Settings, Folder, FileCode, Check, Save } from 'lucide-react'

interface SettingsPageProps {
  activeGame: any
  onSaveGameConfig: (patch: any) => Promise<void>
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  activeGame,
  onSaveGameConfig
}) => {
  const [gamePath, setGamePath] = useState(activeGame?.gamePath || '')
  const [modFolderPath, setModFolderPath] = useState(activeGame?.modFolderPath || '')
  const [modLoaderPath, setModLoaderPath] = useState(activeGame?.modLoaderPath || '')
  const [saved, setSaved] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSaveGameConfig({
      gamePath,
      modFolderPath,
      modLoaderPath
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-slate-950/40 p-6">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <Settings className="w-5 h-5 text-blue-400" />
            <span>游戏环境与路径设置 - {activeGame?.name}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            配置当前游戏的可执行文件、Mods 存放目录以及 XXMI / 3DMigoto 加载器路径
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                游戏本体可执行文件路径 (Game Executable)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={gamePath}
                  onChange={(e) => setGamePath(e.target.value)}
                  placeholder="例如：E:\Games\ZenlessZoneZero\ZenlessZoneZero.exe"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Mod 目录路径 (Mods Folder)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={modFolderPath}
                  onChange={(e) => setModFolderPath(e.target.value)}
                  placeholder="例如：F:\XXMI\ZZMI\Mods"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                XXMI / 3DMigoto 加载器路径 (Mod Loader)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={modLoaderPath}
                  onChange={(e) => setModLoaderPath(e.target.value)}
                  placeholder="例如：F:\XXMI\Resources\Bin\XXMI Launcher.exe"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              * 设置会自动与原版 QAQManager 配置文件保持双向兼容同步
            </span>

            <button
              type="submit"
              className={`flex items-center space-x-1.5 px-5 py-2 rounded-lg text-xs font-semibold transition ${
                saved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
              }`}
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>已保存！</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>保存设置</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
