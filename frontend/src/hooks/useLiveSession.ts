import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ConnectionState,
  ConversationAnalysis,
  SafetyWarning,
  StreamSafetyWarning,
  StreamServerMessage,
  TranscriptLine,
  WarningPlaybackClientStatus,
} from '../types'
import { getStreamUrl } from '../services/config'
import { MicCapture } from '../services/audioCapture'
import { emptyAnalysis } from '../services/detection'
import { CBI_PARCEL_SCRIPT, mockLiveAnalysis } from '../mock/mockData'
import { uid } from '../lib/format'
import { parseStreamServerMessage, validateWarningWav } from '../services/warningProtocol'

type WarningPlaybackUiStatus =
  | 'idle'
  | 'awaiting_audio'
  | 'received'
  | 'playing'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'

interface WarningPlaybackView {
  warning: StreamSafetyWarning | null
  status: WarningPlaybackUiStatus
  error: string | null
  acknowledgedStatus: WarningPlaybackClientStatus | null
}

interface PendingWarning {
  metadata: StreamSafetyWarning
  cancelled: boolean
  audioReceived: boolean
  lastReportedStatus: WarningPlaybackClientStatus | null
}

const WARNING_AUDIO_RECEIVE_TIMEOUT_MS = 5000
const WARNING_PLAYBACK_TIMEOUT_MIN_MS = 60_000

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
  warningConsent: boolean
  warningPlayback: WarningPlaybackView
  dismissWarning: () => void
  setWarningConsent: (granted: boolean) => void
  playWarning: () => Promise<void>
  start: (warningConsent?: boolean) => Promise<void>
  stop: () => void
  reset: () => void
}

const MOCK_TIME_SCALE = 0.55 // replay the demo script a bit faster than real time

/**
 * Live monitoring session.
 * mock = true  -> replays a scripted Hinglish scam call (no mic, no backend).
 * mock = false -> captures the mic and streams PCM to WS /ws/transcribe.
 */
