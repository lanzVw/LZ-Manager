import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ModEngine } from '../src/core/mod-engine'
import { writeTextWithEncoding } from '../src/core/text-encoding'

/**
 * 基底 Mod 依赖扫描与停用保护。
 *
 * 关键回归点：
 * 1. 只认带路径分隔符的 namespace 引用，`RabbitFX2`、注释行、`namespace =` 自己都不算
 * 2. 停用消费者、UTF-16LE / GBK 文件都要能识别
 * 3. DISABLED/ 子目录里的引用是惰性的，不计入
 * 4. 停用基底 Mod 前必须列出启用中的依赖
 */

let tmpRoot: string
let modsRoot: string
let engine: ModEngine

function writeIni(modDir: string, fileName: string, content: string, encoding: 'utf8' | 'gbk' | 'utf16le' = 'utf8') {
  const target = path.join(modDir, fileName)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (encoding === 'utf8') fs.writeFileSync(target, content, 'utf8')
  else writeTextWithEncoding(target, content, encoding)
}

function makeBaseMod(folderName = 'RabbitFX', withNamespace = true): string {
  const modDir = path.join(modsRoot, '功能', folderName)
  fs.mkdirSync(path.join(modDir, 'DISABLED'), { recursive: true })
  writeIni(
    modDir,
    'RabbitFX.ini',
    `${withNamespace ? 'namespace = RabbitFX\n' : ''}${'; padding\n'.repeat(200)}[Constants]\n`
  )
  fs.writeFileSync(path.join(modDir, 'DISABLED', 'ShaderCacheSettings.ini'), '[Rendering]\ncache_shaders = 1\n', 'utf8')
  return modDir
}

function makeConsumer(folderName: string, fileName: string, content: string, encoding: 'utf8' | 'gbk' | 'utf16le' = 'utf8'): string {
  const modDir = path.join(modsRoot, '简', folderName)
  writeIni(modDir, fileName, content, encoding)
  return modDir
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-basemod-deps-'))
  modsRoot = path.join(tmpRoot, 'Mods')
  fs.mkdirSync(path.join(modsRoot, '功能'), { recursive: true })
  engine = new ModEngine(modsRoot)
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch (_) {}
})

function buildLibrary() {
  const baseDir = makeBaseMod()
  makeConsumer('启用消费者', 'main.ini', 'run = CommandList\\RabbitFX\\Run\n')
  makeConsumer('DISABLED_停用消费者', 'main.ini', '$\\RabbitFX\\brightness = 20\n')
  makeConsumer('UTF16 消费者', 'main.ini', 'Resource\\RabbitFX\\GlowMap = ref resourceFX\n', 'utf16le')
  makeConsumer('GBK 消费者', 'main.ini', '; 中文注释\nResource\\RabbitFX\\FXMap = ref tex\n', 'gbk')
  makeConsumer('误匹配', 'main.ini', 'run = CommandList\\RabbitFX2\\Run\n')
  makeConsumer('注释消费者', 'main.ini', '; run = CommandList\\RabbitFX\\Run\n')
  makeConsumer('DISABLED 子目录消费者', 'DISABLED/main.ini', 'run = CommandList\\RabbitFX\\Run\n')
  makeBaseMod('RabbitFX Copy')
  return baseDir
}

describe('scanBaseModLibrary', () => {
  it('识别启用/停用、UTF-16LE、GBK 的依赖，并排除误匹配与 DISABLED 子目录', () => {
    const baseDir = buildLibrary()
    const scan = engine.scanBaseModLibrary('RabbitFX', baseDir)
    const names = scan.dependents.map((d) => d.modName).sort()

    expect(names).toEqual(['UTF16 消费者', '启用消费者', '停用消费者', 'GBK 消费者'].sort())
    expect(names).not.toContain('误匹配')
    expect(names).not.toContain('注释消费者')
    expect(names).not.toContain('DISABLED 子目录消费者')

    const enabled = scan.dependents.find((d) => d.modName === '启用消费者')
    expect(enabled?.enabled).toBe(true)
    expect(enabled?.characterName).toBe('简')
    expect(enabled?.matchedFiles).toEqual(['main.ini'])

    const disabled = scan.dependents.find((d) => d.modName === '停用消费者')
    expect(disabled?.enabled).toBe(false)
    expect(disabled?.folderName).toBe('DISABLED_停用消费者')
  })

  it('同 namespace 的另一份基底 Mod 记为 duplicates，不混进依赖列表', () => {
    const baseDir = buildLibrary()
    const scan = engine.scanBaseModLibrary('RabbitFX', baseDir)
    expect(scan.duplicates).toHaveLength(1)
    expect(scan.duplicates[0]).toContain('RabbitFX Copy')
    expect(scan.dependents.some((d) => d.modName === 'RabbitFX Copy')).toBe(false)
  })
})

