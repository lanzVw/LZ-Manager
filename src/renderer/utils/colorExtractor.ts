/**
 * 角色立绘/头像主色动态提取器 (Canvas-based Dominant Color Extractor)
 * - 纯前端原生 Canvas 实现，零外部依赖
 * - 智能跳过高亮白底、极深暗底与极低饱和度像素
 * - 内置内存缓存字典，避免重复解析与解码开销
 * - 提取结果为 "R G B" 通道值格式，以便直接对接 Tailwind CSS 变量
 */

import { toFileUrl } from './fileUrl'

const colorCache = new Map<string, string>()

// 默认浅色/深色回退 primary RGB
export const DEFAULT_PRIMARY_RGB = '31 79 196'
export const DEFAULT_DARK_PRIMARY_RGB = '91 140 255'

export async function extractDominantColor(imagePath: string | null): Promise<string | null> {
  if (!imagePath) return null

  if (colorCache.has(imagePath)) {
    return colorCache.get(imagePath)!
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = toFileUrl(imagePath)

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve(null)
          return
        }

        // 缩放至 48x48 快速采样，提升性能
        const sampleSize = 48
        canvas.width = sampleSize
        canvas.height = sampleSize
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize)

        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize)
        const data = imageData.data

        let totalR = 0
        let totalG = 0
        let totalB = 0
        let count = 0

        // 挑选具有饱和度的代表性像素
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]

          if (a < 128) continue // 忽略透明像素

          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const lightness = (max + min) / 2
          const delta = max - min

          // 过滤掉近黑 (L < 20)、近白 (L > 235) 以及完全无饱和度的灰度像素
          if (lightness < 25 || lightness > 235 || delta < 15) {
            continue
          }

          // 加权高饱和度色彩
          const weight = 1 + delta / 128
          totalR += r * weight
          totalG += g * weight
          totalB += b * weight
          count += weight
        }

        if (count > 0) {
          const avgR = Math.round(totalR / count)
          const avgG = Math.round(totalG / count)
          const avgB = Math.round(totalB / count)
          const rgbResult = `${avgR} ${avgG} ${avgB}`
          colorCache.set(imagePath, rgbResult)
          resolve(rgbResult)
        } else {
          resolve(null)
        }
      } catch (err) {
        console.warn('Canvas color extraction error:', err)
        resolve(null)
      }
    }

    img.onerror = () => {
      resolve(null)
    }
  })
}
