import { describe, it, expect } from 'vitest'
import {
  applyModRenames,
  applyRenameToItem,
  buildToggleRenames,
  remapMarkedMods,
  remapModDetailsPaths,
  remapPathPrefix,
  samePath,
  setModEnabledByFullPath
} from '../src/renderer/utils/mods-patch'
import type { ModDetailedInfo, ModItem } from '../src/core/types'

const OLD_ROOT = 'C:\\Mods\\Char\\Name'

const mod = (overrides: Partial<ModItem> = {}): ModItem => ({
  id: 'Char::Name',
  name: 'Name',
  folderName: 'Name',
  characterName: 'Char',
  enabled: true,
  coverPath: `${OLD_ROOT}\\cover.png`,
  previewImages: [`${OLD_ROOT}\\.lz_images\\market_01.png`],
  fullPath: OLD_ROOT,
  hasIni: true,
  mtime: 123,
  ...overrides
})

describe('samePath / remapPathPrefix', () => {
  it('分隔符与大小写不敏感', () => {
    expect(samePath('C:/Mods/Char/Name', 'c:\\mods\\char\\name')).toBe(true)
    expect(samePath('C:\\Mods\\Char\\Name', 'C:\\Mods\\Char\\Other')).toBe(false)
    expect(samePath(null, 'C:\\Mods')).toBe(false)
  })

  it('替换目录前缀时保留原文件名大小写', () => {
    expect(remapPathPrefix(`${OLD_ROOT}\\.lz_images\\Market_01.PNG`, OLD_ROOT, `${OLD_ROOT}\\DISABLED_Name`))
      .toBe(`${OLD_ROOT}\\DISABLED_Name\\.lz_images\\Market_01.PNG`)
  })

  it('路径等于旧根时直接返回新根', () => {
    expect(remapPathPrefix(OLD_ROOT, OLD_ROOT, `${OLD_ROOT}\\DISABLED_Name`)).toBe(`${OLD_ROOT}\\DISABLED_Name`)
  })

  it('不在前缀内的路径原样返回', () => {
    expect(remapPathPrefix('D:\\Other\\cover.png', OLD_ROOT, 'C:\\New')).toBe('D:\\Other\\cover.png')
    // 相似前缀不能误匹配：Name2 不是 Name 的子目录
    expect(remapPathPrefix(`${OLD_ROOT}2\\cover.png`, OLD_ROOT, 'C:\\New')).toBe(`${OLD_ROOT}2\\cover.png`)
  })
})

describe('setModEnabledByFullPath', () => {
  it('按 fullPath 跨桶查找，不依赖 raw characterName 与桶键一致', () => {
    const data = { '官方角色名': [mod()] }
    const next = setModEnabledByFullPath(data, OLD_ROOT, false)
    expect(next).not.toBeNull()
    expect(next!['官方角色名'][0].enabled).toBe(false)
    expect(data['官方角色名'][0].enabled).toBe(true)
  })

  it('状态已经正确时返回原对象，避免多余渲染', () => {
    const data = { Char: [mod({ enabled: false })] }
    expect(setModEnabledByFullPath(data, OLD_ROOT, false)).toBe(data)
  })

  it('找不到目标时返回 null', () => {
    expect(setModEnabledByFullPath({ Char: [mod()] }, 'C:\\Missing', true)).toBeNull()
  })
})

describe('buildToggleRenames', () => {
  it('目标在前、兄弟在后，并去重', () => {
    const renames = buildToggleRenames(OLD_ROOT, {
      newFullPath: `${OLD_ROOT}\\DISABLED_Name`,
      disabledSiblings: [
        { name: 'Sibling', oldFullPath: 'C:\\Mods\\Char\\Sibling', newFullPath: 'C:\\Mods\\Char\\DISABLED_Sibling' },
        { name: 'Dup', oldFullPath: 'C:\\Mods\\Char\\Sibling', newFullPath: 'C:\\Mods\\Char\\DISABLED_Sibling' }
      ]
    }, true)

    expect(renames).toHaveLength(2)
    expect(renames[0].oldFullPath).toBe(OLD_ROOT)
    expect(renames[0].enabled).toBe(true)
    expect(renames[1].newFullPath).toBe('C:\\Mods\\Char\\DISABLED_Sibling')
    expect(renames[1].enabled).toBe(false)
  })

  it('缺少 newFullPath 时不产生目标改名', () => {
    expect(buildToggleRenames(OLD_ROOT, {}, true)).toHaveLength(0)
  })
})

