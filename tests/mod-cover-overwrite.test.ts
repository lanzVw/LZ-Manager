import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import http from 'http'
import { ModEngine } from '../src/core/mod-engine'

/**
 * 回归来源：封面与图片资产长期混在一起——
 * preview.png 既是「市场首图」又是「封面」，一改封面就覆盖原图（踩过两次）。
 *
 * 新设计把两者彻底拆开：
 * - 图片资产统一放 .lz_images/，只增不改
 * - 封面只由 mod.json 的 coverImage 指针决定，不产生任何新文件
 * - 旧结构（根目录 preview.*、旧 .lz_previews/）在用户点「补全」时懒迁移
 */

let tmpRoot: string
let modsRoot: string
let engine: ModEngine

/**
 * 造一个可解析的 PNG（只含 IHDR，足以读出尺寸）
 *
 * 尺寸必须接近真实截图：1×1 之类的极小图会被 isLegacyThumbnail 判定为
 * 旧版缩略图并在补全时清理，用来当夹具会干扰与本文件无关的断言。
 */
function makePng(width: number, height: number, salt = ''): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8
  ihdrData[9] = 6
  const chunkType = Buffer.from('IHDR')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(13, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([chunkType, ihdrData])) >>> 0, 0)
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
  const tail = salt ? Buffer.from(salt) : Buffer.alloc(0)
  return Buffer.concat([sig, len, chunkType, ihdrData, crc, tail, iend])
}

const PNG_A = makePng(1920, 1080, 'a')
const PNG_B = makePng(1600, 900, 'b')
const PNG_C = makePng(1440, 810, 'c')

function startImageServer(payload: Buffer): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(payload)
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        resolve({ server, url: `http://127.0.0.1:${addr.port}/img.png` })
      } else reject(new Error('无法获取端口'))
    })
  })
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