describe('getBaseModDisableGuard', () => {
  it('有启用依赖时需要二次确认', () => {
    buildLibrary()
    const guard = engine.getBaseModDisableGuard('功能', 'RabbitFX')
    expect(guard?.needsConfirm).toBe(true)
    expect(guard?.reason).toBe('dependents')
    expect(guard?.enabledDependents.map((d) => d.modName).sort()).toEqual(['UTF16 消费者', '启用消费者', 'GBK 消费者'].sort())
  })

  it('只有停用依赖时不需要确认', () => {
    const baseDir = makeBaseMod()
    makeConsumer('DISABLED_停用消费者', 'main.ini', 'run = CommandList\\RabbitFX\\Run\n')
    const guard = engine.getBaseModDisableGuard('功能', 'RabbitFX')
    expect(guard?.needsConfirm).toBe(false)
    expect(guard?.enabledDependents).toEqual([])
    expect(baseDir).toBeTruthy()
  })

  it('非基底 Mod 返回 null', () => {
    const modDir = path.join(modsRoot, '简', '普通')
    writeIni(modDir, 'main.ini', 'namespace = Other\n')
    expect(engine.getBaseModDisableGuard('简', '普通')).toBeNull()
  })

  it('已停用的基底 Mod 返回 null（没有可拦截的启用动作）', () => {
    makeBaseMod('DISABLED_RabbitFX')
    expect(engine.getBaseModDisableGuard('功能', 'RabbitFX')).toBeNull()
  })

  it('显式标记但 namespace 缺失时仍要求确认', () => {
    const modDir = makeBaseMod('RabbitFX', false)
    fs.writeFileSync(path.join(modDir, 'mod.json'), JSON.stringify({ baseMod: true }), 'utf8')
    const guard = engine.getBaseModDisableGuard('功能', 'RabbitFX')
    expect(guard?.needsConfirm).toBe(true)
    expect(guard?.reason).toBe('namespace-missing')
  })

  it('路径穿越名称返回 null', () => {
    makeBaseMod()
    expect(engine.getBaseModDisableGuard('功能', '..')).toBeNull()
    expect(engine.getBaseModDisableGuard('..', 'RabbitFX')).toBeNull()
  })
})

describe('toggleMod 的路径与基底 Mod 保护', () => {
  it('返回改名后的 newFullPath', async () => {
    const baseDir = makeBaseMod()
    const res = await engine.toggleMod('功能', 'RabbitFX', false)
    expect(res.success).toBe(true)
    expect(res.newFullPath).toBe(path.join(modsRoot, '功能', 'DISABLED_RabbitFX'))
    expect(fs.existsSync(baseDir)).toBe(false)

    const back = await engine.toggleMod('功能', 'RabbitFX', true)
    expect(back.success).toBe(true)
    expect(back.newFullPath).toBe(baseDir)
    expect(fs.existsSync(baseDir)).toBe(true)
  })

  it('拒绝 .. 名称，不会逃出角色目录', async () => {
    makeBaseMod()
    const res = await engine.toggleMod('功能', '..', false)
    expect(res.success).toBe(false)
    expect(fs.existsSync(path.join(modsRoot, '功能', 'RabbitFX'))).toBe(true)
  })

  it('Option-A 自动互斥时跳过基底 Mod', async () => {
    const baseDir = makeBaseMod()
    const otherDir = path.join(modsRoot, '功能', 'DISABLED_普通Mod')
    writeIni(otherDir, 'main.ini', 'namespace = Other\n')

    const exclusiveEngine = new ModEngine(modsRoot, true)
    const res = await exclusiveEngine.toggleMod('功能', '普通Mod', true)
    expect(res.success).toBe(true)

    // 普通 Mod 已启用，基底 Mod 必须保持启用，不能被互斥逻辑连带停用
    expect(fs.existsSync(path.join(modsRoot, '功能', '普通Mod'))).toBe(true)
    expect(fs.existsSync(baseDir)).toBe(true)
    expect(fs.existsSync(path.join(modsRoot, '功能', 'DISABLED_RabbitFX'))).toBe(false)
    expect(res.disabledSiblings).toBeUndefined()
  })

  it('Option-A 停用兄弟时返回改名清单，供渲染层局部更新', async () => {
    const siblingDir = path.join(modsRoot, '简', '已启用A')
    writeIni(siblingDir, 'main.ini', 'namespace = A\n')
    const targetDir = path.join(modsRoot, '简', 'DISABLED_B')
    writeIni(targetDir, 'main.ini', 'namespace = B\n')

    const exclusiveEngine = new ModEngine(modsRoot, true)
    const res = await exclusiveEngine.toggleMod('简', 'B', true)

    expect(res.success).toBe(true)
    expect(res.disabledSiblings).toEqual([
      {
        name: '已启用A',
        oldFullPath: siblingDir,
        newFullPath: path.join(modsRoot, '简', 'DISABLED_已启用A')
      }
    ])
    expect(fs.existsSync(path.join(modsRoot, '简', 'DISABLED_已启用A'))).toBe(true)
  })

  it('兄弟的 DISABLED_ 目标已存在时跳过且不回报', async () => {
    const siblingDir = path.join(modsRoot, '简', '已启用A')
    writeIni(siblingDir, 'main.ini', 'namespace = A\n')
    fs.mkdirSync(path.join(modsRoot, '简', 'DISABLED_已启用A'), { recursive: true })
    writeIni(path.join(modsRoot, '简', 'DISABLED_B'), 'main.ini', 'namespace = B\n')

    const exclusiveEngine = new ModEngine(modsRoot, true)
    const res = await exclusiveEngine.toggleMod('简', 'B', true)

    expect(res.success).toBe(true)
    expect(res.disabledSiblings).toBeUndefined()
    expect(fs.existsSync(siblingDir)).toBe(true)
  })

  it('停用操作不返回兄弟改名清单', async () => {
    writeIni(path.join(modsRoot, '简', 'B'), 'main.ini', 'namespace = B\n')
    const res = await engine.toggleMod('简', 'B', false)
    expect(res.success).toBe(true)
    expect(res.disabledSiblings).toBeUndefined()
  })
})
