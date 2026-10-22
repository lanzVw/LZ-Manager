import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'
import {
  findInstalledModByGameBananaId,
  inspectInstalledMod,
  resolveInstallPlan,
  installMod
} from '../src/core/gamebanana-service'

/**
 * 回归来源：用户反馈「通过市场更新的 mod 为什么是新建一个，不是覆盖掉旧的」。
 * 现场证据是同一 modId 在 Mods/<角色> 下出现两份：`Remielle Sportswear`（启用）
 * 与 `DISABLED_Remielle Sportswear`（停用），正是 installMod 零覆盖安装的产物。
 */

let tmpRoot = ''

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-gb-install-update-'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch (_) {}
})

const MODS_ROOT = () => path.join(tmpRoot, 'Mods')
const CHAR_DIR = () => path.join(MODS_ROOT(), '蕾米埃尔')
const GB_7ZA = path.join(__dirname, '..', 'resources', 'binaries', '7za.exe')

function writeMod(opts: {
  folderName: string
  meta?: Record<string, any>
  files?: Record<string, string>
}) {
  const dir = path.join(CHAR_DIR(), opts.folderName)
  fs.mkdirSync(dir, { recursive: true })
  if (opts.meta) {
    fs.writeFileSync(path.join(dir, 'mod.json'), JSON.stringify(opts.meta, null, 2), 'utf8')
  }
  for (const [name, content] of Object.entries(opts.files || {})) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8')
  }
  return dir
}

