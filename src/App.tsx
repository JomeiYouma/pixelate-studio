import { useCallback, useEffect, useRef, useState } from 'react'
import Particles from './components/Particles'
import {
  cloneGrid,
  exportPng,
  magicErase,
  paintBrush,
  pixelate,
  removeSimilarColor,
  rowsForCols,
  type PixelGrid,
} from './lib/pixelate'

type Tool = 'erase' | 'restore' | 'wand' | 'removeColor'

const MAX_STAGE_HEIGHT = 0.66 // fraction of viewport height the canvas may use

export default function App() {
  // --- source image ---
  const sourceRef = useRef<CanvasImageSource | null>(null)
  const [meta, setMeta] = useState<{ w: number; h: number; name: string } | null>(null)

  // --- grids ---
  const baseGridRef = useRef<PixelGrid | null>(null) // pixelated, pre-edit (source of truth for "restore")
  const gridRef = useRef<PixelGrid | null>(null) // working grid (edited)

  // --- params ---
  const [cols, setCols] = useState(64)
  const [quantize, setQuantize] = useState(false)
  const [levels, setLevels] = useState(8)
  const [tool, setTool] = useState<Tool>('erase')
  const [brush, setBrush] = useState(1)
  const [tolerance, setTolerance] = useState(18)
  const [exportScale, setExportScale] = useState(8)
  const [showGrid, setShowGrid] = useState(false)
  const [edited, setEdited] = useState(false)

  // --- view ---
  const stageRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [display, setDisplay] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [dragOver, setDragOver] = useState(false)
  const drawing = useRef(false)

  const rows = meta ? rowsForCols(meta.w, meta.h, cols) : 0

  // ---- load helpers ----------------------------------------------------------
  const loadSource = useCallback(
    (src: CanvasImageSource, w: number, h: number, name: string) => {
      sourceRef.current = src
      setMeta({ w, h, name })
      setCols((c) => Math.min(c, Math.max(8, Math.min(w, 256))))
      setEdited(false)
    },
    [],
  )

  const loadFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        loadSource(img, img.naturalWidth, img.naturalHeight, file.name.replace(/\.[^.]+$/, ''))
        URL.revokeObjectURL(url)
      }
      img.src = url
    },
    [loadSource],
  )

  const loadSample = useCallback(() => {
    const s = 480
    const c = document.createElement('canvas')
    c.width = s
    c.height = s
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, s, s)
    // colourful blob on transparent background
    const g = ctx.createLinearGradient(0, 0, s, s)
    g.addColorStop(0, '#7c5cff')
    g.addColorStop(0.5, '#ff6ad5')
    g.addColorStop(1, '#3dd7d0')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffd166'
    ctx.beginPath()
    ctx.arc(s * 0.66, s * 0.36, s * 0.12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0c0c16'
    ctx.beginPath()
    ctx.arc(s * 0.4, s * 0.42, s * 0.05, 0, Math.PI * 2)
    ctx.arc(s * 0.6, s * 0.42, s * 0.05, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#0c0c16'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.arc(s / 2, s * 0.58, s * 0.16, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
    loadSource(c, s, s, 'sample')
  }, [loadSource])

  // ---- (re)build the grid when params change --------------------------------
  useEffect(() => {
    if (!sourceRef.current || !meta) return
    const base = pixelate(sourceRef.current, meta.w, meta.h, {
      cols,
      colorLevels: quantize ? levels : 0,
    })
    baseGridRef.current = base
    gridRef.current = cloneGrid(base)
    setEdited(false)
    drawView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, quantize, levels, meta])

  // ---- fit the stage --------------------------------------------------------
  const recomputeDisplay = useCallback(() => {
    const stage = stageRef.current
    if (!stage || !meta) return
    const availW = stage.clientWidth - 8
    const availH = window.innerHeight * MAX_STAGE_HEIGHT
    const aspect = cols / rows
    let w = availW
    let h = w / aspect
    if (h > availH) {
      h = availH
      w = h * aspect
    }
    setDisplay({ w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) })
  }, [meta, cols, rows])

  useEffect(() => {
    recomputeDisplay()
    window.addEventListener('resize', recomputeDisplay)
    return () => window.removeEventListener('resize', recomputeDisplay)
  }, [recomputeDisplay])

  // ---- drawing --------------------------------------------------------------
  const drawView = useCallback(() => {
    const grid = gridRef.current
    const canvas = viewRef.current
    if (!grid || !canvas) return
    canvas.width = grid.cols
    canvas.height = grid.rows
    const ctx = canvas.getContext('2d')!
    ctx.putImageData(new ImageData(new Uint8ClampedArray(grid.data), grid.cols, grid.rows), 0, 0)
  }, [])

  // redraw when geometry changes
  useEffect(() => {
    drawView()
  }, [display, drawView])

  // grid-line overlay
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.width = display.w
    overlay.height = display.h
    const ctx = overlay.getContext('2d')!
    ctx.clearRect(0, 0, display.w, display.h)
    if (!showGrid || !meta || cols > 160) return
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    const cw = display.w / cols
    const ch = display.h / rows
    ctx.beginPath()
    for (let x = 0; x <= cols; x++) {
      const px = Math.round(x * cw) + 0.5
      ctx.moveTo(px, 0)
      ctx.lineTo(px, display.h)
    }
    for (let y = 0; y <= rows; y++) {
      const py = Math.round(y * ch) + 0.5
      ctx.moveTo(0, py)
      ctx.lineTo(display.w, py)
    }
    ctx.stroke()
  }, [showGrid, display, cols, rows, meta])

  // ---- editing --------------------------------------------------------------
  const cellFromEvent = (e: React.PointerEvent): [number, number] | null => {
    const canvas = viewRef.current
    const grid = gridRef.current
    if (!canvas || !grid) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * grid.cols)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * grid.rows)
    if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return null
    return [x, y]
  }

  const applyAt = (x: number, y: number, single: boolean) => {
    const grid = gridRef.current
    const base = baseGridRef.current
    if (!grid || !base) return
    if (tool === 'erase') paintBrush(grid, base, x, y, brush - 1, 'erase')
    else if (tool === 'restore') paintBrush(grid, base, x, y, brush - 1, 'restore')
    else if (single && tool === 'wand') magicErase(grid, x, y, tolerance)
    else if (single && tool === 'removeColor') removeSimilarColor(grid, x, y, tolerance)
    setEdited(true)
    drawView()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!meta) return
    const cell = cellFromEvent(e)
    if (!cell) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drawing.current = true
    applyAt(cell[0], cell[1], true)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return
    if (tool === 'wand' || tool === 'removeColor') return // one-shot tools
    const cell = cellFromEvent(e)
    if (cell) applyAt(cell[0], cell[1], false)
  }
  const onPointerUp = () => {
    drawing.current = false
  }

  // ---- actions --------------------------------------------------------------
  const resetEdits = () => {
    const base = baseGridRef.current
    if (!base) return
    gridRef.current = cloneGrid(base)
    setEdited(false)
    drawView()
  }

  const download = async () => {
    const grid = gridRef.current
    if (!grid) return
    const blob = await exportPng(grid, exportScale)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${meta?.name || 'pixelated'}_${grid.cols}x${grid.rows}.png`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---- global paste & drop --------------------------------------------------
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) =>
        i.type.startsWith('image/'),
      )
      const file = item?.getAsFile()
      if (file) loadFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [loadFile])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const toolMeta: { id: Tool; label: string; icon: string; hint: string }[] = [
    { id: 'erase', label: 'Erase', icon: '⌫', hint: 'Paint cells transparent' },
    { id: 'restore', label: 'Restore', icon: '✎', hint: 'Bring erased cells back' },
    { id: 'wand', label: 'Magic erase', icon: '✦', hint: 'Flood-fill similar adjacent cells' },
    { id: 'removeColor', label: 'Drop colour', icon: '◈', hint: 'Remove all cells of a colour' },
  ]

  return (
    <div className="app">
      <Particles />
      <div className="bg-glow" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i style={{ background: '#7c5cff' }} />
            <i style={{ background: '#3dd7d0' }} />
            <i style={{ background: '#ff6ad5' }} />
            <i style={{ background: '#ffd166' }} />
          </span>
          <div>
            <h1>Pixelate Studio</h1>
            <p>Grid-pixelate images &amp; export with a transparent background</p>
          </div>
        </div>
        <a className="ghost-link" href="https://reactbits.dev" target="_blank" rel="noreferrer">
          background by react bits ↗
        </a>
      </header>

      <main className="layout">
        {/* ----- canvas stage ----- */}
        <section className="stage-col">
          <div
            ref={stageRef}
            className={`stage ${dragOver ? 'is-drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {meta ? (
              <div className="canvas-wrap" style={{ width: display.w, height: display.h }}>
                <canvas
                  ref={viewRef}
                  className="view-canvas"
                  style={{ width: display.w, height: display.h }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                />
                <canvas ref={overlayRef} className="overlay-canvas" />
              </div>
            ) : (
              <div className="dropzone">
                <div className="dz-icon">🖼️</div>
                <h2>Drop an image here</h2>
                <p>or paste from clipboard · PNG, JPG, WebP, GIF</p>
                <div className="dz-actions">
                  <button className="btn primary" onClick={() => fileInputRef.current?.click()}>
                    Choose file
                  </button>
                  <button className="btn" onClick={loadSample}>
                    Try a sample
                  </button>
                </div>
              </div>
            )}
          </div>

          {meta && (
            <div className="stage-meta">
              <span>
                grid <strong>{cols} × {rows}</strong>
              </span>
              <span>
                source <strong>{meta.w} × {meta.h}</strong>
              </span>
              {edited && <span className="badge">edited</span>}
            </div>
          )}
        </section>

        {/* ----- controls ----- */}
        <aside className="panel">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) loadFile(f)
              e.target.value = ''
            }}
          />

          <div className="panel-group">
            <div className="group-head">
              <span>Image</span>
            </div>
            <div className="row">
              <button className="btn block" onClick={() => fileInputRef.current?.click()}>
                {meta ? 'Replace image' : 'Open image'}
              </button>
              {!meta && (
                <button className="btn block ghost" onClick={loadSample}>
                  Sample
                </button>
              )}
            </div>
          </div>

          <div className="panel-group">
            <div className="group-head">
              <span>Pixel resolution</span>
              <em>{cols}px wide</em>
            </div>
            <input
              type="range"
              min={8}
              max={256}
              step={1}
              value={cols}
              disabled={!meta}
              onChange={(e) => setCols(+e.target.value)}
            />
            <div className="ticks">
              <span>chunky</span>
              <span>fine</span>
            </div>
          </div>

          <div className="panel-group">
            <label className="group-head toggle">
              <span>Quantize colours</span>
              <input
                type="checkbox"
                checked={quantize}
                disabled={!meta}
                onChange={(e) => setQuantize(e.target.checked)}
              />
            </label>
            {quantize && (
              <>
                <input
                  type="range"
                  min={2}
                  max={32}
                  value={levels}
                  onChange={(e) => setLevels(+e.target.value)}
                />
                <div className="ticks">
                  <span>{levels} levels / channel</span>
                </div>
              </>
            )}
          </div>

          <div className="panel-group">
            <div className="group-head">
              <span>Tools</span>
            </div>
            <div className="tool-grid">
              {toolMeta.map((t) => (
                <button
                  key={t.id}
                  className={`tool ${tool === t.id ? 'active' : ''}`}
                  disabled={!meta}
                  title={t.hint}
                  onClick={() => setTool(t.id)}
                >
                  <span className="tool-ico">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {(tool === 'erase' || tool === 'restore') && (
              <div className="sub">
                <div className="group-head sm">
                  <span>Brush size</span>
                  <em>{brush}</em>
                </div>
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={brush}
                  onChange={(e) => setBrush(+e.target.value)}
                />
              </div>
            )}
            {(tool === 'wand' || tool === 'removeColor') && (
              <div className="sub">
                <div className="group-head sm">
                  <span>Tolerance</span>
                  <em>{tolerance}%</em>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={tolerance}
                  onChange={(e) => setTolerance(+e.target.value)}
                />
              </div>
            )}

            <label className="group-head toggle sm">
              <span>Show grid lines</span>
              <input
                type="checkbox"
                checked={showGrid}
                disabled={!meta}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
            </label>

            <button className="btn block ghost" disabled={!meta || !edited} onClick={resetEdits}>
              Reset edits
            </button>
          </div>

          <div className="panel-group">
            <div className="group-head">
              <span>Export</span>
              <em>
                {cols * exportScale} × {rows * exportScale}px
              </em>
            </div>
            <div className="seg">
              {[1, 4, 8, 16].map((s) => (
                <button
                  key={s}
                  className={exportScale === s ? 'on' : ''}
                  disabled={!meta}
                  onClick={() => setExportScale(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
            <button className="btn primary block" disabled={!meta} onClick={download}>
              ⬇ Download transparent PNG
            </button>
          </div>
        </aside>
      </main>

      <footer className="footnote">
        100% client-side · your images never leave the browser · deploy on Vercel
      </footer>
    </div>
  )
}
