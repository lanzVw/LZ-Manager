import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkModUpdate } from '../src/core/gamebanana-service'

function stubMod(
  modId: number,
  opts: {
    version?: string
    dateModified: number
    files: Array<{ id: number; fileName: string; dateAdded: number }>
  }
) {
  const payload = {
    _idRow: modId,
    _sName: 'Fixture Mod',
    _sVersion: opts.version || '',
    _tsDateAdded: opts.dateModified - 86400,
    _tsDateModified: opts.dateModified,
    _tsDateUpdated: opts.dateModified,
    _aFiles: opts.files.map((f) => ({
      _idRow: f.id,
      _sFile: f.fileName,
      _nFilesize: 1024,
      _sDownloadUrl: `https://gamebanana.com/dl/${f.id}`,
      _tsDateAdded: f.dateAdded
    }))
  }
  vi.stubGlobal('fetch', async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('checkModUpdate 更新判定', () => {
  it('1. 本地 version == 线上最新文件名（真实场景）→ hasUpdate === false', async () => {
    const modId = 671939
    const fileName = 'zhuang_fangyi_ink_cheongsam_full_ver_52_-MqgcoX.zip'
    stubMod(modId, {
      version: '5.2',
      dateModified: 1791854802,
      files: [{ id: 1809667, fileName, dateAdded: 1791854802 }]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: '2026/10/16',
      localVersion: fileName
    })

    expect(res.hasUpdate).toBe(false)
    expect(res.checked).toBe(true)
    expect(res.changelog).toBe('')
    expect(res.latestFile?.fileName).toBe(fileName)
    expect(res.downloadUrl).toBe('https://gamebanana.com/dl/1809667')
  })

  it('2. 本地 version 是更早的文件名（线上最新文件名不同）+ 线上 _sVersion 与本地不同 → true', async () => {
    const modId = 671940
    const olderFileName = 'zhuang_fangyi_ink_cheongsam_full_ver_51_-ABCDEF.zip'
    const latestFileName = 'zhuang_fangyi_ink_cheongsam_full_ver_52_-MqgcoX.zip'
    stubMod(modId, {
      version: '5.2',
      dateModified: 1791854802,
      files: [
        { id: 1809667, fileName: latestFileName, dateAdded: 1791854802 },
        { id: 1809660, fileName: olderFileName, dateAdded: 1790000000 }
      ]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: '2026/10/16',
      localVersion: olderFileName
    })

    expect(res.hasUpdate).toBe(true)
    expect(res.latestFile?.fileName).toBe(latestFileName)
  })

  it('3. 本地 version 是人类版本号 5.1，线上 _sVersion: 5.2 → true', async () => {
    const modId = 671941
    stubMod(modId, {
      version: '5.2',
      dateModified: 1700000000,
      files: [{ id: 100, fileName: 'mod_v52.zip', dateAdded: 1700000000 }]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: 1700000000 * 1000,
      localVersion: '5.1'
    })

    expect(res.hasUpdate).toBe(true)
    expect(res.remoteVersion).toBe('5.2')
  })

  it('4. 本地 version 5.2 与线上 _sVersion: 5.2 相同，且线上 _tsDateModified 不比本地记录晚 1 小时 → false', async () => {
    const modId = 671942
    stubMod(modId, {
      version: '5.2',
      dateModified: 1700000000,
      files: [{ id: 100, fileName: 'mod_v52.zip', dateAdded: 1700000000 }]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: 1700000000 * 1000,
      localVersion: '5.2'
    })

    expect(res.hasUpdate).toBe(false)
    expect(res.remoteVersion).toBe('5.2')
  })

  it('5. 本地没有 version，本地日期比线上 _tsDateModified 早很多 → true', async () => {
    const modId = 671943
    stubMod(modId, {
      version: '5.2',
      dateModified: 1700000000,
      files: [{ id: 100, fileName: 'mod.zip', dateAdded: 1700000000 }]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: '2020/01/01'
    })

    expect(res.hasUpdate).toBe(true)
  })

  it('6. 大小写/首尾空白差异不误报：本地 " DEMO_Ver_52_-MqgcoX.ZIP "、线上 demo_ver_52_-MqgcoX.zip → false', async () => {
    const modId = 671944
    stubMod(modId, {
      version: '5.2',
      dateModified: 1700000000,
      files: [{ id: 100, fileName: 'demo_ver_52_-MqgcoX.zip', dateAdded: 1700000000 }]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: '2020/01/01',
      localVersion: ' DEMO_Ver_52_-MqgcoX.ZIP '
    })

    expect(res.hasUpdate).toBe(false)
    expect(res.checked).toBe(true)
    expect(res.changelog).toBe('')
  })
})
