import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import { ModEngine } from '../src/core/mod-engine'

/**
 * 回归来源：市场安装只保存首图（preview.png），GameBanana 上其余截图从未落盘，
 * 详情页因此只显示一张图。补全功能把其余截图存到 .lz_previews/，
 * 这里锁定四件事：不污染根目录、能按序读出、getModDetails 会合并进图片列表、
 * 与既有封面内容相同的图不会重复保存。
 */

let tmpRoot: string
let modsRoot: string
let engine: ModEngine

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

/** 起一个只返回固定图片字节的本地服务，避免测试依赖外网 */
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
      } else {
        reject(new Error('无法获取端口'))
      }
    })
  })
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

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

    const img = Buffer.concat([PNG_1PX, Buffer.from('unique')])
    const s = await startImageServer(img)
    try {
      const res = await engine.saveMarketPreviews(modDir, [s.url])
      expect(res.success).toBe(true)
      expect(fs.existsSync(path.join(modDir, '.lz_previews'))).toBe(true)
      const after = fs.readdirSync(modDir).filter((n) => n !== '.lz_previews').sort()
      expect(after).toEqual(before)
    } finally {
      await closeServer(s.server)
    }
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

  it('与 preview.png 内容相同的截图会被跳过，不产生重复', async () => {
    const modDir = makeModDir()
    // 本地起一个 HTTP 服务返回与 preview.png 完全相同的字节，模拟市场首图
    const { server, url } = await startImageServer(PNG_1PX)
    try {
      const res = await engine.saveMarketPreviews(modDir, [url])
      expect(res.skipped).toBe(1)
      expect(res.saved).toBe(0)
      // 关键：目录里没有多出重复图
      const dir = path.join(modDir, '.lz_previews')
      const files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
      expect(files).toEqual([])
    } finally {
      await closeServer(server)
    }
  })

  it('内容不同的截图会被保存，相同内容只存一份', async () => {
    const modDir = makeModDir()
    // 两张不同内容的图，外加一张与 preview.png 相同的
    const otherA = Buffer.concat([PNG_1PX, Buffer.from('a')])
    const otherB = Buffer.concat([PNG_1PX, Buffer.from('b')])
    const s1 = await startImageServer(otherA)
    const s2 = await startImageServer(otherB)
    const s3 = await startImageServer(PNG_1PX)
    try {
      const res = await engine.saveMarketPreviews(modDir, [s1.url, s2.url, s3.url, s1.url])
      expect(res.saved).toBe(2)
      expect(res.skipped).toBe(2) // 一张与封面重复，一张 URL 重复
      const dir = path.join(modDir, '.lz_previews')
      expect(fs.readdirSync(dir).sort()).toEqual(['market_01.png', 'market_02.png'])
    } finally {
      await closeServer(s1.server)
      await closeServer(s2.server)
      await closeServer(s3.server)
    }
  })

  it('重复执行补全不会残留旧序号文件', async () => {
    const modDir = makeModDir()
    const dir = path.join(modDir, '.lz_previews')
    fs.mkdirSync(dir, { recursive: true })
    // 模拟上一轮留下的多余文件
    fs.writeFileSync(path.join(dir, 'market_01.png'), PNG_1PX)
    fs.writeFileSync(path.join(dir, 'market_02.png'), PNG_1PX)
    fs.writeFileSync(path.join(dir, 'market_99.png'), PNG_1PX)

    const img = Buffer.concat([PNG_1PX, Buffer.from('fresh')])
    const s = await startImageServer(img)
    try {
      const res = await engine.saveMarketPreviews(modDir, [s.url])
      expect(res.success).toBe(true)
      // 旧的多余文件应被清掉，只留这一轮的结果
      expect(fs.readdirSync(dir).sort()).toEqual(['market_01.png'])
    } finally {
      await closeServer(s.server)
    }
  })
})
