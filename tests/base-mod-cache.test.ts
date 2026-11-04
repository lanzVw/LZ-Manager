import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ModEngine } from '../src/core/mod-engine'
import { writeTextWithEncoding } from '../src/core/text-encoding'

/**
 * 基底 Mod 识别与着色器缓存开关。
 *
 * 关键回归点：
 * 1. RabbitFX 根目录同时有 RabbitFX.ini（namespace = RabbitFX）和 deltaTime.ini
 *    （namespace = time），必须选主 ini，否则依赖扫描会认错 namespace。
 * 2. 开关只在 Mod 根目录与 DISABLED/ 模板之间复制/移除，模板永远保留。
 * 3. cache_directory 来自 d3dx.ini，必须做包含校验，不能删到 Mods / qaqm 状态目录。
 */

let tmpRoot: string
let modsRoot: string
let envRoot: string
let engine: ModEngine

const TEMPLATE = '[Rendering]\ncache_shaders = 1\n'

function makeBaseMod(folderName = 'RabbitFX'): string {
  const modDir = path.join(modsRoot, '功能', folderName)
  fs.mkdirSync(path.join(modDir, 'DISABLED'), { recursive: true })
  // 主 ini 必须比 deltaTime.ini 大，才能命中「按大小取 namespace」的规则
  fs.writeFileSync(
    path.join(modDir, 'RabbitFX.ini'),
    `namespace = RabbitFX\n${'; padding\n'.repeat(200)}[Constants]\nglobal $censor = 0\n`,
    'utf8'
  )
  fs.writeFileSync(path.join(modDir, 'deltaTime.ini'), 'namespace = time\n', 'utf8')
  fs.writeFileSync(path.join(modDir, 'DISABLED', 'ShaderCacheSettings.ini'), TEMPLATE, 'utf8')
  return modDir
}

function writeD3dx(cacheDirectory: string, globalCacheShaders = '0'): void {
  fs.writeFileSync(
    path.join(envRoot, 'd3dx.ini'),
    [
      '[Include]',
      'include_recursive = Mods',
      'exclude_recursive = DISABLED*',
      '',
      '[Rendering]',
      `cache_directory = ${cacheDirectory}`,
      `cache_shaders = ${globalCacheShaders}`,
      ''
    ].join('\n'),
    'utf8'
  )
}

