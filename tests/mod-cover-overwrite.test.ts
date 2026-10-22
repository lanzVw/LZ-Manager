import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ModEngine } from '../src/core/mod-engine'

/**
 * 回归来源：用户反馈「设为 mod 封面把其他图覆盖了」。
 *
 * 旧实现把选中的图复制成 preview.png，而 preview.png 本身就是一张真实截图，
 * 于是设置封面 = 永久覆盖原图。截图里缩略图第 1 张被替换成新选的图，
 * 原封面再也找不回来。
 *
 * 现在改用独立的 _cover.<ext> 作为封面标记，任何既有图片都不被改写。
 */

let tmpRoot: string
let modsRoot: string
let engine: ModEngine

const PNG_RED = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const PNG_BLUE = Buffer.concat([PNG_RED, Buffer.from('blue-variant')])
const PNG_GREEN = Buffer.concat([PNG_RED, Buffer.from('green-variant')])

function makeMod(): string {
  const modDir = path.join(modsRoot, '菲欧妮', 'Goth Leotard Phoenix')
  fs.mkdirSync(modDir, { recursive: true })
  fs.writeFileSync(path.join(modDir, 'mod.ini'), '[TextureOverride]\nhash = abc\n')
  fs.writeFileSync(path.join(modDir, 'preview.png'), PNG_RED)
  fs.writeFileSync(path.join(modDir, 'shot_a.png'), PNG_BLUE)
  fs.writeFileSync(path.join(modDir, 'shot_b.png'), PNG_GREEN)
  return modDir
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-cover-'))
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

describe('设为 Mod 封面：不得覆盖任何既有图片', () => {
  it('设置封面后 preview.png 内容保持不变', () => {
    const modDir = makeMod()
    const before = fs.readFileSync(path.join(modDir, 'preview.png'))

    engine.setAsCoverImage(modDir, path.join(modDir, 'shot_a.png'))

    const after = fs.readFileSync(path.join(modDir, 'preview.png'))
    expect(after.equals(before), 'preview.png 被覆盖了').toBe(true)
  })

  it('设置封面后 shot_a.png / shot_b.png 都还在且内容不变', () => {
    const modDir = makeMod()
    const aBefore = fs.readFileSync(path.join(modDir, 'shot_a.png'))
    const bBefore = fs.readFileSync(path.join(modDir, 'shot_b.png'))

    engine.setAsCoverImage(modDir, path.join(modDir, 'shot_b.png'))

    expect(fs.existsSync(path.join(modDir, 'shot_a.png'))).toBe(true)
    expect(fs.existsSync(path.join(modDir, 'shot_b.png'))).toBe(true)
    expect(fs.readFileSync(path.join(modDir, 'shot_a.png')).equals(aBefore)).toBe(true)
    expect(fs.readFileSync(path.join(modDir, 'shot_b.png')).equals(bBefore)).toBe(true)
  })

  it('封面写入独立的 _cover.<ext>，且内容等于选中的图', () => {
    const modDir = makeMod()
    engine.setAsCoverImage(modDir, path.join(modDir, 'shot_a.png'))

    const coverPath = path.join(modDir, '_cover.png')
    expect(fs.existsSync(coverPath)).toBe(true)
    expect(fs.readFileSync(coverPath).equals(PNG_BLUE)).toBe(true)
  })

  it('getModDetails 把 _cover 标为封面，原 preview.png 仍留在列表里', async () => {
    const modDir = makeMod()
    engine.setAsCoverImage(modDir, path.join(modDir, 'shot_a.png'))

    const details = await engine.getModDetails(modDir)
    const byName = new Map(details.images.map((i: any) => [i.name, i]))

    expect(byName.has('preview.png'), '原 preview.png 消失了').toBe(true)
    expect(byName.get('_cover.png')?.isCover).toBe(true)
    expect(byName.get('preview.png')?.isCover).toBe(false)
  })

  it('换封面时旧的 _cover.* 被清掉，不会 png/webp 并存', () => {
    const modDir = makeMod()
    engine.setAsCoverImage(modDir, path.join(modDir, 'shot_a.png'))
    expect(fs.existsSync(path.join(modDir, '_cover.png'))).toBe(true)

    // 造一个 webp 旧封面，再换成新封面
    fs.writeFileSync(path.join(modDir, '_cover.webp'), PNG_GREEN)
    engine.setAsCoverImage(modDir, path.join(modDir, 'shot_b.png'))

    const covers = fs.readdirSync(modDir).filter((f) => /^_cover\./i.test(f))
    expect(covers).toEqual(['_cover.png'])
  })

  it('clearCoverImage 删除 _cover.*，封面回落到 preview.png', async () => {
    const modDir = makeMod()
    engine.setAsCoverImage(modDir, path.join(modDir, 'shot_a.png'))
    expect(engine.clearCoverImage(modDir)).toBe(true)

    expect(fs.existsSync(path.join(modDir, '_cover.png'))).toBe(false)
    const details = await engine.getModDetails(modDir)
    const cover = details.images.find((i: any) => i.isCover)
    expect(cover?.name).toBe('preview.png')
  })

  it('重复把同一张图设为封面不会报错也不会产生副本', () => {
    const modDir = makeMod()
    engine.setAsCoverImage(modDir, path.join(modDir, 'shot_a.png'))
    expect(engine.setAsCoverImage(modDir, path.join(modDir, 'shot_a.png'))).toBe(true)
    const covers = fs.readdirSync(modDir).filter((f) => /^_cover\./i.test(f))
    expect(covers).toEqual(['_cover.png'])
  })

  it('把 _cover 自身再设为封面时不会自我复制报错', () => {
    const modDir = makeMod()
    engine.setAsCoverImage(modDir, path.join(modDir, 'shot_a.png'))
    const coverPath = path.join(modDir, '_cover.png')
    expect(engine.setAsCoverImage(modDir, coverPath)).toBe(true)
    expect(fs.existsSync(coverPath)).toBe(true)
  })

  it('越界路径被守卫拦截', () => {
    const modDir = makeMod()
    const outside = path.join(tmpRoot, 'outside.png')
    fs.writeFileSync(outside, PNG_RED)
    expect(engine.setAsCoverImage(modDir, outside)).toBe(false)
  })
})
