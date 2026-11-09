import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  FolderOpen,
  HardDrive,
  Info,
  Layers,
  RefreshCw,
  Trash2
} from 'lucide-react'
import { BaseModStatus, ToggleModResult } from '../../../core/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { HoverHint } from '../ui/HoverHint'
import { Modal } from '../ui/Modal'
import { Switch } from '../ui/Switch'
import { useToast } from '../ui/Toast'

interface BaseModPanelProps {
  modFullPath: string
  onToggleBaseMod?: (enabled: boolean) => Promise<ToggleModResult>
  onChanged?: () => void
}

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const formatTime = (ms: number): string => {
  if (!ms) return '暂无'
  try {
    return new Date(ms).toLocaleString('zh-CN', { hour12: false })
  } catch (_) {
    return '暂无'
  }
}

/**
 * 基底 Mod 面板：着色器缓存开关与缓存统计。
 * 依赖检测与健康检查在后续提交里追加，保持这个组件按块增长。
 */
export const BaseModPanel: React.FC<BaseModPanelProps> = ({ modFullPath, onToggleBaseMod, onChanged }) => {
  const toast = useToast()
  const [status, setStatus] = useState<BaseModStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingCache, setTogglingCache] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [fixingBaseMod, setFixingBaseMod] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const requestIdRef = useRef(0)

  const loadStatus = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const next = await window.flairx.getBaseModStatus(modFullPath)
      if (requestId !== requestIdRef.current) return
      if (!next) {
        setStatus(null)
        setError('未能识别为基底 Mod')
      } else {
        setStatus(next)
      }
    } catch (err: any) {
      if (requestId === requestIdRef.current) {
        setError(err?.message || '读取基底 Mod 状态失败')
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [modFullPath])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const handleToggleCache = async (next: boolean) => {
    if (!status || togglingCache) return
    setTogglingCache(true)
    try {
      const res = await window.flairx.setShaderCacheEnabled(modFullPath, next)
      if (res.success) {
        toast.success(
          next ? '已启用着色器缓存' : '已停用着色器缓存',
          next ? '重启游戏后生效' : '根目录的 ShaderCacheSettings.ini 已移除'
        )
        await loadStatus()
      } else {
        toast.error('操作失败', res.error)
      }
    } catch (err: any) {
      toast.error('操作失败', err?.message || '未知错误')
    } finally {
      setTogglingCache(false)
    }
  }

  const handleOpenCache = async () => {
    try {
      const res = await window.flairx.openShaderCacheFolder()
      if (!res.success) toast.error('无法打开缓存目录', res.error)
    } catch (err: any) {
      toast.error('无法打开缓存目录', err?.message || '未知错误')
    }
  }

  const handleClearCache = async () => {
    setClearing(true)
    try {
      const res = await window.flairx.clearShaderCache()
      if (res.success) {
        toast.success('着色器缓存已清理', `删除 ${res.deletedCount} 项`)
      } else if (res.failedCount > 0) {
        toast.warning('部分缓存未能清理', `成功 ${res.deletedCount} 项，失败 ${res.failedCount} 项`)
      } else {
        toast.error('清理失败', res.error || '未知错误')
      }
      setShowClearConfirm(false)
      await loadStatus()
    } catch (err: any) {
      toast.error('清理失败', err?.message || '未知错误')
    } finally {
      setClearing(false)
    }
  }

  const handleFixBaseMod = async () => {
    if (!onToggleBaseMod || fixingBaseMod) return
    setFixingBaseMod(true)
    try {
      const res = await onToggleBaseMod(true)
      if (res?.success) {
        toast.success('基底 Mod 已启用')
        // 启用会改目录名，旧 modFullPath 立刻失效；
        // 父组件收到 newFullPath 后会重新挂载并刷新，这里不要再用旧路径读状态
        if (!res.newFullPath) {
          await loadStatus()
          onChanged?.()
        }
      } else if (!res?.cancelled) {
        toast.error('启用失败', res?.error || '未知错误')
      }
    } catch (err: any) {
      toast.error('启用失败', err?.message || '未知错误')
    } finally {
      setFixingBaseMod(false)
    }
  }

  if (loading && !status) {
    return (
      <Card className="p-6 flex items-center justify-center text-text-muted">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin text-primary" />
        <span className="text-xs">正在读取基底 Mod 状态...</span>
      </Card>
    )
  }

  if (error || !status) {
    return (
      <Card className="p-6 space-y-3">
        <div className="flex items-center space-x-2 text-danger">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-xs font-bold">{error || '未能识别为基底 Mod'}</span>
        </div>
        <Button variant="secondary" size="sm" onClick={loadStatus} icon={<RefreshCw className="w-3.5 h-3.5" />}>
          重新检测
        </Button>
      </Card>
    )
  }

  const cache = status.shaderCache
  const stats = status.cacheStats
  const d3dx = status.d3dx
  const dependents = [...(status.dependents || [])].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return a.modName.localeCompare(b.modName)
  })
  const enabledDependents = dependents.filter((d) => d.enabled)
  const disabledDependents = dependents.filter((d) => !d.enabled)
  const severityRank = { error: 0, warning: 1, info: 2 } as const
  const healthChecks = [...(status.health?.checks || [])].sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity]
  )
  const errorCount = healthChecks.filter((check) => check.severity === 'error').length
  const warningCount = healthChecks.filter((check) => check.severity === 'warning').length

  return (
    <div className="space-y-6">
      {/* 概览 */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text tracking-wide flex items-center gap-2">
                <HoverHint content="此 Mod 为其他角色 Mod 提供 namespace 资源。停用或删除会影响所有依赖它的 Mod。">
                  基底 Mod
                </HoverHint>
                <Badge variant="primary" size="sm">
                  namespace {status.namespace || '未识别'}
                </Badge>
                {status.explicit && (
                  <Badge variant="default" size="sm">
                    显式标记
                  </Badge>
                )}
              </h2>
            </div>
          </div>
          <Badge variant={status.enabled ? 'success' : 'danger'} size="sm">
            {status.enabled ? '已启用' : '已停用'}
          </Badge>
        </div>
      </Card>

      {/* 着色器缓存 */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-text tracking-wide uppercase">
                <HoverHint content="在 Mod 根目录放置 ShaderCacheSettings.ini，让 3DMigoto 把编译过的着色器缓存到 ShaderCache 目录。">
                  着色器缓存 (SHADER CACHE)
                </HoverHint>
              </h3>
              {/* 重启提示是操作前置条件，不随说明一起隐藏 */}
              <p className="text-[11px] leading-relaxed mt-1">
                <span className="text-amber-500 font-semibold">需重启游戏生效。</span>
              </p>
            </div>
          </div>
          <Switch
            checked={cache.active}
            onChange={handleToggleCache}
            disabled={togglingCache}
            label={cache.active ? '已开启' : '已关闭'}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-control bg-surface-2 border border-border">
            <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">生效文件</div>
            <div className="text-[11px] text-text break-all">
              {cache.installed ? 'ShaderCacheSettings.ini' : '未放置'}
            </div>
          </div>
          <div className="p-3 rounded-control bg-surface-2 border border-border">
            <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">模板文件</div>
            <div className="text-[11px] text-text break-all">
              {cache.templatePath ? 'DISABLED\\ShaderCacheSettings.ini' : '不存在'}
            </div>
          </div>
          <div className="p-3 rounded-control bg-surface-2 border border-border">
            <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">解析值</div>
            <div className="text-[11px] text-text font-mono">
              {cache.value === null ? '未解析' : `cache_shaders = ${cache.value}`}
            </div>
          </div>
        </div>

        {cache.installed && !cache.active && (
          <div className="p-3 rounded-control bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-600 dark:text-amber-400 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>文件已存在，但 cache_shaders 不是 1。关闭后再开启会用模板覆盖成正确值。</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center space-x-2 text-[11px] text-text-muted">
            <HardDrive className="w-3.5 h-3.5 text-primary" />
            <span>{stats.exists ? `${stats.fileCount} 个文件` : '缓存目录不存在'}</span>
          </div>
          <div className="flex items-center space-x-2 text-[11px] text-text-muted">
            <Database className="w-3.5 h-3.5 text-primary" />
            <span>{stats.exists ? formatBytes(stats.totalBytes) : '0 B'}</span>
          </div>
          <div className="flex items-center space-x-2 text-[11px] text-text-muted">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span>{stats.exists ? `最近写入 ${formatTime(stats.lastModified)}` : '暂无写入'}</span>
          </div>
        </div>

        {stats.error && (
          <div className="text-[11px] text-danger flex items-center space-x-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{stats.error}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadStatus}
            loading={loading}
            icon={<RefreshCw className="w-3.5 h-3.5 text-primary" />}
          >
            刷新
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenCache}
            disabled={!stats.exists}
            icon={<FolderOpen className="w-3.5 h-3.5 text-primary" />}
          >
            打开缓存目录
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowClearConfirm(true)}
            disabled={!stats.exists || stats.fileCount === 0}
            icon={<Trash2 className="w-3.5 h-3.5 text-danger" />}
            className="hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
          >
            清理缓存
          </Button>
        </div>

        <div className="text-[10px] text-text-muted border-t border-border/60 pt-3 space-y-1">
          <div>
            d3dx.ini 全局 cache_shaders ={' '}
            <span className="font-mono">{d3dx.globalCacheShaders ?? '未配置'}</span>
            {d3dx.globalCacheShaders === '1' && <span className="ml-1 text-primary">（全局已开启）</span>}
          </div>
          <div>
            include_recursive = Mods{' '}
            <span className={d3dx.includeRecursiveMods ? 'text-success' : 'text-danger'}>
              {d3dx.includeRecursiveMods ? '✓' : '✗'}
            </span>
            <span className="mx-2 text-border">|</span>
            exclude_recursive = DISABLED*{' '}
            <span className={d3dx.excludesDisabled ? 'text-success' : 'text-danger'}>
              {d3dx.excludesDisabled ? '✓' : '✗'}
            </span>
          </div>
        </div>
      </Card>

      {/* 依赖 Mod */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-control bg-primary/10 text-primary border border-primary/20">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-text tracking-wide uppercase">
                <HoverHint
                  content={
                    <>
                      扫描所有 Mod 的 ini 中对{' '}
                      <span className="font-mono">{status.namespace || 'namespace'}</span>{' '}
                      的引用；停用基底 Mod 前会先列出这些依赖。
                    </>
                  }
                >
                  依赖此基底 Mod 的模组
                </HoverHint>
              </h3>
            </div>
          </div>
          <Badge variant="primary" size="sm">
            {enabledDependents.length} 启用 / {disabledDependents.length} 停用
          </Badge>
        </div>

        {status.scanTruncated && (
          <div className="p-3 rounded-control bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-600 dark:text-amber-400 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>依赖扫描达到上限，结果可能不完整；停用前请自行确认。</span>
          </div>
        )}

        {dependents.length === 0 ? (
          <div className="p-3 rounded-control bg-surface-2 border border-border text-[11px] text-text-muted">
            未发现引用此 namespace 的 Mod。
          </div>
        ) : (
          <div className="space-y-2">
            {dependents.map((dependent) => (
              <div
                key={dependent.fullPath}
                className="flex items-center justify-between gap-3 p-3 rounded-control bg-surface-2 border border-border"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text truncate">{dependent.modName}</div>
                  <div className="text-[10px] text-text-muted truncate">
                    {dependent.characterName}
                    {dependent.matchedFiles.length > 1 ? ` · ${dependent.matchedFiles.length} 个文件引用` : ''}
                  </div>
                </div>
                <Badge variant={dependent.enabled ? 'success' : 'default'} size="sm">
                  {dependent.enabled ? '启用中' : '已停用'}
                </Badge>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadStatus}
            loading={loading}
            icon={<RefreshCw className="w-3.5 h-3.5 text-primary" />}
          >
            重新扫描依赖
          </Button>
        </div>
      </Card>

      {/* 健康检查 */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start space-x-3">
            <div
              className={`p-2 rounded-control border ${
                errorCount
                  ? 'bg-danger/10 text-danger border-danger/20'
                  : warningCount
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    : 'bg-success/10 text-success border-success/20'
              }`}
            >
              {errorCount ? (
                <AlertOctagon className="w-4 h-4" />
              ) : warningCount ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="text-xs font-bold text-text tracking-wide uppercase">
                <HoverHint content="检查基底 Mod 状态、依赖、d3dx.ini 规则与缓存目录。只报告可确认的事实，不自动改写 d3dx.ini。">
                  健康检查
                </HoverHint>
              </h3>
            </div>
          </div>
          <Badge variant={errorCount ? 'danger' : warningCount ? 'default' : 'success'} size="sm">
            {errorCount ? `${errorCount} 个错误` : warningCount ? `${warningCount} 个警告` : '未发现问题'}
          </Badge>
        </div>

        {healthChecks.length === 0 ? (
          <div className="p-3 rounded-control bg-success/10 border border-success/25 text-[11px] text-success">
            未发现问题。
          </div>
        ) : (
          <div className="space-y-2">
            {healthChecks.map((check) => {
              const Icon = check.severity === 'error' ? AlertOctagon : check.severity === 'warning' ? AlertTriangle : Info
              const color =
                check.severity === 'error'
                  ? 'text-danger'
                  : check.severity === 'warning'
                    ? 'text-amber-500'
                    : 'text-primary'
              return (
                <div
                  key={check.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-control bg-surface-2 border border-border"
                >
                  <div className="flex items-start space-x-2 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${color}`} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-text leading-relaxed">{check.message}</div>
                      {check.detail && (
                        <div className="text-[10px] text-text-muted whitespace-pre-wrap break-all mt-1">
                          {check.detail}
                        </div>
                      )}
                    </div>
                  </div>
                  {check.fixAction === 'enable-base-mod' && onToggleBaseMod && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={fixingBaseMod}
                      onClick={handleFixBaseMod}
                      className="shrink-0"
                    >
                      启用基底 Mod
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Modal
        isOpen={showClearConfirm}
        onClose={() => !clearing && setShowClearConfirm(false)}
        title="清理着色器缓存？"
        variant="danger"
        confirmText="确认清理"
        loading={clearing}
        onConfirm={handleClearCache}
      >
        <div className="space-y-2 text-xs text-text-muted leading-relaxed">
          <p>
            将删除整个游戏的 ShaderCache（所有 Mod 共用），当前约 {stats.fileCount} 个文件 /{' '}
            {formatBytes(stats.totalBytes)}。
          </p>
          <p>下次启动游戏会重新编译着色器，首次加载可能变慢。请先退出游戏再清理。</p>
          <p className="text-[10px] font-mono break-all text-text-muted/80">{stats.path}</p>
        </div>
      </Modal>
    </div>
  )
}