export function useLiveSession(mock: boolean, autoPlayWarning = true): LiveSession {
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
  const [warningConsent, setWarningConsentState] = useState(false)
  const [warningPlayback, setWarningPlayback] = useState<WarningPlaybackView>({
    warning: null,
    status: 'idle',
    error: null,
    acknowledgedStatus: null,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const micRef = useRef<MicCapture | null>(null)
  const warningConsentRef = useRef(false)
  const pendingWarningRef = useRef<PendingWarning | null>(null)
  const seenWarningIdsRef = useRef(new Set<string>())
  const warningAudioRef = useRef<HTMLAudioElement | null>(null)
  const warningUrlRef = useRef<string | null>(null)
  const warningTimerRef = useRef<number | null>(null)
  const discardNextBinaryRef = useRef(false)
  const autoPlayWarningRef = useRef(autoPlayWarning)
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

  useEffect(() => {
    autoPlayWarningRef.current = autoPlayWarning
  }, [autoPlayWarning])

  const sendPlaybackStatus = useCallback(
    (pending: PendingWarning, status: WarningPlaybackClientStatus, reason?: string) => {
      if (pending.lastReportedStatus === status) return
      pending.lastReportedStatus = status
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'warning_playback',
          warning_id: pending.metadata.warning_id,
          status,
          ...(reason ? { reason } : {}),
        }))
      }
    },
    [],
  )

  const clearWarningAudio = useCallback(() => {
    const audio = warningAudioRef.current
    if (audio) {
      audio.onplaying = null
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    warningAudioRef.current = null
    if (warningUrlRef.current) URL.revokeObjectURL(warningUrlRef.current)
    warningUrlRef.current = null
  }, [])

  const cancelWarningPlayback = useCallback(
    (reason = 'cancelled') => {
      const pending = pendingWarningRef.current
      if (!pending) {
        clearWarningAudio()
        return
      }
      pending.cancelled = true
      if (warningTimerRef.current != null) {
        window.clearTimeout(warningTimerRef.current)
        warningTimerRef.current = null
      }
      sendPlaybackStatus(pending, 'cancelled', reason)
      if (pending.audioReceived) {
        pendingWarningRef.current = null
      }
      clearWarningAudio()
      setWarningPlayback((current) => ({ ...current, status: 'cancelled', error: null }))
    },
    [clearWarningAudio, sendPlaybackStatus],
  )

  const teardown = useCallback(async () => {
    clearTimers()
    readyRef.current = false
    cancelWarningPlayback()
    const mic = micRef.current
    micRef.current = null
    setAnalyser(null)
    if (mic) await mic.stop()
    const ws = wsRef.current
    wsRef.current = null
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close()
    pendingWarningRef.current = null
    discardNextBinaryRef.current = false
    warningConsentRef.current = false
    setWarningConsentState(false)
  }, [cancelWarningPlayback])

  useEffect(() => () => void teardown(), [teardown])

  const clearSessionView = useCallback(() => {
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
    setWarningConsentState(false)
    setWarningPlayback({ warning: null, status: 'idle', error: null, acknowledgedStatus: null })
    seenWarningIdsRef.current.clear()
    setBoth('idle')
  }, [])

  const reset = useCallback(() => {
    void teardown()
    clearSessionView()
  }, [clearSessionView, teardown])

  const setWarningConsent = useCallback(
    (granted: boolean) => {
      const enabled = !mock && granted
      warningConsentRef.current = enabled
      setWarningConsentState(enabled)
      if (!enabled) cancelWarningPlayback('consent_revoked')
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'warning_consent', granted: enabled }))
      }
    },
    [cancelWarningPlayback, mock],
  )

  const playWarning = useCallback(async () => {
    const audio = warningAudioRef.current
    const pending = pendingWarningRef.current
    if (!audio || !pending || pending.cancelled || !warningConsentRef.current) return
    try {
      await audio.play()
    } catch (playError) {
      if (playError instanceof DOMException && playError.name === 'NotAllowedError') {
        sendPlaybackStatus(pending, 'playback_blocked', 'autoplay_blocked')
        setWarningPlayback((current) => ({
          ...current,
          status: 'blocked',
          error: 'Your browser blocked automatic playback. Tap Play warning to hear it.',
        }))
        return
      }
      sendPlaybackStatus(pending, 'playback_failed', 'playback_start_failed')
      setWarningPlayback((current) => ({
        ...current,
        status: 'failed',
        error: 'The safety warning could not be played in this browser.',
      }))
      clearWarningAudio()
      pendingWarningRef.current = null
    }
  }, [clearWarningAudio, sendPlaybackStatus])

  const handleWarningMetadata = useCallback(
    (warning: StreamSafetyWarning) => {
      if (seenWarningIdsRef.current.has(warning.warning_id)) {
        discardNextBinaryRef.current = true
        const pending = pendingWarningRef.current
        if (pending) {
          pending.cancelled = true
          sendPlaybackStatus(pending, 'cancelled', 'duplicate_warning')
          pendingWarningRef.current = null
        }
        if (warningTimerRef.current != null) {
          window.clearTimeout(warningTimerRef.current)
          warningTimerRef.current = null
        }
        clearWarningAudio()
        setWarningPlayback({
          warning,
          status: 'failed',
          error: 'A duplicate warning was received and ignored.',
          acknowledgedStatus: null,
        })
        return
      }
      if (pendingWarningRef.current) {
        cancelWarningPlayback('replaced_by_new_warning')
      }
      seenWarningIdsRef.current.add(warning.warning_id)
      if (warningTimerRef.current != null) window.clearTimeout(warningTimerRef.current)
      const pending: PendingWarning = {
        metadata: warning,
        cancelled: !warningConsentRef.current,
        audioReceived: false,
        lastReportedStatus: null,
      }
      pendingWarningRef.current = pending
      if (pending.cancelled) sendPlaybackStatus(pending, 'cancelled', 'consent_not_granted')
      setWarningPlayback({ warning, status: 'awaiting_audio', error: null, acknowledgedStatus: null })
      warningTimerRef.current = window.setTimeout(() => {
        if (pendingWarningRef.current !== pending || pending.audioReceived) return
        if (pending.cancelled) {
          pendingWarningRef.current = null
          setWarningPlayback({
            warning,
            status: 'cancelled',
            error: null,
            acknowledgedStatus: null,
          })
          return
        }
        pending.cancelled = true
        sendPlaybackStatus(pending, 'playback_failed', 'audio_receive_timeout')
        setWarningPlayback({
          warning,
          status: 'failed',
          error: 'Warning audio did not arrive within 5 seconds.',
          acknowledgedStatus: null,
        })
      }, WARNING_AUDIO_RECEIVE_TIMEOUT_MS)
    },
    [cancelWarningPlayback, clearWarningAudio, sendPlaybackStatus],
  )

  const handleWarningAudio = useCallback(
    (audioBytes: ArrayBuffer) => {
      if (discardNextBinaryRef.current) {
        discardNextBinaryRef.current = false
        return
      }
      const pending = pendingWarningRef.current
      if (!pending) {
        setWarningPlayback((current) => ({
          ...current,
          status: 'failed',
          error: 'Unexpected binary audio was received without warning metadata.',
        }))
        return
      }
      pending.audioReceived = true
      if (warningTimerRef.current != null) {
        window.clearTimeout(warningTimerRef.current)
        warningTimerRef.current = null
      }
      if (
        pending.cancelled &&
        (pending.lastReportedStatus === 'playback_failed' || pending.lastReportedStatus === 'cancelled')
      ) {
        pendingWarningRef.current = null
        setWarningPlayback({
          warning: pending.metadata,
          status: pending.lastReportedStatus === 'cancelled' ? 'cancelled' : 'failed',
          error: pending.lastReportedStatus === 'cancelled' ? null : 'Warning audio arrived after its timeout and was discarded.',
          acknowledgedStatus: null,
        })
        return
      }

      const validationError = validateWarningWav(audioBytes, pending.metadata)
      if (validationError) {
        sendPlaybackStatus(pending, 'playback_failed', 'invalid_wav')
        pendingWarningRef.current = null
        setWarningPlayback({ warning: pending.metadata, status: 'failed', error: validationError, acknowledgedStatus: null })
        return
      }

      sendPlaybackStatus(pending, 'received')
      if (pending.cancelled || !warningConsentRef.current) {
        sendPlaybackStatus(pending, 'cancelled', 'consent_revoked')
        pendingWarningRef.current = null
        setWarningPlayback({ warning: pending.metadata, status: 'cancelled', error: null, acknowledgedStatus: null })
        return
      }

      const url = URL.createObjectURL(new Blob([audioBytes], { type: 'audio/wav' }))
      warningUrlRef.current = url
      const audio = new Audio(url)
      audio.preload = 'auto'
      audio.onplaying = () => {
        if (pendingWarningRef.current !== pending || pending.cancelled) return
        sendPlaybackStatus(pending, 'playback_started')
        setWarningPlayback({ warning: pending.metadata, status: 'playing', error: null, acknowledgedStatus: null })
        warningTimerRef.current = window.setTimeout(() => {
          if (pendingWarningRef.current !== pending) return
          sendPlaybackStatus(pending, 'playback_failed', 'playback_completion_timeout')
          pendingWarningRef.current = null
          clearWarningAudio()
          setWarningPlayback({
            warning: pending.metadata,
            status: 'failed',
            error: 'Warning playback did not finish before its safety timeout.',
            acknowledgedStatus: null,
          })
        }, Math.max(
          WARNING_PLAYBACK_TIMEOUT_MIN_MS,
          (pending.metadata.audio_duration_seconds * 3 + 10) * 1000,
        ))
      }
      audio.onended = () => {
        if (pendingWarningRef.current !== pending || pending.cancelled) return
        if (warningTimerRef.current != null) {
          window.clearTimeout(warningTimerRef.current)
          warningTimerRef.current = null
        }
        sendPlaybackStatus(pending, 'playback_completed')
        pendingWarningRef.current = null
        clearWarningAudio()
        setWarningPlayback({ warning: pending.metadata, status: 'completed', error: null, acknowledgedStatus: null })
      }
      audio.onerror = () => {
        if (pendingWarningRef.current !== pending || pending.cancelled) return
        if (warningTimerRef.current != null) {
          window.clearTimeout(warningTimerRef.current)
          warningTimerRef.current = null
        }
        sendPlaybackStatus(pending, 'playback_failed', 'audio_decode_error')
        pendingWarningRef.current = null
        clearWarningAudio()
        setWarningPlayback({
          warning: pending.metadata,
          status: 'failed',
          error: 'The browser could not decode the safety warning audio.',
          acknowledgedStatus: null,
        })
      }
      warningAudioRef.current = audio
      setWarningPlayback({ warning: pending.metadata, status: 'received', error: null, acknowledgedStatus: null })
      if (autoPlayWarningRef.current) void playWarning()
    },
    [clearWarningAudio, playWarning, sendPlaybackStatus],
  )

  /* ---------------- real backend ---------------- */

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
          setWarningConsentState(msg.warning_consent_enabled)
          if (msg.warning_consent_enabled !== warningConsentRef.current) {
            wsRef.current?.send(JSON.stringify({
              type: 'warning_consent',
              granted: warningConsentRef.current,
            }))
          }
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
          const detection = msg.conversation_detection ?? msg.detection
          if (detection) {
            setAnalysis((current) => ({ ...current, detection, risk: null, warning: null }))
            setAnalysisError(null)
            setAnalysisPending(false)
          } else {
            setAnalysisError('The backend did not include detection evidence for this transcript.')
          }
          break
        }
        case 'error':
          setError(msg.message)
          break
        case 'warning_consent_updated':
          warningConsentRef.current = msg.enabled
          setWarningConsentState(msg.enabled)
          break
        case 'warning_consent_error':
          warningConsentRef.current = msg.enabled
          setWarningConsentState(msg.enabled)
          setError(msg.message)
          break
        case 'safety_warning':
          handleWarningMetadata(msg)
          break
        case 'warning_synthesis_error':
          setWarningPlayback((current) => ({
            ...current,
            status: 'failed',
            error: msg.message,
          }))
          break
        case 'warning_playback_status_updated':
          setWarningPlayback((current) =>
            current.warning?.warning_id === msg.warning_id
              ? { ...current, acknowledgedStatus: msg.status }
              : current,
          )
          break
        case 'warning_playback_status_error':
          setWarningPlayback((current) => ({ ...current, error: msg.message }))
          break
        case 'connected':
        case 'processing':
        case 'provider_event':
          break
        case 'stopped':
          cancelWarningPlayback('session_stopped')
          setBoth('stopped')
          void teardown()
          break
      }
    },
    [cancelWarningPlayback, handleWarningMetadata, teardown],
  )

  const startReal = useCallback(async (consent: boolean) => {
    setBoth('requesting_mic')
    const mic = new MicCapture((frame) => {
      const ws = wsRef.current
      if (!readyRef.current || !ws || ws.readyState !== WebSocket.OPEN || stateRef.current !== 'streaming') return
      ws.send(frame)
      framesRef.current += 1
      if (framesRef.current % 16 === 0) setFramesSent(framesRef.current)
    }, () => {
      setError('The microphone was disconnected. Start a new session to continue.')
      setBoth('error')
      void teardown()
    })
    warningConsentRef.current = consent
    try {
      await mic.start()
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Could not start the microphone.')
      setBoth('error')
      warningConsentRef.current = false
      setWarningConsentState(false)
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
      if (typeof ev.data !== 'string') {
        if (ev.data instanceof ArrayBuffer) handleWarningAudio(ev.data)
        else setError('The streaming service returned an unsupported binary frame.')
        return
      }
      try {
        const parsed: unknown = JSON.parse(ev.data)
        const message = parseStreamServerMessage(parsed)
        if (!message) {
          if (typeof parsed === 'object' && parsed !== null && 'type' in parsed && parsed.type === 'safety_warning') {
            discardNextBinaryRef.current = true
            setWarningPlayback({
              warning: null,
              status: 'failed',
              error: 'Warning metadata was invalid. The associated audio will be discarded.',
              acknowledgedStatus: null,
            })
          } else {
            setError('The streaming service returned an invalid message.')
          }
          ws.close(1002, 'Invalid server message')
          return
        }
        handleMessage(message)
      } catch (messageError) {
        setError(messageError instanceof Error ? messageError.message : 'Could not process a streaming message.')
        ws.close(1002, 'Invalid server message')
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
  }, [handleMessage, handleWarningAudio, teardown])

  const stopReal = useCallback(() => {
    setWarningConsent(false)
    cancelWarningPlayback('session_stopped')
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
  }, [cancelWarningPlayback, setWarningConsent, teardown])

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

  const start = useCallback(async (allowSpokenWarnings = false) => {
    await teardown()
    clearSessionView()
    framesRef.current = 0
    warningConsentRef.current = !mock && allowSpokenWarnings
    setWarningConsentState(!mock && allowSpokenWarnings)
    if (mock) await startMock()
    else await startReal(allowSpokenWarnings)
  }, [clearSessionView, mock, startMock, startReal, teardown])

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
    warningConsent,
    warningPlayback,
    dismissWarning,
    setWarningConsent,
    playWarning,
    start,
    stop,
    reset,
  }
}
