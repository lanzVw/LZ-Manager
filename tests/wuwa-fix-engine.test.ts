import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  validateWuwaRulesManifest,
  compileWuwaAssignmentMaps,
  decodeIniBuffer,
  transformWuwaIniBuffer,
  applyWuwaFixRulesToDirectory,
  SUPPORTED_SCHEMA_VERSION,
  WuwaRulesManifest
} from '../src/core/wuwa-fix-engine'
import { ModFixer } from '../src/core/mod-fixer'

let tmpDir = ''

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-wuwa-fix-test-'))
})

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch (_) {}
})

describe('wuwa-fix-engine', () => {
  describe('规则校验与编译 (validate & compile)', () => {
    it('不支持的 schemaVersion 抛错', () => {
      const manifest: any = {
        schemaVersion: 999,
        engineVersion: 2,
        revision: 1,
        gameId: 'wuthering-waves',
        rules: []
      }
      expect(() => validateWuwaRulesManifest(manifest)).toThrow(/schemaVersion/)
    })

    it('检测循环映射并抛错', () => {
      const cyclicManifest: any = {
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        engineVersion: 2,
        revision: 1,
        gameId: 'wuthering-waves',
        toolVersion: '3.5',
        gameVersion: '2.1',
        rules: [
          {
            id: 'rule-cycle',
            operations: [
              {
                type: 'replace-assignment-value',
                keys: ['hash'],
                valueType: 'hex',
                occurrence: 'all',
                replacements: [
                  { from: '00112233', to: 'aabbccdd' },
                  { from: 'aabbccdd', to: '00112233' }
                ]
              }
            ]
          }
        ]
      }
      expect(() => validateWuwaRulesManifest(cyclicManifest)).toThrow(/循环/)
    })

    it('正常校验并编译打包的内置规则文件 (resources/fix/wuwa/rules.json)', () => {
      const rulesJsonPath = path.join(__dirname, '../resources/fix/wuwa/rules.json')
      const content = JSON.parse(fs.readFileSync(rulesJsonPath, 'utf-8'))
      const validated = validateWuwaRulesManifest(content)
      expect(validated.schemaVersion).toBe(1)
      expect(validated.rules.length).toBeGreaterThan(0)

      const compiled = compileWuwaAssignmentMaps(validated)
      expect(compiled.rules.length).toBeGreaterThan(0)
    })

    it('打包布局下候选列表包含 <resourcesPath>/resources/fix/... 形式', () => {
      const fixer = new ModFixer({
        userDataPath: path.join(tmpDir, 'qaqm-data'),
        resourcesPath: path.join(tmpDir, 'packaged-root')
      })
      const candidates = fixer.getBundledWuwaFixRuleCandidates()
      const expectedPackagedRulePath = path.join(
        tmpDir,
        'packaged-root',
        'resources',
        'fix',
        'wuwa',
        'rules.json'
      )
      expect(candidates).toContain(expectedPackagedRulePath)
    })
  })

  describe('字节保真 ini 编码解码 (decodeIniBuffer)', () => {
    it('以 latin1 字节保真回写含 UTF-8 中文注释的 ini 内容', () => {
      // 模拟磁盘上的 UTF-8 编码文件
      const originalUtf8Buffer = Buffer.from('hash = 11223344\n; 中文注释 with special bytes: ©®\n', 'utf-8')

      const decoded = decodeIniBuffer(originalUtf8Buffer)
      const updatedText = decoded.content.replace('11223344', '99887766')
      const encodedBuffer = decoded.encode(updatedText)

      // 解码后 UTF-8 原文字节未发生任何破坏或乱码
      expect(encodedBuffer.toString('utf-8')).toBe('hash = 99887766\n; 中文注释 with special bytes: ©®\n')
    })

    it('检测 UTF-16LE BOM 编码并保真回写', () => {
      const bom = Buffer.from([0xff, 0xfe])
      const textBuffer = Buffer.from('hash = 11223344\n', 'utf16le')
      const originalBuffer = Buffer.concat([bom, textBuffer])

      const decoded = decodeIniBuffer(originalBuffer)
      expect(decoded.content).toContain('hash = 11223344')

      const updatedText = decoded.content.replace('11223344', '99887766')
      const encodedBuffer = decoded.encode(updatedText)
      expect(encodedBuffer.toString('utf16le')).toBe('\uFEFFhash = 99887766\n')
    })
  })

  describe('缓冲区变换逻辑 (transformWuwaIniBuffer)', () => {
    it('测试 occurrence: all 模式全量替换', () => {
      const manifest: WuwaRulesManifest = {
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        engineVersion: 2,
        revision: 1,
        gameId: 'wuthering-waves',
        rules: [
          {
            id: 'rule-all',
            operations: [
              {
                type: 'replace-assignment-value',
                keys: ['hash'],
                valueType: 'hex',
                occurrence: 'all',
                replacements: [{ from: '11223344', to: '99887766' }]
              }
            ]
          }
        ]
      }
      const compiled = compileWuwaAssignmentMaps(validateWuwaRulesManifest(manifest))
      const input = Buffer.from('hash = 11223344\nhash = 11223344\n', 'latin1')
      const res = transformWuwaIniBuffer(input, compiled)
      expect(res.changed).toBe(true)
      expect(res.replacementCount).toBe(2)
      expect(res.buffer.toString('latin1')).toBe('hash = 99887766\nhash = 99887766\n')
    })

    it('测试 occurrence: ordered-once 模式按顺序单次替换', () => {
      const manifest: WuwaRulesManifest = {
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        engineVersion: 2,
        revision: 1,
        gameId: 'wuthering-waves',
        rules: [
          {
            id: 'rule-once',
            operations: [
              {
                type: 'replace-assignment-value',
                keys: ['hash'],
                valueType: 'hex',
                occurrence: 'ordered-once',
                replacements: [{ from: '11223344', to: '99887766' }]
              }
            ]
          }
        ]
      }
      const compiled = compileWuwaAssignmentMaps(validateWuwaRulesManifest(manifest))
      const input = Buffer.from('hash = 11223344\nhash = 11223344\n', 'latin1')
      const res = transformWuwaIniBuffer(input, compiled)
      expect(res.changed).toBe(true)
      expect(res.replacementCount).toBe(1)
      expect(res.buffer.toString('latin1')).toBe('hash = 99887766\nhash = 11223344\n')
    })

    it('测试 occurrence: first-present-reverse-all 反向查找替换', () => {
      const manifest: WuwaRulesManifest = {
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        engineVersion: 2,
        revision: 1,
        gameId: 'wuthering-waves',
        rules: [
          {
            id: 'rule-reverse',
            operations: [
              {
                type: 'replace-assignment-value',
                keys: ['hash'],
                valueType: 'hex',
                occurrence: 'first-present-reverse-all',
                replacements: [{ from: 'aaaa1111', to: 'bbbb2222' }]
              }
            ]
          }
        ]
      }
      const compiled = compileWuwaAssignmentMaps(validateWuwaRulesManifest(manifest))
      const input = Buffer.from('hash = aaaa1111\nother = 123\n', 'latin1')
      const res = transformWuwaIniBuffer(input, compiled)
      expect(res.changed).toBe(true)
      expect(res.buffer.toString('latin1')).toBe('hash = bbbb2222\nother = 123\n')
    })

    it('测试 when 条件分支：仅在满足 assignments 条件时才替换', () => {
      const manifest: WuwaRulesManifest = {
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        engineVersion: 2,
        revision: 1,
        gameId: 'wuthering-waves',
        rules: [
          {
            id: 'rule-conditional',
            when: {
              anyAssignment: {
                key: 'hash',
                values: ['aaaabbbb']
              }
            },
            operations: [
              {
                type: 'replace-assignment-value',
                keys: ['hash'],
                valueType: 'hex',
                occurrence: 'all',
                replacements: [{ from: '11223344', to: '99887766' }]
              }
            ]
          }
        ]
      }
      const compiled = compileWuwaAssignmentMaps(validateWuwaRulesManifest(manifest))

      // 未包含 hash = aaaabbbb，不应触发替换
      const inputNoMatch = Buffer.from('hash = cccccccc\nhash = 11223344\n', 'latin1')
      const resNoMatch = transformWuwaIniBuffer(inputNoMatch, compiled)
      expect(resNoMatch.changed).toBe(false)

      // 包含 hash = aaaabbbb，应触发替换
      const inputMatch = Buffer.from('hash = aaaabbbb\nhash = 11223344\n', 'latin1')
      const resMatch = transformWuwaIniBuffer(inputMatch, compiled)
      expect(resMatch.changed).toBe(true)
      expect(resMatch.buffer.toString('latin1')).toBe('hash = aaaabbbb\nhash = 99887766\n')
    })
  })

  describe('目录批量应用 (applyWuwaFixRulesToDirectory)', () => {
    it('递归遍历目录中 ini 并记录统计结果', async () => {
      const modDir = path.join(tmpDir, 'apply-test-mod')
      fs.mkdirSync(path.join(modDir, 'sub'), { recursive: true })
      fs.writeFileSync(path.join(modDir, 'main.ini'), 'hash = 11223344\n')
      fs.writeFileSync(path.join(modDir, 'sub', 'part.ini'), 'hash = 11223344\n')
      fs.writeFileSync(path.join(modDir, 'sub', 'skip.txt'), 'hash = 11223344\n')

      const manifest: WuwaRulesManifest = {
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        engineVersion: 2,
        revision: 1,
        gameId: 'wuthering-waves',
        rules: [
          {
            id: 'rule-dir',
            operations: [
              {
                type: 'replace-assignment-value',
                keys: ['hash'],
                valueType: 'hex',
                occurrence: 'all',
                replacements: [{ from: '11223344', to: '99998888' }]
              }
            ]
          }
        ]
      }

      const res = applyWuwaFixRulesToDirectory({ rootDir: modDir, manifest })
      expect(res.stats.scannedFiles).toBe(2)
      expect(res.stats.modifiedFiles).toBe(2)
      expect(res.stats.replacementCount).toBe(2)
      expect(fs.readFileSync(path.join(modDir, 'main.ini'), 'latin1')).toBe('hash = 99998888\n')
      expect(fs.readFileSync(path.join(modDir, 'sub', 'part.ini'), 'latin1')).toBe('hash = 99998888\n')
    })
  })
})
