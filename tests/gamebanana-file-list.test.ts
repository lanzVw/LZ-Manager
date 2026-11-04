import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GameBananaFileList } from '../src/renderer/components/gamebanana/GameBananaFileList'
import type { GameBananaMarketFile } from '../src/renderer/components/gamebanana/GameBananaFileList'

const FILES: GameBananaMarketFile[] = [
  {
    id: 2,
    fileName: 'goth_leotard_phoenix_eb28e.zip',
    downloadUrl: 'https://gamebanana.com/dl/2',
    fileSize: 7.3 * 1024 * 1024,
    dateAdded: 1_793_000_000,
    downloadCount: 2544
  },
  {
    id: 1,
    fileName: 'thicc_goth_leotard_phoenix.zip',
    downloadUrl: 'https://gamebanana.com/dl/1',
    fileSize: 8 * 1024 * 1024,
    dateAdded: 1_792_000_000,
    downloadCount: 2860
  }
]

const render = (overrides: Partial<React.ComponentProps<typeof GameBananaFileList>> = {}) =>
  renderToStaticMarkup(
    React.createElement(GameBananaFileList, {
      files: FILES,
      installingFileId: null,
      progressPercent: 0,
      installedVersions: new Set<string>(),
      busy: false,
      onInstall: () => {},
      ...overrides
    })
  )

describe('GameBananaFileList 安装状态', () => {
  it('已安装版本显示「已安装」，未安装版本显示「安装」', () => {
    // installedVersions 约定为 collectInstalledVersions 产出的归一集合（小写、去空格）
    const html = render({ installedVersions: new Set(['goth_leotard_phoenix_eb28e.zip']) })
    expect(html).toContain('>已安装</span>')
    expect(html).toContain('>安装</span>')
    expect(html.match(/>已安装<\/span>/g)).toHaveLength(1)
  })

  it('安装进度只出现在对应文件行', () => {
    const html = render({ installingFileId: 2, progressPercent: 42, busy: true })
    expect(html.match(/安装中 42%/g)).toHaveLength(1)
  })

  it('安装中时其它行按钮禁用', () => {
    const html = render({ installingFileId: 2, progressPercent: 42, busy: true })
    expect(html.match(/disabled=""/g)?.length).toBe(2)
  })

  it('多文件清单不再把最新发布的工具/旧版本标成「最新发布」，仍按 dateAdded 倒序', () => {
    const html = render()
    expect(html).not.toContain('最新发布')
    expect(html.indexOf('goth_leotard_phoenix_eb28e.zip')).toBeLessThan(
      html.indexOf('thicc_goth_leotard_phoenix.zip')
    )
  })

  it('主文件置顶并标「主文件」，即使工具包发布时间更晚', () => {
    const files: GameBananaMarketFile[] = [
      {
        id: 1,
        fileName: 'cnmodfixer_faf22.zip',
        downloadUrl: 'https://gamebanana.com/dl/1',
        dateAdded: 1_793_000_000,
        description: 'CN Mod Fixer Tool'
      },
      {
        id: 2,
        fileName: '28_2d258.zip',
        downloadUrl: 'https://gamebanana.com/dl/2',
        dateAdded: 1_792_000_000,
        description: 'Main File, if unsure which to download get this one'
      }
    ]
    const html = render({ files })
    expect(html).toContain('主文件')
    expect(html).not.toContain('最新发布')
    expect(html.indexOf('28_2d258.zip')).toBeLessThan(html.indexOf('cnmodfixer_faf22.zip'))
  })

  it('单文件清单仍显示「最新发布」', () => {
    const html = render({ files: [FILES[0]] })
    expect(html).toContain('最新发布')
  })

  it('本地是人类版本号时，用线上版本串的首个 token 把主文件标成已安装', () => {
    const files: GameBananaMarketFile[] = [
      {
        id: 1,
        fileName: '28_2d258.zip',
        downloadUrl: 'https://gamebanana.com/dl/1',
        dateAdded: 1_792_000_000,
        description: 'Main File'
      },
      {
        id: 2,
        fileName: 'v46e4.zip',
        downloadUrl: 'https://gamebanana.com/dl/2',
        dateAdded: 1_792_000_000,
        description: 'EXPERIMENTAL'
      }
    ]
    const html = render({
      files,
      installedVersions: new Set<string>(),
      installedVersion: '2.8',
      remoteVersion: '2.8 | 4.6E4'
    })
    expect(html.match(/>已安装<\/span>/g)).toHaveLength(1)
    expect(html.indexOf('28_2d258.zip')).toBeLessThan(html.indexOf('已安装'))
    expect(html.indexOf('已安装')).toBeLessThan(html.indexOf('v46e4.zip'))
  })

  it('空清单区分加载中与无文件', () => {
    expect(render({ files: [], loading: true })).toContain('正在检索可下载文件清单...')
    expect(render({ files: [], loading: false })).toContain('暂无可安装的压缩文件')
  })
})
