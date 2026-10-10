import fs from 'fs'
import iconv from 'iconv-lite'

export type TextEncoding = 'utf8' | 'utf16le' | 'gbk'

const utf8Strict = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: true }) : null
const gbkDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('gbk') : null

/**
 * 读取文本文件并自动探测编码。
 * 国内 Mod 社区的 .ini / d3dx.ini 大量是 ANSI/GBK 或 UTF-16LE，
 * 按 utf8 整读会产生 U+FFFD 并在回写时造成永久乱码，因此必须探测。
 */
export function readTextAuto(filePath: string): { content: string; encoding: TextEncoding; hadBom: boolean } {
  const buffer = fs.readFileSync(filePath)

  // 1. BOM 检测
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { content: new TextDecoder('utf-16le').decode(buffer.subarray(2)), encoding: 'utf16le', hadBom: true }
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { content: buffer.subarray(3).toString('utf8'), encoding: 'utf8', hadBom: true }
  }

  // 2. 无 BOM 但偶数位 0x00 占比高：UTF-16LE
  let zeroCount = 0
  const sampleLen = Math.min(buffer.length, 4096)
  for (let i = 1; i < sampleLen; i += 2) {
    if (buffer[i] === 0) zeroCount++
  }
  if (sampleLen > 0 && zeroCount / Math.floor(sampleLen / 2) > 0.3) {
    return { content: new TextDecoder('utf-16le').decode(buffer), encoding: 'utf16le', hadBom: false }
  }

  // 3. 严格 UTF-8 校验通过 → utf8
  if (utf8Strict) {
    try {
      return { content: utf8Strict.decode(buffer), encoding: 'utf8', hadBom: false }
    } catch (_) {
      /* 不是合法 UTF-8，继续探测 GBK */
    }
  }

  // 4. GBK 回退（中文 Windows 代码页 936，3DMigoto 社区最常见）
  if (gbkDecoder) {
    try {
      const content = gbkDecoder.decode(buffer)
      return { content, encoding: 'gbk', hadBom: false }
    } catch (_) {
      /* fallthrough */
    }
  }
  return { content: buffer.toString('utf8'), encoding: 'utf8', hadBom: false }
}

/**
 * 按指定编码写回文本（保持原文件编码，避免 GBK 内容被 utf8 回写永久乱码）。
 * 默认写入 CRLF 行尾以兼容 Windows 记事本/3DMigoto 工具链（仅在原文件没有换行符信息时无副作用）。
 */
export function writeTextWithEncoding(filePath: string, content: string, encoding: TextEncoding): void {
  let buffer: Buffer
  if (encoding === 'utf16le') {
    buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode(content, 'utf16-le')])
  } else if (encoding === 'gbk') {
    buffer = iconv.encode(content, 'gbk')
  } else {
    buffer = Buffer.from(content, 'utf8')
  }
  fs.writeFileSync(filePath, buffer)
}
