import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { downloadFile, installMod } from '../src/core/gamebanana-service'

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
