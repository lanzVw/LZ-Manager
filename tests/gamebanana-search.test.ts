import { describe, it, expect } from 'vitest'
import { buildAuthorSearchQuery } from '../src/renderer/utils/gamebanana-search'

describe('gamebanana-search.buildAuthorSearchQuery', () => {
  it('为作者名拼上 user: 前缀（后端据此走作者筛选）', () => {
    expect(buildAuthorSearchQuery('zxlzxlzxl72')).toBe('user:zxlzxlzxl72')
  })

  it('去除首尾空白', () => {
    expect(buildAuthorSearchQuery('  SomeAuthor  ')).toBe('user:SomeAuthor')
  })

  it('空作者名返回空串，不产生 user: 空查询', () => {
    expect(buildAuthorSearchQuery('')).toBe('')
    expect(buildAuthorSearchQuery('   ')).toBe('')
    expect(buildAuthorSearchQuery(undefined)).toBe('')
    expect(buildAuthorSearchQuery(null)).toBe('')
  })
})
