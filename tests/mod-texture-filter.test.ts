import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { ModEngine } from '../src/core/mod-engine'

/**
 * 回归来源：详情页把 Mod 的纹理贴图当成了预览图，铺满一片红紫灰的色块。
 *
 * 早期过滤是文件名黑名单（normalmap / lightmap / ...），但实际文件常叫
 * Normal.jpg、Material.jpg、Light.jpg，一个都匹配不上。
 *
 * 新判据组合两条：
 * 1. 文件名命中已知纹理关键字
 * 2. 图片是正方形、边长 ≥1024、且边长为 2 的幂（纹理贴图的典型特征）
 */

let tmpRoot: string
let modsRoot: string
let engine: ModEngine

/** 造一个真实可解析的 PNG（只含 IHDR，足以读出尺寸） */
function makePng(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // color type RGBA
  const chunkType = Buffer.from('IHDR')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(13, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([chunkType, ihdrData])) >>> 0, 0)
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
  return Buffer.concat([sig, len, chunkType, ihdrData, crc, iend])
}

/** 造一个最小 JPEG 头（SOI + SOF0），用于验证 JPEG 尺寸解析 */
function makeJpeg(width: number, height: number): Buffer {
  const sof = Buffer.alloc(19)
  sof.writeUInt16BE(0xffc0, 0) // SOF0
  sof.writeUInt16BE(17, 2) // segment length
  sof[4] = 8 // precision
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  sof[9] = 3 // components
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00])
  const soi = Buffer.from([0xff, 0xd8])
  return Buffer.concat([soi, app0, sof])
}

