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

describe('断点续传与多分片并行下载', () => {
  it('分片成功：探测返回 206+content-range，分片请求返回对应片段，拼接后长度/magic/format 正确且 chunk 已清理', async () => {
    const dir = path.join(tmpRoot, 'chunked-success')
    fs.mkdirSync(dir, { recursive: true })

    // 构造 2MB 测试数据（>1MB 且 <=8MB，自适应为 4 分片）
    const totalSize = 2 * 1024 * 1024
    const fullBuffer = Buffer.alloc(totalSize, 0x41)
    fullBuffer[0] = 0x50
    fullBuffer[1] = 0x4b
    fullBuffer[2] = 0x03
    fullBuffer[3] = 0x04

    const requestedRanges: string[] = []

    vi.stubGlobal('fetch', async (url: string, init?: any) => {
      const range = init?.headers?.Range || ''
      requestedRanges.push(range)

      if (range === 'bytes=0-0') {
        // 探测阶段：返回 206 + content-range
        return new Response(fullBuffer.subarray(0, 1), {
          status: 206,
          headers: {
            'content-range': `bytes 0-0/${totalSize}`,
            'content-length': '1',
            'content-type': 'application/zip'
          }
        })
      }

      const match = range.match(/bytes=(\d+)-(\d+)/)
      if (match) {
        const start = parseInt(match[1], 10)
        const end = parseInt(match[2], 10)
        const chunkData = fullBuffer.subarray(start, end + 1)
        return new Response(chunkData, {
          status: 206,
          headers: {
            'content-range': `bytes ${start}-${end}/${totalSize}`,
            'content-length': String(chunkData.length),
            'content-type': 'application/zip'
          }
        })
      }

      return new Response('bad request', { status: 400 })
    })

    const progressReports: any[] = []
    const res = await downloadFile({
      downloadUrl: 'https://gamebanana.com/dl/12345',
      targetDir: dir,
      fileName: 'multichunk.zip',
      onProgress: (p) => progressReports.push(p)
    })

    expect(res.format).toBe('zip')
    expect(res.size).toBe(totalSize)
    expect(fs.existsSync(res.archivePath)).toBe(true)
    const diskContent = fs.readFileSync(res.archivePath)
    expect(diskContent.equals(fullBuffer)).toBe(true)

    // 断言分片临时文件与 .part 均已清理
    const files = fs.readdirSync(dir)
    expect(files.some((f) => f.includes('.part'))).toBe(false)
    expect(files.some((f) => f.includes('.chunk'))).toBe(false)
    expect(requestedRanges[0]).toBe('bytes=0-0')
    // 探测之后应有 4 个分片请求
    expect(requestedRanges.length).toBe(5)

    // 断言最终进度为 100%
    const lastProgress = progressReports[progressReports.length - 1]
    expect(lastProgress.percent).toBe(100)
    expect(lastProgress.downloaded).toBe(totalSize)
  })

  it('单片失败后续传：某片前两次抛错第三次成功，断言该片第二个 Range 起始偏移等于已下载字节数', async () => {
    const dir = path.join(tmpRoot, 'chunked-resume')
    fs.mkdirSync(dir, { recursive: true })

    const totalSize = 2 * 1024 * 1024
    const fullBuffer = Buffer.alloc(totalSize, 0x42)
    fullBuffer[0] = 0x50
    fullBuffer[1] = 0x4b
    fullBuffer[2] = 0x03
    fullBuffer[3] = 0x04

    const chunk1Ranges: string[] = []
    let chunk1Attempts = 0

    vi.stubGlobal('fetch', async (url: string, init?: any) => {
      const range = init?.headers?.Range || ''

      if (range === 'bytes=0-0') {
        return new Response(fullBuffer.subarray(0, 1), {
          status: 206,
          headers: {
            'content-range': `bytes 0-0/${totalSize}`,
            'content-length': '1',
            'content-type': 'application/zip'
          }
        })
      }

      const match = range.match(/bytes=(\d+)-(\d+)/)
      if (match) {
        const start = parseInt(match[1], 10)
        const end = parseInt(match[2], 10)

        // 对分片 1（起始位置 524288）进行失败与断点模拟
        if (start >= 524288 && start < 1048576) {
          chunk1Attempts++
          chunk1Ranges.push(range)

          if (chunk1Attempts === 1) {
            // 第 1 次尝试：写入 1024 字节后流中断
            const written = 1024
            const stream = new ReadableStream({
              start(c) {
                c.enqueue(fullBuffer.subarray(start, start + written))
              },
              pull(c) {
                setTimeout(() => c.error(new Error('模拟网络连接重置 1')), 50)
              }
            })
            return new Response(stream, {
              status: 206,
              headers: {
                'content-range': `bytes ${start}-${end}/${totalSize}`,
                'content-length': String(end - start + 1),
                'content-type': 'application/zip'
              }
            })
          }

          if (chunk1Attempts === 2) {
            // 第 2 次尝试：再写入 2048 字节后流中断
            const written = 2048
            const stream = new ReadableStream({
              start(c) {
                c.enqueue(fullBuffer.subarray(start, start + written))
              },
              pull(c) {
                setTimeout(() => c.error(new Error('模拟网络连接重置 2')), 50)
              }
            })
            return new Response(stream, {
              status: 206,
              headers: {
                'content-range': `bytes ${start}-${end}/${totalSize}`,
                'content-length': String(end - start + 1),
                'content-type': 'application/zip'
              }
            })
          }

          // 第 3 次尝试：完整传输剩余数据
          const remainingData = fullBuffer.subarray(start, end + 1)
          return new Response(remainingData, {
            status: 206,
            headers: {
              'content-range': `bytes ${start}-${end}/${totalSize}`,
              'content-length': String(remainingData.length),
              'content-type': 'application/zip'
            }
          })
        }

        // 其他分片正常返回
        const chunkData = fullBuffer.subarray(start, end + 1)
        return new Response(chunkData, {
          status: 206,
          headers: {
            'content-range': `bytes ${start}-${end}/${totalSize}`,
            'content-length': String(chunkData.length),
            'content-type': 'application/zip'
          }
        })
      }

      return new Response('bad request', { status: 400 })
    })

    const res = await downloadFile({
      downloadUrl: 'https://gamebanana.com/dl/resume',
      targetDir: dir,
      fileName: 'resume.zip'
    })

    expect(res.format).toBe('zip')
    expect(res.size).toBe(totalSize)
    expect(fs.readFileSync(res.archivePath).equals(fullBuffer)).toBe(true)

    // 断言分片 1 尝试了 3 次，且第 2、3 次的 Range 起始偏移精确等于此前已落盘的字节数
    expect(chunk1Attempts).toBe(3)
    expect(chunk1Ranges[0]).toBe('bytes=524288-1048575')
    expect(chunk1Ranges[1]).toBe(`bytes=${524288 + 1024}-1048575`)
    expect(chunk1Ranges[2]).toBe(`bytes=${524288 + 1024 + 2048}-1048575`)

    const files = fs.readdirSync(dir)
    expect(files.some((f) => f.includes('.part'))).toBe(false)
    expect(files.some((f) => f.includes('.chunk'))).toBe(false)
  })

  it('全片停滞：所有片返回挂起流，断言 DOWNLOAD_STALLED 且消息含「下载停滞」，.part 与 chunk 均清理', async () => {
    const dir = path.join(tmpRoot, 'chunked-stalled')
    fs.mkdirSync(dir, { recursive: true })

    const totalSize = 2 * 1024 * 1024

    vi.stubGlobal('fetch', async (url: string, init?: any) => {
      const range = init?.headers?.Range || ''
      if (range === 'bytes=0-0') {
        return new Response(new Uint8Array([0x50]), {
          status: 206,
          headers: {
            'content-range': `bytes 0-0/${totalSize}`,
            'content-length': '1',
            'content-type': 'application/zip'
          }
        })
      }

      // 所有分片返回挂起的流（永远不发数据）
      const hangingStream = new ReadableStream({
        start() {}
      })
      return new Response(hangingStream, {
        status: 206,
        headers: {
          'content-range': range ? `${range}/${totalSize}` : '',
          'content-length': '524288',
          'content-type': 'application/zip'
        }
      })
    })

    await expect(
      downloadFile({
        downloadUrl: 'https://gamebanana.com/dl/stalled',
        targetDir: dir,
        fileName: 'stall.zip',
        stallTimeoutMs: 300
      })
    ).rejects.toMatchObject({
      code: 'DOWNLOAD_STALLED',
      message: expect.stringMatching(/下载停滞/)
    })

    const files = fs.readdirSync(dir)
    expect(files.some((f) => f.includes('.part'))).toBe(false)
    expect(files.some((f) => f.includes('.chunk'))).toBe(false)
  })

  it('取消：下载中中止 signal，断言 DOWNLOAD_CANCELLED 且无残留', async () => {
    const dir = path.join(tmpRoot, 'chunked-cancelled')
    fs.mkdirSync(dir, { recursive: true })

    const totalSize = 2 * 1024 * 1024
    const controller = new AbortController()

    vi.stubGlobal('fetch', async (url: string, init?: any) => {
      const range = init?.headers?.Range || ''
      if (range === 'bytes=0-0') {
        return new Response(new Uint8Array([0x50]), {
          status: 206,
          headers: {
            'content-range': `bytes 0-0/${totalSize}`,
            'content-length': '1',
            'content-type': 'application/zip'
          }
        })
      }

      // 收到分片请求时触发取消
      setTimeout(() => controller.abort(), 50)
      const hangingStream = new ReadableStream({ start() {} })
      return new Response(hangingStream, {
        status: 206,
        headers: {
          'content-range': range ? `${range}/${totalSize}` : '',
          'content-length': '524288',
          'content-type': 'application/zip'
        }
      })
    })

    await expect(
      downloadFile({
        downloadUrl: 'https://gamebanana.com/dl/cancel',
        targetDir: dir,
        fileName: 'cancel.zip',
        signal: controller.signal
      })
    ).rejects.toMatchObject({
      code: 'DOWNLOAD_CANCELLED'
    })

    const files = fs.readdirSync(dir)
    expect(files.some((f) => f.includes('.part'))).toBe(false)
    expect(files.some((f) => f.includes('.chunk'))).toBe(false)
  })

  it('HTML 中间页：探测返回 206 + content-type text/html，断言 DOWNLOAD_INTERSTITIAL', async () => {
    const dir = path.join(tmpRoot, 'chunked-html')
    fs.mkdirSync(dir, { recursive: true })

    vi.stubGlobal('fetch', async () => {
      return new Response('<!DOCTYPE html><html><body>Interstitial Page</body></html>', {
        status: 206,
        headers: {
          'content-range': 'bytes 0-0/49000',
          'content-length': '49000',
          'content-type': 'text/html; charset=utf-8'
        }
      })
    })

    await expect(
      downloadFile({
        downloadUrl: 'https://gamebanana.com/dl/html-page',
        targetDir: dir,
        fileName: 'page.zip'
      })
    ).rejects.toMatchObject({
      code: 'DOWNLOAD_INTERSTITIAL'
    })

    const files = fs.readdirSync(dir)
    expect(files.some((f) => f.includes('.part'))).toBe(false)
    expect(files.some((f) => f.includes('.chunk'))).toBe(false)
  })

  it('200 回退单流：探测返回 200（服务端不支持 Range），复用响应走单流路径成功完成', async () => {
    const dir = path.join(tmpRoot, 'stream-fallback')
    fs.mkdirSync(dir, { recursive: true })

    const body = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(1024, 0x43)])
    let fetchCount = 0

    vi.stubGlobal('fetch', async () => {
      fetchCount++
      // 服务端忽略 Range: bytes=0-0，直接返回 200 全量包
      return new Response(body, {
        status: 200,
        headers: {
          'content-length': String(body.length),
          'content-type': 'application/zip'
        }
      })
    })

    const res = await downloadFile({
      downloadUrl: 'https://gamebanana.com/dl/fallback',
      targetDir: dir,
      fileName: 'fallback.zip'
    })

    expect(res.format).toBe('zip')
    expect(res.size).toBe(body.length)
    expect(fs.existsSync(res.archivePath)).toBe(true)
    // 关键断言：探测阶段的 200 响应必须被直接复用，不应发第二次请求
    expect(fetchCount).toBe(1)
  })

  it('416 范围请求无效：探测返回 416，断言 DOWNLOAD_RANGE_UNSATISFIABLE 并包含文件总大小', async () => {
    const dir = path.join(tmpRoot, 'range-416')
    fs.mkdirSync(dir, { recursive: true })

    vi.stubGlobal('fetch', async () => {
      return new Response('Requested Range Not Satisfiable', {
        status: 416,
        statusText: 'Range Not Satisfiable',
        headers: {
          'content-range': 'bytes */0'
        }
      })
    })

    await expect(
      downloadFile({
        downloadUrl: 'https://gamebanana.com/dl/range-416',
        targetDir: dir,
        fileName: 'empty.zip'
      })
    ).rejects.toMatchObject({
      code: 'DOWNLOAD_RANGE_UNSATISFIABLE'
    })
  })

  it('分片竞态清理：某分片立即失败、其余分片慢速时，断言 reject 后目录不存在任何 .part 或 .chunk 文件', async () => {
    const dir = path.join(tmpRoot, 'chunked-race-cleanup')
    fs.mkdirSync(dir, { recursive: true })

    const totalSize = 2 * 1024 * 1024
    vi.stubGlobal('fetch', async (url: string, init?: any) => {
      const range = init?.headers?.Range || ''

      if (range === 'bytes=0-0') {
        return new Response(new Uint8Array([0x50]), {
          status: 206,
          headers: {
            'content-range': `bytes 0-0/${totalSize}`,
            'content-length': '1',
            'content-type': 'application/zip'
          }
        })
      }

      const match = range.match(/bytes=(\d+)-(\d+)/)
      if (match) {
        const start = parseInt(match[1], 10)
        // 让分片 0 立即失败（400 Bad Request）
        if (start === 0) {
          return new Response('chunk 0 error', { status: 400, statusText: 'Bad Request' })
        }

        // 其余分片返回慢速流（模拟网络延迟）
        const slowStream = new ReadableStream({
          start(controller) {
            setTimeout(() => {
              try {
                controller.enqueue(Buffer.alloc(1024, 0x41))
              } catch (_) {}
            }, 50)
          }
        })
        return new Response(slowStream, {
          status: 206,
          headers: {
            'content-range': `${range}/${totalSize}`,
            'content-length': '524288',
            'content-type': 'application/zip'
          }
        })
      }

      return new Response('not found', { status: 404 })
    })

    // 断言 downloadFile 抛错且错误码为 DOWNLOAD_CHUNK_FAILED
    await expect(
      downloadFile({
        downloadUrl: 'https://gamebanana.com/dl/race-test',
        targetDir: dir,
        fileName: 'race.zip'
      })
    ).rejects.toMatchObject({
      code: 'DOWNLOAD_CHUNK_FAILED',
      message: expect.stringMatching(/分片 0/)
    })

    // 等待 200ms 确保慢速流若有未停止的写入操作也能暴露出来
    await new Promise((resolve) => setTimeout(resolve, 200))

    // 断言目录中绝对没有任何残留
    const files = fs.readdirSync(dir)
    expect(files.filter((f) => f.includes('.part') || f.includes('.chunk'))).toEqual([])
  })

  it('分片失败错误码：分片失败抛出 DOWNLOAD_CHUNK_FAILED 且包含分片序号与原因', async () => {
    const dir = path.join(tmpRoot, 'chunked-error-code')
    fs.mkdirSync(dir, { recursive: true })

    const totalSize = 2 * 1024 * 1024
    vi.stubGlobal('fetch', async (url: string, init?: any) => {
      const range = init?.headers?.Range || ''

      if (range === 'bytes=0-0') {
        return new Response(new Uint8Array([0x50]), {
          status: 206,
          headers: {
            'content-range': `bytes 0-0/${totalSize}`,
            'content-length': '1',
            'content-type': 'application/zip'
          }
        })
      }

      const match = range.match(/bytes=(\d+)-(\d+)/)
      if (match) {
        const start = parseInt(match[1], 10)
        // 让分片 2（start = 1048576）返回 403 Forbidden 明确失败
        if (start === 1048576) {
          return new Response('forbidden', { status: 403, statusText: 'Forbidden' })
        }
        return new Response(Buffer.alloc(524288, 0x41), {
          status: 206,
          headers: {
            'content-range': `${range}/${totalSize}`,
            'content-length': '524288',
            'content-type': 'application/zip'
          }
        })
      }

      return new Response('not found', { status: 404 })
    })

    const err: any = await downloadFile({
      downloadUrl: 'https://gamebanana.com/dl/chunk2-fail',
      targetDir: dir,
      fileName: 'fail.zip'
    }).catch((e) => e)

    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('DOWNLOAD_CHUNK_FAILED')
    expect(err.chunkIndex).toBe(2)
    expect(err.message).toMatch(/分片 2/)
    expect(err.message).toMatch(/403/)
  })
})


