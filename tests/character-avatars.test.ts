import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ModEngine } from '../src/core/mod-engine'

describe('Character Avatars & Appearances without Local Folder Dependency', () => {
  let tmpDir = ''

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-avatar-test-'))
  })

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch (_) {}
  })

  it('1. 当 modFolderPath 不存在时，仍能返回官方角色的头像映射且文件在磁盘上存在', () => {
    const nonExistentPath = 'Z:\\NonExistentPath_Test'
    const modEngine = new ModEngine(nonExistentPath)

    // 验证鸣潮 (wuwa)
    const wuwaAvatars = modEngine.getCharacterAvatars('wuwa')
    expect(Object.keys(wuwaAvatars).length).toBeGreaterThan(0)
    expect(wuwaAvatars['今汐']).toBeDefined()
    expect(wuwaAvatars['长离']).toBeDefined()
    expect(fs.existsSync(wuwaAvatars['今汐'])).toBe(true)
    expect(fs.existsSync(wuwaAvatars['长离'])).toBe(true)

    // 验证星铁 (honkai-star-rail)
    const hsrAvatars = modEngine.getCharacterAvatars('honkai-star-rail')
    expect(Object.keys(hsrAvatars).length).toBeGreaterThan(0)
    expect(hsrAvatars['黄泉']).toBeDefined()
    expect(hsrAvatars['流萤']).toBeDefined()
    expect(fs.existsSync(hsrAvatars['黄泉'])).toBe(true)
    expect(fs.existsSync(hsrAvatars['流萤'])).toBe(true)
  })

  it('2. 本地目录优先覆盖：本地自定义头像覆盖官方底图', () => {
    const localModFolder = path.join(tmpDir, 'Mods')
    const jinxiFolder = path.join(localModFolder, '今汐')
    fs.mkdirSync(jinxiFolder, { recursive: true })
    const customCoverFile = path.join(jinxiFolder, '_cover.png')
    fs.writeFileSync(customCoverFile, 'fake_png_binary_content')

    const modEngine = new ModEngine(localModFolder)
    const wuwaAvatars = modEngine.getCharacterAvatars('wuwa')

    expect(wuwaAvatars['今汐']).toBe(customCoverFile)
    expect(wuwaAvatars['今汐']).not.toContain('resources')

    // 未自定义的角色（如长离）仍走官方底图
    expect(wuwaAvatars['长离']).toBeDefined()
    expect(fs.existsSync(wuwaAvatars['长离'])).toBe(true)
  })

  it('3. 在角色本地文件夹不存在的情况下，getCharacterAppearanceSections 的 base 分区 coverUrl 指向官方封面', async () => {
    const nonExistentPath = 'Z:\\NonExistentPath_Test'
    const modEngine = new ModEngine(nonExistentPath)

    const sections = await modEngine.getCharacterAppearanceSections('今汐', 'wuwa')
    const baseSection = sections.find(s => s.id === 'base')
    expect(baseSection).toBeDefined()
    expect(baseSection?.coverUrl).not.toBeNull()
    expect(typeof baseSection?.coverUrl).toBe('string')
    if (baseSection?.coverUrl) {
      // 验证 coverUrl 对应文件在磁盘上存在
      const normalPath = baseSection.coverUrl.replace(/\//g, path.sep)
      expect(fs.existsSync(normalPath)).toBe(true)
    }
  })

  it('4. getOfficialAppearanceSections 别名解析支持：wuwa / wuthering-waves 与 hsr / honkai-star-rail', () => {
    const modEngine = new ModEngine('Z:\\NonExistentPath_Test')

    // 鸣潮官方时装解析
    const wuwaSections1 = modEngine.getOfficialAppearanceSections('今汐', 'wuwa')
    const wuwaSections2 = modEngine.getOfficialAppearanceSections('今汐', 'wuthering-waves')
    expect(wuwaSections1.length).toBeGreaterThan(0)
    expect(wuwaSections2.length).toBeGreaterThan(0)
    expect(wuwaSections1.some(s => s.nameZh === '桃夭灼灼')).toBe(true)
    expect(wuwaSections2.some(s => s.nameZh === '桃夭灼灼')).toBe(true)

    // 验证男主时装（星火永明）
    const roverSections1 = modEngine.getOfficialAppearanceSections('男主', 'wuwa')
    const roverSections2 = modEngine.getOfficialAppearanceSections('男主', 'wuthering-waves')
    expect(roverSections1.some(s => s.nameZh === '星火永明')).toBe(true)
    expect(roverSections2.some(s => s.nameZh === '星火永明')).toBe(true)

    // 星铁官方时装解析
    const hsrSections1 = modEngine.getOfficialAppearanceSections('流萤', 'hsr')
    const hsrSections2 = modEngine.getOfficialAppearanceSections('流萤', 'honkai-star-rail')
    expect(hsrSections1.length).toBeGreaterThan(0)
    expect(hsrSections2.length).toBeGreaterThan(0)
    expect(hsrSections1.some(s => s.nameZh === '春日手信')).toBe(true)
    expect(hsrSections2.some(s => s.nameZh === '春日手信')).toBe(true)
  })
})
