// Core pixelation + editing engine. Everything runs client-side on canvases.

export interface PixelGrid {
  cols: number
  rows: number
  /** RGBA, row-major, length = cols * rows * 4 */
  data: Uint8ClampedArray
}

export interface PixelateOptions {
  /** number of columns in the output grid (resolution) */
  cols: number
  /** if > 0, quantize each colour channel to this many levels (e.g. 6 => chunky retro palette) */
  colorLevels?: number
  /** pixels whose alpha is below this become fully transparent (0-255) */
  alphaThreshold?: number
}

/** Compute the row count that preserves the source aspect ratio for a given column count. */
export function rowsForCols(srcW: number, srcH: number, cols: number): number {
  return Math.max(1, Math.round((cols * srcH) / srcW))
}

function quantizeChannel(value: number, levels: number): number {
  if (levels <= 1) return value
  const step = 255 / (levels - 1)
  return Math.round(Math.round(value / step) * step)
}

/**
 * Downscale an image into a small grid, averaging colours per cell.
 * Returns the raw RGBA grid; alpha from the source image is preserved.
 */
export function pixelate(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  opts: PixelateOptions,
): PixelGrid {
  const cols = Math.max(1, Math.round(opts.cols))
  const rows = rowsForCols(srcW, srcH, cols)

  const small = document.createElement('canvas')
  small.width = cols
  small.height = rows
  const ctx = small.getContext('2d', { willReadFrequently: true })!
  // High-quality downsample gives us a per-cell colour average.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, cols, rows)
  ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, cols, rows)

  const img = ctx.getImageData(0, 0, cols, rows)
  const data = img.data

  const levels = opts.colorLevels ?? 0
  const aThresh = opts.alphaThreshold ?? 0

  for (let i = 0; i < data.length; i += 4) {
    if (levels > 1) {
      data[i] = quantizeChannel(data[i], levels)
      data[i + 1] = quantizeChannel(data[i + 1], levels)
      data[i + 2] = quantizeChannel(data[i + 2], levels)
    }
    if (aThresh > 0 && data[i + 3] < aThresh) {
      data[i + 3] = 0
    }
  }

  return { cols, rows, data: new Uint8ClampedArray(data) }
}

export function cloneGrid(grid: PixelGrid): PixelGrid {
  return { cols: grid.cols, rows: grid.rows, data: new Uint8ClampedArray(grid.data) }
}

const idx = (grid: PixelGrid, x: number, y: number) => (y * grid.cols + x) * 4

/** Squared RGB distance, 0..195075 */
function colorDist2(
  data: Uint8ClampedArray,
  a: number,
  r: number,
  g: number,
  b: number,
): number {
  const dr = data[a] - r
  const dg = data[a + 1] - g
  const db = data[a + 2] - b
  return dr * dr + dg * dg + db * db
}

/** Paint alpha into a square brush centred on a cell. value 0 = erase, 255 = restore-from-original. */
export function paintBrush(
  grid: PixelGrid,
  original: PixelGrid,
  cx: number,
  cy: number,
  radius: number,
  mode: 'erase' | 'restore',
): void {
  const r = Math.max(0, radius)
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) continue
      // round brush
      if (dx * dx + dy * dy > r * r + r) continue
      const a = idx(grid, x, y)
      if (mode === 'erase') {
        grid.data[a + 3] = 0
      } else {
        grid.data[a] = original.data[a]
        grid.data[a + 1] = original.data[a + 1]
        grid.data[a + 2] = original.data[a + 2]
        grid.data[a + 3] = original.data[a + 3]
      }
    }
  }
}

/** Remove every visible cell within `tolerance` of the colour at (cx,cy). Tolerance 0..100. */
export function removeSimilarColor(
  grid: PixelGrid,
  cx: number,
  cy: number,
  tolerance: number,
): void {
  const start = idx(grid, cx, cy)
  const r = grid.data[start]
  const g = grid.data[start + 1]
  const b = grid.data[start + 2]
  const maxDist = (tolerance / 100) ** 2 * 195075
  for (let i = 0; i < grid.data.length; i += 4) {
    if (grid.data[i + 3] === 0) continue
    if (colorDist2(grid.data, i, r, g, b) <= maxDist) {
      grid.data[i + 3] = 0
    }
  }
}

/** Flood-fill transparency from (cx,cy) across contiguous cells within `tolerance`. */
export function magicErase(
  grid: PixelGrid,
  cx: number,
  cy: number,
  tolerance: number,
): void {
  const start = idx(grid, cx, cy)
  if (grid.data[start + 3] === 0) return
  const r = grid.data[start]
  const g = grid.data[start + 1]
  const b = grid.data[start + 2]
  const maxDist = (tolerance / 100) ** 2 * 195075

  const seen = new Uint8Array(grid.cols * grid.rows)
  const stack: number[] = [cx, cy]
  while (stack.length) {
    const y = stack.pop()!
    const x = stack.pop()!
    if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) continue
    const cell = y * grid.cols + x
    if (seen[cell]) continue
    seen[cell] = 1
    const a = cell * 4
    if (grid.data[a + 3] === 0) continue
    if (colorDist2(grid.data, a, r, g, b) > maxDist) continue
    grid.data[a + 3] = 0
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }
}

/** Render a grid into a freshly sized canvas at 1px per cell (no smoothing). */
export function gridToCanvas(grid: PixelGrid): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = grid.cols
  c.height = grid.rows
  const ctx = c.getContext('2d')!
  const img = new ImageData(new Uint8ClampedArray(grid.data), grid.cols, grid.rows)
  ctx.putImageData(img, 0, 0)
  return c
}

/** Build an upscaled PNG blob with transparency preserved (nearest-neighbour). */
export function exportPng(grid: PixelGrid, scale: number): Promise<Blob> {
  const base = gridToCanvas(grid)
  const out = document.createElement('canvas')
  out.width = grid.cols * scale
  out.height = grid.rows * scale
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(base, 0, 0, out.width, out.height)
  return new Promise((resolve, reject) => {
    out.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to encode PNG'))
    }, 'image/png')
  })
}
