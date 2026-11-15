/**
 * 基底 Mod 相关的纯文本解析。
 *
 * 这里只做字符串处理，不碰文件系统，方便单测。
 * 3DMigoto 的 ini 允许 `;` / `#` 注释，且同一个键可能在多个 include 里重复出现，
 * 因此所有解析都按「section + key」定位，后出现的值覆盖前面的值。
 */

import type {
  BaseModDependent,
  BaseModHealth,
  BaseModHealthCheck,
  D3dxCacheRules,
  ShaderCacheState,
  ShaderCacheStats
} from './types'

interface IniEntry {
  section: string
  key: string
  value: string
}

/** 去掉整行与行内注释；引号内的 `;` / `#` 不当作注释 */
export function stripIniComments(content: string): string {
  const text = String(content || '')
  // 用 charCode 判断 BOM，避免源码里出现不可见的 U+FEFF 字面量
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  return withoutBom
    .split(/\r?\n/)
    .map((line) => {
      let inSingle = false
      let inDouble = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === "'" && !inDouble) {
          inSingle = !inSingle
        } else if (ch === '"' && !inSingle) {
          inDouble = !inDouble
        } else if ((ch === ';' || ch === '#') && !inSingle && !inDouble) {
          return line.slice(0, i)
        }
      }
      return line
    })
    .join('\n')
}

function* iterateIniEntries(content: string): Generator<IniEntry> {
  let section = ''
  for (const rawLine of stripIniComments(content).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const sectionMatch = line.match(/^\[([^\]]+)\]\s*$/)
    if (sectionMatch) {
      section = sectionMatch[1].trim().toLowerCase()
      continue
    }

    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim().toLowerCase()
    if (!key) continue

    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim()
    }
    yield { section, key, value }
  }
}

/** 解析 `namespace = ...`；未声明或为空返回 null */
export function parseIniNamespace(content: string): string | null {
  for (const entry of iterateIniEntries(content)) {
    // 3DMigoto 只在首个 section 之前解析 namespace；section 内的同名键只是普通配置
    if (entry.section !== '') break
    if (entry.key !== 'namespace') continue
    const value = entry.value.replace(/[\\/]+$/, '').trim()
    if (value) return value
  }
  return null
}

/** 解析 `[Rendering] cache_shaders`；未声明返回 null */
export function parseShaderCacheValue(content: string): string | null {
  let value: string | null = null
  for (const entry of iterateIniEntries(content)) {
    if (entry.section === 'rendering' && entry.key === 'cache_shaders') {
      value = entry.value
    }
  }
  return value
}

export interface ParsedD3dxCacheRules {
  includeRecursive: string[]
  excludeRecursive: string[]
  cacheDirectory: string | null
  cacheShaders: string | null
}

/** 解析 d3dx.ini 里与 Mod 扫描 / 着色器缓存相关的规则 */
export function parseD3dxCacheRules(content: string): ParsedD3dxCacheRules {
  const includeRecursive: string[] = []
  const excludeRecursive: string[] = []
  let cacheDirectory: string | null = null
  let cacheShaders: string | null = null

  for (const entry of iterateIniEntries(content)) {
    if (entry.section === 'include') {
      if (entry.key === 'include_recursive') includeRecursive.push(entry.value)
      else if (entry.key === 'exclude_recursive') excludeRecursive.push(entry.value)
    } else if (entry.section === 'rendering') {
      if (entry.key === 'cache_directory') cacheDirectory = entry.value
      else if (entry.key === 'cache_shaders') cacheShaders = entry.value
    }
  }

  return { includeRecursive, excludeRecursive, cacheDirectory, cacheShaders }
}

/**
 * 判断 ini 是否引用了某个 namespace。
 *
 * 只认带路径分隔符的引用（`CommandList\RabbitFX\Run`、`$\RabbitFX\h`、
 * `Resource\RabbitFX\GlowMap`、`Resource/RabbitFX/GlowMap`），
 * 因此不会把 `namespace = RabbitFX` 自己、`RabbitFX2\...` 或注释里的文字算进来。
 */
