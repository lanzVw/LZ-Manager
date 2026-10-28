import React from 'react'
import { FileArchive, PackageCheck } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { GameBananaInstallButton } from './GameBananaInstallButton'
import { formatDate, formatFileSize } from '../../utils/gamebanana-format'
import { isGameBananaFileInstalled } from '../../utils/gamebanana-install'

export interface GameBananaMarketFile {
  id: number | string
  fileName: string
  downloadUrl: string
  fileSize?: number
  md5?: string
  dateAdded?: number
  downloadCount?: number
  description?: string
  isArchived?: boolean
}

export interface GameBananaFileListProps {
  files?: GameBananaMarketFile[] | null
  loading?: boolean
  installingFileId: number | string | null
  progressPercent: number
  installedVersions: ReadonlySet<string>
  busy: boolean
  onInstall: (file: GameBananaMarketFile) => void
}

/**
 * 市场页与模组详情抽屉共用的可安装文件清单。
 * 进度必须按 file.id 匹配：按 modId 匹配会让同一 Mod 的所有版本行一起显示「安装中」。
 */
export const GameBananaFileList: React.FC<GameBananaFileListProps> = ({
  files,
  loading = false,
  installingFileId,
  progressPercent,
  installedVersions,
  busy,
  onInstall
}) => {
  const sortedFiles = React.useMemo(
    () => [...(files || [])].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)),
    [files]
  )

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-title text-xs font-extrabold uppercase tracking-wider text-text">
          <PackageCheck className="h-4 w-4 text-primary align-neg-125" />
          可安装文件清单 ({files?.length || 0})
        </h3>
        <span className="text-[10px] text-text-muted">选择对应版本进行解压装载</span>
      </div>

      <div className="space-y-2">
        {sortedFiles.length === 0 ? (
          <div className="rounded-control bg-surface-2 p-4 text-center text-xs text-text-muted">
            {loading ? '正在检索可下载文件清单...' : '暂无可安装的压缩文件'}
          </div>
        ) : (
          sortedFiles.map((file, index, arr) => {
            const isInstalling = installingFileId === file.id
            const isInstalled = isGameBananaFileInstalled(file.fileName, installedVersions)
            const isLatest = index === 0 && arr.length > 1 && Boolean(file.dateAdded)

            return (
              <div
                key={file.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/60 p-3 transition-colors hover:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileArchive className="h-3.5 w-3.5 shrink-0 text-text-muted align-neg-125" />
                    <span className="truncate text-xs font-semibold text-text" title={file.fileName}>
                      {file.fileName}
                    </span>
                    {isLatest && (
                      <Badge variant="success" className="shrink-0">
                        最新发布
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-text-muted tabular-nums-strict">
                    {file.dateAdded ? (
                      <>
                        <span className="font-medium text-primary">发布: {formatDate(file.dateAdded)}</span>
                        <span>·</span>
                      </>
                    ) : null}
                    <span>大小: {formatFileSize(file.fileSize)}</span>
                    <span>·</span>
                    <span>下载: {file.downloadCount || 0} 次</span>
                  </div>
                  {file.description && (
                    <div className="mt-1 line-clamp-1 text-[11px] italic text-text-muted/90">
                      {file.description}
                    </div>
                  )}
                </div>

                <GameBananaInstallButton
                  state={isInstalling ? 'installing' : isInstalled ? 'installed' : 'idle'}
                  percent={progressPercent}
                  disabled={busy && !isInstalling}
                  onClick={() => onInstall(file)}
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
