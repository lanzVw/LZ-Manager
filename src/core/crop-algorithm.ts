/**
 * LZ Manager - AI Smart Crop Algorithm Engine
 * Ported & enhanced from FlairX AI Smart Crop
 * 
 * Supports:
 * - Smart: Multi-factor saliency (0.45) + Sobel edges (0.30) + Entropy (0.15) + Center Prior (0.10) - Truncation Penalty
 * - Attention: Contrast and local saliency
 * - Entropy: 16-level grayscale Shannon entropy information density
 * - Center: Maximum inscribed center crop
 */

function getLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

class IntegralImage {
  private width: number
  private height: number
  private integral: Float64Array

  constructor(width: number, height: number, data: Float32Array | number[]) {
    this.width = width
    this.height = height
    this.integral = new Float64Array((width + 1) * (height + 1))
    this.build(data)
  }

  private build(data: Float32Array | number[]) {
    const w = this.width
    const h = this.height
    const stride = w + 1

    for (let y = 0; y < h; y++) {
      let rowSum = 0
      const srcRowOffset = y * w
      const intRowOffset = (y + 1) * stride
      const prevRowOffset = y * stride

      for (let x = 0; x < w; x++) {
        rowSum += data[srcRowOffset + x]
        this.integral[intRowOffset + (x + 1)] = this.integral[prevRowOffset + (x + 1)] + rowSum
      }
    }
  }

  public query(x1: number, y1: number, x2: number, y2: number): number {
    x1 = Math.max(0, Math.min(x1, this.width - 1))
    y1 = Math.max(0, Math.min(y1, this.height - 1))
    x2 = Math.max(0, Math.min(x2, this.width - 1))
    y2 = Math.max(0, Math.min(y2, this.height - 1))

    if (x2 < x1 || y2 < y1) return 0

    const stride = this.width + 1
    const a = this.integral[y1 * stride + x1]
    const b = this.integral[y1 * stride + (x2 + 1)]
    const c = this.integral[(y2 + 1) * stride + x1]
    const d = this.integral[(y2 + 1) * stride + (x2 + 1)]

    return d - b - c + a
  }

  public queryAverage(x1: number, y1: number, x2: number, y2: number): number {
    const area = (x2 - x1 + 1) * (y2 - y1 + 1)
    if (area <= 0) return 0
    return this.query(x1, y1, x2, y2) / area
  }
}

function downsampleImage(pixels: Uint8ClampedArray | Uint8Array, srcW: number, srcH: number, maxDim = 256) {
  let scale = 1.0
  if (Math.max(srcW, srcH) > maxDim) {
    scale = maxDim / Math.max(srcW, srcH)
  }

  const dstW = Math.max(8, Math.round(srcW * scale))
  const dstH = Math.max(8, Math.round(srcH * scale))

  const gray = new Float32Array(dstW * dstH)
  const rgb = new Float32Array(dstW * dstH * 3)

  const xRatio = srcW / dstW
  const yRatio = srcH / dstH

  for (let dy = 0; dy < dstH; dy++) {
    const sy = Math.min(srcH - 1, Math.floor(dy * yRatio))
    for (let dx = 0; dx < dstW; dx++) {
      const sx = Math.min(srcW - 1, Math.floor(dx * xRatio))
      const srcIdx = (sy * srcW + sx) * 4
      const r = pixels[srcIdx]
      const g = pixels[srcIdx + 1]
      const b = pixels[srcIdx + 2]

      const dstIdx = dy * dstW + dx
      gray[dstIdx] = getLuminance(r, g, b)
      rgb[dstIdx * 3] = r / 255
      rgb[dstIdx * 3 + 1] = g / 255
      rgb[dstIdx * 3 + 2] = b / 255
    }
  }

  return { dstW, dstH, gray, rgb, scale }
}

