import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ModEngine } from '../src/core/mod-engine'
import { evaluateBaseModHealth, BaseModHealthInput } from '../src/core/base-mod'

/**
 * 基底 Mod 健康检查。
 *
 * 纯函数覆盖每个检查项的严重级别；集成用例确认 getBaseModStatus
 * 会把依赖、重复安装、d3dx.ini 规则和缓存目录组合成一份报告。
 */

let tmpRoot: string
let modsRoot: string
let envRoot: string
let engine: ModEngine

function healthyInput(overrides: Partial<BaseModHealthInput> = {}): BaseModHealthInput {
  return {
    namespace: 'RabbitFX',
    explicit: false,
    enabled: true,
    shaderCache: {
      installed: false,
      active: false,
      value: null,
      activePath: null,
      templatePath: 'C:\\mod\\DISABLED\\ShaderCacheSettings.ini'
    },
    cacheStats: { path: 'C:\\ShaderCache', exists: true, fileCount: 10, totalBytes: 1024, lastModified: 1 },
    d3dx: {
      d3dxIniPath: 'C:\\d3dx.ini',
      exists: true,
      includeRecursiveMods: true,
      excludesDisabled: true,
      cacheDirectory: 'ShaderCache',
      cacheDirectoryConfigured: true,
      globalCacheShaders: '0'
    },
    dependents: [],
    duplicates: [],
    scanTruncated: false,
    ...overrides
  }
}

function checkIds(input: BaseModHealthInput): string[] {
  return evaluateBaseModHealth(input).checks.map((check) => check.id)
}

function writeBaseMod(folderName = 'RabbitFX', withNamespace = true): string {
  const modDir = path.join(modsRoot, '功能', folderName)
  fs.mkdirSync(path.join(modDir, 'DISABLED'), { recursive: true })
  fs.writeFileSync(
    path.join(modDir, 'RabbitFX.ini'),
    `${withNamespace ? 'namespace = RabbitFX\n' : ''}${'; padding\n'.repeat(200)}`,
    'utf8'
  )
  fs.writeFileSync(path.join(modDir, 'DISABLED', 'ShaderCacheSettings.ini'), '[Rendering]\ncache_shaders = 1\n', 'utf8')
  return modDir
}

function writeD3dx(cacheShaders = '0'): void {
  fs.writeFileSync(
    path.join(envRoot, 'd3dx.ini'),
    [
      '[Include]',
      'include_recursive = Mods',
      'exclude_recursive = DISABLED*',
      '',
      '[Rendering]',
      'cache_directory = ShaderCache',
      `cache_shaders = ${cacheShaders}`,
      ''
    ].join('\n'),
    'utf8'
  )
}

function writeCacheFiles(): void {
  const cacheDir = path.join(envRoot, 'ShaderCache')
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(path.join(cacheDir, 'a.bin'), Buffer.alloc(16))
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-basemod-health-'))
  modsRoot = path.join(tmpRoot, 'Mods')
  envRoot = tmpRoot
  fs.mkdirSync(path.join(modsRoot, '功能'), { recursive: true })
  engine = new ModEngine(modsRoot)
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch (_) {}
})

