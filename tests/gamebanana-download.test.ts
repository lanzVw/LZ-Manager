import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { downloadFile, installMod, resolveDownloadRoot, sweepStaleDownloadDirs } from '../src/core/gamebanana-service'

/**
 * 回归来源：用户现场 %APPDATA%\Electron\lz-main-error.log
 * uncaughtException: ENOENT: no such file or directory, open '…\qaqman_gb_downloads\dl_…\….zip.part'
 * 成因：下载临时目录在 fetch（最多 3 次重试 / 30s 超时）期间被系统清理，写流 open 抛原始 ENOENT，
 * 且失败没有兜底（下载不自愈、installMod 只 reject）。
 */
let tmpRoot = ''

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-gb-download-test-'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch (_) {}
})

// verifyArchiveMagic 需要 ZIP 魔数 PK\x03\x04
function zipResponse() {
  const body = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(512, 0x41)])
  return new Response(body, { headers: { 'content-length': String(body.length) } })
}

describe('downloadFile 临时目录韧性', () => {
  it('fetch 期间下载目录被清掉后仍能完成下载', async () => {
    const dir = path.join(tmpRoot, 'wipe-during-fetch')
    fs.mkdirSync(dir, { recursive: true })
    vi.stubGlobal('fetch', async () => {
      fs.rmSync(dir, { recursive: true, force: true })
      return zipResponse()
    })

    const res: any = await downloadFile({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetDir: dir,
      fileName: 'demo_ver_52_-MqgcoX.zip'
    })

    expect(res.format).toBe('zip')
    expect(fs.existsSync(res.archivePath)).toBe(true)
  })
})

describe('downloadFile 停滞超时', () => {
  it('下载停滞超时且清理 .part 文件', async () => {
    const dir = path.join(tmpRoot, 'stall-timeout')
    fs.mkdirSync(dir, { recursive: true })
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([0x50, 0x4b, 0x03, 0x04])) } })
    vi.stubGlobal('fetch', async () => new Response(body, { headers: { 'content-length': '1048576' } }))

    await expect(
      downloadFile({
        downloadUrl: 'https://gamebanana.com/dl/1',
        targetDir: dir,
        fileName: 'demo.zip',
        stallTimeoutMs: 300
      })
    ).rejects.toThrow(/下载停滞/)

    expect(fs.existsSync(path.join(dir, 'demo.zip.part'))).toBe(false)
  })
})

describe('resolveDownloadRoot 兜底下载根目录位置', () => {
  it('下载根目录包含 QAQManager 与 gb_downloads，且不位于 os.tmpdir()', () => {
    const root = resolveDownloadRoot()
    expect(root).toContain('QAQManager')
    expect(root).toContain('gb_downloads')
    expect(root.startsWith(os.tmpdir())).toBe(false)
  })
})

describe('installMod 失败语义', () => {
  it('下载失败时返回 { success:false, error } 而不是抛异常', async () => {
    const target = path.join(tmpRoot, 'install-target', 'TestChar')
    // 400 是 fetchWithRetry 明确不重试的分支，保证用例离网、快速
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 400, statusText: 'Bad Request' }))

    const res: any = await installMod({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetParentDir: target,
      modName: 'Probe Mod',
      fileName: 'demo_ver_52_-MqgcoX.zip'
    })

    expect(res.success).toBe(false)
    expect(typeof res.error).toBe('string')
  })
})

describe('外部传入 downloadRoot 优先', () => {
  it('外部传入 downloadRoot 优先且用后清理，兜底目录不新增残留', async () => {
    const target = path.join(tmpRoot, 'install-target-custom', 'TestChar')
    const customRoot = path.join(tmpRoot, 'custom-cache-root')
    const fallbackRoot = resolveDownloadRoot()
    const fallbackBefore = fs.existsSync(fallbackRoot)
      ? fs.readdirSync(fallbackRoot).filter((n) => n.startsWith('dl_') || n.startsWith('staging_'))
      : []

    // 400 是 fetchWithRetry 明确不重试的分支，保证用例离网、快速
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 400, statusText: 'Bad Request' }))

    const res: any = await installMod({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetParentDir: target,
      modName: 'Probe Mod',
      fileName: 'demo_ver_52_-MqgcoX.zip',
      downloadRoot: customRoot
    })

    expect(res.success).toBe(false)
    expect(typeof res.error).toBe('string')
    expect(res.error.length).toBeGreaterThan(0)

    expect(fs.existsSync(customRoot)).toBe(true)
    const customLeftovers = fs.readdirSync(customRoot).filter((n) => n.startsWith('dl_') || n.startsWith('staging_'))
    expect(customLeftovers).toEqual([])

    const fallbackAfter = fs.existsSync(fallbackRoot)
      ? fs.readdirSync(fallbackRoot).filter((n) => n.startsWith('dl_') || n.startsWith('staging_'))
      : []
    const newlyAdded = fallbackAfter.filter((n) => !fallbackBefore.includes(n))
    expect(newlyAdded).toEqual([])
  })
})

