/**
 * 3DMigoto 专有中英文词汇映射高精词典 (纯函数与数据，不依赖 Node.js 内置模块)
 * 可在主进程 (Node.js) 与渲染进程 (Vite/Browser) 双端通用
 */

export const MIGOTO_DICTIONARY: Record<string, string> = {
  // --- 外观与身体部位 ---
  hair: '发型',
  hairstyle: '发型',
  bangs: '刘海',
  front: '刘海',
  hair_f: '刘海',
  hair_front: '刘海',
  ponytail: '马尾',
  twintail: '双马尾',
  twintails: '双马尾',
  braid: '编发',
  braids: '编发',
  head: '头部',
  headwear: '头饰',
  hat: '帽子',
  cap: '鸭舌帽',
  beret: '贝雷帽',
  hood: '兜帽',
  helmet: '头盔',
  face: '面部',
  eyes: '眼睛',
  eye: '眼睛',
  eyepatch: '眼罩',
  glasses: '眼镜',
  sunglasses: '墨镜',
  mask: '面具',
  veil: '面纱',
  ears: '兽耳',
  ear: '兽耳',
  horns: '角',
  horn: '角',
  tail: '尾巴',
  wings: '翅膀',
  wing: '翅膀',
  jacket: '外套',
  coat: '大衣',
  blazer: '西装',
  cardigan: '开衫',
  hoodie: '卫衣',
  cape: '披风',
  cloak: '斗篷',
  shirt: '衬衫',
  cloth: '服装',
  clothes: '服装',
  clothing: '服装',
  top: '上装',
  tops: '上装',
  blouse: '罩衫',
  sweater: '毛衣',
  vest: '背心',
  belt: '腰带',
  belts: '腰带',
  hsos: '鞋袜',
  bra: '文胸',
  corset: '束腰',
  dress: '连衣裙',
  onepiece: '连身裙',
  gown: '礼服',
  skirt: '裙子',
  miniskirt: '短裙',
  pleated: '百褶裙',
  pants: '长裤',
  trousers: '长裤',
  shorts: '短裤',
  jeans: '牛仔裤',
  bottom: '下装',
  bottoms: '下装',
  underwear: '内衣',
  panties: '胖次',
  pantsu: '胖次',
  thong: '丁字裤',
  swimsuit: '泳装',
  bikini: '比基尼',
  monokini: '连体泳装',
  socks: '袜子',
  stockings: '丝袜',
  tights: '连裤袜',
  pantyhose: '裤袜',
  fishnet: '渔网袜',
  kneehigh: '过膝袜',
  thighhigh: '大腿袜',
  shoes: '鞋履',
  shoe: '鞋履',
  boots: '靴子',
  boot: '靴子',
  heels: '高跟鞋',
  highheels: '高跟鞋',
  sneakers: '运动鞋',
  sandals: '凉鞋',
  slippers: '拖鞋',
  barefoot: '赤足',
  barefeet: '赤足',
  gloves: '手套',
  glove: '手套',
  sleeves: '袖套',
  sleeve: '袖子',
  armwarmers: '护臂',
  bracelets: '手镯',
  chest: '胸部',
  breast: '胸部',
  breasts: '胸部',
  boobs: '胸部',
  cleavage: '胸部',
  butt: '臀部',
  hips: '臀围',
  thighs: '大腿',
  thigh: '大腿',
  body: '身躯',
  skin: '皮肤',
  weapon: '武器',
  weapons: '武器',
  sword: '长剑',
  blade: '刀刃',
  gun: '枪械',
  guns: '枪械',
  bow: '弓箭',
  shield: '盾牌',
  staff: '法杖',
  dagger: '匕首',
  effect: '特效',
  effects: '特效',
  glow: '发光',
  particles: '粒子',
  fx: '特效',
  aura: '光环',
  accessory: '配饰',
  accessories: '配饰',
  necklace: '项链',
  choker: '项圈',
  ribbon: '丝带',
  ring: '戒指',
  bag: '背包',
  backpack: '背包',
  purse: '手提包',
  outfit: '服装',
  costume: '套装',

  // --- 动作与操作词 ---
  toggle: '开关',
  cycle: '轮循',
  swap: '切换',
  switch: '切换',
  change: '更换',
  hide: '隐藏',
  show: '显示',
  remove: '脱下',
  strip: '褪去',
  add: '穿上',
  enable: '启用',
  disable: '禁用',
  reset: '重置',

  // --- 状态与选项词 ---
  default: '默认',
  normal: '常规',
  alt: '替代',
  alternative: '替代样式',
  off: '关闭',
  on: '开启',
  none: '无',
  all: '全部',
  short: '短',
  long: '长',
  medium: '中等',
  small: '小',
  large: '大',
  big: '大',
  black: '黑色',
  white: '白色',
  red: '红色',
  blue: '蓝色',
  green: '绿色',
  yellow: '黄色',
  purple: '紫色',
  pink: '粉色',
  nude: '清凉',
  casual: '便装',
  original: '原版',
  size: '大小',
  type: '类型',
  style: '样式',
  color: '颜色',
  mode: '模式'
}

