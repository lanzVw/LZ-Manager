/**
 * 基底 Mod 相关的纯文本解析。
 *
 * 这里只做字符串处理，不碰文件系统，方便单测。
 * 3DMigoto 的 ini 允许 `;` / `#` 注释，且同一个键可能在多个 include 里重复出现，
 * 因此所有解析都按「section + key」定位，后出现的值覆盖前面的值。
 */

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
