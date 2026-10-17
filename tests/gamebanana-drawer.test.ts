import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GameBananaDetailDrawer } from '../src/renderer/components/GameBananaDetailDrawer'

describe('GameBananaDetailDrawer 抽屉组件测试', () => {
  beforeEach(() => {
    // 模拟 window.flairx 接口
    ;(globalThis as any).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      flairx: {
        getGameBananaDetails: vi.fn().mockResolvedValue(null),
        searchGameBanana: vi.fn().mockResolvedValue({ records: [] }),
        installGameBananaMod: vi.fn().mockResolvedValue({ success: true }),
        cancelGameBananaInstall: vi.fn().mockResolvedValue({ success: true }),
        onInstallProgress: vi.fn().mockReturnValue(() => {}),
        detectGameBananaCharacter: vi.fn().mockResolvedValue(null),
        getGameBananaCharacters: vi.fn().mockResolvedValue([]),
        translateText: vi.fn().mockResolvedValue(null)
      }
    }
  })

  it('1. 当 isOpen 为 false 时，不渲染任何 DOM', () => {
    const html = renderToStaticMarkup(
      React.createElement(GameBananaDetailDrawer, {
        isOpen: false,
        onClose: vi.fn(),
        modId: 123456
      })
    )
    expect(html).toBe('')
  })

  it('2. 当 isOpen 为 true 时，渲染抽屉遮罩与容器容器结构', () => {
    const html = renderToStaticMarkup(
      React.createElement(GameBananaDetailDrawer, {
        isOpen: true,
        onClose: vi.fn(),
        modId: 123456
      })
    )

    // 遮罩层及动画
    expect(html).toContain('fixed inset-0 z-50 bg-black/50 backdrop-blur-xs')
    // 抽屉容器
    expect(html).toContain('w-full max-w-xl h-full bg-surface border-l border-border')
    // 初始标题
    expect(html).toContain('市场模组详情')
  })

  it('3. 抽屉提供关闭按钮', () => {
    const html = renderToStaticMarkup(
      React.createElement(GameBananaDetailDrawer, {
        isOpen: true,
        onClose: vi.fn(),
        modId: 123456
      })
    )

    expect(html).toContain('<button type="button"')
    // 包含 lucide-x svg
    expect(html).toContain('svg')
  })
})
