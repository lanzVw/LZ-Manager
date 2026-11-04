import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkModUpdate } from '../src/core/gamebanana-service'

function stubMod(
  modId: number,
  opts: {
    version?: string
    dateModified: number
    files: Array<{ id: number; fileName: string; dateAdded: number; description?: string; isArchived?: boolean }>
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
      _sDescription: f.description || '',
      _bIsArchived: f.isArchived || false,
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

  it('7. 多文件 Mod：工具包比主文件新，本地装的是主文件 → 不报更新，latestFile 指向主文件', async () => {
    const modId = 671945
    const mainFile = '28_2d258.zip'
    stubMod(modId, {
      version: '2.8 | 4.6E4',
      dateModified: 1792117599,
      files: [
        { id: 1, fileName: 'cnmodfixer_faf22.zip', dateAdded: 1792117481, description: 'CN Mod Fixer Tool' },
        { id: 2, fileName: 'examples.zip', dateAdded: 1792117403, description: 'Example for modders' },
        {
          id: 3,
          fileName: mainFile,
          dateAdded: 1792091301,
          description: 'Main File, if unsure which to download get this one'
        },
        { id: 4, fileName: 'v46e4.zip', dateAdded: 1792091301, description: 'EXPERIMENTAL' }
      ]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: '2026/11/4',
      localVersion: mainFile
    })

    expect(res.hasUpdate).toBe(false)
    expect(res.latestFile?.fileName).toBe(mainFile)
    expect(res.downloadUrl).toBe('https://gamebanana.com/dl/3')
  })

  it('8. 本地是人类版本 2.8，线上 _sVersion 是 "2.8 | 4.6E4"（主文件 + 实验版）→ 不报更新', async () => {
    const modId = 671946
    stubMod(modId, {
      version: '2.8 | 4.6E4',
      dateModified: 1792117599,
      files: [
        { id: 1, fileName: '28_2d258.zip', dateAdded: 1792091301, description: 'Main File' },
        { id: 2, fileName: 'v46e4.zip', dateAdded: 1792091301, description: 'EXPERIMENTAL' }
      ]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: '2026/11/4',
      localVersion: '2.8'
    })

    expect(res.hasUpdate).toBe(false)
    expect(res.remoteVersion).toBe('2.8 | 4.6E4')
  })

  it('9. 本地 2.8，线上 2.9 | 4.7E4 → 报更新', async () => {
    const modId = 671947
    stubMod(modId, {
      version: '2.9 | 4.7E4',
      dateModified: 1793000000,
      files: [
        { id: 1, fileName: 'newmain.zip', dateAdded: 1793000000, description: 'Main File' }
      ]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: '2026/10/16',
      localVersion: '2.8'
    })

    expect(res.hasUpdate).toBe(true)
    expect(res.remoteVersion).toBe('2.9 | 4.7E4')
  })

  it('10. 本地是旧主文件，线上有新主文件 + 更新的工具包 → 报更新，latestFile 仍是新主文件', async () => {
    const modId = 671948
    stubMod(modId, {
      version: '3.0',
      dateModified: 1793000000,
      files: [
        { id: 1, fileName: 'newtool.zip', dateAdded: 1793000000, description: 'CN Mod Fixer Tool' },
        { id: 2, fileName: 'newmain.zip', dateAdded: 1792000000, description: 'Main File' },
        { id: 3, fileName: 'oldmain.zip', dateAdded: 1791000000, description: 'Main File' }
      ]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: '2026/10/16',
      localVersion: 'oldmain.zip'
    })

    expect(res.hasUpdate).toBe(true)
    expect(res.latestFile?.fileName).toBe('newmain.zip')
    expect(res.downloadUrl).toBe('https://gamebanana.com/dl/2')
  })

  it('11. 本地装的是实验版，实验版仍在清单且与主文件同日发布 → 不报更新', async () => {
    const modId = 671949
    stubMod(modId, {
      version: '2.8 | 4.6E4',
      dateModified: 1792117599,
      files: [
        { id: 1, fileName: '28_2d258.zip', dateAdded: 1792091301, description: 'Main File' },
        { id: 2, fileName: 'v46e4.zip', dateAdded: 1792091301, description: 'EXPERIMENTAL' }
      ]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: '2026/11/4',
      localVersion: 'v46e4.zip'
    })

    expect(res.hasUpdate).toBe(false)
  })

  it('12. 本地文件名已不在清单（作者重传），新主文件比本地安装时间新 → 报更新', async () => {
    const modId = 671950
    stubMod(modId, {
      version: '3.0',
      dateModified: 1793000000,
      files: [{ id: 1, fileName: 'newmain.zip', dateAdded: 1793000000, description: 'Main File' }]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: 1792000000,
      localVersion: 'oldmain.zip'
    })

    expect(res.hasUpdate).toBe(true)
  })

  it('13. 本地文件名已不在清单，但新主文件比本地安装时间旧 → 不报更新', async () => {
    const modId = 671951
    stubMod(modId, {
      version: '3.0',
      dateModified: 1793000000,
      files: [{ id: 1, fileName: 'newmain.zip', dateAdded: 1792000000, description: 'Main File' }]
    })

    const res: any = await checkModUpdate({
      modId,
      localDate: 1793000000,
      localVersion: 'oldmain.zip'
    })

    expect(res.hasUpdate).toBe(false)
  })
})
