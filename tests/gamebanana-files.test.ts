import { describe, it, expect } from 'vitest'
import { isMainGameBananaFile, pickMainGameBananaFile } from '../src/core/gamebanana-files'

describe('GameBanana 主文件判定', () => {
  it('只认描述里的 Main File', () => {
    expect(isMainGameBananaFile({ description: 'Main File, if unsure which to download get this one' })).toBe(true)
    expect(isMainGameBananaFile({ description: 'MAIN FILE' })).toBe(true)
    expect(isMainGameBananaFile({ description: 'CN Mod Fixer Tool' })).toBe(false)
    expect(isMainGameBananaFile({ description: 'EXPERIMENTAL' })).toBe(false)
    expect(isMainGameBananaFile({ description: 'Example for modders' })).toBe(false)
    expect(isMainGameBananaFile(null)).toBe(false)
  })

  it('多文件时选主文件，而不是发布时间最新的工具包', () => {
    const files = [
      { fileName: 'cnmodfixer_faf22.zip', description: 'CN Mod Fixer Tool', dateAdded: 1792117481 },
      { fileName: 'examples.zip', description: 'Example for modders', dateAdded: 1792117403 },
      { fileName: '28_2d258.zip', description: 'Main File', dateAdded: 1792091301 },
      { fileName: 'v46e4.zip', description: 'EXPERIMENTAL', dateAdded: 1792091301 }
    ]
    expect(pickMainGameBananaFile(files)?.fileName).toBe('28_2d258.zip')
  })

  it('有多份主文件时取最新的一份（作者重传会留下旧主文件）', () => {
    const files = [
      { fileName: 'oldmain.zip', description: 'Main File', dateAdded: 100 },
      { fileName: 'newmain.zip', description: 'Main File', dateAdded: 200 }
    ]
    expect(pickMainGameBananaFile(files)?.fileName).toBe('newmain.zip')
  })

  it('没有 Main File 标记时排除工具/示例/演示，取剩余文件里最新的', () => {
    const files = [
      { fileName: 'tool.zip', description: 'CN Mod Fixer Tool', dateAdded: 300 },
      { fileName: 'demo.zip', description: 'Glow demo', dateAdded: 250 },
      { fileName: 'realmod.zip', description: 'Character skin', dateAdded: 200 }
    ]
    expect(pickMainGameBananaFile(files)?.fileName).toBe('realmod.zip')
  })

  it('全部都是辅助文件时退回最新的一份', () => {
    const files = [
      { fileName: 'tool.zip', description: 'CN Mod Fixer Tool', dateAdded: 100 },
      { fileName: 'demo.zip', description: 'Glow demo', dateAdded: 200 }
    ]
    expect(pickMainGameBananaFile(files)?.fileName).toBe('demo.zip')
  })

  it('忽略已归档文件', () => {
    const files = [
      { fileName: 'oldmain.zip', description: 'Main File', dateAdded: 300, isArchived: true },
      { fileName: 'newmain.zip', description: 'Main File', dateAdded: 200, isArchived: false }
    ]
    expect(pickMainGameBananaFile(files)?.fileName).toBe('newmain.zip')
  })

  it('空列表返回 null', () => {
    expect(pickMainGameBananaFile([])).toBeNull()
    expect(pickMainGameBananaFile(null)).toBeNull()
  })
})