describe('applyRenameToItem', () => {
  it('停用改名同步 enabled / folderName / fullPath / 图片路径', () => {
    const next = applyRenameToItem(mod(), {
      oldFullPath: OLD_ROOT,
      newFullPath: `${OLD_ROOT}\\DISABLED_Name`,
      enabled: false
    })

    expect(next.enabled).toBe(false)
    expect(next.folderName).toBe('DISABLED_Name')
    expect(next.name).toBe('Name')
    expect(next.id).toBe('Char::Name')
    expect(next.fullPath).toBe(`${OLD_ROOT}\\DISABLED_Name`)
    expect(next.coverPath).toBe(`${OLD_ROOT}\\DISABLED_Name\\cover.png`)
    expect(next.previewImages[0]).toBe(`${OLD_ROOT}\\DISABLED_Name\\.lz_images\\market_01.png`)
    expect(next.mtime).toBe(123)
  })

  it('启用改名剥掉所有 DISABLED_ 前缀', () => {
    const next = applyRenameToItem(
      mod({ enabled: false, folderName: 'DISABLED_DISABLED_Name', fullPath: `${OLD_ROOT}\\DISABLED_DISABLED_Name` }),
      {
        oldFullPath: `${OLD_ROOT}\\DISABLED_DISABLED_Name`,
        newFullPath: `${OLD_ROOT}\\DISABLED_Name`,
        enabled: true
      }
    )
    expect(next.name).toBe('Name')
    expect(next.folderName).toBe('DISABLED_Name')
    expect(next.enabled).toBe(true)
  })

  it('coverPath 为 null、预览图在目录外时保持原值', () => {
    const next = applyRenameToItem(
      mod({ coverPath: null, previewImages: ['D:\\Shared\\x.png'] }),
      { oldFullPath: OLD_ROOT, newFullPath: `${OLD_ROOT}\\DISABLED_Name`, enabled: false }
    )
    expect(next.coverPath).toBeNull()
    expect(next.previewImages[0]).toBe('D:\\Shared\\x.png')
  })
})

describe('applyModRenames', () => {
  it('目标与兄弟跨桶一起更新，未命中条目保持引用', () => {
    const target = mod()
    const sibling = mod({
      id: 'Char::Sibling',
      name: 'Sibling',
      folderName: 'Sibling',
      fullPath: 'C:\\Mods\\Char\\Sibling',
      coverPath: 'C:\\Mods\\Char\\Sibling\\cover.png',
      previewImages: []
    })
    const untouched = mod({ id: 'Other::X', fullPath: 'C:\\Mods\\Other\\X' })
    const data = { Char: [target, sibling], Other: [untouched] }

    const next = applyModRenames(data, [
      { oldFullPath: OLD_ROOT, newFullPath: `${OLD_ROOT}\\DISABLED_Name`, enabled: false },
      { oldFullPath: 'C:\\Mods\\Char\\Sibling', newFullPath: 'C:\\Mods\\Char\\DISABLED_Sibling', enabled: false }
    ])

    expect(next).not.toBe(data)
    expect(next.Char[0].fullPath).toBe(`${OLD_ROOT}\\DISABLED_Name`)
    expect(next.Char[1].fullPath).toBe('C:\\Mods\\Char\\DISABLED_Sibling')
    expect(next.Other).toBe(data.Other)
    expect(data.Char[0].fullPath).toBe(OLD_ROOT)
  })

  it('没有任何条目命中时返回原对象，供调用方判断是否回退扫描', () => {
    const data = { Char: [mod()] }
    expect(applyModRenames(data, [{ oldFullPath: 'C:\\Missing', newFullPath: 'C:\\New', enabled: false }])).toBe(data)
  })
})

