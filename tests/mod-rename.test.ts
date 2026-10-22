import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ModEngine } from '../src/core/mod-engine'

/**
 * 重命名 Mod = 改磁盘目录名（列表与详情都直接读文件夹名）。
 *
 * 三条必须守住的不变量：
 * 1. DISABLED_ 前缀表示停用状态，重命名时必须原样保留，否则会意外启用 Mod
 * 2. 首次重命名记录作者原名，后续再改不覆盖，否则还原点会漂移
 * 3. 名称即目录名，非法字符与重名必须在落盘前拒绝
 */

let tmpRoot: string
let modsRoot: string
let engine: ModEngine

function makeMod(folderName: string, meta?: any): string {
  const modDir = path.join(modsRoot, '菲欧妮', folderName)
  fs.mkdirSync(modDir, { recursive: true })
  fs.writeFileSync(path.join(modDir, 'mod.ini'), '[TextureOverride]\nhash = abc\n')
  if (meta) {
    fs.writeFileSync(path.join(modDir, 'mod.json'), JSON.stringify(meta, null, 2))
  }
  return modDir
}

function readMeta(modDir: string): any {
  const p = path.join(modDir, 'mod.json')
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-rename-'))
  modsRoot = path.join(tmpRoot, 'Mods')
  fs.mkdirSync(path.join(modsRoot, '菲欧妮'), { recursive: true })
  engine = new ModEngine()
  engine.setModFolderPath(modsRoot)
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch (_) {}
})

describe('重命名 Mod：基本行为', () => {
  it('改名后目录名变化，内容保留', () => {
    const modDir = makeMod('Remielle Sportswear')
    const res = engine.renameMod(modDir, '蕾米艾尔 运动装')

    expect(res.success).toBe(true)
    expect(fs.existsSync(path.join(modsRoot, '菲欧妮', '蕾米艾尔 运动装'))).toBe(true)
    expect(fs.existsSync(modDir)).toBe(false)
    const newDir = path.join(modsRoot, '菲欧妮', '蕾米艾尔 运动装')
    expect(fs.existsSync(path.join(newDir, 'mod.ini'))).toBe(true)
  })

  it('首次重命名记录 originalName', () => {
    const modDir = makeMod('Remielle Sportswear')
    engine.renameMod(modDir, '蕾米艾尔 运动装')

    const newDir = path.join(modsRoot, '菲欧妮', '蕾米艾尔 运动装')
    const meta = readMeta(newDir)
    expect(meta.originalName).toBe('Remielle Sportswear')
    expect(meta.name).toBe('蕾米艾尔 运动装')
  })

  it('再次重命名不会覆盖 originalName', () => {
    const modDir = makeMod('Remielle Sportswear')
    engine.renameMod(modDir, '第一次改名')
    const dir2 = path.join(modsRoot, '菲欧妮', '第一次改名')
    engine.renameMod(dir2, '第二次改名')

    const dir3 = path.join(modsRoot, '菲欧妮', '第二次改名')
    const meta = readMeta(dir3)
    expect(meta.originalName, '还原点被后续改名覆盖了').toBe('Remielle Sportswear')
  })

  it('改成相同名字时直接成功且不动磁盘', () => {
    const modDir = makeMod('Remielle Sportswear')
    const res = engine.renameMod(modDir, 'Remielle Sportswear')
    expect(res.success).toBe(true)
    expect(fs.existsSync(modDir)).toBe(true)
  })
})

describe('DISABLED_ 前缀必须保留', () => {
  it('停用的 Mod 改名后仍是停用状态', () => {
    const modDir = makeMod('DISABLED_Remielle Sportswear')
    const res = engine.renameMod(modDir, '蕾米艾尔 运动装')

    expect(res.success).toBe(true)
    expect(
      fs.existsSync(path.join(modsRoot, '菲欧妮', 'DISABLED_蕾米艾尔 运动装')),
      '停用前缀丢了，Mod 会被意外启用'
    ).toBe(true)
    // 不能出现无前缀的同名目录
    expect(fs.existsSync(path.join(modsRoot, '菲欧妮', '蕾米艾尔 运动装'))).toBe(false)
  })

  it('停用 Mod 的 originalName 不含 DISABLED_ 前缀', () => {
    const modDir = makeMod('DISABLED_Remielle Sportswear')
    engine.renameMod(modDir, '蕾米艾尔 运动装')

    const newDir = path.join(modsRoot, '菲欧妮', 'DISABLED_蕾米艾尔 运动装')
    const meta = readMeta(newDir)
    expect(meta.originalName).toBe('Remielle Sportswear')
  })
})

