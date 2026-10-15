import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from '../src/renderer/components/ui/Button'
import { SegmentedControl } from '../src/renderer/components/ui/SegmentedControl'
import {
  ThinkingQuietDots,
  StatusBeacon,
  ActivityBadge
} from '../src/renderer/components/ui/StatusIndicators'
import { Modal } from '../src/renderer/components/ui/Modal'
import { Badge } from '../src/renderer/components/ui/Badge'

describe('CDS 原子组件与基础控件测试', () => {
  describe('Button 组件', () => {
    it('正确应用 4 级尺寸类名 (xs, sm, md, lg)', () => {
      const htmlXs = renderToStaticMarkup(
        React.createElement(Button, { size: 'xs' }, 'XS按钮')
      )
      expect(htmlXs).toContain('h-6')
      expect(htmlXs).toContain('text-[11px]')

      const htmlSm = renderToStaticMarkup(
        React.createElement(Button, { size: 'sm' }, 'SM按钮')
      )
      expect(htmlSm).toContain('h-7')
      expect(htmlSm).toContain('text-xs')

      const htmlMd = renderToStaticMarkup(
        React.createElement(Button, { size: 'md' }, 'MD按钮')
      )
      expect(htmlMd).toContain('h-8')
      expect(htmlMd).toContain('text-xs')

      const htmlLg = renderToStaticMarkup(
        React.createElement(Button, { size: 'lg' }, 'LG按钮')
      )
      expect(htmlLg).toContain('h-10')
      expect(htmlLg).toContain('text-sm')
    })

    it('正确应用 5 大变体样式与物理弹簧类', () => {
      const htmlPrimary = renderToStaticMarkup(
        React.createElement(Button, { variant: 'primary' }, '主要')
      )
      expect(htmlPrimary).toContain('bg-primary')
      expect(htmlPrimary).toContain('shadow-cds-sm')
      expect(htmlPrimary).toContain('active:scale-[0.96]')

      const htmlSecondary = renderToStaticMarkup(
        React.createElement(Button, { variant: 'secondary' }, '次要')
      )
      expect(htmlSecondary).toContain('bg-surface')
      expect(htmlSecondary).toContain('border-border/80')

      const htmlGhost = renderToStaticMarkup(
        React.createElement(Button, { variant: 'ghost' }, '幽灵')
      )
      expect(htmlGhost).toContain('bg-transparent')

      const htmlAccent = renderToStaticMarkup(
        React.createElement(Button, { variant: 'accent' }, '强调')
      )
      expect(htmlAccent).toContain('bg-accent/10')

      const htmlDanger = renderToStaticMarkup(
        React.createElement(Button, { variant: 'danger' }, '危险')
      )
      expect(htmlDanger).toContain('bg-danger/10')
    })

    it('支持 loading 与 icon 的光学对齐', () => {
      const htmlLoading = renderToStaticMarkup(
        React.createElement(Button, { loading: true }, '加载中')
      )
      expect(htmlLoading).toContain('align-neg-125')
      expect(htmlLoading).toContain('animate-spin')

      const htmlIcon = renderToStaticMarkup(
        React.createElement(Button, { icon: React.createElement('span', null, '★') }, '带图标')
      )
      expect(htmlIcon).toContain('align-neg-125')
      expect(htmlIcon).toContain('★')
    })
  })

  describe('SegmentedControl 胶囊滑块组件', () => {
    it('正确渲染选项卡与高亮滑动背景', () => {
      const items = [
        { id: 'all', label: '全部', badge: '12' },
        { id: 'enabled', label: '已启用' },
        { id: 'disabled', label: '已禁用', disabled: true }
      ]

      const html = renderToStaticMarkup(
        React.createElement(SegmentedControl, {
          items,
          value: 'all',
          onChange: () => {}
        })
      )

      expect(html).toContain('role="tablist"')
      expect(html).toContain('aria-selected="true"')
      expect(html).toContain('aria-selected="false"')
      expect(html).toContain('tabular-nums-strict')
      expect(html).toContain('calc(2px + 0 * (100% - 4px) / 3)')
    })
  })

  describe('StatusIndicators 状态组件', () => {
    it('ThinkingQuietDots 渲染 3 个静默波浪点', () => {
      const html = renderToStaticMarkup(React.createElement(ThinkingQuietDots))
      expect(html).toContain('cds-quiet-dot-1')
      expect(html).toContain('cds-quiet-dot-2')
      expect(html).toContain('cds-quiet-dot-3')
    })

    it('StatusBeacon 支持各语义状态与呼吸光晕', () => {
      const htmlOnline = renderToStaticMarkup(
        React.createElement(StatusBeacon, { status: 'online', label: '正常运行' })
      )
      expect(htmlOnline).toContain('animate-ping')
      expect(htmlOnline).toContain('正常运行')

      const htmlIdle = renderToStaticMarkup(
        React.createElement(StatusBeacon, { status: 'idle', label: '空闲' })
      )
      // idle 状态不显示 ping 动效
      expect(htmlIdle).not.toContain('animate-ping')
      expect(htmlIdle).toContain('空闲')

      const htmlClay = renderToStaticMarkup(
        React.createElement(StatusBeacon, { status: 'clay', label: '陶土主题' })
      )
      expect(htmlClay).toContain('bg-clay')
    })

    it('ActivityBadge 渲染胶囊状态小标', () => {
      const html = renderToStaticMarkup(
        React.createElement(ActivityBadge, {
          status: 'busy',
          label: '处理中 (3)',
          variant: 'surface'
        })
      )
      expect(html).toContain('tabular-nums-strict')
      expect(html).toContain('处理中 (3)')
      expect(html).toContain('shadow-cds-sm')
    })
  })

  describe('Modal 模态弹窗组件', () => {
    it('isOpen 为 false 时返回 null', () => {
      const html = renderToStaticMarkup(
        React.createElement(Modal, {
          isOpen: false,
          onClose: () => {},
          title: '测试标题'
        })
      )
      expect(html).toBe('')
    })

    it('isOpen 为 true 时渲染 CDS 遮罩、圆角与排版类', () => {
      const html = renderToStaticMarkup(
        React.createElement(Modal, {
          isOpen: true,
          onClose: () => {},
          title: '系统提示',
          description: '这是一段测试说明',
          variant: 'warning'
        })
      )
      expect(html).toContain('bg-black/45')
      expect(html).toContain('backdrop-blur-sm')
      expect(html).toContain('rounded-2xl')
      expect(html).toContain('shadow-popover')
      expect(html).toContain('text-balance-native')
      expect(html).toContain('text-pretty-native')
      expect(html).toContain('align-neg-125')
    })
  })

  describe('Badge 组件', () => {
    it('包含 tabular-nums-strict 并支持 clay 变体', () => {
      const htmlClay = renderToStaticMarkup(
        React.createElement(Badge, { variant: 'clay' }, '99+')
      )
      expect(htmlClay).toContain('tabular-nums-strict')
      expect(htmlClay).toContain('bg-clay/10')
      expect(htmlClay).toContain('text-clay')
    })
  })
})
