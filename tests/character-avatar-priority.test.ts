import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ModEngine } from '../src/core/mod-engine'

/**
 * 回归来源：角色分类头像曾被本地 Mod 的预览图抢占。
 * 菲欧妮有本地 Mod 时，侧边栏显示的是该 Mod 的 preview.png 而不是官方立绘，
 * 导致同一角色会随 Mod 启停而「变脸」。官方图必须压过 Mod 封面。
 *
 * 例外：「设为角色头像」写入角色目录的 _cover.* 是用户显式指定，仍应最优先。
 */

let tmpRoot: string
let modsRoot: string
let officialRoot: string
let originalCwd: string

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

function writePng(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, PNG_1PX)
}

beforeEach(() => {
  originalCwd = process.cwd()
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-avatar-'))
  modsRoot = path.join(tmpRoot, 'Mods')
  officialRoot = path.join(tmpRoot, 'resources', 'images')
  fs.mkdirSync(modsRoot, { recursive: true })
  fs.mkdirSync(officialRoot, { recursive: true })
  // getCharacterAvatars 通过 process.cwd() 找官方资源，切到临时目录隔离
  process.chdir(tmpRoot)
})

afterEach(() => {
  process.chdir(originalCwd)
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch (_) {}
})

describe('角色头像优先级', () => {
  it('官方图优先于本地 Mod 预览图', () => {
    const charName = '菲欧妮'
    // 官方图
    writePng(path.join(officialRoot, 'zzz', charName, '_cover.png'))
    // 本地角色目录 + 一个带预览图的 Mod
    const charDir = path.join(modsRoot, charName)
    writePng(path.join(charDir, 'Some Mod', 'preview.png'))

    const engine = new ModEngine(modsRoot)
    const avatars = engine.getCharacterAvatars('zzz')

    expect(avatars[charName]).toBeDefined()
    expect(avatars[charName]).toContain('resources')
    expect(avatars[charName]).not.toContain('Some Mod')
  })

  it('「设为角色头像」写入的 _cover 仍最优先', () => {
    const charName = '菲欧妮'
    writePng(path.join(officialRoot, 'zzz', charName, '_cover.png'))
    const charDir = path.join(modsRoot, charName)
    // 用户显式设置的角色头像
    writePng(path.join(charDir, '_cover.png'))
    // 同时存在带预览图的 Mod
    writePng(path.join(charDir, 'Some Mod', 'preview.png'))

    const engine = new ModEngine(modsRoot)
    const avatars = engine.getCharacterAvatars('zzz')

    expect(avatars[charName]).toBe(path.join(charDir, '_cover.png'))
  })

  it('官方图缺失时才用 Mod 封面兜底', () => {
    const charName = '新角色'
    const charDir = path.join(modsRoot, charName)
    writePng(path.join(charDir, 'Some Mod', 'preview.png'))

    const engine = new ModEngine(modsRoot)
    const avatars = engine.getCharacterAvatars('zzz')

    expect(avatars[charName]).toBeDefined()
    expect(avatars[charName]).toContain('Some Mod')
  })

  it('官方图存在且无本地目录时直接使用官方图', () => {
    const charName = '星徽·比利'
    writePng(path.join(officialRoot, 'zzz', charName, '_cover.png'))

    const engine = new ModEngine(modsRoot)
    const avatars = engine.getCharacterAvatars('zzz')

    expect(avatars[charName]).toContain('resources')
  })
})