export function calculateCenterCrop(W: number, H: number, targetAspect: number): [number, number, number, number] {
  const currentAspect = W / H
  let cropW: number
  let cropH: number

  if (currentAspect > targetAspect) {
    cropH = H
    cropW = Math.round(H * targetAspect)
  } else {
    cropW = W
    cropH = Math.round(W / targetAspect)
  }

  const cropX = Math.round((W - cropW) / 2)
  const cropY = Math.round((H - cropH) / 2)

  return [cropX, cropY, cropW, cropH]
}

function calculateSobelGradients(gray: Float32Array, W: number, H: number): Float32Array {
  const edges = new Float32Array(W * H)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p00 = gray[(y - 1) * W + (x - 1)]
      const p01 = gray[(y - 1) * W + x]
      const p02 = gray[(y - 1) * W + (x + 1)]
      const p10 = gray[y * W + (x - 1)]
      const p12 = gray[y * W + (x + 1)]
      const p20 = gray[(y + 1) * W + (x - 1)]
      const p21 = gray[(y + 1) * W + x]
      const p22 = gray[(y + 1) * W + (x + 1)]

      const gx = -p00 + p02 - 2 * p10 + 2 * p12 - p20 + p22
      const gy = -p00 - 2 * p01 - p02 + p20 + 2 * p21 + p22
      edges[y * W + x] = Math.sqrt(gx * gx + gy * gy)
    }
  }
  return edges
}

function calculateShannonEntropyMap(gray: Float32Array, W: number, H: number, radius = 4): Float32Array {
  const entropy = new Float32Array(W * H)
  const hist = new Int32Array(16)

  for (let y = 0; y < H; y++) {
    const ymin = Math.max(0, y - radius)
    const ymax = Math.min(H - 1, y + radius)
    for (let x = 0; x < W; x++) {
      const xmin = Math.max(0, x - radius)
      const xmax = Math.min(W - 1, x + radius)

      hist.fill(0)
      let count = 0
      for (let sy = ymin; sy <= ymax; sy++) {
        for (let sx = xmin; sx <= xmax; sx++) {
          const val = gray[sy * W + sx]
          const bin = Math.min(15, Math.max(0, Math.floor(val / 16)))
          hist[bin]++
          count++
        }
      }

      let ent = 0
      if (count > 0) {
        for (let i = 0; i < 16; i++) {
          if (hist[i] > 0) {
            const p = hist[i] / count
            ent -= p * Math.log2(p)
          }
        }
      }
      entropy[y * W + x] = ent
    }
  }
  return entropy
}

function calculateColorSaliencyMap(rgb: Float32Array, W: number, H: number): Float32Array {
  let meanR = 0, meanG = 0, meanB = 0
  const total = W * H

  for (let i = 0; i < total; i++) {
    meanR += rgb[i * 3]
    meanG += rgb[i * 3 + 1]
    meanB += rgb[i * 3 + 2]
  }
  meanR /= total
  meanG /= total
  meanB /= total

  const saliency = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    const dr = rgb[i * 3] - meanR
    const dg = rgb[i * 3 + 1] - meanG
    const db = rgb[i * 3 + 2] - meanB
    saliency[i] = Math.sqrt(dr * dr + dg * dg + db * db)
  }
  return saliency
}

