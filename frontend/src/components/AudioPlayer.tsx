import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Volume2 } from 'lucide-react'
import { fetchWarningAudio } from '../services/records'
import { toErrorMessage } from '../services/api'
import { Spinner } from './ui'
import { cx } from '../lib/format'

/**
 * Plays the spoken safety warning from POST /synthesize-warning
 * (Gnani Timbre, voice "Tarika", hi-IN). Audio is fetched on first play.
 */
export function AudioPlayer({ autoPlay = false, compact = false, tone = 'default' }: { autoPlay?: boolean; compact?: boolean; tone?: 'default' | 'danger' }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () => () => {
      audioRef.current?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const ensureAudio = async () => {
    if (audioRef.current) return audioRef.current
    setLoading(true)
    setError(null)
    try {
      const url = await fetchWarningAudio()
      urlRef.current = url
      const a = new Audio(url)
      a.onplay = () => setPlaying(true)
      a.onpause = () => setPlaying(false)
      a.onended = () => {
        setPlaying(false)
        setProgress(0)
      }
      a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0)
      audioRef.current = a
      return a
    } finally {
      setLoading(false)
    }
  }

  const toggle = async () => {
    try {
      const a = await ensureAudio()
      if (a.paused) await a.play()
      else a.pause()
    } catch (e) {
      setError(e instanceof DOMException ? 'Tap play to hear the warning.' : toErrorMessage(e))
    }
  }

  useEffect(() => {
    if (autoPlay) void toggle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={cx('flex items-center gap-3 rounded-xl border px-3 py-2.5', tone === 'danger' ? 'border-rose-500/30 bg-rose-500/5' : 'border-ink-700 bg-ink-850')}>
      <button
        onClick={toggle}
        disabled={loading}
        className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors', tone === 'danger' ? 'bg-rose-500 text-white hover:bg-rose-400' : 'bg-brand-500 text-ink-950 hover:bg-brand-400')}
        aria-label={playing ? 'Pause warning audio' : 'Play warning audio'}
      >
        {loading ? <Spinner /> : playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-300">
            <Volume2 className="h-3.5 w-3.5" />
            <span className="truncate">Spoken warning · Hindi · Gnani Timbre</span>
          </div>
        )}
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
          <div className={cx('h-full rounded-full transition-[width]', tone === 'danger' ? 'bg-rose-400' : 'bg-brand-400')} style={{ width: `${progress * 100}%` }} />
        </div>
        {error && <p className="mt-1 text-xs text-amber-300">{error}</p>}
      </div>
    </div>
  )
}