describe('非法输入在落盘前被拒绝', () => {
  it('空名称被拒绝', () => {
    const modDir = makeMod('A')
    expect(engine.renameMod(modDir, '').success).toBe(false)
    expect(engine.renameMod(modDir, '   ').success).toBe(false)
    expect(fs.existsSync(modDir)).toBe(true)
  })

  it('含路径分隔符或 Windows 非法字符被拒绝', () => {
    const modDir = makeMod('A')
    for (const bad of ['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b']) {
      const res = engine.renameMod(modDir, bad)
      expect(res.success, `应拒绝: ${bad}`).toBe(false)
    }
    expect(fs.existsSync(modDir)).toBe(true)
  })

  it('以 DISABLED_ 开头被拒绝（会与启用状态冲突）', () => {
    const modDir = makeMod('A')
    expect(engine.renameMod(modDir, 'DISABLED_foo').success).toBe(false)
  })

  it('目标目录已存在时拒绝，不覆盖', () => {
    const modA = makeMod('A')
    makeMod('B')
    const res = engine.renameMod(modA, 'B')
    expect(res.success).toBe(false)
    expect(res.error).toContain('已存在')
    // 两个目录都还在
    expect(fs.existsSync(path.join(modsRoot, '菲欧妮', 'A'))).toBe(true)
    expect(fs.existsSync(path.join(modsRoot, '菲欧妮', 'B'))).toBe(true)
  })
})

describe('还原为作者原名', () => {
  it('改名后能还原回原名', () => {
    const modDir = makeMod('Remielle Sportswear')
    engine.renameMod(modDir, '蕾米艾尔 运动装')
    const renamedDir = path.join(modsRoot, '菲欧妮', '蕾米艾尔 运动装')

    const res = engine.restoreOriginalModName(renamedDir)
    expect(res.success).toBe(true)
    expect(res.restoredName).toBe('Remielle Sportswear')
    expect(fs.existsSync(path.join(modsRoot, '菲欧妮', 'Remielle Sportswear'))).toBe(true)
  })

  it('停用的 Mod 还原后仍停用', () => {
    const modDir = makeMod('DISABLED_Remielle Sportswear')
    engine.renameMod(modDir, '蕾米艾尔 运动装')
    const renamedDir = path.join(modsRoot, '菲欧妮', 'DISABLED_蕾米艾尔 运动装')

    const res = engine.restoreOriginalModName(renamedDir)
    expect(res.success).toBe(true)
    expect(fs.existsSync(path.join(modsRoot, '菲欧妮', 'DISABLED_Remielle Sportswear'))).toBe(true)
  })

  it('从未重命名过的 Mod 还原会失败并给出提示', () => {
    const modDir = makeMod('Never Renamed')
    const res = engine.restoreOriginalModName(modDir)
    expect(res.success).toBe(false)
    expect(res.error).toContain('没有记录作者原名')
  })

  it('还原后 originalName 仍保留，可以再次还原', () => {
    const modDir = makeMod('Remielle Sportswear')
    engine.renameMod(modDir, '蕾米艾尔 运动装')
    const renamedDir = path.join(modsRoot, '菲欧妮', '蕾米艾尔 运动装')
    engine.restoreOriginalModName(renamedDir)

    const backDir = path.join(modsRoot, '菲欧妮', 'Remielle Sportswear')
    expect(engine.readOriginalName(backDir)).toBe('Remielle Sportswear')
  })
})

describe('readOriginalName', () => {
  it('未重命名时返回空串', () => {
    const modDir = makeMod('Untouched')
    expect(engine.readOriginalName(modDir)).toBe('')
  })

  it('重命名后返回原名', () => {
    const modDir = makeMod('Original Name')
    engine.renameMod(modDir, '中文名')
    const newDir = path.join(modsRoot, '菲欧妮', '中文名')
    expect(engine.readOriginalName(newDir)).toBe('Original Name')
  })

  it('越界路径返回空串', () => {
    const outside = path.join(tmpRoot, 'outside')
    fs.mkdirSync(outside, { recursive: true })
    expect(engine.readOriginalName(outside)).toBe('')
  })
})

describe('重命名后扫描结果同步', () => {
  it('scanMods 反映新名字', async () => {
    const modDir = makeMod('Remielle Sportswear')
    engine.renameMod(modDir, '蕾米艾尔 运动装')

    const mods = await engine.scanMods()
    const names = (mods['菲欧妮'] || []).map((m: any) => m.name)
    expect(names).toContain('蕾米艾尔 运动装')
    expect(names).not.toContain('Remielle Sportswear')
  })

  it('停用 Mod 重命名后 scanMods 仍标记为停用', async () => {
    const modDir = makeMod('DISABLED_Remielle Sportswear')
    engine.renameMod(modDir, '蕾米艾尔 运动装')

    const mods = await engine.scanMods()
    const item = (mods['菲欧妮'] || []).find((m: any) => m.name === '蕾米艾尔 运动装')
    expect(item, '改名后找不到该 Mod').toBeTruthy()
    expect(item.enabled, '停用状态丢失了').toBe(false)
  })
})
