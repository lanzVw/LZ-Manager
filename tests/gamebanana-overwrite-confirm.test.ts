import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GameBananaOverwriteConfirm } from '../src/renderer/components/GameBananaOverwriteConfirm'
import type { GameBananaInstalledTarget } from '../src/renderer/utils/gamebanana-install'

const makeTarget = (version: string): GameBananaInstalledTarget => ({
  existing: {
    fullPath: 'F:\\XXMI\\ZZZ\\Mods\\安比\\Goth Leotard',
    folderName: 'Goth Leotard',
    enabled: true,
    modId: 730301,
    version
  },
  duplicates: []
})

const render = (fileName: string, target: GameBananaInstalledTarget) =>
  renderToStaticMarkup(
    React.createElement(GameBananaOverwriteConfirm, {
      isOpen: true,
      modName: 'Goth Leotard Phoenix',
      fileName,
      target,
      onConfirmUpdate: () => {},
      onConfirmNewInstall: () => {},
      onCancel: () => {}
    })
  )

describe('GameBananaOverwriteConfirm 重装模式', () => {
  it('文件名命中本地版本时切换为「该版本已安装 / 重新安装」，且不提供另建一份', () => {
    const html = render('goth_leotard_phoenix_eb28e.zip', makeTarget('goth_leotard_phoenix_eb28e.zip'))
    expect(html).toContain('该版本已安装')
    expect(html).toContain('重新安装')
    expect(html).toContain('已安装版本')
    expect(html).not.toContain('保留旧版，另建一份')
    expect(html).not.toContain('该模组已在本地安装')
  })

  it('文件名不命中时保持原来的覆盖更新文案', () => {
    const html = render('thicc_goth_leotard_phoenix.zip', makeTarget('goth_leotard_phoenix_eb28e.zip'))
    expect(html).toContain('该模组已在本地安装')
    expect(html).toContain('覆盖更新')
    expect(html).toContain('保留旧版，另建一份')
  })

  it('命中另一份副本时提示实际覆盖目标', () => {
    const target = makeTarget('goth_leotard_phoenix_eb28e.zip')
    target.duplicates = [
      {
        fullPath: 'F:\\XXMI\\ZZZ\\Mods\\安比\\DISABLED_Thicc',
        folderName: 'DISABLED_Thicc',
        enabled: false,
        modId: 730301,
        version: 'thicc_goth_leotard_phoenix.zip'
      }
    ]

    const html = render('thicc_goth_leotard_phoenix.zip', target)
    expect(html).toContain('该版本已安装')
    expect(html).toContain('该版本位于另一份副本')
    expect(html).toContain('DISABLED_Thicc')
  })
})
