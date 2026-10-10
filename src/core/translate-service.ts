import https from 'https'
import http from 'http'
import crypto from 'crypto'

interface TranslationCacheItem {
  translatedTitle: string
  translatedDescription: string
  translatedText: string
  timestamp: number
}

// 内存与本地缓存
const memoryCache = new Map<string, TranslationCacheItem>()
// LRU 上限与 TTL（30 分钟）
const MEMORY_CACHE_MAX_ENTRIES = 200
const MEMORY_CACHE_TTL_MS = 30 * 60 * 1000

/**
 * 字符串 MD5 哈希
 */
function hashString(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex')
}

/**
 * 清扫 memoryCache 中已超过 TTL 的过期条目
 */
function purgeExpiredCache(): void {
  const now = Date.now()
  for (const [key, item] of memoryCache) {
    if (now - item.timestamp > MEMORY_CACHE_TTL_MS) {
      memoryCache.delete(key)
    }
  }
}

/**
 * 按 LRU 上限淘汰最久未使用的条目（Map 迭代顺序即插入顺序，队首为最旧）
 */
function trimMemoryCache(): void {
  while (memoryCache.size > MEMORY_CACHE_MAX_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value
    if (oldestKey === undefined) break
    memoryCache.delete(oldestKey)
  }
}

/**
 * 统一网络请求（支持超时、代理和一次 3xx 重定向跟随）
 * 注意：手动基于 http/https 实现，不自动跟随重定向，此处仅手动跟随一层
 */
function httpGet(url: string, timeoutMs = 8000, redirectsLeft = 1): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: timeoutMs
      },
      (res) => {
        const status = res.statusCode || 0
        // 3xx 重定向跟随（限一次），防止接口域名迁移后直接报 HTTP Status 30x
        if (redirectsLeft > 0 && status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          httpGet(new URL(res.headers.location, url).toString(), timeoutMs, redirectsLeft - 1).then(resolve, reject)
          return
        }
        if (status && (status < 200 || status >= 300)) {
          return reject(new Error(`HTTP Status ${status}`))
        }
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => resolve(data))
      }
    )

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Translation request timed out'))
    })

    req.on('error', (err) => reject(err))
  })
}

/**
 * 通道 1: Google Translate GTX 免费公共接口
 */
async function translateViaGoogleGTX(text: string, targetLang = 'zh-CN'): Promise<string> {
  if (!text || !text.trim()) return ''
  const encodedText = encodeURIComponent(text)
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodedText}`

  const rawJson = await httpGet(url, 9000)
  const parsed = JSON.parse(rawJson)
  if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
    const result = parsed[0].map((item: any) => (item && item[0] ? item[0] : '')).join('')
    return result || text
  }
  return text
}

/**
 * 通道 2: MyMemory 免费翻译备用接口
 */
async function translateViaMyMemory(text: string): Promise<string> {
  if (!text || !text.trim()) return ''
  // MyMemory 单次建议不超过 500 字符，若长文本切片请求
  const chunks: string[] = []
  let curr = text
  while (curr.length > 0) {
    if (curr.length <= 400) {
      chunks.push(curr)
      break
    }
    let splitIdx = curr.lastIndexOf('\n', 400)
    if (splitIdx <= 0) splitIdx = curr.lastIndexOf('. ', 400)
    if (splitIdx <= 0) splitIdx = 400
    chunks.push(curr.slice(0, splitIdx))
    curr = curr.slice(splitIdx).trimStart()
  }

  const translatedChunks: string[] = []
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|zh`
    const raw = await httpGet(url, 8000)
    const json = JSON.parse(raw)
    if (json?.responseData?.translatedText) {
      translatedChunks.push(json.responseData.translatedText)
    } else {
      translatedChunks.push(chunk)
    }
  }

  return translatedChunks.join('\n')
}

/**
 * 通道 3: 微软必应轻量词典/翻译回退备选
 */
async function translateSingleText(text: string): Promise<string> {
  if (!text || !text.trim()) return ''

  // 1. 优先尝试 Google GTX
  try {
    const res = await translateViaGoogleGTX(text)
    if (res && res.trim()) return res
  } catch (err: any) {
    console.warn('[TranslateService] Google GTX failed, trying fallback MyMemory...', err?.message)
  }

  // 2. 备用尝试 MyMemory
  try {
    const res = await translateViaMyMemory(text)
    if (res && res.trim()) return res
  } catch (err: any) {
    console.warn('[TranslateService] MyMemory fallback failed:', err?.message)
  }

  // 若均无法访问，安全回退原文
  return text
}

/**
 * 保护 HTML 结构并翻译其中的文字内容
 */
async function translateHtmlContent(html: string): Promise<string> {
  if (!html || !html.trim()) return ''

  // 将 HTML 中的纯文本提取为占位符替换机制，或者分段处理
  // 简易且稳健的做法：提取可见文本段落翻译，保留标签
  const tagPlaceholders: string[] = []
  const textWithTokens = html.replace(/<[^>]+>/g, (tag) => {
    const placeholder = `__HTML_TAG_${tagPlaceholders.length}__`
    tagPlaceholders.push(tag)
    return placeholder
  })

  // 翻译带占位符的文本
  const translatedWithTokens = await translateSingleText(textWithTokens)

  // 恢复 HTML 标签
  let finalHtml = translatedWithTokens
  for (let i = 0; i < tagPlaceholders.length; i++) {
    // 允许翻译后占位符可能带有轻微空格变动
    const re = new RegExp(`__\\s*HTML_TAG_${i}\\s*__`, 'gi')
    finalHtml = finalHtml.replace(re, tagPlaceholders[i])
  }

  return finalHtml
}

/**
 * 模组批量翻译对外核心函数
 */
export async function translateModDetails(params: {
  title?: string
  description?: string
  text?: string
}): Promise<{
  translatedTitle: string
  translatedDescription: string
  translatedText: string
  cached: boolean
}> {
  const title = (params.title || '').trim()
  const description = (params.description || '').trim()
  const text = (params.text || '').trim()

  const combinedKey = hashString(`${title}||${description}||${text}`)

  if (memoryCache.has(combinedKey)) {
    const cached = memoryCache.get(combinedKey)!
    // TTL 判定（timestamp 字段）：超过 30 分钟视为过期，删除后走重新翻译
    if (Date.now() - cached.timestamp > MEMORY_CACHE_TTL_MS) {
      memoryCache.delete(combinedKey)
    } else {
      // LRU 位序刷新：删除后重新插入，使其成为最近使用
      memoryCache.delete(combinedKey)
      memoryCache.set(combinedKey, cached)
      return {
        translatedTitle: cached.translatedTitle,
        translatedDescription: cached.translatedDescription,
        translatedText: cached.translatedText,
        cached: true
      }
    }
  }

  // 并行翻译标题、简述与正文
  const [translatedTitle, translatedDescription, translatedText] = await Promise.all([
    title ? translateSingleText(title) : Promise.resolve(''),
    description ? translateSingleText(description) : Promise.resolve(''),
    text ? translateHtmlContent(text) : Promise.resolve('')
  ])

  const result: TranslationCacheItem = {
    translatedTitle: translatedTitle || title,
    translatedDescription: translatedDescription || description,
    translatedText: translatedText || text,
    timestamp: Date.now()
  }

  // 写入缓存：先写入新条目，再顺手清扫过期项并按 LRU 上限淘汰
  memoryCache.set(combinedKey, result)
  purgeExpiredCache()
  trimMemoryCache()

  return {
    translatedTitle: result.translatedTitle,
    translatedDescription: result.translatedDescription,
    translatedText: result.translatedText,
    cached: false
  }
}