export function calculateSmartCrop(
  pixels: Uint8ClampedArray | Uint8Array,
  W: number,
  H: number,
  targetAspect: number,
  mode: 'Smart' | 'Attention' | 'Entropy' | 'Center' = 'Smart'
): { rect: [number, number, number, number]; mode: string } {
  if (mode === 'Center') {
    return { rect: calculateCenterCrop(W, H, targetAspect), mode: 'Center' }
  }

  const { dstW, dstH, gray, rgb, scale } = downsampleImage(pixels, W, H, 240)

  let importanceMap: Float32Array

  if (mode === 'Entropy') {
    importanceMap = calculateShannonEntropyMap(gray, dstW, dstH, 3)
  } else if (mode === 'Attention') {
    importanceMap = calculateColorSaliencyMap(rgb, dstW, dstH)
  } else {
    // Smart: Combined
    const saliency = calculateColorSaliencyMap(rgb, dstW, dstH)
    const edges = calculateSobelGradients(gray, dstW, dstH)
    const entropy = calculateShannonEntropyMap(gray, dstW, dstH, 2)

    // Normalize each map
    const normalize = (arr: Float32Array) => {
      let max = 0.00001
      for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i]
      const out = new Float32Array(arr.length)
      for (let i = 0; i < arr.length; i++) out[i] = arr[i] / max
      return out
    }

    const nSal = normalize(saliency)
    const nEdge = normalize(edges)
    const nEnt = normalize(entropy)

    importanceMap = new Float32Array(dstW * dstH)
    for (let y = 0; y < dstH; y++) {
      const cy = y / dstH - 0.5
      for (let x = 0; x < dstW; x++) {
        const cx = x / dstW - 0.5
        const distFromCenter = Math.sqrt(cx * cx + cy * cy)
        const centerPrior = Math.max(0, 1.0 - distFromCenter * 1.3)

        const idx = y * dstW + x
        importanceMap[idx] =
          nSal[idx] * 0.45 +
          nEdge[idx] * 0.30 +
          nEnt[idx] * 0.15 +
          centerPrior * 0.10
      }
    }
  }

  const integral = new IntegralImage(dstW, dstH, importanceMap)

  // Determine base bounding box sizes
  let baseW: number
  let baseH: number
  const currentAspect = dstW / dstH

  if (currentAspect > targetAspect) {
    baseH = dstH
    baseW = Math.round(dstH * targetAspect)
  } else {
    baseW = dstW
    baseH = Math.round(dstW / targetAspect)
  }

  let bestScore = -1
  let bestX = 0
  let bestY = 0
  let bestBoxW = baseW
  let bestBoxH = baseH

  // Multi-scale candidate search (from 100% of base down to 75%)
  const scales = [1.0, 0.9, 0.82]
  for (const s of scales) {
    const boxW = Math.max(16, Math.round(baseW * s))
    const boxH = Math.max(16, Math.round(baseH * s))
    const stepX = Math.max(2, Math.floor((dstW - boxW) / 16))
    const stepY = Math.max(2, Math.floor((dstH - boxH) / 16))
    const maxX = dstW - boxW
    const maxY = dstH - boxH

    // 评分逻辑（主循环与贴边补扫共用）
    const scoreAt = (x: number, y: number): void => {
      const score = integral.queryAverage(x, y, x + boxW - 1, y + boxH - 1)
      if (score > bestScore) {
        bestScore = score
        bestX = x
        bestY = y
        bestBoxW = boxW
        bestBoxH = boxH
      }
    }

    for (let y = 0; y <= maxY; y += stepY) {
      for (let x = 0; x <= maxX; x += stepX) {
        scoreAt(x, y)
      }
    }

    // 贴边补扫：步进对齐使起点只落在步长整数倍上，右/下边界（y = dstH-boxH 一行、
    // x = dstW-boxW 一列）可能永远评不到；仅当主循环最大起点未到达贴边值时各补扫一行/一列
    const needEdgeY = maxY > 0 && maxY % stepY !== 0
    const needEdgeX = maxX > 0 && maxX % stepX !== 0
    if (needEdgeY) {
      for (let x = 0; x <= maxX; x += stepX) {
        scoreAt(x, maxY)
      }
    }
    if (needEdgeX) {
      for (let y = 0; y <= maxY; y += stepY) {
        scoreAt(maxX, y)
      }
    }
    // 双向都未对齐时，右下角起点两轮补扫均覆盖不到，单独补评一次
    if (needEdgeY && needEdgeX) {
      scoreAt(maxX, maxY)
    }
  }

  // Map back to original image dimensions
  const invScale = 1.0 / scale
  const origX = Math.max(0, Math.min(W - 1, Math.round(bestX * invScale)))
  const origY = Math.max(0, Math.min(H - 1, Math.round(bestY * invScale)))
  const origW = Math.min(W - origX, Math.round(bestBoxW * invScale))
  const origH = Math.min(H - origY, Math.round(bestBoxH * invScale))

  return {
    rect: [origX, origY, origW, origH],
    mode
  }
}