function makeCacheFiles(): string {
  const cacheDir = path.join(envRoot, 'ShaderCache')
  fs.mkdirSync(path.join(cacheDir, 'nested'), { recursive: true })
  fs.writeFileSync(path.join(cacheDir, 'a.bin'), Buffer.alloc(100))
  fs.writeFileSync(path.join(cacheDir, 'b.bin'), Buffer.alloc(200))
  fs.writeFileSync(path.join(cacheDir, 'nested', 'c.dat'), Buffer.alloc(50))
  return cacheDir
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-basemod-'))
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

describe('基底 Mod 识别', () => {
  it('模板 + namespace 命中，且优先选主 ini 的 namespace', () => {
    const modDir = makeBaseMod()
    const info = engine.detectBaseMod(modDir)
    expect(info?.isBaseMod).toBe(true)
    expect(info?.namespace).toBe('RabbitFX')
    expect(info?.shaderCache.templatePath).toBeTruthy()
    expect(info?.shaderCache.installed).toBe(false)
  })

  it('只有 namespace、没有 ShaderCacheSettings 时不算基底 Mod', () => {
    const modDir = path.join(modsRoot, '功能', '普通Mod')
    fs.mkdirSync(modDir, { recursive: true })
    fs.writeFileSync(path.join(modDir, 'main.ini'), 'namespace = Foo\n', 'utf8')
    expect(engine.detectBaseMod(modDir)).toBeNull()
  })

  it('mod.json.baseMod 可作为显式兜底', () => {
    const modDir = path.join(modsRoot, '功能', '手动基底')
    fs.mkdirSync(modDir, { recursive: true })
    fs.writeFileSync(path.join(modDir, 'main.ini'), 'namespace = Manual\n', 'utf8')
    fs.writeFileSync(path.join(modDir, 'mod.json'), JSON.stringify({ baseMod: true }), 'utf8')
    const info = engine.detectBaseMod(modDir)
    expect(info?.isBaseMod).toBe(true)
    expect(info?.explicit).toBe(true)
    expect(info?.namespace).toBe('Manual')
  })

  it('DISABLED_ 目录仍能识别', () => {
    const modDir = makeBaseMod('DISABLED_RabbitFX')
    const info = engine.detectBaseMod(modDir)
    expect(info?.isBaseMod).toBe(true)
    expect(info?.namespace).toBe('RabbitFX')
  })

  it('scanMods / getModDetails 会带上基底 Mod 字段', async () => {
    const modDir = makeBaseMod()
    const scanned = await engine.scanMods()
    const item = (scanned['功能'] || []).find((m) => m.name === 'RabbitFX')
    expect(item?.isBaseMod).toBe(true)
    expect(item?.baseModNamespace).toBe('RabbitFX')

    const details = await engine.getModDetails(modDir)
    expect(details?.baseModInfo?.isBaseMod).toBe(true)
    expect(details?.baseModInfo?.namespace).toBe('RabbitFX')
  })
})

describe('着色器缓存开关', () => {
  it('启用时复制模板到根目录，模板保留', () => {
    const modDir = makeBaseMod()
    const res = engine.setShaderCacheEnabled(modDir, true)
    expect(res.success).toBe(true)
    expect(res.state?.active).toBe(true)
    expect(res.state?.value).toBe('1')
    expect(fs.existsSync(path.join(modDir, 'ShaderCacheSettings.ini'))).toBe(true)
    expect(fs.existsSync(path.join(modDir, 'DISABLED', 'ShaderCacheSettings.ini'))).toBe(true)
  })

  it('重复启用是幂等的', () => {
    const modDir = makeBaseMod()
    engine.setShaderCacheEnabled(modDir, true)
    const res = engine.setShaderCacheEnabled(modDir, true)
    expect(res.success).toBe(true)
    expect(res.state?.active).toBe(true)
  })

  it('根目录文件值为 0 时，启用会用模板覆盖', () => {
    const modDir = makeBaseMod()
    fs.writeFileSync(path.join(modDir, 'ShaderCacheSettings.ini'), '[Rendering]\ncache_shaders = 0\n', 'utf8')
    const res = engine.setShaderCacheEnabled(modDir, true)
    expect(res.success).toBe(true)
    expect(res.state?.value).toBe('1')
  })

  it('停用时删除根文件，模板保留', () => {
    const modDir = makeBaseMod()
    engine.setShaderCacheEnabled(modDir, true)
    const res = engine.setShaderCacheEnabled(modDir, false)
    expect(res.success).toBe(true)
    expect(res.state?.installed).toBe(false)
    expect(fs.existsSync(path.join(modDir, 'ShaderCacheSettings.ini'))).toBe(false)
    expect(fs.existsSync(path.join(modDir, 'DISABLED', 'ShaderCacheSettings.ini'))).toBe(true)
  })

  it('没有模板时停用会把根文件移回 DISABLED，而不是删掉唯一副本', () => {
    const modDir = path.join(modsRoot, '功能', '无模板')
    fs.mkdirSync(modDir, { recursive: true })
    fs.writeFileSync(path.join(modDir, 'ShaderCacheSettings.ini'), TEMPLATE, 'utf8')
    const res = engine.setShaderCacheEnabled(modDir, false)
    expect(res.success).toBe(true)
    expect(fs.existsSync(path.join(modDir, 'ShaderCacheSettings.ini'))).toBe(false)
    expect(fs.existsSync(path.join(modDir, 'DISABLED', 'ShaderCacheSettings.ini'))).toBe(true)
  })

  it('模板缺失且根目录没有文件时，启用失败并给出提示', () => {
    const modDir = path.join(modsRoot, '功能', '无模板无根文件')
    fs.mkdirSync(modDir, { recursive: true })
    const res = engine.setShaderCacheEnabled(modDir, true)
    expect(res.success).toBe(false)
    expect(res.error).toContain('模板')
  })

  it('越界路径被拒绝', () => {
    const outside = path.join(tmpRoot, 'outside')
    fs.mkdirSync(outside, { recursive: true })
    const res = engine.setShaderCacheEnabled(outside, true)
    expect(res.success).toBe(false)
  })
})

describe('ShaderCache 统计与清理', () => {
  it('统计文件数、体积与 d3dx 规则', () => {
    makeCacheFiles()
    writeD3dx('ShaderCache')
    const stats = engine.getShaderCacheInfo(envRoot)
    expect(stats.exists).toBe(true)
    expect(stats.fileCount).toBe(3)
    expect(stats.totalBytes).toBe(350)

    const rules = engine.getD3dxCacheRules(envRoot)
    expect(rules.exists).toBe(true)
    expect(rules.includeRecursiveMods).toBe(true)
    expect(rules.excludesDisabled).toBe(true)
    expect(rules.cacheDirectory).toBe('ShaderCache')
    expect(rules.globalCacheShaders).toBe('0')
  })

  it('清理只删目录内容，目录本身保留', () => {
    const cacheDir = makeCacheFiles()
    writeD3dx('ShaderCache')
    const res = engine.clearShaderCache(envRoot)
    expect(res.success).toBe(true)
    expect(res.deletedCount).toBe(3)
    expect(fs.existsSync(cacheDir)).toBe(true)
    expect(fs.readdirSync(cacheDir)).toHaveLength(0)
  })

  it('拒绝 cache_directory = cache（qaqm 状态目录）', () => {
    const stateDir = path.join(envRoot, 'cache')
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(path.join(stateDir, 'qaqm_state_abc.ini'), 'x = 1\n', 'utf8')
    writeD3dx('cache')

    const stats = engine.getShaderCacheInfo(envRoot)
    expect(stats.path).toBe('')
    expect(stats.error).toBeTruthy()

    const res = engine.clearShaderCache(envRoot)
    expect(res.success).toBe(false)
    expect(fs.existsSync(path.join(stateDir, 'qaqm_state_abc.ini'))).toBe(true)
  })

  it('拒绝 cache_directory = Mods', () => {
    writeD3dx('Mods')
    const res = engine.clearShaderCache(envRoot)
    expect(res.success).toBe(false)
    expect(fs.existsSync(modsRoot)).toBe(true)
  })

  it('拒绝越界的 cache_directory', () => {
    writeD3dx('..\\outside')
    const res = engine.clearShaderCache(envRoot)
    expect(res.success).toBe(false)
  })

  it('GBK / UTF-16LE 的 d3dx.ini 也能解析', () => {
    const cacheDir = path.join(envRoot, 'ShaderCache')
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(path.join(cacheDir, 'a.bin'), Buffer.alloc(10))

    const content = '; 中文注释\n[Include]\ninclude_recursive = Mods\n[Rendering]\ncache_directory = ShaderCache\ncache_shaders = 0\n'
    const gbkPath = path.join(envRoot, 'd3dx.ini')
    writeTextWithEncoding(gbkPath, content, 'gbk')
    expect(engine.getD3dxCacheRules(envRoot).cacheDirectory).toBe('ShaderCache')

    writeTextWithEncoding(gbkPath, content, 'utf16le')
    expect(engine.getD3dxCacheRules(envRoot).cacheDirectory).toBe('ShaderCache')
    expect(engine.getShaderCacheInfo(envRoot).fileCount).toBe(1)
  })
})
