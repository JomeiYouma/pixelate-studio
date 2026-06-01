import { useEffect, useRef } from 'react'

interface ParticlesProps {
  /** approximate particle count at 1080p; scales with viewport area */
  density?: number
  colors?: string[]
}

interface Dot {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  c: string
}

/**
 * A lightweight animated particle network rendered on a full-screen canvas.
 * Inspired by the "Particles" background from React Bits (reactbits.dev),
 * reimplemented here with vanilla canvas so it ships with no extra deps.
 */
export default function Particles({
  density = 90,
  colors = ['#7c5cff', '#3dd7d0', '#ff6ad5', '#ffd166'],
}: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let dots: Dot[] = []
    let raf = 0
    let w = 0
    let h = 0
    let dpr = 1
    const mouse = { x: -9999, y: -9999 }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const count = Math.round((density * (w * h)) / (1920 * 1080))
      dots = Array.from({ length: Math.max(24, count) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.8 + 0.8,
        c: colors[(Math.random() * colors.length) | 0],
      }))
    }

    const LINK_DIST = 130

    const frame = () => {
      ctx.clearRect(0, 0, w, h)

      for (const d of dots) {
        d.x += d.vx
        d.y += d.vy
        if (d.x < 0 || d.x > w) d.vx *= -1
        if (d.y < 0 || d.y > h) d.vy *= -1

        // gentle attraction toward the cursor
        const mdx = mouse.x - d.x
        const mdy = mouse.y - d.y
        const md2 = mdx * mdx + mdy * mdy
        if (md2 < 180 * 180) {
          d.x += mdx * 0.0008
          d.y += mdy * 0.0008
        }
      }

      // connection lines
      for (let i = 0; i < dots.length; i++) {
        const a = dots[i]
        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.hypot(dx, dy)
          if (dist < LINK_DIST) {
            ctx.globalAlpha = (1 - dist / LINK_DIST) * 0.18
            ctx.strokeStyle = a.c
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      // dots
      ctx.globalAlpha = 0.9
      for (const d of dots) {
        ctx.beginPath()
        ctx.fillStyle = d.c
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      raf = requestAnimationFrame(frame)
    }

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }
    const onLeave = () => {
      mouse.x = -9999
      mouse.y = -9999
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseout', onLeave)

    if (reduceMotion) {
      frame()
      cancelAnimationFrame(raf)
      raf = 0
    } else {
      raf = requestAnimationFrame(frame)
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseout', onLeave)
    }
  }, [density, colors])

  return <canvas ref={canvasRef} className="particles-canvas" aria-hidden="true" />
}
