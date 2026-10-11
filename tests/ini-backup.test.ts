import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  parseFixBackupFileName,
  formatFixBackupLabel,
  createIniBackupStamp,
  createIniBackupSnapshotForDirectory,
  listIniBackupsForMod,
  restoreIniBackupForMod,
  collectFixBackupFilesForMod,
  buildFixBackupRestorePlan
} from '../src/core/ini-backup'

let tmpDir = ''

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-ini-backup-test-'))
})

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch (_) {}
})

describe('ini-backup', () => {
  describe('备份文件名解析与标签格式化', () => {
    it('解析 QAQ 格式备份文件名 (.qaqm-inibak-<stamp>)', () => {
      const stamp = '20261011-123045-999-abcdef'
      const parsed = parseFixBackupFileName(`character.ini.qaqm-inibak-${stamp}`)
      expect(parsed).not.toBeNull()
      expect(parsed?.format).toBe('qaqm')
      expect(parsed?.originalName).toBe('character.ini')
      expect(parsed?.stamp).toBe(stamp)
      expect(formatFixBackupLabel(parsed!)).toContain('2026-10-11')
    })

    it('解析鸣潮独立修复器格式备份文件名 (xxx_<YYYY-MM-DD HH-MM-SS(.mmm)>.BAK)', () => {
      const parsed = parseFixBackupFileName('weapon.ini_2026-03-27 15-45-12.BAK', {
        includeWuwaIndependent: true
      })
      expect(parsed).not.toBeNull()
      expect(parsed?.format).toBe('wuwa-independent')
      expect(parsed?.stamp).toBe('wuwa-independent:2026-03-27 15-45')
      expect(parsed?.timestamp).toBe('2026-03-27 15-45-12')
      expect(formatFixBackupLabel(parsed!)).toContain('独立修复器')
      expect(formatFixBackupLabel(parsed!)).toContain('2026-03-27 15:45')
    })

    it('非备份文件返回 null', () => {
      expect(parseFixBackupFileName('mod.ini')).toBeNull()
      expect(parseFixBackupFileName('backup.zip')).toBeNull()
      expect(parseFixBackupFileName('character.ini.bak')).toBeNull()
    })
  })

  describe('备份快照与还原计划 (createIniBackupSnapshotForDirectory & buildFixBackupRestorePlan)', () => {
    it('为目录建立快照并解析还原计划', () => {
      const modDir = path.join(tmpDir, 'snapshot-mod')
      fs.mkdirSync(modDir, { recursive: true })
      fs.writeFileSync(path.join(modDir, 'main.ini'), 'hash = 1111\n')
      fs.writeFileSync(path.join(modDir, 'sub.ini'), 'hash = 2222\n')

      const snapshot = createIniBackupSnapshotForDirectory(modDir)
      expect(snapshot.count).toBe(2)
      expect(snapshot.backupPaths.length).toBe(2)

      // 验证生成的备份文件存在
      const backupFile1 = path.join(modDir, `main.ini.qaqm-inibak-${snapshot.stamp}`)
      expect(fs.existsSync(backupFile1)).toBe(true)

      const scan = collectFixBackupFilesForMod(modDir)
      expect(scan.backups.length).toBe(2)

      const plan = buildFixBackupRestorePlan(scan.backups, snapshot.stamp)
      expect(plan).not.toBeNull()
      expect(plan?.restoreBackups.length).toBe(2)
      expect(plan?.restoreBackups.some((b) => b.originalPath.endsWith('main.ini'))).toBe(true)
    })
  })

  describe('Mod 备份列表与还原 (listIniBackupsForMod & restoreIniBackupForMod)', () => {
    it('正确按 stamp 分组列出备份记录', () => {
      const modDir = path.join(tmpDir, 'list-mod')
      fs.mkdirSync(modDir, { recursive: true })

      const stampA = '20261011-100000-001-aaaaaa'
      const stampB = '20261011-120000-002-bbbbbb'

      fs.writeFileSync(path.join(modDir, `a.ini.qaqm-inibak-${stampA}`), 'content a')
      fs.writeFileSync(path.join(modDir, `b.ini.qaqm-inibak-${stampA}`), 'content b')
      fs.writeFileSync(path.join(modDir, `a.ini.qaqm-inibak-${stampB}`), 'content a new')

      const groups = listIniBackupsForMod(modDir)
      expect(groups.length).toBe(2)

      const groupA = groups.find((b) => b.stamp === stampA)
      expect(groupA?.fileCount).toBe(2)

      const groupB = groups.find((b) => b.stamp === stampB)
      expect(groupB?.fileCount).toBe(1)
    })

    it('回滚指定 stamp 备份文件并清理备份', () => {
      const modDir = path.join(tmpDir, 'restore-mod')
      fs.mkdirSync(modDir, { recursive: true })

      const stamp = '20261011-150000-003-cccccc'
      const originalPath = path.join(modDir, 'mod.ini')
      const backupPath = path.join(modDir, `mod.ini.qaqm-inibak-${stamp}`)

      fs.writeFileSync(backupPath, 'original content')
      fs.writeFileSync(originalPath, 'modified broken content')

      const res = restoreIniBackupForMod(modDir, stamp)
      expect(res.success).toBe(true)
      expect(res.restoredCount).toBe(1)

      // 验证 mod.ini 已被恢复，且备份文件已被删除清理
      expect(fs.readFileSync(originalPath, 'utf-8')).toBe('original content')
      expect(fs.existsSync(backupPath)).toBe(false)
    })

    it('部分失败语义：若目标无法被还原，记录失败项且保留备份文件', () => {
      const modDir = path.join(tmpDir, 'partial-fail-mod')
      fs.mkdirSync(modDir, { recursive: true })

      const stamp = '20261011-160000-004-dddddd'
      const backupFile1 = path.join(modDir, `success.ini.qaqm-inibak-${stamp}`)
      fs.writeFileSync(backupFile1, 'success backup')

      // 模拟一个目标路径是已存在的子目录，导致 copyFileSync 报错
      const failTargetName = 'fail.ini'
      const failDirAsFile = path.join(modDir, failTargetName)
      fs.mkdirSync(failDirAsFile, { recursive: true })
      const backupFile2 = path.join(modDir, `${failTargetName}.qaqm-inibak-${stamp}`)
      fs.writeFileSync(backupFile2, 'fail backup')

      const res = restoreIniBackupForMod(modDir, stamp)
      expect(res.restoreSucceeded).toBe(false)
      expect(res.restoredCount).toBe(1)
      expect(res.errors.length).toBe(1)
      expect(res.cleanupAttempted).toBe(false)
      expect(res.removedBackupCount).toBe(0)

      // 只要有任何文件恢复失败，为确保数据安全，全量备份文件予以保留
      expect(fs.existsSync(backupFile1)).toBe(true)
      expect(fs.existsSync(backupFile2)).toBe(true)
    })
  })
})
