/**
 * 统一将本地文件路径转换为 file:// URL。
 * - 已是 URL 的原样返回
 * - 反斜杠归一、保留盘符、对路径做 URI 编码（空格/中文/#/% 等）
 * 修复此前各页面 `file://${path}` 直接拼接在路径含空格、#、% 或中文时产生非法 URL 导致裂图的问题。
 */
export function toFileUrl(p: string | null | undefined): string {
  if (!p) return ''
  if (p.startsWith('file://')) return p
  if (/^https?:\/\//i.test(p)) return p
  const normalized = String(p).replace(/\\/g, '/')
  // 保留已编码字符不被二次编码：先解码再统一编码
  let decoded = normalized
  try {
    decoded = decodeURIComponent(normalized)
  } catch (_) {
    /* 含非法 % 序列时按原文处理 */
  }
  const encoded = encodedPath(decoded)
  return `file:///${encoded.replace(/^\/+/, '')}`
}

function encodedPath(p: string): string {
  return p
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}