describe('中途取消安装', () => {
  it('downloadFile 被取消：抛出 DOWNLOAD_CANCELLED 且清理 .part 文件', async () => {
    const dir = path.join(tmpRoot, 'cancel-download')
    fs.mkdirSync(dir, { recursive: true })
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))
      }
    })
    vi.stubGlobal('fetch', async () => new Response(body, { headers: { 'content-length': '1048576' } }))

    const controller = new AbortController()
    setTimeout(() => controller.abort(), 150)

    const promise = downloadFile({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetDir: dir,
      fileName: 'demo.zip',
      signal: controller.signal
    })

    await expect(promise).rejects.toMatchObject({ code: 'DOWNLOAD_CANCELLED' })
    expect(fs.existsSync(path.join(dir, 'demo.zip.part'))).toBe(false)
  })

  it('installMod 被取消：返回已取消安装并清理临时及未完成目录', async () => {
    const target = path.join(tmpRoot, 'install-cancel-target', 'TestChar')
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))
      }
    })
    vi.stubGlobal('fetch', async () => new Response(body, { headers: { 'content-length': '1048576' } }))

    const controller = new AbortController()
    setTimeout(() => controller.abort(), 150)

    const res: any = await installMod({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetParentDir: target,
      modName: 'Probe Mod',
      fileName: 'demo_ver_52_-MqgcoX.zip',
      signal: controller.signal
    })

    expect(res).toEqual({
      success: false,
      cancelled: true,
      error: '已取消安装'
    })

    const disabledDirs = fs.existsSync(target)
      ? fs.readdirSync(target).filter((n) => n.startsWith('DISABLED_'))
      : []
    expect(disabledDirs).toEqual([])

    const root = resolveDownloadRoot()
    const leftovers = fs.existsSync(root)
      ? fs.readdirSync(root).filter((n) => n.startsWith('dl_') || n.startsWith('staging_'))
      : []
    expect(leftovers).toEqual([])
  })
})

describe('sweepStaleDownloadDirs 清理陈旧下载缓存残留', () => {
  it('清理陈旧残留、保留无关目录', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-sweep-'))
    const dlOld = path.join(root, 'dl_old')
    const stagingOld = path.join(root, 'staging_old')
    const keepme = path.join(root, 'keepme')
    fs.mkdirSync(dlOld, { recursive: true })
    fs.mkdirSync(stagingOld, { recursive: true })
    fs.mkdirSync(keepme, { recursive: true })

    const oldTime = new Date(Date.now() - 3 * 60 * 60 * 1000)
    fs.utimesSync(dlOld, oldTime, oldTime)
    fs.utimesSync(stagingOld, oldTime, oldTime)

    try {
      const res = await sweepStaleDownloadDirs(root)
      expect(res.removed).toBe(2)
      expect(fs.existsSync(dlOld)).toBe(false)
      expect(fs.existsSync(stagingOld)).toBe(false)
      expect(fs.existsSync(keepme)).toBe(true)
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }) } catch {}
    }
  })

  it('新鲜残留不删', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-sweep-'))
    const dlFresh = path.join(root, 'dl_fresh')
    fs.mkdirSync(dlFresh, { recursive: true })

    try {
      const res = await sweepStaleDownloadDirs(root)
      expect(res.removed).toBe(0)
      expect(fs.existsSync(dlFresh)).toBe(true)
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }) } catch {}
    }
  })
})


