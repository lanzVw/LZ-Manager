import { describe, it, expect } from 'vitest'
import {
  stripIniComments,
  parseIniNamespace,
  parseShaderCacheValue,
  parseD3dxCacheRules
} from '../src/core/base-mod'

describe('stripIniComments', () => {
  it('去掉整行与行内注释，保留引号内的 # / ;', () => {
    expect(stripIniComments('; comment\nkey = 1 ; tail')).toBe('\nkey = 1 ')
    expect(stripIniComments('key = "a#b"')).toBe('key = "a#b"')
    expect(stripIniComments('﻿namespace = RabbitFX')).toBe('namespace = RabbitFX')
  })
})

describe('parseIniNamespace', () => {
  it('解析普通声明', () => {
    expect(parseIniNamespace('namespace = RabbitFX\n[Constants]\nfoo = 1\n')).toBe('RabbitFX')
  })

  it('忽略 section 内的同名键', () => {
    expect(parseIniNamespace('[Constants]\nnamespace = RabbitFX\n')).toBeNull()
  })

  it('兼容 BOM、CRLF、缩进与行内注释', () => {
    expect(parseIniNamespace('﻿  namespace = RabbitFX ; base mod\r\n')).toBe('RabbitFX')
  })

  it('去掉引号与尾部路径分隔符', () => {
    expect(parseIniNamespace('namespace = "RabbitFX\\"')).toBe('RabbitFX')
    expect(parseIniNamespace("namespace = 'RabbitFX/'")).toBe('RabbitFX')
  })

  it('忽略被注释掉的声明', () => {
    expect(parseIniNamespace('; namespace = RabbitFX\n')).toBeNull()
    expect(parseIniNamespace('# namespace = RabbitFX\n')).toBeNull()
  })

  it('缺失或为空返回 null', () => {
    expect(parseIniNamespace('')).toBeNull()
    expect(parseIniNamespace('namespace =   ')).toBeNull()
    expect(parseIniNamespace('[Constants]\nfoo = 1\n')).toBeNull()
  })
})

describe('parseShaderCacheValue', () => {
  it('只接受 [Rendering] 段内的 cache_shaders', () => {
    expect(parseShaderCacheValue('[Rendering]\ncache_shaders = 1\n')).toBe('1')
    expect(parseShaderCacheValue('[Rendering]\ncache_shaders = 0\n')).toBe('0')
  })

  it('大小写不敏感，去行内注释', () => {
    expect(parseShaderCacheValue('[rendering]\nCACHE_SHADERS = 1 ; enabled\n')).toBe('1')
  })

  it('忽略其他段的同名键', () => {
    expect(parseShaderCacheValue('[Other]\ncache_shaders = 1\n')).toBeNull()
  })

  it('后出现的值覆盖前面的值', () => {
    expect(parseShaderCacheValue('[Rendering]\ncache_shaders = 0\n[Rendering]\ncache_shaders = 1\n')).toBe('1')
  })

  it('未声明返回 null', () => {
    expect(parseShaderCacheValue('[Rendering]\nfoo = 1\n')).toBeNull()
  })
})

describe('parseD3dxCacheRules', () => {
  const d3dx = `
[Include]
include = Core\\ZZMI\\main.ini
include_recursive = Mods
exclude_recursive = DISABLED*
exclude_recursive = desktop.ini

[Rendering]
cache_directory = ShaderCache
cache_shaders = 0
`

  it('解析 include / exclude 规则', () => {
    const rules = parseD3dxCacheRules(d3dx)
    expect(rules.includeRecursive).toEqual(['Mods'])
    expect(rules.excludeRecursive).toEqual(['DISABLED*', 'desktop.ini'])
  })

  it('解析缓存目录与全局 cache_shaders', () => {
    const rules = parseD3dxCacheRules(d3dx)
    expect(rules.cacheDirectory).toBe('ShaderCache')
    expect(rules.cacheShaders).toBe('0')
  })

  it('忽略错误段里的同名键', () => {
    const rules = parseD3dxCacheRules('[Rendering]\ninclude_recursive = Mods\n[Include]\ncache_shaders = 1\n')
    expect(rules.includeRecursive).toEqual([])
    expect(rules.cacheShaders).toBeNull()
  })

  it('未配置时返回 null', () => {
    const rules = parseD3dxCacheRules('')
    expect(rules.cacheDirectory).toBeNull()
    expect(rules.cacheShaders).toBeNull()
  })
})