function makeMod(name = 'Test Mod'): string {
  const modDir = path.join(modsRoot, '菲欧妮', name)
  fs.mkdirSync(modDir, { recursive: true })
  fs.writeFileSync(path.join(modDir, 'mod.ini'), '[TextureOverride]\nhash = abc\n')
  return modDir
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-texture-'))
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

describe('纹理贴图不得出现在预览图列表', () => {
  it('4096×4096 的 Light.jpg / Material.jpg / Normal.jpg 被过滤', async () => {
    const modDir = makeMod()
    fs.writeFileSync(path.join(modDir, 'Light.jpg'), makeJpeg(4096, 4096))
    fs.writeFileSync(path.join(modDir, 'Material.jpg'), makeJpeg(4096, 4096))
    fs.writeFileSync(path.join(modDir, 'Normal.jpg'), makeJpeg(4096, 4096))
    fs.writeFileSync(path.join(modDir, 'preview.png'), makePng(1920, 1080))

    const details = await engine.getModDetails(modDir)
    const names = details.images.map((i: any) => i.name)
    expect(names).toEqual(['preview.png'])
  })

  it('1024×1024 的正方形贴图被过滤', async () => {
    const modDir = makeMod()
    fs.writeFileSync(path.join(modDir, 'PhoenixBodyANormalMap.jpg'), makeJpeg(1024, 1024))
    fs.writeFileSync(path.join(modDir, 'shot.png'), makePng(800, 1200))

    const details = await engine.getModDetails(modDir)
    expect(details.images.map((i: any) => i.name)).toEqual(['shot.png'])
  })

  it('文件名黑名单仍然生效（连写形式）', async () => {
    const modDir = makeMod()
    fs.writeFileSync(path.join(modDir, 'body_normalmap.png'), makePng(800, 600))
    fs.writeFileSync(path.join(modDir, 'shot.png'), makePng(800, 1200))

    const details = await engine.getModDetails(modDir)
    expect(details.images.map((i: any) => i.name)).toEqual(['shot.png'])
  })

  it('正方形但非 2 的幂的截图不会被误判为纹理', async () => {
    const modDir = makeMod()
    // 775x775 / 1291x1291 是真实存在的正方形截图，不能当成纹理
    fs.writeFileSync(path.join(modDir, 'preview-06.jpg'), makeJpeg(775, 775))
    fs.writeFileSync(path.join(modDir, 'preview-03.jpg'), makeJpeg(1291, 1291))

    const details = await engine.getModDetails(modDir)
    const names = details.images.map((i: any) => i.name).sort()
    expect(names).toEqual(['preview-03.jpg', 'preview-06.jpg'])
  })

  it('非正方形的大图（2559×1439 之类）不会被误判', async () => {
    const modDir = makeMod()
    fs.writeFileSync(path.join(modDir, 'preview.jpg'), makeJpeg(2559, 1439))

    const details = await engine.getModDetails(modDir)
    expect(details.images.map((i: any) => i.name)).toEqual(['preview.jpg'])
  })

  it('正方形边长小于 1024 的截图保留（如 512×512）', async () => {
    const modDir = makeMod()
    fs.writeFileSync(path.join(modDir, 'thumb.png'), makePng(512, 512))

    const details = await engine.getModDetails(modDir)
    expect(details.images.map((i: any) => i.name)).toEqual(['thumb.png'])
  })

  it('损坏的图片文件不会被当成纹理而丢弃', async () => {
    const modDir = makeMod()
    fs.writeFileSync(path.join(modDir, 'broken.png'), Buffer.from('not really a png'))

    const details = await engine.getModDetails(modDir)
    expect(details.images.map((i: any) => i.name)).toEqual(['broken.png'])
  })
})

describe('列表与详情使用同一套纹理过滤', () => {
  it('inspectModFolder（列表路径）同样过滤掉纹理', async () => {
    const modDir = makeMod()
    fs.writeFileSync(path.join(modDir, 'Normal.jpg'), makeJpeg(4096, 4096))
    fs.writeFileSync(path.join(modDir, 'preview.png'), makePng(1920, 1080))

    const mods = await engine.scanMods()
    const item = mods['菲欧妮']?.find((m: any) => m.name === 'Test Mod')
    expect(item).toBeTruthy()
    expect(item.coverPath).toBeTruthy()
    expect(path.basename(item.coverPath)).toBe('preview.png')
    // 列表的 previewImages 里不应出现纹理
    expect((item.previewImages || []).map((p: string) => path.basename(p))).toEqual(['preview.png'])
  })

  it('只有纹理没有截图时，封面为空而不是指向纹理', async () => {
    const modDir = makeMod()
    fs.writeFileSync(path.join(modDir, 'Normal.jpg'), makeJpeg(4096, 4096))

    const mods = await engine.scanMods()
    const item = mods['菲欧妮']?.find((m: any) => m.name === 'Test Mod')
    expect(item?.coverPath || null).toBeNull()
  })
})

describe('旧数据收敛：缺 coverImage 指针时自动补', () => {
  it('补全后若原本没有指针，自动按第一张图建立指针', async () => {
    const modDir = makeMod('Legacy No Pointer')
    // 模拟旧数据：有图但 mod.json 里没有 coverImage
    const imgDir = path.join(modDir, '.lz_images')
    fs.mkdirSync(imgDir, { recursive: true })
    fs.writeFileSync(path.join(imgDir, 'market_01.png'), makePng(1920, 1080))
    fs.writeFileSync(path.join(modDir, 'mod.json'), JSON.stringify({ name: 'Legacy No Pointer' }, null, 2))

    const http = await import('http')
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(makePng(1600, 900))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const addr = server.address() as any
    try {
      await engine.saveMarketPreviews(modDir, [`http://127.0.0.1:${addr.port}/a.png`])
    } finally {
      await new Promise<void>((r) => server.close(() => r()))
    }

    const meta = JSON.parse(fs.readFileSync(path.join(modDir, 'mod.json'), 'utf8'))
    expect(meta.coverImage, '旧数据补全后应自动建立封面指针').toBeTruthy()
    expect(meta.coverImage).toMatch(/^\.lz_images\//)
  })

  it('封面指向 market_* 时，补全会先固化成 _cover.png，不因序号重排而换图', async () => {
    const modDir = makeMod('Legacy With Pointer')
    const imgDir = path.join(modDir, '.lz_images')
    fs.mkdirSync(imgDir, { recursive: true })
    const originalCover = makePng(1920, 1080)
    fs.writeFileSync(path.join(imgDir, 'market_01.png'), makePng(1200, 700))
    fs.writeFileSync(path.join(imgDir, 'market_02.png'), originalCover)
    fs.writeFileSync(
      path.join(modDir, 'mod.json'),
      JSON.stringify({ name: 'x', coverImage: '.lz_images/market_02.png' }, null, 2)
    )

    const http = await import('http')
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(makePng(1400, 800))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const addr = server.address() as any
    try {
      await engine.saveMarketPreviews(modDir, [`http://127.0.0.1:${addr.port}/a.png`])
    } finally {
      await new Promise<void>((r) => server.close(() => r()))
    }

    const meta = JSON.parse(fs.readFileSync(path.join(modDir, 'mod.json'), 'utf8'))
    // 指针改为指向固化副本
    expect(meta.coverImage).toBe('.lz_images/_cover.png')
    // 固化副本的内容必须是用户原来选的那张
    const pinned = fs.readFileSync(path.join(imgDir, '_cover.png'))
    expect(pinned.equals(originalCover), '固化后的封面内容变了').toBe(true)
  })
})