function makeZip(fileName: string, entries: Record<string, string>) {
  const srcDir = path.join(tmpRoot, `zip-src-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(srcDir, { recursive: true })
  for (const [name, content] of Object.entries(entries)) {
    const target = path.join(srcDir, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
  }
  const zipPath = path.join(tmpRoot, fileName)
  execFileSync(GB_7ZA, ['a', '-tzip', zipPath, path.join(srcDir, '*')], { windowsHide: true })
  return fs.readFileSync(zipPath)
}

function stubFetchWithZip(zipBuffer: Buffer) {
  vi.stubGlobal('fetch', async () => {
    const body = zipBuffer.buffer.slice(zipBuffer.byteOffset, zipBuffer.byteOffset + zipBuffer.byteLength)
    return new Response(body, {
      status: 200,
      headers: { 'content-length': String(zipBuffer.length) }
    })
  })
}

// installMod 里 autoTranslateModConfig 是 fire-and-forget 的，会再回写一次 mod.json；
// 读文件前必须让它跑完，否则会读到写了一半的 JSON
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

describe('findInstalledModByGameBananaId 按 modId 找回本地 Mod', () => {
  it('1. mod.json 里的 modId 命中', () => {
    const dir = writeMod({ folderName: 'Remielle Sportswear', meta: { modId: 730301, version: 'v10.zip' } })
    const hit = findInstalledModByGameBananaId(MODS_ROOT(), 730301)
    expect(hit).not.toBeNull()
    expect(hit?.fullPath).toBe(dir)
    expect(hit?.folderName).toBe('Remielle Sportswear')
    expect(hit?.enabled).toBe(true)
    expect(hit?.modId).toBe(730301)
    expect(hit?.version).toBe('v10.zip')
  })

  it('2. mod.json 没有 modId 时按 sourceUrl 命中', () => {
    writeMod({
      folderName: 'Some Renamed Mod',
      meta: { sourceUrl: 'https://gamebanana.com/mods/730302' }
    })
    expect(findInstalledModByGameBananaId(MODS_ROOT(), 730302)?.folderName).toBe('Some Renamed Mod')
  })

  it('3. mod.json 没有来源信息时按 gamebanana_730303 文件夹名命中（DISABLED_ 前缀不影响）', () => {
    writeMod({ folderName: 'DISABLED_gamebanana_730303', meta: { name: 'x' } })
    const hit = findInstalledModByGameBananaId(MODS_ROOT(), 730303)
    expect(hit?.folderName).toBe('DISABLED_gamebanana_730303')
    expect(hit?.enabled).toBe(false)
  })

  it('4. 目录里没有 mod.json 时不命中（不能误覆盖用户手放的 Mod）', () => {
    writeMod({ folderName: 'gamebanana_730304' })
    expect(findInstalledModByGameBananaId(MODS_ROOT(), 730304)).toBeNull()
  })

  it('5. modsRoot 不存在返回 null', () => {
    expect(findInstalledModByGameBananaId(path.join(tmpRoot, 'nope'), 730301)).toBeNull()
  })

  it('6. modId 非正整数返回 null', () => {
    writeMod({ folderName: 'A', meta: { modId: 730301 } })
    expect(findInstalledModByGameBananaId(MODS_ROOT(), 0)).toBeNull()
    expect(findInstalledModByGameBananaId(MODS_ROOT(), NaN)).toBeNull()
    expect(findInstalledModByGameBananaId(MODS_ROOT(), -5)).toBeNull()
  })

  it('7. 同一 modId 两份时优先返回启用那份，并把其余作为 duplicates 带出', () => {
    const enabledDir = writeMod({ folderName: 'Remielle Sportswear', meta: { modId: 730301 } })
    const disabledDir = writeMod({ folderName: 'DISABLED_Remielle Sportswear', meta: { modId: 730301 } })

    const hit = findInstalledModByGameBananaId(MODS_ROOT(), 730301)
    expect(hit?.fullPath).toBe(enabledDir)

    const inspected = inspectInstalledMod(MODS_ROOT(), 730301)
    expect(inspected.existing?.fullPath).toBe(enabledDir)
    expect(inspected.duplicates.map((d) => d.fullPath)).toEqual([disabledDir])
  })

  it('8. inspectInstalledMod 无命中时 existing 为 null、duplicates 为空数组', () => {
    expect(inspectInstalledMod(MODS_ROOT(), 999999)).toEqual({ existing: null, duplicates: [] })
  })
})

describe('resolveInstallPlan 决定落点', () => {
  it('1. 命中同 modId → update，targetDir 复用旧目录绝对路径（DISABLED_ 前缀原样保留）', () => {
    const oldDir = writeMod({ folderName: 'DISABLED_Remielle Sportswear', meta: { modId: 730301 } })
    const plan = resolveInstallPlan({
      modsRoot: MODS_ROOT(),
      targetParentDir: CHAR_DIR(),
      modId: 730301,
      modName: 'Remielle Sportswear'
    })
    expect(plan.mode).toBe('update')
    expect(plan.targetDir).toBe(oldDir)
    expect(plan.existing?.fullPath).toBe(oldDir)
    expect(plan.duplicates).toEqual([])
  })

  it('2. 命中多份 → existing 是启用的那份，duplicates 是其余项', () => {
    const enabledDir = writeMod({ folderName: 'Remielle Sportswear', meta: { modId: 730301 } })
    const disabledDir = writeMod({ folderName: 'DISABLED_Remielle Sportswear (1)', meta: { modId: 730301 } })
    const plan = resolveInstallPlan({
      modsRoot: MODS_ROOT(),
      targetParentDir: CHAR_DIR(),
      modId: 730301,
      modName: 'Remielle Sportswear'
    })
    expect(plan.mode).toBe('update')
    expect(plan.targetDir).toBe(enabledDir)
    expect(plan.duplicates.map((d) => d.fullPath)).toEqual([disabledDir])
  })

  it('3. 未命中 → install，targetDir 为 DISABLED_<名字>', () => {
    fs.mkdirSync(CHAR_DIR(), { recursive: true })
    const plan = resolveInstallPlan({
      modsRoot: MODS_ROOT(),
      targetParentDir: CHAR_DIR(),
      modId: 730999,
      modName: 'New Mod'
    })
    expect(plan.mode).toBe('install')
    expect(plan.targetDir).toBe(path.join(CHAR_DIR(), 'DISABLED_New Mod'))
    expect(plan.existing).toBeUndefined()
  })

  it('4. 同名目录已存在 → 追加 (1)', () => {
    writeMod({ folderName: 'DISABLED_New Mod' })
    const plan = resolveInstallPlan({
      modsRoot: MODS_ROOT(),
      targetParentDir: CHAR_DIR(),
      modName: 'New Mod'
    })
    expect(plan.mode).toBe('install')
    expect(plan.targetDir).toBe(path.join(CHAR_DIR(), 'DISABLED_New Mod (1)'))
  })

  it('5. modsRoot 缺省时从 targetParentDir 的上级目录推导', () => {
    writeMod({ folderName: 'Remielle Sportswear', meta: { modId: 730301 } })
    const plan = resolveInstallPlan({
      targetParentDir: CHAR_DIR(),
      modId: 730301,
      modName: 'Remielle Sportswear'
    })
    expect(plan.mode).toBe('update')
  })

  it('6. forceNewInstall 跳过覆盖判定，强制新建一份并回报已有同源副本', () => {
    const oldDir = writeMod({ folderName: 'Remielle Sportswear', meta: { modId: 730301 } })
    const plan = resolveInstallPlan({
      modsRoot: MODS_ROOT(),
      targetParentDir: CHAR_DIR(),
      modId: 730301,
      modName: 'Remielle Sportswear',
      forceNewInstall: true
    })
    expect(plan.mode).toBe('install')
    expect(plan.targetDir).toBe(path.join(CHAR_DIR(), 'DISABLED_Remielle Sportswear'))
    expect(plan.duplicates.map((d) => d.fullPath)).toEqual([oldDir])
  })
})

describe('installMod 覆盖安装（真实 zip 集成）', () => {
  it('同一 modId 更新时就地覆盖：目录数不变、名字与启用状态保持、新内容生效、用户键保留', async () => {
    const modId = 730301
    const oldDir = writeMod({
      folderName: 'Remielle Sportswear',
      meta: {
        name: 'Remielle Sportswear',
        modId,
        sourceUrl: `https://gamebanana.com/mods/${modId}`,
        version: 'remiellesportswear_v10.zip',
        author: 'Old Author',
        variableAliases: { a: '旧别名' },
        hotkeyTranslations: { ToggleKey: '切换键' },
        valueLabels: { a: { 1: '旧标签' } },
        appearanceSectionId: 'custom:123_abc',
        modBroken: true,
        brokenReason: '旧版本缺贴图',
        lastConfigTranslatedAt: '2020-01-01T00:00:00.000Z'
      },
      files: { 'old_only.ini': '[TextureOverride]\n; 旧版内容\n' }
    })
    fs.writeFileSync(path.join(oldDir, 'preview.png.lz_bak'), 'backup-cover-bytes', 'utf8')
    fs.writeFileSync(
      path.join(oldDir, 'tags.json'),
      JSON.stringify({ qaqm: { appearanceSectionId: 'custom:123_abc', classificationSource: 'user' }, other: 1 }),
      'utf8'
    )

    const before = fs.readdirSync(CHAR_DIR())
    const zipBuffer = makeZip('remiellesportswear_v11.zip', {
      'new_only.ini': '[TextureOverride]\n; 新版内容\n',
      'readme.txt': 'v11 notes'
    })
    stubFetchWithZip(zipBuffer)

    const res: any = await installMod({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetParentDir: CHAR_DIR(),
      downloadRoot: path.join(tmpRoot, 'cache'),
      modId,
      modName: 'Remielle Sportswear',
      fileName: 'remiellesportswear_v11.zip',
      sourceUrl: `https://gamebanana.com/mods/${modId}`,
      author: 'New Author',
      version: 'remiellesportswear_v11.zip',
      description: 'v11'
    })

    expect(res.success).toBe(true)
    expect(res.action).toBe('update')
    expect(res.installedPath).toBe(oldDir)
    expect(res.replacedPath).toBe(oldDir)
    expect(res.preservedEnabled).toBe(true)

    await settle()

    // 没有新建第二份，旧目录名与启用状态原样保留
    const after = fs.readdirSync(CHAR_DIR())
    expect(after.sort()).toEqual(before.sort())
    expect(after).toEqual(['Remielle Sportswear'])

    // 新内容已写入，旧内容已被替换
    expect(fs.readFileSync(path.join(oldDir, 'new_only.ini'), 'utf8')).toContain('新版内容')
    expect(fs.existsSync(path.join(oldDir, 'old_only.ini'))).toBe(false)

    const meta = JSON.parse(fs.readFileSync(path.join(oldDir, 'mod.json'), 'utf8'))
    // 版本必须变成新的远端版本，否则「检查更新」会永远报有新版本
    expect(meta.version).toBe('remiellesportswear_v11.zip')
    expect(meta.author).toBe('New Author')
    expect(meta.description).toBe('v11')
    expect(meta.modId).toBe(modId)
    // 用户自定义键必须保留（自动翻译只会往里补新键，不会删用户键，故用子集断言）
    expect(meta.variableAliases).toMatchObject({ a: '旧别名' })
    expect(meta.hotkeyTranslations).toMatchObject({ ToggleKey: '切换键' })
    expect(meta.valueLabels).toMatchObject({ a: { 1: '旧标签' } })
    expect(meta.appearanceSectionId).toBe('custom:123_abc')
    expect(meta.modBroken).toBe(true)
    expect(meta.brokenReason).toBe('旧版本缺贴图')
    // 与本次更新无关的历史键不能被顺手清掉（lastConfigTranslatedAt 会被自动翻译刷新，故不参与断言）
    expect(meta.name).toBe('Remielle Sportswear')

    // tags.json 的 qaqm（外观分区）必须保留；其余字段以新文件为准，旧的非 qaqm 键不搬
    const tags = JSON.parse(fs.readFileSync(path.join(oldDir, 'tags.json'), 'utf8'))
    expect(tags.qaqm).toEqual({ appearanceSectionId: 'custom:123_abc', classificationSource: 'user' })
    expect(tags.other).toBeUndefined()

    // 旧封面备份保留（回滚封面功能依赖它）
    expect(fs.readFileSync(path.join(oldDir, 'preview.png.lz_bak'), 'utf8')).toBe('backup-cover-bytes')

    // 缓存目录里不能留下备份残留
    const cacheLeftovers = fs.existsSync(path.join(tmpRoot, 'cache'))
      ? fs.readdirSync(path.join(tmpRoot, 'cache')).filter((n) => n.startsWith('backup_'))
      : []
    expect(cacheLeftovers).toEqual([])
  })

  it('同 modId 存在两份历史副本时只覆盖启用的那份，duplicates 回报其余项且不删除', async () => {
    const modId = 730302
    const enabledDir = writeMod({
      folderName: 'Remielle Sportswear',
      meta: { modId, version: 'v10.zip', appearanceSectionId: 'custom:x' }
    })
    const disabledDir = writeMod({
      folderName: 'DISABLED_Remielle Sportswear',
      meta: { modId, version: 'v11.zip' }
    })

    stubFetchWithZip(makeZip('remiellesportswear_v12.zip', { 'mod.ini': '[TextureOverride]\n' }))

    const res: any = await installMod({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetParentDir: CHAR_DIR(),
      downloadRoot: path.join(tmpRoot, 'cache'),
      modId,
      modName: 'Remielle Sportswear',
      fileName: 'remiellesportswear_v12.zip',
      version: 'remiellesportswear_v12.zip'
    })

    expect(res.success).toBe(true)
    expect(res.action).toBe('update')
    expect(res.installedPath).toBe(enabledDir)
    expect(res.duplicates.map((d: any) => d.fullPath)).toEqual([disabledDir])
    // 历史副本只提示不删除
    expect(fs.existsSync(disabledDir)).toBe(true)
    expect(fs.readdirSync(CHAR_DIR()).sort()).toEqual(
      ['DISABLED_Remielle Sportswear', 'Remielle Sportswear'].sort()
    )
  })

  it('forceNewInstall 为 true 时强制新建一份，旧版本保持原样', async () => {
    const modId = 730303
    const oldDir = writeMod({
      folderName: 'Remielle Sportswear',
      meta: { modId, version: 'v10.zip' },
      files: { 'keep.ini': '[TextureOverride]\n; 旧版\n' }
    })

    stubFetchWithZip(makeZip('remiellesportswear_v11.zip', { 'mod.ini': '[TextureOverride]\n' }))

    const res: any = await installMod({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetParentDir: CHAR_DIR(),
      downloadRoot: path.join(tmpRoot, 'cache'),
      modId,
      modName: 'Remielle Sportswear',
      fileName: 'remiellesportswear_v11.zip',
      version: 'remiellesportswear_v11.zip',
      forceNewInstall: true
    })

    expect(res.success).toBe(true)
    expect(res.action).toBe('install')
    expect(res.installedPath).toBe(path.join(CHAR_DIR(), 'DISABLED_Remielle Sportswear'))
    expect(res.duplicates.map((d: any) => d.fullPath)).toEqual([oldDir])
    expect(fs.readFileSync(path.join(oldDir, 'keep.ini'), 'utf8')).toContain('旧版')
  })

  it('更新时新压缩包不带封面则沿用旧封面，lz_bak 一并保留', async () => {
    const modId = 730306
    const oldDir = writeMod({
      folderName: 'Remielle Sportswear',
      meta: { modId, version: 'v10.zip' }
    })
    // 用户自己裁的封面 + 回滚备份
    fs.writeFileSync(path.join(oldDir, 'preview.png'), 'user-cropped-cover', 'utf8')
    fs.writeFileSync(path.join(oldDir, 'preview.png.lz_bak'), 'cover-backup', 'utf8')

    stubFetchWithZip(makeZip('remiellesportswear_v11.zip', { 'mod.ini': '[TextureOverride]\n' }))

    const res: any = await installMod({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetParentDir: CHAR_DIR(),
      downloadRoot: path.join(tmpRoot, 'cache'),
      modId,
      modName: 'Remielle Sportswear',
      fileName: 'remiellesportswear_v11.zip',
      version: 'remiellesportswear_v11.zip'
    })

    expect(res.success).toBe(true)
    expect(res.action).toBe('update')
    expect(fs.readFileSync(path.join(oldDir, 'preview.png'), 'utf8')).toBe('user-cropped-cover')
    expect(fs.readFileSync(path.join(oldDir, 'preview.png.lz_bak'), 'utf8')).toBe('cover-backup')
  })

  it('更新失败（解压后写入阶段抛错）时旧版本必须完整恢复，不留半成品', async () => {
    const modId = 730304
    const oldDir = writeMod({
      folderName: 'Remielle Sportswear',
      meta: { modId, version: 'v10.zip' },
      files: { 'keep.ini': '[TextureOverride]\n; 旧版必须还在\n' }
    })
    const oldSnapshot = fs.readdirSync(oldDir).sort()

    stubFetchWithZip(makeZip('remiellesportswear_v11.zip', { 'mod.ini': '[TextureOverride]\n' }))
    // 模拟「旧目录已搬走、新内容写到一半」时的磁盘错误（杀软占用 / 磁盘满 / 权限）
    const cpSpy = vi.spyOn(fs, 'cpSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('EACCES: 磁盘写入被拒绝'), { code: 'EACCES' })
    })

    const res: any = await installMod({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetParentDir: CHAR_DIR(),
      downloadRoot: path.join(tmpRoot, 'cache'),
      modId,
      modName: 'Remielle Sportswear',
      fileName: 'remiellesportswear_v11.zip',
      version: 'remiellesportswear_v11.zip'
    })

    cpSpy.mockRestore()

    expect(res.success).toBe(false)
    expect(typeof res.error).toBe('string')
    // 旧目录仍在原位，内容与更新前完全一致
    expect(fs.existsSync(oldDir)).toBe(true)
    expect(fs.readdirSync(oldDir).sort()).toEqual(oldSnapshot)
    expect(fs.readFileSync(path.join(oldDir, 'keep.ini'), 'utf8')).toContain('旧版必须还在')
    const meta = JSON.parse(fs.readFileSync(path.join(oldDir, 'mod.json'), 'utf8'))
    expect(meta.version).toBe('v10.zip')
    expect(fs.readdirSync(CHAR_DIR())).toEqual(['Remielle Sportswear'])
  })

  it('更新过程中取消：返回已取消安装、旧版本恢复、目标目录不留 DISABLED_ 残留', async () => {
    const modId = 730305
    const oldDir = writeMod({
      folderName: 'Remielle Sportswear',
      meta: { modId, version: 'v10.zip' },
      files: { 'keep.ini': '[TextureOverride]\n; 旧版\n' }
    })

    stubFetchWithZip(makeZip('remiellesportswear_v11.zip', { 'mod.ini': '[TextureOverride]\n' }))
    const controller = new AbortController()

    // 预览图阶段位于「旧目录已搬走、新内容已写入」之后，是最能暴露回滚缺失的时机
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input)
      if (url.includes('preview')) {
        controller.abort()
        throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      }
      const buf = makeZip('remiellesportswear_v11.zip', { 'mod.ini': '[TextureOverride]\n' })
      const body = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      return new Response(body, { status: 200, headers: { 'content-length': String(buf.length) } })
    })

    const res: any = await installMod({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetParentDir: CHAR_DIR(),
      downloadRoot: path.join(tmpRoot, 'cache'),
      modId,
      modName: 'Remielle Sportswear',
      fileName: 'remiellesportswear_v11.zip',
      version: 'remiellesportswear_v11.zip',
      previewImageUrl: 'https://gamebanana.com/preview/1.png',
      signal: controller.signal
    })

    expect(res).toEqual({ success: false, cancelled: true, error: '已取消安装' })
    // 旧版本恢复，内容还是旧的
    expect(fs.existsSync(oldDir)).toBe(true)
    expect(fs.readFileSync(path.join(oldDir, 'keep.ini'), 'utf8')).toContain('旧版')
    expect(JSON.parse(fs.readFileSync(path.join(oldDir, 'mod.json'), 'utf8')).version).toBe('v10.zip')
    // 目标角色目录下没有 DISABLED_ 残留
    expect(fs.readdirSync(CHAR_DIR()).filter((n) => n.startsWith('DISABLED_'))).toEqual([])
    expect(fs.readdirSync(CHAR_DIR())).toEqual(['Remielle Sportswear'])
  })

  it('备份目录落在 Mods 同盘而非系统盘缓存，成功后清理干净', async () => {
    const modId = 730306
    const oldDir = writeMod({
      folderName: 'Remielle Sportswear',
      meta: { modId, version: 'v10.zip' },
      files: { 'keep.ini': '[TextureOverride]\n' }
    })

    stubFetchWithZip(makeZip('remiellesportswear_v11.zip', { 'mod.ini': '[TextureOverride]\n' }))

    const res: any = await installMod({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetParentDir: CHAR_DIR(),
      downloadRoot: path.join(tmpRoot, 'cache'),
      modId,
      modName: 'Remielle Sportswear',
      fileName: 'remiellesportswear_v11.zip',
      version: 'remiellesportswear_v11.zip'
    })

    expect(res.success).toBe(true)
    expect(res.action).toBe('update')

    // 大 Mod 跨卷复制会多花十几秒，备份必须和被覆盖目录同盘（Mods 根下）
    const sameDriveBackupDir = path.join(MODS_ROOT(), '.lz_update_backup')
    const leftoverBackups = fs.existsSync(sameDriveBackupDir)
      ? fs.readdirSync(sameDriveBackupDir).filter((n) => n.startsWith('backup_'))
      : []
    expect(leftoverBackups).toEqual([])
    // 系统盘缓存里也不该再出现备份（旧实现会落在这里）
    const cacheBackups = fs.existsSync(path.join(tmpRoot, 'cache'))
      ? fs.readdirSync(path.join(tmpRoot, 'cache')).filter((n) => n.startsWith('backup_'))
      : []
    expect(cacheBackups).toEqual([])
    expect(fs.readdirSync(CHAR_DIR())).toEqual(['Remielle Sportswear'])
  })

  it('旧版本恢复失败时把备份路径回传给界面，不静默吞掉', async () => {
    const modId = 730307
    const oldDir = writeMod({
      folderName: 'Remielle Sportswear',
      meta: { modId, version: 'v10.zip' },
      files: { 'keep.ini': '[TextureOverride]\n' }
    })

    stubFetchWithZip(makeZip('remiellesportswear_v11.zip', { 'mod.ini': '[TextureOverride]\n' }))
    // 模拟磁盘级故障：旧目录搬去备份时 rename 失败只能走复制（复制成功，备份保住了），
    // 随后「写新内容」与「回滚搬回」全部失败
    const realRenameSync = fs.renameSync.bind(fs)
    const realCpSync = fs.cpSync.bind(fs)
    vi.spyOn(fs, 'renameSync').mockImplementation(((src: any, dest: any) => {
      if (String(dest).includes('backup_') || String(src).includes('backup_')) {
        throw Object.assign(new Error('EIO: 设备错误'), { code: 'EIO' })
      }
      return realRenameSync(src, dest)
    }) as any)
    vi.spyOn(fs, 'cpSync').mockImplementation(((src: any, dest: any, opts: any) => {
      // 备份复制必须成功，否则测的就不是「回滚失败」而是「备份失败」
      if (String(dest).includes('backup_')) return realCpSync(src, dest, opts)
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
    }) as any)

    const res: any = await installMod({
      downloadUrl: 'https://gamebanana.com/dl/1',
      targetParentDir: CHAR_DIR(),
      downloadRoot: path.join(tmpRoot, 'cache'),
      modId,
      modName: 'Remielle Sportswear',
      fileName: 'remiellesportswear_v11.zip',
      version: 'remiellesportswear_v11.zip'
    })

    expect(res.success).toBe(false)
    // 关键：错误信息里必须带上备份路径，否则用户以为旧版本彻底没了
    expect(typeof res.backupPath).toBe('string')
    expect(res.error).toContain(res.backupPath)
    expect(fs.existsSync(res.backupPath)).toBe(true)
    expect(fs.readFileSync(path.join(res.backupPath, 'keep.ini'), 'utf8')).toContain('[TextureOverride]')
    // 回滚失败时旧路径确实回不去，但用户内容完整躺在备份里，且不能被误当成「安装成功」清掉
    expect(fs.existsSync(oldDir)).toBe(false)
  })
})
