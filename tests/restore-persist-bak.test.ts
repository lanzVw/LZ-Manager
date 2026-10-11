import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ModEngine } from '../src/core/mod-engine'

let tmpDir = ''

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-persist-bak-test-'))
})

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch (_) {}
})

describe('restorePersistBakFiles', () => {
  it('还原目录下的 *.qaqm-persistbak 为原 ini 并清理备份文件', () => {
    const modDir = path.join(tmpDir, 'persist-mod')
    const subDir = path.join(modDir, 'sub')
    fs.mkdirSync(subDir, { recursive: true })

    const originalMain = path.join(modDir, 'main.ini')
    const bakMain = path.join(modDir, 'main.ini.qaqm-persistbak')
    const originalSub = path.join(subDir, 'sub.ini')
    const bakSub = path.join(subDir, 'sub.ini.qaqm-persistbak')

    fs.writeFileSync(originalMain, 'modified main content')
    fs.writeFileSync(bakMain, 'initial clean main content')

    fs.writeFileSync(originalSub, 'modified sub content')
    fs.writeFileSync(bakSub, 'initial clean sub content')

    // 独立文件无对应备份
    const untouched = path.join(modDir, 'untouched.ini')
    fs.writeFileSync(untouched, 'untouched content')

    const engine = new ModEngine(tmpDir)
    const count = engine.restorePersistBakFiles(modDir)

    expect(count).toBe(2)

    // 验证 ini 内容已恢复为 persistbak 初始版本
    expect(fs.readFileSync(originalMain, 'utf-8')).toBe('initial clean main content')
    expect(fs.readFileSync(originalSub, 'utf-8')).toBe('initial clean sub content')
    expect(fs.readFileSync(untouched, 'utf-8')).toBe('untouched content')

    // 验证 .qaqm-persistbak 备份已被清理删除
    expect(fs.existsSync(bakMain)).toBe(false)
    expect(fs.existsSync(bakSub)).toBe(false)
  })

  it('无备份文件时返回 restoredCount 为 0', () => {
    const modDir = path.join(tmpDir, 'empty-mod')
    fs.mkdirSync(modDir, { recursive: true })
    fs.writeFileSync(path.join(modDir, 'test.ini'), 'some ini content')

    const engine = new ModEngine(tmpDir)
    const count = engine.restorePersistBakFiles(modDir)

    expect(count).toBe(0)
    expect(fs.readFileSync(path.join(modDir, 'test.ini'), 'utf-8')).toBe('some ini content')
  })
})
