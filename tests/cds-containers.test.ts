import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Composer, handleComposerKeyDown } from '../src/renderer/components/ui/Composer'
import { ThinkingAccordion } from '../src/renderer/components/ui/ThinkingAccordion'
import { MessageBubble } from '../src/renderer/components/ui/MessageBubble'
import { ToolActionCard } from '../src/renderer/components/ui/ToolActionCard'
import {
  ScrollContainer,
  computeScrollFadeMask
} from '../src/renderer/components/ui/ScrollContainer'

describe('CDS 会话核心流与容器交互重构测试', () => {
  describe('Composer 核心输入终端组件', () => {
    it('正确渲染 20px 圆角与双环微弥散阴影类名', () => {
      const html = renderToStaticMarkup(
        React.createElement(Composer, {
          value: '测试消息',
          onChange: () => {},
          onSend: () => {},
          placeholder: '输入内容...'
        })
      )

      expect(html).toContain('rounded-[20px]')
      expect(html).toContain('cds-composer-shadow')
      expect(html).toContain('placeholder="输入内容..."')
      expect(html).toContain('测试消息')
      expect(html).toContain('align-neg-125')
    })

    it('支持左侧 actionsLeft 插槽与 loading 状态', () => {
      const leftAction = React.createElement('span', { id: 'file-upload' }, '附件')
      const html = renderToStaticMarkup(
        React.createElement(Composer, {
          value: '',
          onChange: () => {},
          onSend: () => {},
          actionsLeft: leftAction,
          loading: true
        })
      )

      expect(html).toContain('id="file-upload"')
      expect(html).toContain('animate-spin')
      expect(html).toContain('disabled=""')
    })

    it('CJK IME 合成双重互锁守卫拦截拼音选词回车', () => {
      const onSend = vi.fn()
      const preventDefault = vi.fn()

      // 1. isComposing = true（输入法合成中）时按下回车 -> 拦截，不触发 onSend
      const composingEvent = {
        key: 'Enter',
        keyCode: 13,
        shiftKey: false,
        nativeEvent: { isComposing: true },
        preventDefault
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>

      const result1 = handleComposerKeyDown(composingEvent, 'nih', false, onSend)
      expect(result1).toBe(false)
      expect(onSend).not.toHaveBeenCalled()
      expect(preventDefault).not.toHaveBeenCalled()

      // 2. keyCode = 229（某些环境下的输入法标志）时按下回车 -> 拦截
      const imeKeyCodeEvent = {
        key: 'Enter',
        keyCode: 229,
        shiftKey: false,
        nativeEvent: {},
        preventDefault
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>

      const result2 = handleComposerKeyDown(imeKeyCodeEvent, '你好', false, onSend)
      expect(result2).toBe(false)
      expect(onSend).not.toHaveBeenCalled()

      // 3. Shift + Enter -> 允许换行，不触发 onSend
      const shiftEnterEvent = {
        key: 'Enter',
        keyCode: 13,
        shiftKey: true,
        nativeEvent: { isComposing: false },
        preventDefault
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>

      const result3 = handleComposerKeyDown(shiftEnterEvent, '第一行', false, onSend)
      expect(result3).toBe(false)
      expect(onSend).not.toHaveBeenCalled()

      // 4. 输入仅为空格 -> 不触发 onSend
      const emptySpaceEvent = {
        key: 'Enter',
        keyCode: 13,
        shiftKey: false,
        nativeEvent: { isComposing: false },
        preventDefault
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>

      const result4 = handleComposerKeyDown(emptySpaceEvent, '   ', false, onSend)
      expect(result4).toBe(false)
      expect(onSend).not.toHaveBeenCalled()

      // 5. disabled = true 时按下回车 -> 拦截
      const disabledEvent = {
        key: 'Enter',
        keyCode: 13,
        shiftKey: false,
        nativeEvent: { isComposing: false },
        preventDefault
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>

      const result5 = handleComposerKeyDown(disabledEvent, '有效消息', true, onSend)
      expect(result5).toBe(false)
      expect(onSend).not.toHaveBeenCalled()

      // 6. 正常发送：非合成状态按下 Enter -> 触发 preventDefault 与 onSend('有效消息')
      const validEnterEvent = {
        key: 'Enter',
        keyCode: 13,
        shiftKey: false,
        nativeEvent: { isComposing: false },
        preventDefault
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>

      const result6 = handleComposerKeyDown(validEnterEvent, '有效消息', false, onSend)
      expect(result6).toBe(true)
      expect(preventDefault).toHaveBeenCalled()
      expect(onSend).toHaveBeenCalledWith('有效消息')
    })
  })

  describe('ThinkingAccordion 思考折叠面板组件', () => {
    it('折叠态渲染 grid-template-rows: 0fr 与 aria-expanded="false"', () => {
      const html = renderToStaticMarkup(
        React.createElement(ThinkingAccordion, {
          title: '修复推理',
          isOpen: false,
          logs: ['分析依赖...', '匹配哈希值...']
        })
      )

      expect(html).toContain('修复推理')
      expect(html).toContain('aria-expanded="false"')
      expect(html).toContain('grid-template-rows:0fr')
      expect(html).toContain('transition-[grid-template-rows]')
      expect(html).toContain('rotate-0')
      expect(html).toContain('分析依赖...')
    })

    it('展开态渲染 grid-template-rows: 1fr 与 rotate-90 图标', () => {
      const html = renderToStaticMarkup(
        React.createElement(ThinkingAccordion, {
          title: '推理过程',
          isOpen: true,
          statusText: '耗时 1.2s'
        })
      )

      expect(html).toContain('aria-expanded="true"')
      expect(html).toContain('grid-template-rows:1fr')
      expect(html).toContain('rotate-90')
      expect(html).toContain('耗时 1.2s')
    })

    it('isThinking 激活时渲染 ThinkingQuietDots 静默波浪点', () => {
      const html = renderToStaticMarkup(
        React.createElement(ThinkingAccordion, {
          isThinking: true,
          statusText: '思考中...'
        })
      )

      expect(html).toContain('cds-quiet-dot-1')
      expect(html).toContain('cds-quiet-dot-2')
      expect(html).toContain('cds-quiet-dot-3')
      expect(html).toContain('思考中...')
    })
  })

  describe('MessageBubble 消息气泡组件', () => {
    it('用户气泡挂载入场动效、非对称圆角与 Surface 2 底色', () => {
      const html = renderToStaticMarkup(
        React.createElement(MessageBubble, {
          role: 'user',
          content: '请帮我部署 3dmigoto 环境',
          timestamp: '14:20'
        })
      )

      expect(html).toContain(
        'animate-[code-user-bubble-enter_200ms_cubic-bezier(.34,1.3,.64,1)]'
      )
      expect(html).toContain('rounded-[18px]')
      expect(html).toContain('rounded-br-[4px]')
      expect(html).toContain('bg-surface-2')
      expect(html).toContain('text-pretty-native')
      expect(html).toContain('overflow-wrap-safe')
      expect(html).toContain('14:20')
    })

    it('助手消息挂载阶梯浮现动效与原生排版类', () => {
      const html = renderToStaticMarkup(
        React.createElement(MessageBubble, {
          role: 'assistant',
          content: '已为您检测到目标路径，即将开始注入。'
        })
      )

      expect(html).toContain('animate-[message-fade-up_250ms_ease-out]')
      expect(html).toContain('text-pretty-native')
      expect(html).toContain('overflow-wrap-safe')
      expect(html).toContain('已为您检测到目标路径')
    })

    it('系统消息以居中胶囊格式展示', () => {
      const html = renderToStaticMarkup(
        React.createElement(MessageBubble, {
          role: 'system',
          content: '游戏进程已连接 (PID: 12084)'
        })
      )

      expect(html).toContain('bg-surface-1')
      expect(html).toContain('rounded-full')
      expect(html).toContain('游戏进程已连接')
    })
  })

  describe('ToolActionCard 审批卡片组件', () => {
    it('渲染类别标签与不同状态徽章', () => {
      const htmlPending = renderToStaticMarkup(
        React.createElement(ToolActionCard, {
          category: 'DEPLOYMENT ACTION',
          title: '应用 3DMigoto Loader',
          status: 'pending'
        })
      )
      expect(htmlPending).toContain('DEPLOYMENT ACTION')
      expect(htmlPending).toContain('PENDING APPROVAL')
      expect(htmlPending).toContain('应用 3DMigoto Loader')

      const htmlCompleted = renderToStaticMarkup(
        React.createElement(ToolActionCard, {
          title: 'Hash 签名修复',
          status: 'completed'
        })
      )
      expect(htmlCompleted).toContain('COMPLETED')
      expect(htmlCompleted).toContain('bg-success/10')
    })

    it('包含取消 (secondary) 与实心主色批准 (primary) 按钮', () => {
      const html = renderToStaticMarkup(
        React.createElement(ToolActionCard, {
          title: '删除旧版本缓存',
          onCancel: () => {},
          onApprove: () => {},
          approveText: '确认清理',
          cancelText: '放弃'
        })
      )

      expect(html).toContain('放弃')
      expect(html).toContain('确认清理')
      // Button 变体类名验证
      expect(html).toContain('bg-surface') // secondary
      expect(html).toContain('bg-primary') // primary
      expect(html).toContain('active:scale-[0.96]') // 物理弹簧阻尼
    })

    it('代码/参数预览区使用 Grid 0fr/1fr 弹性过渡', () => {
      const htmlCollapsed = renderToStaticMarkup(
        React.createElement(ToolActionCard, {
          title: '执行脚本',
          code: 'rm -rf ./temp',
          isExpanded: false
        })
      )
      expect(htmlCollapsed).toContain('grid-template-rows:0fr')
      expect(htmlCollapsed).toContain('rm -rf ./temp')

      const htmlExpanded = renderToStaticMarkup(
        React.createElement(ToolActionCard, {
          title: '执行脚本',
          code: 'rm -rf ./temp',
          isExpanded: true
        })
      )
      expect(htmlExpanded).toContain('grid-template-rows:1fr')
    })
  })

  describe('ScrollContainer 与边界渐隐算法', () => {
    it('渲染 .cds-scroll-fade-mask 遮罩类名与初始变量', () => {
      const html = renderToStaticMarkup(
        React.createElement(ScrollContainer, { fadeSize: 24 }, '可滚动列表内容')
      )

      expect(html).toContain('cds-scroll-fade-mask')
      expect(html).toContain('--cds-scroll-fade-top:0px')
      expect(html).toContain('--cds-scroll-fade-bottom:24px')
    })

    it('computeScrollFadeMask 正确计算 7 阶非线性边界渐隐', () => {
      // 1. 内容无需滚动 (scrollHeight <= clientHeight)：两端均为 0px
      const maskNoScroll = computeScrollFadeMask(0, 500, 400, 24)
      expect(maskNoScroll).toEqual({ top: '0px', bottom: '0px' })

      // 2. 位于顶部 (scrollTop <= 1)：顶部 0px，底部 24px
      const maskAtTop = computeScrollFadeMask(0, 400, 1000, 24)
      expect(maskAtTop).toEqual({ top: '0px', bottom: '24px' })

      // 3. 滚动到中间：两端均呈现 24px 渐隐
      const maskMiddle = computeScrollFadeMask(200, 400, 1000, 24)
      expect(maskMiddle).toEqual({ top: '24px', bottom: '24px' })

      // 4. 触达底部 (scrollTop + clientHeight >= scrollHeight - 1)：顶部 24px，底部 0px
      const maskAtBottom = computeScrollFadeMask(600, 400, 1000, 24)
      expect(maskAtBottom).toEqual({ top: '24px', bottom: '0px' })
    })
  })
})
