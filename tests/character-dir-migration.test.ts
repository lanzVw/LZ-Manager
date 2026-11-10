import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ModEngine } from '../src/core/mod-engine'

/**
 * 回归来源：角色库改用国服官方名后，磁盘上仍留着旧译名目录。
 * 归一化只改展示名，按官方名启停会报「角色目录不存在」，所以扫描时要顺手改名。
 */
describe('角色目录迁移：旧译名改为官方名', () => {
  let root = ''

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-char-migrate-'))
  })

  afterEach(() => {
    try {
      fs.rmSync(root, { recursive: true, force: true })
    } catch (_) {}
  })

  const makeCharDir = (name: string) => {
    const dir = path.join(root, name)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'mod.ini'), `[TextureOverride_${name}]`)
    return dir
  }

  it('把鸣潮旧译名目录改名为官方名并保留内容', () => {
    makeCharDir('青霄')
    makeCharDir('恰空')
    makeCharDir('洛琪亚')

    const engine = new ModEngine(root)
    expect(engine.migrateLegacyCharacterDirs('wuwa')).toBe(true)

    expect(fs.existsSync(path.join(root, '清宵', 'mod.ini'))).toBe(true)
    expect(fs.existsSync(path.join(root, '夏空', 'mod.ini'))).toBe(true)
    expect(fs.existsSync(path.join(root, '洛可可', 'mod.ini'))).toBe(true)
    expect(fs.existsSync(path.join(root, '青霄'))).toBe(false)
  })

  it('已经是官方名时不做任何改动', () => {
    makeCharDir('清宵')
    const engine = new ModEngine(root)
    expect(engine.migrateLegacyCharacterDirs('wuwa')).toBe(false)
    expect(fs.existsSync(path.join(root, '清宵'))).toBe(true)
  })

  it('目标目录已存在时不覆盖，避免两个角色目录被合并', () => {
    makeCharDir('青霄')
    makeCharDir('清宵')

    const engine = new ModEngine(root)
    expect(engine.migrateLegacyCharacterDirs('wuwa')).toBe(false)
    expect(fs.existsSync(path.join(root, '青霄', 'mod.ini'))).toBe(true)
    expect(fs.existsSync(path.join(root, '清宵', 'mod.ini'))).toBe(true)
  })

  it('重复执行是幂等的', () => {
    makeCharDir('恰空')
    const engine = new ModEngine(root)
    expect(engine.migrateLegacyCharacterDirs('wuwa')).toBe(true)
    expect(engine.migrateLegacyCharacterDirs('wuwa')).toBe(false)
    expect(fs.existsSync(path.join(root, '恰空'))).toBe(false)
    expect(fs.existsSync(path.join(root, '夏空'))).toBe(true)
  })
})
