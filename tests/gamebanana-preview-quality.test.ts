import { describe, it, expect, vi, afterEach } from 'vitest'
import { getModDetails } from '../src/core/gamebanana-service'

/**
 * 回归来源：用户反馈「补充下载的截图很模糊」。
 * 实测 Velina Sportswear（modId 730473）的 7 张截图里，只有第 1 张有 530/800 变体，
 * 其余 6 张只有 100×134 缩略图。旧逻辑 previewImages 取 medUrl，
 * 于是补全下来的图全是 100px 的糊图，而原图 _sFile 实际是 802×1078。
 */

const BASE = 'https://images.gamebanana.com/img/ss/mods'

/** 构造一张图：variants 决定提供哪些尺寸变体 */
function makeImage(id: string, variants: string[]) {
  const img: any = { _sType: 'screenshot', _sBaseUrl: BASE, _sFile: id }
  if (variants.includes('100')) {
    img._sFile100 = `100-90_${id}`
    img._wFile100 = 100
    img._hFile100 = 134
  }
  if (variants.includes('220')) {
    img._sFile220 = `220-90_${id}`
    img._wFile220 = 220
    img._hFile220 = 124
  }
  if (variants.includes('530')) {
    img._sFile530 = `530-90_${id}`
    img._wFile530 = 530
    img._hFile530 = 298
  }
  if (variants.includes('800')) {
    img._sFile800 = `800-90_${id}`
    img._wFile800 = 800
    img._hFile800 = 450
  }
  return img
}

function stubDetails(images: any[]) {
  vi.stubGlobal('fetch', async () => {
    const payload = {
      _idRow: 730473,
      _sName: 'Velina Sportswear',
      _aPreviewMedia: { _aImages: images },
      _aFiles: [],
      _aSubmitter: { _sName: 'someone' }
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('市场截图 URL 选择：必须用原图', () => {
  it('只有 100px 缩略图的图，previewImages 仍给出原图地址', async () => {
    stubDetails([makeImage('a.jpg', ['100']), makeImage('b.jpg', ['100'])])
    const info = await getModDetails({ itemType: 'Mod', itemId: 730473 })
    // 关键断言：不能是 100-90_ 开头的缩略图
    for (const url of info.previewImages) {
      expect(url).not.toContain('100-90_')
    }
    expect(info.previewImages).toEqual([`${BASE}/a.jpg`, `${BASE}/b.jpg`])
  })

  it('有 530 变体的图，previewImages 依然取原图而非 530', async () => {
    stubDetails([makeImage('c.jpg', ['100', '530'])])
    const info = await getModDetails({ itemType: 'Mod', itemId: 730473 })
    expect(info.previewImages[0]).toBe(`${BASE}/c.jpg`)
    expect(info.previewImages[0]).not.toContain('530-90_')
  })

  it('medUrl 优先 800 而不是 530（用于列表缩略展示）', async () => {
    stubDetails([makeImage('d.jpg', ['100', '530', '800'])])
    const info = await getModDetails({ itemType: 'Mod', itemId: 730473 })
    expect(info.images[0].medUrl).toBe(`${BASE}/800-90_d.jpg`)
  })

  it('缺 800 时 medUrl 退回 530', async () => {
    stubDetails([makeImage('e.jpg', ['100', '530'])])
    const info = await getModDetails({ itemType: 'Mod', itemId: 730473 })
    expect(info.images[0].medUrl).toBe(`${BASE}/530-90_e.jpg`)
  })

  it('previewImage（首图）仍走 medUrl，供卡片展示', async () => {
    stubDetails([makeImage('f.jpg', ['100', '530', '800'])])
    const info = await getModDetails({ itemType: 'Mod', itemId: 730473 })
    expect(info.previewImage).toBe(`${BASE}/800-90_f.jpg`)
  })

  it('原图字段缺失时回退，不会产出空字符串', async () => {
    const broken: any = { _sType: 'screenshot', _sBaseUrl: BASE, _sFile: '' }
    broken._sFile100 = '100-90_x.jpg'
    stubDetails([broken])
    const info = await getModDetails({ itemType: 'Mod', itemId: 730473 })
    expect(info.previewImages.length).toBe(1)
    expect(info.previewImages[0]).not.toBe('')
  })
})

/**
 * 回归来源：市场列表 30 张卡片首图走 medUrl（530/800 档）实测共 2.71 MB，
 * 而卡片渲染宽度只有 200–260px，220 档只要 0.53 MB。
 * cardUrl 专供列表卡片，medUrl/previewImage 的语义保持不变（详情大图仍要清晰）。
 */
describe('列表卡片图档位：cardUrl 走 220，2x 档走 530', () => {
  it('有 220 变体时 cardUrl 取 220', async () => {
    stubDetails([makeImage('g.jpg', ['100', '220', '530', '800'])])
    const info = await getModDetails({ itemType: 'Mod', itemId: 730473 })
    expect(info.images[0].cardUrl).toBe(`${BASE}/220-90_g.jpg`)
  })

  it('2x 档取 530，供 HiDPI 屏升档', async () => {
    stubDetails([makeImage('h.jpg', ['100', '220', '530', '800'])])
    const info = await getModDetails({ itemType: 'Mod', itemId: 730473 })
    expect(info.images[0].cardUrl2x).toBe(`${BASE}/530-90_h.jpg`)
  })

  it('没有 220 时 cardUrl 退回 530，不会掉到 100', async () => {
    stubDetails([makeImage('i.jpg', ['100', '530'])])
    const info = await getModDetails({ itemType: 'Mod', itemId: 730473 })
    expect(info.images[0].cardUrl).toBe(`${BASE}/530-90_i.jpg`)
    expect(info.images[0].cardUrl).not.toContain('100-90_')
  })

  it('cardUrl 不影响 previewImage / medUrl 的老语义', async () => {
    stubDetails([makeImage('j.jpg', ['100', '220', '530', '800'])])
    const info = await getModDetails({ itemType: 'Mod', itemId: 730473 })
    // 详情与安装流程仍取大图
    expect(info.previewImage).toBe(`${BASE}/800-90_j.jpg`)
    expect(info.images[0].medUrl).toBe(`${BASE}/800-90_j.jpg`)
    expect(info.previewImages[0]).toBe(`${BASE}/j.jpg`)
  })
})