describe('remapMarkedMods', () => {
  it('旧 key 迁到新 key 并保留 false 值', () => {
    const next = remapMarkedMods(
      { [OLD_ROOT]: true, 'C:\\Mods\\Char\\Sibling': false, 'C:\\Keep': true },
      [
        { oldFullPath: OLD_ROOT, newFullPath: `${OLD_ROOT}\\DISABLED_Name`, enabled: false },
        { oldFullPath: 'C:\\Mods\\Char\\Sibling', newFullPath: 'C:\\Mods\\Char\\DISABLED_Sibling', enabled: false }
      ]
    )
    expect(next[`${OLD_ROOT}\\DISABLED_Name`]).toBe(true)
    expect(next['C:\\Mods\\Char\\DISABLED_Sibling']).toBe(false)
    expect(next['C:\\Keep']).toBe(true)
    expect(next[OLD_ROOT]).toBeUndefined()
  })

  it('两个旧 key 撞到同一个新 key 时 true 优先', () => {
    const next = remapMarkedMods(
      { 'C:\\A': false, 'C:\\B': true },
      [
        { oldFullPath: 'C:\\A', newFullPath: 'C:\\New', enabled: false },
        { oldFullPath: 'C:\\B', newFullPath: 'C:\\New', enabled: false }
      ]
    )
    expect(next['C:\\New']).toBe(true)
  })

  it('没有 key 移动时返回原对象', () => {
    const marked = { 'C:\\Keep': true }
    expect(remapMarkedMods(marked, [{ oldFullPath: 'C:\\Missing', newFullPath: 'C:\\New', enabled: false }])).toBe(marked)
  })
})

describe('remapModDetailsPaths', () => {
  it('详情页所有绝对路径跟随目录改名', () => {
    const details: ModDetailedInfo = {
      id: 'Char::Name',
      name: 'Name',
      folderName: 'Name',
      characterName: 'Char',
      enabled: true,
      fullPath: OLD_ROOT,
      images: [{ path: `${OLD_ROOT}\\cover.png`, name: 'cover.png', isCover: true }],
      coverPath: `${OLD_ROOT}\\cover.png`,
      iniFiles: [{ name: 'mod.ini', fullPath: `${OLD_ROOT}\\mod.ini`, size: 10 }],
      totalSize: 10,
      fileCount: 1,
      mtime: 1,
      birthtime: 1,
      metadata: {},
      baseModInfo: {
        isBaseMod: true,
        namespace: 'Test',
        explicit: false,
        shaderCache: {
          installed: true,
          active: true,
          value: '1',
          activePath: `${OLD_ROOT}\\ShaderCacheSettings.ini`,
          templatePath: `${OLD_ROOT}\\DISABLED\\ShaderCacheSettings.ini`
        }
      }
    }

    const next = remapModDetailsPaths(details, OLD_ROOT, `${OLD_ROOT}\\DISABLED_Name`)
    expect(next.fullPath).toBe(`${OLD_ROOT}\\DISABLED_Name`)
    expect(next.coverPath).toBe(`${OLD_ROOT}\\DISABLED_Name\\cover.png`)
    expect(next.images[0].path).toBe(`${OLD_ROOT}\\DISABLED_Name\\cover.png`)
    expect(next.iniFiles[0].fullPath).toBe(`${OLD_ROOT}\\DISABLED_Name\\mod.ini`)
    expect(next.baseModInfo!.shaderCache.activePath).toBe(`${OLD_ROOT}\\DISABLED_Name\\ShaderCacheSettings.ini`)
    expect(next.baseModInfo!.shaderCache.templatePath).toBe(`${OLD_ROOT}\\DISABLED_Name\\DISABLED\\ShaderCacheSettings.ini`)
    expect(next.metadata).toBe(details.metadata)
  })
})