export function containsNamespaceReference(content: string, namespace: string): boolean {
  const ns = String(namespace || '').trim()
  if (!ns) return false
  const escaped = ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(?:^|[\\\\/$])${escaped}(?:\\\\|/)`, 'im')
  return pattern.test(stripIniComments(content))
}

export interface BaseModHealthInput {
  namespace: string
  explicit: boolean
  enabled: boolean
  shaderCache: ShaderCacheState
  cacheStats: ShaderCacheStats
  d3dx: D3dxCacheRules
  dependents: BaseModDependent[]
  duplicates: string[]
  scanTruncated: boolean
}

/**
 * 基底 Mod 健康检查。
 *
 * 只报告「能从磁盘确认的事实」，不断言 cache_shaders 一定生效——
 * 3DMigoto 的 include 覆盖顺序需要在真实运行时验证，这里只检查规则是否完整。
 */
export function evaluateBaseModHealth(input: BaseModHealthInput): BaseModHealth {
  const checks: BaseModHealthCheck[] = []
  const enabledDependents = input.dependents.filter((d) => d.enabled)

  if (!input.namespace) {
    checks.push({
      id: 'namespace-missing',
      severity: 'error',
      message: '未能从 ini 中解析出 namespace，无法检测依赖 Mod'
    })
  }

  if (!input.shaderCache.installed && !input.shaderCache.templatePath) {
    checks.push({
      id: 'settings-missing',
      severity: 'warning',
      message: '未找到 ShaderCacheSettings.ini 模板（根目录与 DISABLED 目录都不存在）'
    })
  }
  if (input.shaderCache.installed && !input.shaderCache.active) {
    checks.push({
      id: 'cache-file-not-active',
      severity: 'warning',
      message: '根目录存在 ShaderCacheSettings.ini，但 cache_shaders 不是 1；关闭后重新开启可从模板恢复'
    })
  }

  if (!input.enabled && enabledDependents.length > 0) {
    checks.push({
      id: 'base-disabled-with-dependents',
      severity: 'error',
      message: `基底 Mod 已停用，但仍有 ${enabledDependents.length} 个启用中的 Mod 依赖它`,
      fixAction: 'enable-base-mod'
    })
  }
  if (!input.enabled && input.shaderCache.installed) {
    checks.push({
      id: 'base-disabled-cache-inert',
      severity: 'warning',
      message: '基底 Mod 已停用，根目录的 ShaderCacheSettings.ini 不会被加载',
      fixAction: 'enable-base-mod'
    })
  }
  if (input.enabled && enabledDependents.length > 0) {
    checks.push({
      id: 'dependents-enabled',
      severity: 'info',
      message: `${enabledDependents.length} 个启用中的 Mod 依赖此基底 Mod`
    })
  }

  if (input.duplicates.length > 0) {
    checks.push({
      id: 'duplicate-base-mods',
      severity: 'warning',
      message: `检测到 ${input.duplicates.length} 个使用相同 namespace 的重复基底 Mod`,
      detail: input.duplicates.join('\n')
    })
  }

  if (!input.d3dx.exists) {
    checks.push({
      id: 'd3dx-missing',
      severity: 'error',
      message: '未找到 d3dx.ini，无法确认着色器缓存配置'
    })
  } else {
    if (!input.d3dx.includeRecursiveMods) {
      checks.push({
        id: 'include-recursive-missing',
        severity: 'warning',
        message: 'd3dx.ini 缺少 include_recursive = Mods，Mod 目录不会被加载'
      })
    }
    if (!input.d3dx.excludesDisabled) {
      checks.push({
        id: 'exclude-disabled-missing',
        severity: 'warning',
        message: 'd3dx.ini 缺少 exclude_recursive = DISABLED*，停用的 Mod 与模板也会被加载'
      })
    }
    if (input.d3dx.globalCacheShaders === '1') {
      checks.push({
        id: 'global-cache-enabled',
        severity: 'info',
        message: 'd3dx.ini 全局已开启 cache_shaders = 1，单个 Mod 的开关没有额外效果'
      })
    }
    if (!input.d3dx.cacheDirectoryConfigured) {
      checks.push({
        id: 'cache-directory-default',
        severity: 'info',
        message: 'd3dx.ini 未配置 cache_directory，使用默认 ShaderCache'
      })
    }
  }

  if (input.cacheStats.error) {
    checks.push({
      id: 'cache-path-error',
      severity: 'warning',
      message: `无法读取着色器缓存目录: ${input.cacheStats.error}`
    })
  } else if (!input.cacheStats.exists) {
    checks.push({
      id: 'cache-dir-missing',
      severity: 'info',
      message: '缓存目录尚不存在，游戏首次启用缓存后会生成'
    })
  } else if (input.cacheStats.fileCount === 0) {
    checks.push({
      id: 'cache-empty',
      severity: 'info',
      message: '缓存目录为空'
    })
  }

  if (input.scanTruncated) {
    checks.push({
      id: 'scan-truncated',
      severity: 'warning',
      message: '依赖扫描达到上限，结果可能不完整'
    })
  }

  return {
    ok: checks.every((check) => check.severity !== 'error'),
    checks
  }
}