function makeMod(): string {
  const modDir = path.join(modsRoot, '菲欧妮', 'Goth Leotard Phoenix')
  fs.mkdirSync(modDir, { recursive: true })
  fs.writeFileSync(path.join(modDir, 'mod.ini'), '[TextureOverride]\nhash = abc\n')
  return modDir
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-cover-design-'))
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

describe('封面：只记指针，不复制文件', () => {
  it('设为封面后不产生任何新图片文件', async () => {
    const modDir = makeMod()
    const s = await startImageServer(PNG_A)
    try {
      await engine.saveMarketPreviews(modDir, [s.url, s.url + '?2'])
    } finally {
      await closeServer(s.server)
    }
    const imgDir = path.join(modDir, '.lz_images')
    const filesBefore = fs.readdirSync(imgDir).sort()

    const target = engine.getMarketPreviews(modDir)[0]
    expect(engine.setAsCoverImage(modDir, target)).toBe(true)

    const filesAfter = fs.readdirSync(imgDir).sort()
    expect(filesAfter).toEqual(filesBefore)
  })

  it('设为封面后 mod.json 写入 coverImage 指针', async () => {
    const modDir = makeMod()
    const s = await startImageServer(PNG_B)
    try {
      await engine.saveMarketPreviews(modDir, [s.url])
    } finally {
      await closeServer(s.server)
    }
    const target = engine.getMarketPreviews(modDir)[0]
    engine.setAsCoverImage(modDir, target)

    const meta = JSON.parse(fs.readFileSync(path.join(modDir, 'mod.json'), 'utf8'))
    expect(meta.coverImage).toBe('.lz_images/market_01.png')
  })

  it('换封面只改指针，原图内容不变', async () => {
    const modDir = makeMod()
    const s1 = await startImageServer(PNG_A)
    const s2 = await startImageServer(PNG_B)
    try {
      await engine.saveMarketPreviews(modDir, [s1.url, s2.url])
    } finally {
      await closeServer(s1.server)
      await closeServer(s2.server)
    }
    const [img1, img2] = engine.getMarketPreviews(modDir)
    const buf1 = fs.readFileSync(img1)

    engine.setAsCoverImage(modDir, img1)
    engine.setAsCoverImage(modDir, img2)

    expect(fs.readFileSync(img1).equals(buf1)).toBe(true)
    const meta = JSON.parse(fs.readFileSync(path.join(modDir, 'mod.json'), 'utf8'))
    expect(meta.coverImage).toBe('.lz_images/market_02.png')
  })

  it('getModDetails 按指针标记封面', async () => {
    const modDir = makeMod()
    const s1 = await startImageServer(PNG_A)
    const s2 = await startImageServer(PNG_C)
    try {
      await engine.saveMarketPreviews(modDir, [s1.url, s2.url])
    } finally {
      await closeServer(s1.server)
      await closeServer(s2.server)
    }
    const imgs = engine.getMarketPreviews(modDir)
    engine.setAsCoverImage(modDir, imgs[1])

    const details = await engine.getModDetails(modDir)
    const cover = details.images.find((i: any) => i.isCover)
    expect(cover?.path).toBe(imgs[1])
  })

  it('clearCoverImage 清掉指针，封面回落到自动选取', async () => {
    const modDir = makeMod()
    const s = await startImageServer(PNG_A)
    try {
      await engine.saveMarketPreviews(modDir, [s.url])
    } finally {
      await closeServer(s.server)
    }
    const target = engine.getMarketPreviews(modDir)[0]
    engine.setAsCoverImage(modDir, target)
    expect(engine.clearCoverImage(modDir)).toBe(true)

    const meta = JSON.parse(fs.readFileSync(path.join(modDir, 'mod.json'), 'utf8'))
    expect(meta.coverImage).toBeUndefined()
  })

  it('指针指向的图被删掉时，静默回落到自动选取而不报错', async () => {
    const modDir = makeMod()
    const s = await startImageServer(PNG_A)
    try {
      await engine.saveMarketPreviews(modDir, [s.url])
    } finally {
      await closeServer(s.server)
    }
    const target = engine.getMarketPreviews(modDir)[0]
    engine.setAsCoverImage(modDir, target)
    fs.unlinkSync(target)

    const details = await engine.getModDetails(modDir)
    expect(details.images.length).toBe(0)
  })

  /**
   * 回归来源：详情页能显示封面，但角色库列表卡片显示「无预览图」。
   * 原因是列表走 inspectModFolder（只扫根目录），封面指针指向 .lz_images/ 时找不到。
   */
  it('列表卡片封面与详情页封面必须一致（不能显示无预览图）', async () => {
    const modDir = makeMod()
    const s = await startImageServer(PNG_A)
    try {
      await engine.saveMarketPreviews(modDir, [s.url])
    } finally {
      await closeServer(s.server)
    }
    const target = engine.getMarketPreviews(modDir)[0]
    engine.setAsCoverImage(modDir, target)

    // 列表路径
    const mods = await engine.scanMods()
    const item = mods['菲欧妮']?.find((m: any) => m.name === 'Goth Leotard Phoenix')
    expect(item, '列表里找不到该 Mod').toBeTruthy()
    expect(item.coverPath, '列表卡片封面为空，会显示「无预览图」').toBeTruthy()

    // 详情路径
    const details = await engine.getModDetails(modDir)
    const detailCover = details.images.find((i: any) => i.isCover)
    expect(detailCover?.path).toBe(item.coverPath)
  })

  it('只有 .lz_images/ 里的图时，列表也能取到封面', async () => {
    const modDir = makeMod()
    const s = await startImageServer(PNG_B)
    try {
      await engine.saveMarketPreviews(modDir, [s.url])
    } finally {
      await closeServer(s.server)
    }
    // 不设指针，走自动选取；此时根目录没有任何图片
    const mods = await engine.scanMods()
    const item = mods['菲欧妮']?.find((m: any) => m.name === 'Goth Leotard Phoenix')
    expect(item?.coverPath).toBeTruthy()
  })
})

describe('懒迁移：旧结构归位到 .lz_images/', () => {
  it('根目录 preview.png 被搬进 .lz_images/，旧位置清空', async () => {
    const modDir = makeMod()
    fs.writeFileSync(path.join(modDir, 'preview.png'), PNG_A)

    const s = await startImageServer(PNG_B)
    try {
      await engine.saveMarketPreviews(modDir, [s.url])
    } finally {
      await closeServer(s.server)
    }

    expect(fs.existsSync(path.join(modDir, 'preview.png'))).toBe(false)
    const imgDir = path.join(modDir, '.lz_images')
    const names = fs.readdirSync(imgDir)
    // 补全会整批重建为 market_*，但原封面内容必须被保留下来
    expect(names.length).toBeGreaterThan(0)
  })

  it('旧 .lz_previews/ 里的图被搬过来，旧目录删除', async () => {
    const modDir = makeMod()
    const legacy = path.join(modDir, '.lz_previews')
    fs.mkdirSync(legacy, { recursive: true })
    fs.writeFileSync(path.join(legacy, 'market_01.png'), PNG_A)

    const s = await startImageServer(PNG_B)
    try {
      await engine.saveMarketPreviews(modDir, [s.url])
    } finally {
      await closeServer(s.server)
    }

    expect(fs.existsSync(legacy)).toBe(false)
    const imgDir = path.join(modDir, '.lz_images')
    expect(fs.readdirSync(imgDir)).toContain('market_01.png')
  })

  it('Mod 自带的其它图片不被误迁移', async () => {
    const modDir = makeMod()
    fs.writeFileSync(path.join(modDir, 'screenshot.png'), PNG_A)
    fs.writeFileSync(path.join(modDir, 'preview.png'), PNG_C)

    const s = await startImageServer(PNG_B)
    try {
      await engine.saveMarketPreviews(modDir, [s.url])
    } finally {
      await closeServer(s.server)
    }

    // 非封面命名的图原地不动
    expect(fs.existsSync(path.join(modDir, 'screenshot.png'))).toBe(true)
    expect(fs.existsSync(path.join(modDir, 'preview.png'))).toBe(false)
  })

  it('迁移来的封面内容不会因重建而丢失', async () => {
    const modDir = makeMod()
    fs.writeFileSync(path.join(modDir, 'preview.png'), PNG_A)

    const s = await startImageServer(PNG_B)
    try {
      await engine.saveMarketPreviews(modDir, [s.url])
    } finally {
      await closeServer(s.server)
    }

    // 原封面不在市场返回的图里，应被单独保留下来并可继续作为封面
    const imgDir = path.join(modDir, '.lz_images')
    const meta = JSON.parse(fs.readFileSync(path.join(modDir, 'mod.json'), 'utf8'))
    const coverAbs = path.join(modDir, meta.coverImage.split('/').join(path.sep))
    expect(fs.existsSync(coverAbs), '原封面文件丢失了').toBe(true)
    expect(fs.readFileSync(coverAbs).equals(PNG_A), '原封面内容被改写了').toBe(true)
  })
})

describe('重复补全：整批重建，序号始终与市场顺序一致', () => {
  it('第二次补全不会残留上一轮的多余图片', async () => {
    const modDir = makeMod()
    fs.writeFileSync(path.join(modDir, 'preview.png'), PNG_A)

    const s1 = await startImageServer(PNG_B)
    try {
      await engine.saveMarketPreviews(modDir, [s1.url])
    } finally {
      await closeServer(s1.server)
    }

    const s2 = await startImageServer(PNG_C)
    try {
      await engine.saveMarketPreviews(modDir, [s2.url])
    } finally {
      await closeServer(s2.server)
    }

    const names = fs.readdirSync(path.join(modDir, '.lz_images')).sort()
    expect(names).toContain('market_01.png')
    // 上一轮的 market_* 与迁移来的 legacy_* 都被清掉，只留本轮结果 + 保留下来的原封面
    const marketFiles = names.filter((n) => n.startsWith('market_'))
    expect(marketFiles).toEqual(['market_01.png'])
  })
})

describe('补全的边界行为', () => {
  it('没有图片目录时返回空数组', () => {
    const modDir = makeMod()
    expect(engine.getMarketPreviews(modDir)).toEqual([])
  })

  it('非法 URL 计入 failed 而不是抛异常', async () => {
    const modDir = makeMod()
    const res = await engine.saveMarketPreviews(modDir, ['', 'ftp://x/y.png', 'not-a-url'])
    expect(res.success).toBe(false)
    expect(res.failed).toBe(3)
    expect(res.saved).toBe(0)
  })

  it('空列表直接返回错误', async () => {
    const modDir = makeMod()
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

  it('getMarketPreviews 按文件名排序，顺序稳定', async () => {
    const modDir = makeMod()
    const imgDir = path.join(modDir, '.lz_images')
    fs.mkdirSync(imgDir, { recursive: true })
    fs.writeFileSync(path.join(imgDir, 'market_10.png'), PNG_A)
    fs.writeFileSync(path.join(imgDir, 'market_02.png'), PNG_B)
    fs.writeFileSync(path.join(imgDir, 'market_01.png'), PNG_C)

    const list = engine.getMarketPreviews(modDir).map((p) => path.basename(p))
    expect(list).toEqual(['market_01.png', 'market_02.png', 'market_10.png'])
  })

  it('补全的图会出现在 getModDetails 的图片列表里', async () => {
    const modDir = makeMod()
    const s = await startImageServer(PNG_A)
    try {
      await engine.saveMarketPreviews(modDir, [s.url])
    } finally {
      await closeServer(s.server)
    }
    const details = await engine.getModDetails(modDir)
    expect(details.images.some((i: any) => i.name === 'market_01.png')).toBe(true)
  })

  it('内容相同的图只存一份', async () => {
    const modDir = makeMod()
    const s1 = await startImageServer(PNG_B)
    const s2 = await startImageServer(PNG_C)
    try {
      const res = await engine.saveMarketPreviews(modDir, [s1.url, s2.url, s1.url])
      expect(res.saved).toBe(2)
      expect(res.skipped).toBe(1)
    } finally {
      await closeServer(s1.server)
      await closeServer(s2.server)
    }
    const names = fs.readdirSync(path.join(modDir, '.lz_images'))
    expect(names.filter((n) => n.startsWith('market_'))).toEqual(['market_01.png', 'market_02.png'])
  })
})

describe('缩略图顺序必须与市场顺序一致', () => {
  /**
   * 回归来源：用户反馈「下载的封面跟市场排序不一致」。
   * 根因是安装写 image_*.png、补全写 market_*.png，两套命名混在一起后
   * 按字母排序会把 image_02 排到 market_01 前面。
   */
  it('安装留下的 image_* 与补全的 market_* 不会导致顺序错乱', async () => {
    const modDir = makeMod('Order Test')
    const imgDir = path.join(modDir, '.lz_images')
    fs.mkdirSync(imgDir, { recursive: true })
    // 模拟安装只下了后两张（第 0 张失败），留下 image_02 / image_03
    fs.writeFileSync(path.join(imgDir, 'image_02.png'), PNG_B)
    fs.writeFileSync(path.join(imgDir, 'image_03.png'), PNG_C)

    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      if (req.url?.includes('a')) res.end(PNG_A)
      else if (req.url?.includes('b')) res.end(PNG_B)
      else res.end(PNG_C)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const addr = server.address() as any
    const base = `http://127.0.0.1:${addr.port}`
    try {
      await engine.saveMarketPreviews(modDir, [`${base}/a.png`, `${base}/b.png`, `${base}/c.png`])
    } finally {
      await closeServer(server)
    }

    const names = fs.readdirSync(imgDir).filter((n) => /^(market_|image_)/i.test(n)).sort()
    expect(names).toEqual(['market_01.png', 'market_02.png', 'market_03.png'])
    expect(fs.readFileSync(path.join(imgDir, 'market_01.png')).equals(PNG_A)).toBe(true)
    expect(fs.readFileSync(path.join(imgDir, 'market_02.png')).equals(PNG_B)).toBe(true)
    expect(fs.readFileSync(path.join(imgDir, 'market_03.png')).equals(PNG_C)).toBe(true)
  })

  it('getMarketPreviews 返回的顺序与市场顺序一致', async () => {
    const modDir = makeMod('Order Test 2')
    const imgDir = path.join(modDir, '.lz_images')
    fs.mkdirSync(imgDir, { recursive: true })

    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      if (req.url?.includes('a')) res.end(PNG_A)
      else res.end(PNG_B)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const addr = server.address() as any
    const base = `http://127.0.0.1:${addr.port}`
    try {
      await engine.saveMarketPreviews(modDir, [`${base}/a.png`, `${base}/b.png`])
    } finally {
      await closeServer(server)
    }

    const list = engine.getMarketPreviews(modDir)
    const names = list.map((p) => path.basename(p))
    expect(names[0]).toBe('market_01.png')
    expect(names[1]).toBe('market_02.png')
    expect(fs.readFileSync(list[0]).equals(PNG_A)).toBe(true)
  })
})
