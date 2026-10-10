import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { readTextAuto, writeTextWithEncoding } from '../src/core/text-encoding'

let tmpDir = ''

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-text-enc-'))
})

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
})

describe('text-encoding 自动编码探测与回写', () => {
  it('UTF-8 无 BOM 正常读取', () => {
    const file = path.join(tmpDir, 'utf8.ini')
    fs.writeFileSync(file, '; 中文注释\ntarget = game.exe\n', 'utf8')
    const { content, encoding } = readTextAuto(file)
    expect(encoding).toBe('utf8')
    expect(content).toContain('中文注释')
  })

  it('GBK 文件被识别为 gbk 且内容正确', () => {
    const file = path.join(tmpDir, 'gbk.ini')
    const iconv = require('iconv-lite')
    fs.writeFileSync(file, iconv.encode('; GBK 中文注释\nkey = 1\n', 'gbk'))
    const { content, encoding } = readTextAuto(file)
    expect(encoding).toBe('gbk')
    expect(content).toContain('GBK 中文注释')
  })

  it('UTF-16LE (带 BOM) 被识别且内容正确', () => {
    const file = path.join(tmpDir, 'utf16.ini')
    const content = '; UTF16 中文注释\nhash = 123456\n'
    const iconv = require('iconv-lite')
    fs.writeFileSync(file, iconv.encode(content, 'utf16-le'))
    const { content: decoded, encoding } = readTextAuto(file)
    expect(encoding).toBe('utf16le')
    expect(decoded).toContain('hash = 123456')
  })

  it('GBK 写入后再读回内容一致（编码保持）', () => {
    const file = path.join(tmpDir, 'gbk-roundtrip.ini')
    writeTextWithEncoding(file, '; 回写中文\nvalue = 测试\n', 'gbk')
    const { content, encoding } = readTextAuto(file)
    expect(encoding).toBe('gbk')
    expect(content).toContain('回写中文')
  })

  it('UTF-16LE 写入带 BOM 且可读回', () => {
    const file = path.join(tmpDir, 'utf16-roundtrip.ini')
    writeTextWithEncoding(file, 'data = 1\n', 'utf16le')
    const raw = fs.readFileSync(file)
    expect(raw[0]).toBe(0xff)
    expect(raw[1]).toBe(0xfe)
    expect(readTextAuto(file).content).toContain('data = 1')
  })
})
