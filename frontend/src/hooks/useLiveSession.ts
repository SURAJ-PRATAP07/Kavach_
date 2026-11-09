import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ConnectionState,
  ConversationAnalysis,
  SafetyWarning,
  StreamServerMessage,
  TranscriptLine,
} from '../types'
import { getStreamUrl } from '../services/config'
import { MicCapture } from '../services/audioCapture'
import { analyzeSegments, emptyAnalysis } from '../services/detection'
import { CBI_PARCEL_SCRIPT, mockLiveAnalysis } from '../mock/mockData'
import { uid } from '../lib/format'

export interface SessionInfo {
  model: string
  language: string
  sampleRate: number
  encoding: string
  frameBytes: number
}

export interface LiveSession {
  state: ConnectionState
  lines: TranscriptLine[]
  analysis: ConversationAnalysis
  analysisPending: boolean
  analysisError: string | null
  error: string | null
  info: SessionInfo | null
  startedAt: number | null
  lastLatency: number | null
  framesSent: number
  speaking: boolean
  analyser: AnalyserNode | null
  warning: SafetyWarning | null
  dismissWarning: () => void
  start: () => Promise<void>
  stop: () => void
  reset: () => void
}

const MOCK_TIME_SCALE = 0.55 // replay the demo script a bit faster than real time

/**
 * Live monitoring session.
 * mock = true  -> replays a scripted Hinglish scam call (no mic, no backend).
 * mock = false -> captures the mic and streams PCM to WS /ws/transcribe.
 */
