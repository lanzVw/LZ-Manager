import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ModEngine } from '../src/core/mod-engine'

/**
 * 回归来源：市场安装只保存首图（preview.png），GameBanana 上其余截图从未落盘，
 * 详情页因此只显示一张图。补全功能把其余截图存到 .lz_previews/，
 * 这里锁定三件事：不污染根目录、能按序读出、getModDetails 会合并进图片列表。
 */

let tmpRoot: string
let modsRoot: string
let engine: ModEngine

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

function makeModDir(): string {
  const modDir = path.join(modsRoot, '菲欧妮', 'Velina Sportswea')
  fs.mkdirSync(modDir, { recursive: true })
  fs.writeFileSync(path.join(modDir, 'mod.ini'), '[TextureOverride]\nhash = abc\n')
  fs.writeFileSync(path.join(modDir, 'preview.png'), PNG_1PX)
  return modDir
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-previews-'))
  modsRoot = path.join(tmpRoot, 'Mods')
  fs.mkdirSync(modsRoot, { recursive: true })
  engine = new ModEngine()
  engine.setModFolderPath(modsRoot)
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch (_) {}
})

describe('市场截图补全', () => {
  it('没有补全目录时返回空数组', () => {
    const modDir = makeModDir()
    expect(engine.getMarketPreviews(modDir)).toEqual([])
  })

  it('补全的截图落在 .lz_previews 子目录，不污染 Mod 根目录', async () => {
    const modDir = makeModDir()
    const before = fs.readdirSync(modDir).sort()

    // 用 file:// 之外的非法 URL 让下载失败，只为验证目录隔离
    const res = await engine.saveMarketPreviews(modDir, ['not-a-url'])

    expect(res.success).toBe(false)
    expect(fs.existsSync(path.join(modDir, '.lz_previews'))).toBe(true)
    const after = fs.readdirSync(modDir).filter((n) => n !== '.lz_previews').sort()
    expect(after).toEqual(before)
  })

  it('非法 URL 被计入 failed 而不是抛异常', async () => {
    const modDir = makeModDir()
    const res = await engine.saveMarketPreviews(modDir, ['', 'ftp://x/y.png', 'not-a-url'])
    expect(res.success).toBe(false)
    expect(res.failed).toBe(3)
    expect(res.saved).toBe(0)
  })

  it('空列表直接返回错误，不创建目录', async () => {
    const modDir = makeModDir()
    const res = await engine.saveMarketPreviews(modDir, [])
    expect(res.success).toBe(false)
    expect(res.error).toContain('没有可下载的截图')
  })

  it('目录越界被路径守卫拦截', async () => {
    const outside = path.join(tmpRoot, 'outside')
    fs.mkdirSync(outside, { recursive: true })
    const res = await engine.saveMarketPreviews(outside, ['https://example.com/a.png'])
    expect(res.success).toBe(false)
    expect(res.error).toContain('Mod 目录不存在')
  })

  it('getMarketPreviews 按文件名排序，保证截图顺序稳定', () => {
    const modDir = makeModDir()
    const dir = path.join(modDir, '.lz_previews')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'market_10.png'), PNG_1PX)
    fs.writeFileSync(path.join(dir, 'market_02.png'), PNG_1PX)
    fs.writeFileSync(path.join(dir, 'market_01.png'), PNG_1PX)

    const list = engine.getMarketPreviews(modDir).map((p) => path.basename(p))
    expect(list).toEqual(['market_01.png', 'market_02.png', 'market_10.png'])
  })

  it('补全的截图会被 getModDetails 合并进 images 列表', async () => {
    const modDir = makeModDir()
    const dir = path.join(modDir, '.lz_previews')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'market_01.png'), PNG_1PX)
    fs.writeFileSync(path.join(dir, 'market_02.png'), PNG_1PX)

    const details = await engine.getModDetails(modDir)
    const names = (details.images || []).map((i: any) => i.name)

    expect(names).toContain('preview.png')
    expect(names).toContain('market_01.png')
    expect(names).toContain('market_02.png')
    // 首图仍应是 Mod 自带的 preview.png，不被市场截图抢走
    expect(details.images[0].name).toBe('preview.png')
    expect(details.images.find((i: any) => i.name === 'preview.png')?.isCover).toBe(true)
  })
})
