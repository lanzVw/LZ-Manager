import type { ParsedHotkey } from './iniParser'

/**
 * 快捷键展示层的纯函数工具
 * 主窗口（ModDetailPage）与悬浮窗（OverlayApp）共用，避免两套逻辑漂移
 */

// formatKey 产出的修饰键显示名：Ctrl / L-Ctrl / R-Shift / Alt / Win 等
const MODIFIER_KEY_RE = /^(?:[lr][-_]?)?(?:ctrl|control|shift|alt|menu|win)$/i

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEY_RE.test(key.trim().replace(/^[~!@#]+/, ''))
}

// 主进程无法注入鼠标与手柄按键，UI 据此禁用模拟按钮并给出提示
export function isNonKeyboardKey(key: string): boolean {
  return key.includes('🎮') || key.includes('鼠标') || key.includes('Button')
}

export function isNonKeyboardHotkey(keys: readonly string[]): boolean {
  return keys.some(isNonKeyboardKey)
}

const normalizeLabel = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * 只在描述确实提供额外信息时返回它。
 * 解析器在 section 无注释时会把名称回填成描述，且中英文大小写不一致，
 * 直接渲染会出现「Hold / hold」这类重复行。
 */
export function getHotkeyDescription(
  h: Pick<ParsedHotkey, 'name' | 'chineseName' | 'description' | 'chineseDescription'>
): string | null {
  const names = [h.chineseName, h.name]
    .filter((v): v is string => Boolean(v?.trim()))
    .map(normalizeLabel)

  const candidates = [h.chineseDescription, h.description].filter((v): v is string => Boolean(v?.trim()))

  for (const candidate of candidates) {
    if (!names.includes(normalizeLabel(candidate))) return candidate.trim()
  }
  return null
}

const TYPE_LABELS: Record<string, string> = {
  hold: '长按',
  cycle: '循环',
  toggle: '切换'
}

export function getHotkeyTypeLabel(type?: string): string | null {
  if (!type) return null
  return TYPE_LABELS[type.toLowerCase()] ?? null
}
