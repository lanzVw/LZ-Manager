// GameBanana 关键词搜索用 user:/author: 前缀区分「按作者筛选」与普通全文搜索。
// 直接传作者名会走全文检索（按 Mod 标题/正文匹配），通常搜不到该作者的投稿。
export type SearchScope = 'all' | 'author'

/** 去掉可能存在的 user:/author: 前缀（可叠加），供 UI 展示与幂等拼装使用 */
export function stripAuthorPrefix(raw?: string | null): string {
  return (raw ?? '')
    .trim()
    .replace(/^(?:(?:user|author):\s*)+/i, '')
    .trim()
}

/**
 * 把「作用域 + 输入框原文」解析成后端真正收到的查询串。
 * - all：原样透传，保留用户手输 user:xxx 的旧用法
 * - author：剥离已有前缀后拼一次 user:，空名返回空串（绝不能发出裸 user:）
 */
export function resolveSearchQuery(scope: SearchScope, raw?: string | null): string {
  const text = (raw ?? '').trim()
  if (!text) return ''
  if (scope === 'all') return text

  // GameBanana member 名不含空格，后端也只取第一个 token
  const name = stripAuthorPrefix(text).split(/\s+/)[0] ?? ''
  return name ? `user:${name}` : ''
}

export function buildAuthorSearchQuery(authorName?: string | null): string {
  return resolveSearchQuery('author', authorName)
}

/** 与后端 /(?:^|\s)(?:user|author):([^\s]+)/i 保持一致，用于已选条件 chip */
export function parseAuthorQuery(raw?: string | null): string | null {
  const match = (raw ?? '').match(/(?:^|\s)(?:user|author):([^\s]+)/i)
  return match?.[1] ?? null
}