describe('evaluateBaseModHealth', () => {
  it('健康状态没有任何检查项', () => {
    const health = evaluateBaseModHealth(healthyInput())
    expect(health.ok).toBe(true)
    expect(health.checks).toEqual([])
  })

  it('namespace 缺失是 error', () => {
    const health = evaluateBaseModHealth(healthyInput({ namespace: '' }))
    expect(health.ok).toBe(false)
    expect(checkIds(healthyInput({ namespace: '' }))).toContain('namespace-missing')
  })

  it('模板与根文件都不存在时警告', () => {
    const input = healthyInput({
      shaderCache: { installed: false, active: false, value: null, activePath: null, templatePath: null }
    })
    expect(checkIds(input)).toContain('settings-missing')
    expect(evaluateBaseModHealth(input).ok).toBe(true)
  })

  it('根文件存在但值不是 1 时警告', () => {
    const input = healthyInput({
      shaderCache: {
        installed: true,
        active: false,
        value: '0',
        activePath: 'C:\\mod\\ShaderCacheSettings.ini',
        templatePath: 'C:\\mod\\DISABLED\\ShaderCacheSettings.ini'
      }
    })
    expect(checkIds(input)).toContain('cache-file-not-active')
  })

  it('基底 Mod 停用但仍有启用依赖是 error，并给出修复动作', () => {
    const input = healthyInput({
      enabled: false,
      dependents: [
        {
          fullPath: 'C:\\mod\\consumer',
          characterName: '简',
          modName: '消费者',
          folderName: '消费者',
          enabled: true,
          matchedFiles: ['main.ini']
        }
      ]
    })
    const health = evaluateBaseModHealth(input)
    expect(health.ok).toBe(false)
    const check = health.checks.find((c) => c.id === 'base-disabled-with-dependents')
    expect(check?.severity).toBe('error')
    expect(check?.fixAction).toBe('enable-base-mod')
  })

  it('基底 Mod 停用且根目录有缓存文件时警告', () => {
    const input = healthyInput({
      enabled: false,
      shaderCache: {
        installed: true,
        active: true,
        value: '1',
        activePath: 'C:\\mod\\ShaderCacheSettings.ini',
        templatePath: 'C:\\mod\\DISABLED\\ShaderCacheSettings.ini'
      }
    })
    expect(checkIds(input)).toContain('base-disabled-cache-inert')
  })

  it('基底 Mod 启用且有依赖时只给 info', () => {
    const input = healthyInput({
      dependents: [
        {
          fullPath: 'C:\\mod\\consumer',
          characterName: '简',
          modName: '消费者',
          folderName: '消费者',
          enabled: true,
          matchedFiles: ['main.ini']
        }
      ]
    })
    const health = evaluateBaseModHealth(input)
    expect(health.ok).toBe(true)
    expect(health.checks.find((c) => c.id === 'dependents-enabled')?.severity).toBe('info')
  })

  it('重复基底 Mod 是 warning，并带上路径明细', () => {
    const health = evaluateBaseModHealth(healthyInput({ duplicates: ['C:\\mods\\功能\\RabbitFX Copy'] }))
    expect(health.ok).toBe(true)
    const check = health.checks.find((c) => c.id === 'duplicate-base-mods')
    expect(check?.severity).toBe('warning')
    expect(check?.detail).toContain('RabbitFX Copy')
  })

  it('d3dx.ini 缺失是 error；规则缺失是 warning', () => {
    const missing = healthyInput({
      d3dx: { ...healthyInput().d3dx, exists: false }
    })
    expect(evaluateBaseModHealth(missing).ok).toBe(false)
    expect(checkIds(missing)).toContain('d3dx-missing')

    const incomplete = healthyInput({
      d3dx: {
        ...healthyInput().d3dx,
        includeRecursiveMods: false,
        excludesDisabled: false
      }
    })
    expect(evaluateBaseModHealth(incomplete).ok).toBe(true)
    expect(checkIds(incomplete)).toEqual(
      expect.arrayContaining(['include-recursive-missing', 'exclude-disabled-missing'])
    )
  })

  it('全局已开启缓存 / 默认缓存目录是 info', () => {
    const input = healthyInput({
      d3dx: {
        ...healthyInput().d3dx,
        globalCacheShaders: '1',
        cacheDirectoryConfigured: false
      }
    })
    const ids = checkIds(input)
    expect(ids).toContain('global-cache-enabled')
    expect(ids).toContain('cache-directory-default')
  })

  it('缓存目录错误 / 不存在 / 为空分别是 warning / info / info', () => {
    const errorInput = healthyInput({
      cacheStats: { path: '', exists: false, fileCount: 0, totalBytes: 0, lastModified: 0, error: '越界' }
    })
    expect(evaluateBaseModHealth(errorInput).checks.find((c) => c.id === 'cache-path-error')?.severity).toBe('warning')

    const missingInput = healthyInput({
      cacheStats: { path: 'C:\\ShaderCache', exists: false, fileCount: 0, totalBytes: 0, lastModified: 0 }
    })
    expect(checkIds(missingInput)).toContain('cache-dir-missing')

    const emptyInput = healthyInput({
      cacheStats: { path: 'C:\\ShaderCache', exists: true, fileCount: 0, totalBytes: 0, lastModified: 0 }
    })
    expect(checkIds(emptyInput)).toContain('cache-empty')
  })

  it('扫描截断是 warning，不影响 ok', () => {
    const input = healthyInput({ scanTruncated: true })
    const health = evaluateBaseModHealth(input)
    expect(health.ok).toBe(true)
    expect(health.checks.find((c) => c.id === 'scan-truncated')?.severity).toBe('warning')
  })
})

describe('getBaseModStatus 集成健康报告', () => {
  it('健康基底 Mod：d3dx 规则完整、缓存存在、无依赖', () => {
    const baseDir = writeBaseMod()
    writeD3dx('0')
    writeCacheFiles()

    const status = engine.getBaseModStatus(baseDir, envRoot)
    expect(status?.health?.ok).toBe(true)
    expect(status?.duplicates).toEqual([])
    expect(status?.dependents).toEqual([])
  })

  it('基底 Mod 停用且消费者启用时报 error', () => {
    const baseDir = writeBaseMod('DISABLED_RabbitFX')
    const consumerDir = path.join(modsRoot, '简', '消费者')
    fs.mkdirSync(consumerDir, { recursive: true })
    fs.writeFileSync(path.join(consumerDir, 'main.ini'), 'run = CommandList\\RabbitFX\\Run\n', 'utf8')
    writeD3dx('0')
    writeCacheFiles()

    const status = engine.getBaseModStatus(baseDir, envRoot)
    expect(status?.enabled).toBe(false)
    expect(status?.health?.ok).toBe(false)
    expect(status?.health?.checks.map((c) => c.id)).toContain('base-disabled-with-dependents')
  })

  it('重复基底 Mod 与全局缓存开启会出现在报告里', () => {
    const baseDir = writeBaseMod()
    writeBaseMod('RabbitFX Copy')
    writeD3dx('1')
    writeCacheFiles()

    const status = engine.getBaseModStatus(baseDir, envRoot)
    expect(status?.duplicates).toHaveLength(1)
    const ids = status?.health?.checks.map((c) => c.id) || []
    expect(ids).toContain('duplicate-base-mods')
    expect(ids).toContain('global-cache-enabled')
  })

  it('d3dx.ini 缺失时报 error', () => {
    const baseDir = writeBaseMod()
    const status = engine.getBaseModStatus(baseDir, envRoot)
    expect(status?.health?.ok).toBe(false)
    expect(status?.health?.checks.map((c) => c.id)).toContain('d3dx-missing')
  })
})
