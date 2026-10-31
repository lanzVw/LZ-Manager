import { translateTerm, translateValueLabel } from '../../core/mod-translator-dict'

/**
 * INI 快捷键与键位映射智能解析器
 * 从 3DMigoto mod 的 .ini 内容中解析出所有 KeyBind 与触发按键
 */

export interface ParsedHotkey {
  name: string
  chineseName?: string
  description?: string
  chineseDescription?: string
  keys: string[]
  isVariable?: boolean
  type?: string
  variable?: string
  allowedValues?: string[]
  currentValue?: string
  valueLabels?: Record<string, string>
}

function formatSectionName(sec: string): string {
  if (!sec) return '快捷键'
  return sec.replace(/^Key[_\s-]*/i, '') || sec
}

// 3DMigoto 的否定修饰词只表达「要求不按该键」，不是可触发的按键；
// 白名单而非 /^no_/，避免吞掉未来可能合法的自定义 token
const NEGATED_MODIFIER_TOKEN = /^(?:no_(?:ctrl|alt|shift|modifiers))$/i

export function isNegatedModifierToken(token: string): boolean {
  return NEGATED_MODIFIER_TOKEN.test(token.trim().replace(/^[~!@#]+/, ''))
}

function formatKey(rawKey: string): string {
  const clean = rawKey.replace(/^[~!@#]/, '').trim()
  const upper = clean.toUpperCase()

  // 虚拟键码映射
  if (upper.startsWith('VK_')) {
    const vk = upper.substring(3)
    switch (vk) {
      case 'UP': return '↑'
      case 'DOWN': return '↓'
      case 'LEFT': return '←'
      case 'RIGHT': return '→'
      case 'RSHIFT': return 'R-Shift'
      case 'LSHIFT': return 'L-Shift'
      case 'SHIFT': return 'Shift'
      case 'RCONTROL':
      case 'RCTRL': return 'R-Ctrl'
      case 'LCONTROL':
      case 'LCTRL': return 'L-Ctrl'
      case 'CONTROL':
      case 'CTRL': return 'Ctrl'
      case 'RMENU':
      case 'RALT': return 'R-Alt'
      case 'LMENU':
      case 'LALT': return 'L-Alt'
      case 'MENU':
      case 'ALT': return 'Alt'
      case 'SPACE': return 'Space'
      case 'RETURN': return 'Enter'
      case 'ESCAPE': return 'Esc'
      case 'BACK': return 'Backspace'
      case 'TAB': return 'Tab'
      case 'CAPITAL': return 'Caps'
      case 'PRIOR': return 'PageUp'
      case 'NEXT': return 'PageDown'
      case 'RBUTTON': return '鼠标右键'
      case 'LBUTTON': return '鼠标左键'
      case 'MBUTTON': return '鼠标中键'
      default: return vk.length === 1 ? vk : (vk.charAt(0) + vk.slice(1).toLowerCase())
    }
  }

  // 常见手柄十六进制编码映射
  switch (upper) {
    case '0XCB': return '🎮 D-Up'
    case '0XCC': return '🎮 D-Down'
    case '0XCD': return '🎮 D-Left'
    case '0XCE': return '🎮 D-Right'
    case '0XC8': return '🎮 A'
    case '0XC9': return '🎮 B'
    case '0XCA': return '🎮 X'
    case '0XC0': return '🎮 Start'
    case '0XC1': return '🎮 Back'
    case '0XC2': return '🎮 L3'
    case '0XC3': return '🎮 R3'
    case '0XC4': return '🎮 LB'
    case '0XC5': return '🎮 RB'
  }

  // 常用普通键标准化
  const lower = clean.toLowerCase()
  switch (lower) {
    case 'alt':
    case 'lalt':
    case 'ralt': return 'Alt'
    case 'ctrl':
    case 'lctrl':
    case 'rctrl': return 'Ctrl'
    case 'shift':
    case 'lshift':
    case 'rshift': return 'Shift'
    case 'up': return '↑'
    case 'down': return '↓'
    case 'left': return '←'
    case 'right': return '→'
    case 'space': return 'Space'
    case 'enter':
    case 'return': return 'Enter'
    case 'esc':
    case 'escape': return 'Esc'
    case 'tab': return 'Tab'
    case 'backspace': return 'Backspace'
    default:
      return clean.length === 1 ? clean.toUpperCase() : (clean.charAt(0).toUpperCase() + clean.slice(1))
  }
}

export function parseIniHotkeys(iniContent: string): ParsedHotkey[] {
  if (!iniContent) return []

  const hotkeys: ParsedHotkey[] = []
  const lines = iniContent.split(/\r?\n/)

  let currentSection = ''
  let currentKeyDesc = ''
  let currentKeys: string[] = []
  let currentType = ''
  let currentVariable = ''
  let currentAllowedValues: string[] = []
  let currentValueLabels: Record<string, string> = {}

  // 常见 3DMigoto 按键行正则匹配
  const keyRegex = /^\s*key\s*=\s*(.+)$/i
  const sectionRegex = /^\s*\[(.*?)\]\s*$/
  const typeRegex = /^\s*type\s*=\s*(.+)$/i
  const varCycleRegex = /^\s*\$([a-zA-Z0-9_\\.]+)\s*=\s*([0-9a-zA-Z_,\s\-]+)$/

  const flush = () => {
    if (currentKeys.length > 0) {
      const secName = formatSectionName(currentSection)
      const chName = translateTerm(secName)
      const rawDesc = currentKeyDesc || secName
      const chDesc = currentKeyDesc ? translateTerm(currentKeyDesc) : chName

      hotkeys.push({
        name: secName,
        chineseName: chName,
        description: rawDesc,
        chineseDescription: chDesc,
        keys: currentKeys,
        type: currentType || undefined,
        variable: currentVariable || undefined,
        allowedValues: currentAllowedValues.length > 0 ? currentAllowedValues : undefined,
        valueLabels: Object.keys(currentValueLabels).length > 0 ? currentValueLabels : undefined
      })
      currentKeys = []
      currentKeyDesc = ''
      currentType = ''
      currentVariable = ''
      currentAllowedValues = []
      currentValueLabels = {}
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // 匹配 Section 标头，如 [KeyToggle], [KeySwapHair] 等
    const sectionMatch = line.match(sectionRegex)
    if (sectionMatch) {
      flush()
      currentSection = sectionMatch[1]
      continue
    }

    // 注释行提取可能包含的描述与数值含义标注 (如 ; 0: 长发, 1: 短发)
    if (line.startsWith(';') || line.startsWith('//')) {
      const comment = line.replace(/^[;//\s]+/, '').trim()
      const labelMatch = comment.match(/^([0-9]+)\s*[:=\-\s]\s*(.+)$/)
      if (labelMatch) {
        currentValueLabels[labelMatch[1]] = translateValueLabel(labelMatch[2].trim())
      } else if (comment && !comment.startsWith('---') && !currentKeyDesc) {
        currentKeyDesc = comment
      }
      continue
    }

    // 匹配 type = cycle 或 hold
    const typeMatch = line.match(typeRegex)
    if (typeMatch) {
      currentType = typeMatch[1].trim().toLowerCase()
      continue
    }

    // 匹配变量与其允许的设定值集合，如 $hair = 0, 1, 2 或 $\QAQM\Persist\Bridge_...\chest = 0, 1, 2, 3
    const varCycleMatch = line.match(varCycleRegex)
    if (varCycleMatch) {
      const fullVar = varCycleMatch[1]
      const parts = fullVar.split('\\')
      const canonicalVar = parts[parts.length - 1]
      const vals = varCycleMatch[2].split(',').map((s) => s.trim()).filter(Boolean)
      if (vals.length > 0) {
        currentVariable = canonicalVar
        currentAllowedValues = vals
      }
      continue
    }

    // 匹配 key = no_modifiers h 或 key = ctrl h 等按键指令
    const keyMatch = line.match(keyRegex)
    if (keyMatch) {
      let rawKeyVal = keyMatch[1].trim()

      // 提取行内注释，如 key = ctrl h ; toggle menu
      const commentIdx = rawKeyVal.search(/[;//]/)
      if (commentIdx !== -1) {
        const inlineComment = rawKeyVal.slice(commentIdx).replace(/^[;//\s]+/, '').trim()
        if (inlineComment && !currentKeyDesc) {
          currentKeyDesc = inlineComment
        }
        rawKeyVal = rawKeyVal.slice(0, commentIdx).trim()
      }

      // 清洗按键名称：先按 + , 与空白分词，再逐 token 过滤否定修饰词，最后格式化。
      // 顺序不能反：formatKey 会改大小写/显示名，先过滤更精确。
      const parts = rawKeyVal
        .replace(/[+,]/g, ' ')
        .split(/\s+/)
        .map((k) => k.trim())
        .filter(Boolean)
        .filter((k) => !isNegatedModifierToken(k))

      // 仅含否定词的 key 行不构成可触发快捷键：不覆盖已有真实按键，也不产出空条目
      if (parts.length > 0) {
        currentKeys = parts.map(formatKey)
      }
    }
  }

  // 收尾最后一个 Section
  flush()

  // 去重并合并
  const seen = new Set<string>()
  return hotkeys.filter((item) => {
    const keySig = `${item.name}-${item.keys.join('+')}`
    if (seen.has(keySig)) return false
    seen.add(keySig)
    return true
  })
}
