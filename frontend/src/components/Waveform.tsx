import { useEffect, useRef } from 'react'

/**
 * Live waveform. Uses the mic AnalyserNode when available,
 * otherwise draws a synthetic signal (mock mode) driven by `active`.
 */
export function Waveform({ analyser, active, speaking, height = 96 }: { analyser: AnalyserNode | null; active: boolean; speaking?: boolean; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const speakingRef = useRef(speaking)
  useEffect(() => {
    speakingRef.current = speaking
  }, [speaking])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let t = 0
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null
    const bars = 64
    const levels = new Array(bars).fill(0)

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      t += 1
      if (active && analyser && data) analyser.getByteTimeDomainData(data)

      for (let i = 0; i < bars; i++) {
        let target = 0.04
        if (active && analyser && data) {
          const step = Math.floor(data.length / bars)
          let peak = 0
          for (let j = 0; j < step; j++) peak = Math.max(peak, Math.abs(data[i * step + j] - 128))
          target = Math.min(1, (peak / 128) * 2.2 + 0.04)
        } else if (active) {
          const base = speakingRef.current ? 0.55 : 0.08
          const n = Math.sin(i * 0.45 + t * 0.12) * 0.5 + Math.sin(i * 1.3 - t * 0.21) * 0.35 + Math.random() * 0.4
          target = Math.max(0.04, base * Math.abs(n))
        }
        levels[i] += (target - levels[i]) * 0.25
      }

      const gap = 3
      const bw = (w - gap * (bars - 1)) / bars
      for (let i = 0; i < bars; i++) {
        const bh = Math.max(3, levels[i] * (h - 8))
        const x = i * (bw + gap)
        const y = (h - bh) / 2
        const g = ctx.createLinearGradient(0, y, 0, y + bh)
        g.addColorStop(0, active ? '#6ee7c8' : '#26334f')
        g.addColorStop(1, active ? '#0e9677' : '#1b2640')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.roundRect(x, y, bw, bh, Math.min(3, bw / 2))
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [analyser, active])

  return <canvas ref={canvasRef} className="w-full" style={{ height }} aria-label="Audio level visualisation" />
}
