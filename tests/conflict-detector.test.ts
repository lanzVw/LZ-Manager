import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ConflictDetector } from '../src/core/conflict-detector'

let tmpDir = ''

function writeMod(modDir: string, iniName: string, content: Buffer | string) {
  fs.mkdirSync(modDir, { recursive: true })
  fs.writeFileSync(path.join(modDir, iniName), content)
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-conflict-'))
})

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
})

describe('ConflictDetector', () => {
  it('检测同一 hash 的跨 Mod 冲突', async () => {
    const root = path.join(tmpDir, 'case1')
    writeMod(path.join(root, '阿莉亚', 'ModA'), 'a.ini', 'hash = 0a1b2c3d\n')
    writeMod(path.join(root, '阿莉亚', 'ModB'), 'b.ini', 'hash = 0a1b2c3d\n')
    const detector = new ConflictDetector(root)
    const report = await detector.detectCharacterConflicts('阿莉亚')
    expect(report.totalEnabledMods).toBe(2)
    expect(report.hasConflict).toBe(true)
    expect(report.allCollisions.length).toBeGreaterThan(0)
    expect(report.conflictsByMod['ModA'].conflictingMods).toContain('ModB')
  })

  it('支持 0x 前缀与逗号分隔多值 hash', async () => {
    const root = path.join(tmpDir, 'case2')
    writeMod(path.join(root, '角色', 'ModA'), 'a.ini', 'hash = 0xaabbccdd\n')
    writeMod(path.join(root, '角色', 'ModB'), 'b.ini', 'hash = aabbccdd, 11223344\n')
    const detector = new ConflictDetector(root)
    const report = await detector.detectCharacterConflicts('角色')
    expect(report.hasConflict).toBe(true)
    expect(report.allCollisions.some((c) => c.hash === 'aabbccdd')).toBe(true)
  })

  it('UTF-16LE 编码的 ini 也能提取 hash（此前全量漏检）', async () => {
    const root = path.join(tmpDir, 'case3')
    const iconv = require('iconv-lite')
    writeMod(path.join(root, '角色', 'ModA'), 'a.ini', iconv.encode('hash = 99887766\n', 'utf16-le'))
    writeMod(path.join(root, '角色', 'ModB'), 'b.ini', 'hash = 99887766\n')
    const detector = new ConflictDetector(root)
    const report = await detector.detectCharacterConflicts('角色')
    expect(report.hasConflict).toBe(true)
  })

  it('DISABLED_ 前缀的 Mod 不参与冲突', async () => {
    const root = path.join(tmpDir, 'case4')
    writeMod(path.join(root, '角色', 'ModA'), 'a.ini', 'hash = 11223344\n')
    fs.mkdirSync(path.join(root, '角色', 'DISABLED_ModB'), { recursive: true })
    fs.writeFileSync(path.join(root, '角色', 'DISABLED_ModB', 'b.ini'), 'hash = 11223344\n')
    const detector = new ConflictDetector(root)
    const report = await detector.detectCharacterConflicts('角色')
    expect(report.totalEnabledMods).toBe(1)
    expect(report.hasConflict).toBe(false)
  })
})
