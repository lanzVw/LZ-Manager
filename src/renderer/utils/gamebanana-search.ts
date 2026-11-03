// GameBanana 关键词搜索用 user:/author: 前缀区分「按作者筛选」与普通全文搜索。
// 直接传作者名会走全文检索（按 Mod 标题/正文匹配），通常搜不到该作者的投稿，
// 所以所有「查看作者的所有模组」入口都必须先拼前缀。
export function buildAuthorSearchQuery(authorName?: string | null): string {
  const name = (authorName ?? '').trim()
  return name ? `user:${name}` : ''
}
