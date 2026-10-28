import { describe, it, expect } from 'vitest'
import type { ModInstallTarget } from '../src/core/types'
import {
  characterNameFromInstallTarget,
  collectInstalledVersions,
  findInstalledCopyByVersion,
  isGameBananaFileInstalled,
  normalizeGameBananaVersion,
  type GameBananaInstalledTarget
} from '../src/renderer/utils/gamebanana-install'

const copy = (overrides: Partial<ModInstallTarget> = {}): ModInstallTarget => ({
  fullPath: 'F:\\XXMI\\ZZZ\\Mods\\安比\\Goth Leotard',
  folderName: 'Goth Leotard',
  enabled: true,
  modId: 730301,
  version: 'goth_leotard_phoenix_eb28e.zip',
  ...overrides
})

const target = (
  existing: ModInstallTarget,
  duplicates: ModInstallTarget[] = []
): GameBananaInstalledTarget => ({ existing, duplicates })

describe('normalizeGameBananaVersion', () => {
  it('大小写与首尾空格不敏感', () => {
    expect(normalizeGameBananaVersion('  Goth_V1.ZIP ')).toBe('goth_v1.zip')
  })

  it('空值统一为空串', () => {
    expect(normalizeGameBananaVersion(undefined)).toBe('')
    expect(normalizeGameBananaVersion(null)).toBe('')
    expect(normalizeGameBananaVersion('   ')).toBe('')
  })
})

describe('collectInstalledVersions / isGameBananaFileInstalled', () => {
  it('合并 existing 与 duplicates 并去重', () => {
    const versions = collectInstalledVersions(
      target(copy({ version: 'A.zip' }), [
        copy({ folderName: 'DISABLED_A', version: 'a.zip' }),
        copy({ folderName: 'B', version: 'b.zip' })
      ])
    )
    expect([...versions].sort()).toEqual(['a.zip', 'b.zip'])
  })

  it('跳过缺失/空版本，null target 返回空集合', () => {
    expect([...collectInstalledVersions(target(copy({ version: undefined })))]).toEqual([])
    expect([...collectInstalledVersions(null)]).toEqual([])
  })

  it('文件名比较复用同一套归一规则', () => {
    const versions = collectInstalledVersions(target(copy({ version: 'A.zip' })))
    expect(isGameBananaFileInstalled(' a.ZIP ', versions)).toBe(true)
    expect(isGameBananaFileInstalled('b.zip', versions)).toBe(false)
    expect(isGameBananaFileInstalled(undefined, versions)).toBe(false)
  })
})

describe('findInstalledCopyByVersion', () => {
  it('命中 existing', () => {
    const existing = copy({ version: 'a.zip' })
    expect(findInstalledCopyByVersion(target(existing), 'A.ZIP')?.fullPath).toBe(existing.fullPath)
  })

  it('命中 duplicate 时返回那一份副本', () => {
    const duplicate = copy({ folderName: 'DISABLED_B', version: 'b.zip', enabled: false })
    const matched = findInstalledCopyByVersion(target(copy({ version: 'a.zip' }), [duplicate]), 'b.zip')
    expect(matched?.folderName).toBe('DISABLED_B')
  })

  it('未命中/空文件名返回 null', () => {
    expect(findInstalledCopyByVersion(target(copy({ version: 'a.zip' })), 'c.zip')).toBeNull()
    expect(findInstalledCopyByVersion(target(copy({ version: 'a.zip' })), undefined)).toBeNull()
    expect(findInstalledCopyByVersion(null, 'a.zip')).toBeNull()
  })
})

describe('characterNameFromInstallTarget', () => {
  it('从 Windows / Unix 路径取角色目录', () => {
    expect(characterNameFromInstallTarget(copy({ fullPath: 'F:\\XXMI\\ZZZ\\Mods\\安比\\Mod A' }))).toBe('安比')
    expect(characterNameFromInstallTarget(copy({ fullPath: '/home/lz/Mods/安比/Mod A/' }))).toBe('安比')
  })

  it('路径层数不足返回 null', () => {
    expect(characterNameFromInstallTarget(copy({ fullPath: 'Mod A' }))).toBeNull()
    expect(characterNameFromInstallTarget(copy({ fullPath: '' }))).toBeNull()
    expect(characterNameFromInstallTarget(null)).toBeNull()
  })
})