export function useLiveSession(mock: boolean): LiveSession {
  const [state, setState] = useState<ConnectionState>('idle')
  const [lines, setLines] = useState<TranscriptLine[]>([])
  const [analysis, setAnalysis] = useState<ConversationAnalysis>(emptyAnalysis())
  const [analysisPending, setAnalysisPending] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [lastLatency, setLastLatency] = useState<number | null>(null)
  const [framesSent, setFramesSent] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const micRef = useRef<MicCapture | null>(null)
  const timersRef = useRef<number[]>([])
  const readyRef = useRef(false)
  const framesRef = useRef(0)
  const stateRef = useRef<ConnectionState>('idle')
  const linesRef = useRef<TranscriptLine[]>([])

  const setBoth = (s: ConnectionState) => {
    stateRef.current = s
    setState(s)
  }

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t))
    timersRef.current = []
  }

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms))
  }

  const teardown = useCallback(async () => {
    clearTimers()
    readyRef.current = false
    const mic = micRef.current
    micRef.current = null
    setAnalyser(null)
    if (mic) await mic.stop()
    const ws = wsRef.current
    wsRef.current = null
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close()
  }, [])

  useEffect(() => () => void teardown(), [teardown])

  const reset = useCallback(() => {
    void teardown()
    linesRef.current = []
    setLines([])
    setAnalysis(emptyAnalysis())
    setAnalysisError(null)
    setError(null)
    setInfo(null)
    setStartedAt(null)
    setLastLatency(null)
    setFramesSent(0)
    setSpeaking(false)
    setDismissedKey(null)
    setBoth('idle')
  }, [teardown])

  /* ---------------- real backend ---------------- */

  const runAnalysis = useCallback(async () => {
    setAnalysisPending(true)
    try {
      const result = await analyzeSegments(linesRef.current)
      setAnalysis(result)
      setAnalysisError(null)
    } catch {
      setAnalysisError('Detection API is not connected yet. Showing transcript only.')
    } finally {
      setAnalysisPending(false)
    }
  }, [])

  const handleMessage = useCallback(
    (msg: StreamServerMessage) => {
      switch (msg.type) {
        case 'ready':
          readyRef.current = true
          setInfo({
            model: msg.model,
            language: msg.language,
            sampleRate: msg.sample_rate,
            encoding: msg.encoding,
            frameBytes: msg.frame_bytes,
          })
          setStartedAt(Date.now())
          setBoth('streaming')
          break
        case 'transcript': {
          if (!msg.text?.trim()) break
          const line: TranscriptLine = {
            id: msg.segment_id ?? uid('seg'),
            text: msg.text,
            source: 'streaming',
            segment_id: msg.segment_id,
            segment_index: msg.segment_index,
            timestamp: msg.timestamp,
            audio_duration_ms: msg.audio_duration_ms,
            language_code: msg.detected_language_code,
            speaker: 'unknown',
            received_at: new Date().toISOString(),
          }
          linesRef.current = [...linesRef.current, line]
          setLines(linesRef.current)
          if (msg.latency != null) setLastLatency(msg.latency)
          void runAnalysis()
          break
        }
        case 'error':
          setError(msg.message)
          break
        case 'stopped':
          setBoth('stopped')
          void teardown()
          break
        default:
          break
      }
    },
    [runAnalysis, teardown],
  )

  const startReal = useCallback(async () => {
    setBoth('requesting_mic')
    const mic = new MicCapture((frame) => {
      const ws = wsRef.current
      if (!readyRef.current || !ws || ws.readyState !== WebSocket.OPEN || stateRef.current !== 'streaming') return
      ws.send(frame)
      framesRef.current += 1
      if (framesRef.current % 16 === 0) setFramesSent(framesRef.current)
    })
    try {
      await mic.start()
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Could not start the microphone.')
      setBoth('error')
      await mic.stop()
      return
    }
    micRef.current = mic
    setAnalyser(mic.analyser)
    setBoth('connecting')

    const ws = new WebSocket(getStreamUrl())
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      try {
        handleMessage(JSON.parse(ev.data) as StreamServerMessage)
      } catch {
        /* ignore malformed message */
      }
    }
    ws.onerror = () => {
      setError('Could not connect to the Kavach streaming service.')
    }
    ws.onclose = () => {
      const s = stateRef.current
      if (s !== 'stopped' && s !== 'idle') {
        setBoth(s === 'stopping' ? 'stopped' : 'error')
        setError((prev) => prev ?? 'The streaming connection closed unexpectedly.')
      }
      void teardown()
    }
  }, [handleMessage, teardown])

  const stopReal = useCallback(() => {
    setBoth('stopping')
    const mic = micRef.current
    micRef.current = null
    setAnalyser(null)
    void mic?.stop()
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }))
      // Backend sends ~1 s of silence then waits up to 3 s for a final transcript.
      later(() => {
        if (stateRef.current === 'stopping') {
          setBoth('stopped')
          void teardown()
        }
      }, 7000)
    } else {
      setBoth('stopped')
      void teardown()
    }
  }, [teardown])

  /* ---------------- mock demo ---------------- */

  const startMock = useCallback(async () => {
    setBoth('requesting_mic')
    later(() => setBoth('connecting'), 400)
    later(() => {
      readyRef.current = true
      const t0 = Date.now()
      const startIso = new Date(t0).toISOString()
      setInfo({ model: 'prisma-v2.5', language: 'hi-IN', sampleRate: 16000, encoding: 'pcm_s16le', frameBytes: 1024 })
      setStartedAt(t0)
      setBoth('streaming')
      framesRef.current = 0
      const tick = window.setInterval(() => {
        if (stateRef.current !== 'streaming') return window.clearInterval(tick)
        framesRef.current += 31
        setFramesSent(framesRef.current)
      }, 1000)
      timersRef.current.push(tick)

      CBI_PARCEL_SCRIPT.forEach((l, i) => {
        const at = l.at * 1000 * MOCK_TIME_SCALE
        later(() => setSpeaking(true), Math.max(0, at - 1600))
        later(() => {
          setSpeaking(false)
          const line: TranscriptLine = {
            id: `live_${i}`,
            text: l.text,
            source: 'streaming',
            segment_id: `seg-${i.toString().padStart(3, '0')}`,
            segment_index: i,
            timestamp: new Date().toISOString(),
            audio_duration_ms: 2600,
            language_code: l.lang,
            speaker: l.speaker,
            received_at: new Date().toISOString(),
            offset_ms: Date.now() - t0,
          }
          linesRef.current = [...linesRef.current, line]
          setLines(linesRef.current)
          setLastLatency(180 + Math.round(Math.random() * 60))
          setAnalysisPending(true)
          later(() => {
            setAnalysis(mockLiveAnalysis(i + 1, startIso))
            setAnalysisPending(false)
          }, 450)
        }, at)
      })
    }, 1100)
  }, [])

  const stopMock = useCallback(() => {
    setBoth('stopping')
    clearTimers()
    setSpeaking(false)
    later(() => setBoth('stopped'), 900)
  }, [])

  /* ---------------- public API ---------------- */

  const start = useCallback(async () => {
    reset()
    framesRef.current = 0
    if (mock) await startMock()
    else await startReal()
  }, [mock, reset, startMock, startReal])

  const stop = useCallback(() => {
    if (mock) stopMock()
    else stopReal()
  }, [mock, stopMock, stopReal])

  const w = analysis.warning
  const key = w ? `${w.id}:${w.severity}` : null
  const warning = w && key !== dismissedKey ? w : null
  const dismissWarning = useCallback(() => setDismissedKey(key), [key])

  return {
    state,
    lines,
    analysis,
    analysisPending,
    analysisError,
    error,
    info,
    startedAt,
    lastLatency,
    framesSent,
    speaking,
    analyser,
    warning,
    dismissWarning,
    start,
    stop,
    reset,
  }
}