/**
 * 单词分割（处理驼峰、下划线、短横线）
 */
export function splitWords(str: string): string[] {
  if (!str) return []
  return str
    .replace(/^Key[_\s-]*/i, '') // 去除 3DMigoto Key 前缀
    .replace(/([a-z])([A-Z])/g, '$1 $2') // 驼峰分词
    .replace(/[_\-]+/g, ' ') // 标点转空格
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * 基于 3DMigoto 专有词典翻译变量名或快捷键名称
 */
export function translateTerm(raw: string): string {
  if (!raw || !raw.trim()) return ''
  const trimmed = raw.trim()

  // 如果原本已包含中文字符，直接返回
  if (/[\u4e00-\u9fa5]/.test(trimmed)) {
    return trimmed
  }

  const words = splitWords(trimmed)
  if (words.length === 0) return trimmed

  // 特殊模式组合优化
  const lowerJoined = words.join(' ')
  if (lowerJoined === 'short hair') return '短发'
  if (lowerJoined === 'long hair') return '长发'
  if (lowerJoined === 'high heels') return '高跟鞋'
  if (lowerJoined === 'bare foot' || lowerJoined === 'barefoot') return '赤足'
  if (lowerJoined === 'no shoes') return '脱鞋/赤足'
  if (lowerJoined === 'no clothes') return '脱衣/清凉'

  const actions: string[] = []
  const parts: string[] = []

  const actionKeys = ['toggle', 'cycle', 'swap', 'switch', 'hide', 'show', 'remove', 'strip', 'add', 'enable', 'disable', 'reset']

  for (const w of words) {
    if (actionKeys.includes(w)) {
      actions.push(MIGOTO_DICTIONARY[w] || w)
    } else if (MIGOTO_DICTIONARY[w]) {
      parts.push(MIGOTO_DICTIONARY[w])
    } else {
      parts.push(w)
    }
  }

  const partStr = parts.join('')
  const actionStr = actions.join('')

  if (partStr && actionStr) {
    return `${partStr}${actionStr}`
  }
  if (partStr) return partStr
  if (actionStr) return actionStr
  return trimmed
}

/**
 * 翻译档位选项标签 (如 "0: Default", "1: Short Hair")
 */
export function translateValueLabel(label: string): string {
  if (!label || !label.trim()) return ''
  const trimmed = label.trim()

  if (/[\u4e00-\u9fa5]/.test(trimmed)) {
    return trimmed
  }

  const match = trimmed.match(/^([0-9]+)\s*[:=\-\s]\s*(.+)$/)
  if (match) {
    const val = match[1]
    const desc = match[2].trim()
    return `${val}: ${translateTerm(desc)}`
  }

  return translateTerm(trimmed)
}
