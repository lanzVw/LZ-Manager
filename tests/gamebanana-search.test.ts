import { describe, it, expect } from 'vitest'
import {
  buildAuthorSearchQuery,
  parseAuthorQuery,
  resolveSearchQuery,
  stripAuthorPrefix
} from '../src/renderer/utils/gamebanana-search'

describe('gamebanana-search.buildAuthorSearchQuery', () => {
  it('为作者名拼上 user: 前缀（后端据此走作者筛选）', () => {
    expect(buildAuthorSearchQuery('SomeAuthor')).toBe('user:SomeAuthor')
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

  it('已有 user: 前缀时不重复拼接', () => {
    expect(buildAuthorSearchQuery('user:foo')).toBe('user:foo')
  })
})

describe('gamebanana-search.stripAuthorPrefix', () => {
  it('剥离一层或多层 user:/author: 前缀', () => {
    expect(stripAuthorPrefix('user:foo')).toBe('foo')
    expect(stripAuthorPrefix('author:foo')).toBe('foo')
    expect(stripAuthorPrefix('AUTHOR:foo')).toBe('foo')
    expect(stripAuthorPrefix('user:author:foo')).toBe('foo')
    expect(stripAuthorPrefix('  user: foo  ')).toBe('foo')
  })

  it('无前缀原样返回并去空白', () => {
    expect(stripAuthorPrefix('  foo bar  ')).toBe('foo bar')
    expect(stripAuthorPrefix('')).toBe('')
    expect(stripAuthorPrefix(null)).toBe('')
  })
})

describe('gamebanana-search.resolveSearchQuery', () => {
  it('all 原样返回全文查询，只做首尾裁剪', () => {
    expect(resolveSearchQuery('all', '  foo bar  ')).toBe('foo bar')
    expect(resolveSearchQuery('all', 'user:foo')).toBe('user:foo')
    expect(resolveSearchQuery('all', '')).toBe('')
    expect(resolveSearchQuery('all', '   ')).toBe('')
    expect(resolveSearchQuery('all', undefined)).toBe('')
  })

  it('author 自动拼 user: 前缀', () => {
    expect(resolveSearchQuery('author', 'foo')).toBe('user:foo')
    expect(resolveSearchQuery('author', '  foo  ')).toBe('user:foo')
  })

  it('author 对已有前缀幂等，不产生 user:user:', () => {
    expect(resolveSearchQuery('author', 'user:foo')).toBe('user:foo')
    expect(resolveSearchQuery('author', 'author:foo')).toBe('user:foo')
    expect(resolveSearchQuery('author', 'AUTHOR:foo')).toBe('user:foo')
    expect(resolveSearchQuery('author', 'user:author:foo')).toBe('user:foo')
  })

  it('author 空名返回空串，绝不发出裸 user:', () => {
    expect(resolveSearchQuery('author', '')).toBe('')
    expect(resolveSearchQuery('author', '   ')).toBe('')
    expect(resolveSearchQuery('author', 'user:')).toBe('')
    expect(resolveSearchQuery('author', undefined)).toBe('')
    expect(resolveSearchQuery('author', null)).toBe('')
  })

  it('author 只取首个 token，匹配后端 member 名无空格约束', () => {
    expect(resolveSearchQuery('author', 'foo bar')).toBe('user:foo')
  })
})

describe('gamebanana-search.parseAuthorQuery', () => {
  it('识别 user:/author: token', () => {
    expect(parseAuthorQuery('user:foo')).toBe('foo')
    expect(parseAuthorQuery('foo user:bar')).toBe('bar')
    expect(parseAuthorQuery('AUTHOR:Baz')).toBe('Baz')
  })

  it('普通关键词返回 null', () => {
    expect(parseAuthorQuery('foo bar')).toBeNull()
    expect(parseAuthorQuery('')).toBeNull()
    expect(parseAuthorQuery(undefined)).toBeNull()
  })
})
