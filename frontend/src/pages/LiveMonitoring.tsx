import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  AudioLines,
  FileAudio,
  Languages,
  Mic,
  MicOff,
  Play,
  RotateCcw,
  Square,
  Timer,
  Upload,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { ConnectionState, ConversationAnalysis, TranscribeResponse, TranscriptLine } from '../types'
import { transcribeFile, validateAudioFile } from '../services/transcription'
import { analyzeSegments } from '../services/detection'
import { toErrorMessage } from '../services/api'
import { CardHeader, Modal, PageHeader, Spinner, StatusDot } from '../components/ui'
import { Waveform } from '../components/Waveform'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { RiskCard } from '../components/RiskCard'
import { StageTracker } from '../components/StageTracker'
import { EvidenceCard } from '../components/EvidenceCard'
import { cx, formatDuration } from '../lib/format'
import { languageLabel } from '../lib/meta'

const STATE_LABEL: Record<ConnectionState, { label: string; tone: 'green' | 'amber' | 'red' | 'gray' | 'blue' }> = {
  idle: { label: 'Not started', tone: 'gray' },
  requesting_mic: { label: 'Requesting microphone', tone: 'amber' },
  connecting: { label: 'Connecting to Kavach', tone: 'amber' },
  ready: { label: 'Ready', tone: 'green' },
  streaming: { label: 'Listening', tone: 'green' },
  stopping: { label: 'Finishing up', tone: 'amber' },
  stopped: { label: 'Session ended', tone: 'blue' },
  error: { label: 'Error', tone: 'red' },
}

function useTicker(active: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => set((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [active])
}

export function LiveMonitoring() {
  const [tab, setTab] = useState<'live' | 'upload'>('live')
  const { settings } = useApp()

  return (
    <>
      <PageHeader
        title="Live Monitoring"
        subtitle="Put the call on speaker and start monitoring. Kavach transcribes the conversation and flags scam patterns as they happen."
        actions={
          <span className={cx('chip', settings.useMock ? 'bg-sky-500/10 text-sky-300 ring-sky-500/30' : 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30')}>
            {settings.useMock ? 'Demo replay' : 'Live microphone'}
          </span>
        }
      />
      <div className="mb-6 inline-flex rounded-xl border border-ink-700 bg-ink-900 p-1">
        {(
          [
            ['live', 'Live call', AudioLines],
            ['upload', 'Upload recording', Upload],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cx('flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors', tab === key ? 'bg-ink-800 text-white' : 'text-ink-400 hover:text-white')}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'live' ? <LivePanel /> : <UploadPanel />}
    </>
  )
}

/* ------------------------------------------------------------------ */

function LivePanel() {
  const { live, settings } = useApp()
  const [consentOpen, setConsentOpen] = useState(false)
  const consentRef = useRef(false)
  const running = live.state === 'streaming' || live.state === 'connecting' || live.state === 'requesting_mic'
  useTicker(live.state === 'streaming')
  const elapsed = live.startedAt ? (Date.now() - live.startedAt) / 1000 : 0
  const st = STATE_LABEL[live.state]
  const evidence = live.analysis.detection.stage_assessments.flatMap((s) => s.evidence).slice(-3).reverse()

  const begin = () => {
    if (!consentRef.current) {
      setConsentOpen(true)
      return
    }
    void live.start()
  }

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        {/* Controls + waveform */}
        <div className="card overflow-hidden">
          <div className="card-pad">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              {!running && live.state !== 'stopping' ? (
                <button className="btn btn-primary px-5" onClick={begin}>
                  <Play className="h-4 w-4" /> Start monitoring
                </button>
              ) : (
                <button className="btn btn-danger px-5" onClick={live.stop} disabled={live.state === 'stopping' || live.state === 'requesting_mic'}>
                  {live.state === 'stopping' ? <Spinner /> : <Square className="h-4 w-4" />} Stop monitoring
                </button>
              )}
              {(live.state === 'stopped' || live.state === 'error') && (
                <button className="btn btn-ghost" onClick={live.reset}>
                  <RotateCcw className="h-4 w-4" /> Clear
                </button>
              )}
              <div className="ml-auto flex items-center gap-2 text-sm">
                <StatusDot tone={st.tone} pulse={live.state === 'streaming'} />
                <span className="text-ink-100">{st.label}</span>
                {live.state === 'streaming' && <span className="font-mono text-ink-300">{formatDuration(elapsed)}</span>}
              </div>
            </div>

            <div className="relative rounded-xl border border-ink-800 bg-ink-950/60 px-4 py-3">
              <Waveform analyser={live.analyser} active={live.state === 'streaming'} speaking={live.speaking} />
              {live.state === 'idle' && <p className="absolute inset-0 grid place-items-center text-sm text-ink-400">Waveform appears when monitoring starts</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-ink-800 bg-ink-900/60 text-xs sm:grid-cols-3 lg:grid-cols-6">
            {[
              {
                icon: live.state === 'streaming' ? <Mic className="h-3.5 w-3.5 text-emerald-400" /> : <MicOff className="h-3.5 w-3.5" />,
                k: 'Microphone',
                v: settings.useMock ? 'Simulated' : live.analyser ? 'Recording' : 'Off',
              },
              {
                icon: live.state === 'streaming' ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5" />,
                k: 'Connection',
                v: live.state === 'streaming' ? 'WebSocket open' : live.state === 'connecting' ? 'Opening' : 'Closed',
              },
              { icon: <Languages className="h-3.5 w-3.5" />, k: 'Language', v: live.info ? languageLabel(live.info.language) : 'hi-IN' },
              { icon: <AudioLines className="h-3.5 w-3.5" />, k: 'Model', v: live.info?.model ?? 'prisma-v2.5' },
              { icon: <Timer className="h-3.5 w-3.5" />, k: 'Latency', v: live.lastLatency != null ? `${Math.round(live.lastLatency)} ms` : '--' },
              { icon: <Zap className="h-3.5 w-3.5" />, k: 'Frames sent', v: live.framesSent.toLocaleString('en-IN') },
            ].map((c) => (
              <div key={c.k} className="border-b border-r border-ink-800 px-4 py-3 last:border-r-0">
                <p className="flex items-center gap-1.5 text-ink-400">
                  {c.icon} {c.k}
                </p>
                <p className="mt-1 truncate font-medium text-ink-100">{c.v}</p>
              </div>
            ))}
          </div>
        </div>

        {live.error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div>
              <p className="font-medium text-white">Streaming problem</p>
              <p className="text-ink-300">{live.error}</p>
            </div>
          </div>
        )}

        <div className="card card-pad">
          <CardHeader
            title="Live transcript"
            hint={`${live.lines.length} segment${live.lines.length === 1 ? '' : 's'} · scam phrases are highlighted`}
            icon={<AudioLines className="h-4 w-4" />}
          />
          <TranscriptPanel
            lines={live.lines}
            detection={live.analysis.detection}
            showSpeakers={settings.showSpeakerLabels}
            autoScroll
            typing={live.speaking}
            emptyText={live.state === 'idle' ? 'Press Start monitoring. Transcribed speech appears here in real time.' : 'Listening for speech...'}
          />
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-6">
        <RiskCard risk={live.analysis.risk} detection={live.analysis.detection} title="Live risk" compact />

        <div className="card card-pad">
          <CardHeader title="Scam stages" hint={live.analysisPending ? 'Updating...' : 'Updated after each segment'} />
          <StageTracker detection={live.analysis.detection} layout="grid" />
          {live.analysisError && <p className="mt-3 text-xs text-amber-300">{live.analysisError}</p>}
        </div>

        <div className="card card-pad">
          <CardHeader
            title="Latest evidence"
            action={
              <Link to="/analysis" className="flex items-center gap-1 text-xs text-brand-400 hover:underline">
                Full analysis <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {evidence.length ? (
            <div className="space-y-3">
              {evidence.map((e) => (
                <EvidenceCard key={`${e.rule_id}-${e.segment_index}`} evidence={e} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-400">No scam signals detected yet.</p>
          )}
        </div>
      </div>

      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Before Kavach starts listening">
        <ul className="mb-5 space-y-2.5 text-sm text-ink-300">
          <li>• Kavach will use your microphone to transcribe this conversation.</li>
          <li>• Audio is sent to Kavach's server for speech recognition and is not stored by the browser.</li>
          <li>• Only start monitoring on calls you are part of, with the consent required where you live.</li>
          <li>• You can stop at any time.</li>
        </ul>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setConsentOpen(false)}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              consentRef.current = true
              setConsentOpen(false)
              void live.start()
            }}
          >
            I agree, start
          </button>
        </div>
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function UploadPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'idle' | 'transcribing' | 'analyzing'>('idle')
  const [result, setResult] = useState<TranscribeResponse | null>(null)
  const [analysis, setAnalysis] = useState<ConversationAnalysis | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const pick = (f: File | undefined) => {
    if (!f) return
    const problem = validateAudioFile(f)
    setFile(problem ? null : f)
    setError(problem)
    setResult(null)
    setAnalysis(null)
  }

  const run = async () => {
    if (!file) return
    setError(null)
    setAnalysisError(null)
    setBusy('transcribing')
    try {
      const r = await transcribeFile(file)
      setResult(r)
      setBusy('analyzing')
      try {
        setAnalysis(await analyzeSegments([{ text: r.transcript, source: 'rest', segment_index: 0 }]))
      } catch {
        setAnalysisError('Detection API is not connected yet. Transcript shown without analysis.')
      }
    } catch (e) {
      setError(toErrorMessage(e))
    } finally {
      setBusy('idle')
    }
  }

  const line: TranscriptLine[] = result
    ? [{ id: 'upload_0', text: result.transcript, source: 'rest', segment_index: 0, language_code: 'hi-IN', speaker: 'unknown', received_at: new Date().toISOString() }]
    : []

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <div className="card card-pad">
          <CardHeader title="Analyse a recorded call" hint="WAV, MP3, OGG, FLAC, AAC or M4A · up to 10 MB" icon={<FileAudio className="h-4 w-4" />} />
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              pick(e.dataTransfer.files[0])
            }}
            onClick={() => inputRef.current?.click()}
            className={cx(
              'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              drag ? 'border-brand-400 bg-brand-500/5' : 'border-ink-700 hover:border-ink-600',
            )}
          >
            <Upload className="mb-3 h-7 w-7 text-ink-400" />
            <p className="text-sm text-white">{file ? file.name : 'Drop an audio file or click to browse'}</p>
            <p className="mt-1 text-xs text-ink-400">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'The file is sent to Kavach for transcription only'}</p>
            <input ref={inputRef} type="file" accept=".wav,.mp3,.ogg,.flac,.aac,.m4a,audio/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </div>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          <div className="mt-4 flex justify-end">
            <button className="btn btn-primary" disabled={!file || busy !== 'idle'} onClick={run}>
              {busy !== 'idle' && <Spinner />}
              {busy === 'transcribing' ? 'Transcribing...' : busy === 'analyzing' ? 'Analysing...' : 'Transcribe & analyse'}
            </button>
          </div>
        </div>

        <div className="card card-pad">
          <CardHeader title="Transcript" hint={result?.model ? `Model ${result.model}${result.processing_time != null ? ` · ${result.processing_time.toFixed(2)} s` : ''}` : undefined} />
          <TranscriptPanel lines={line} detection={analysis?.detection} showSpeakers={false} emptyText="Upload a recording to see its transcript." />
          {analysisError && <p className="mt-3 text-xs text-amber-300">{analysisError}</p>}
        </div>
      </div>

      <div className="space-y-6">
        <RiskCard risk={analysis?.risk ?? null} detection={analysis?.detection} title="Recording risk" compact />
        <div className="card card-pad">
          <CardHeader title="Scam stages" />
          <StageTracker detection={analysis?.detection ?? null} layout="grid" />
        </div>
        {analysis && (
          <div className="space-y-3">
            {analysis.detection.stage_assessments
              .flatMap((s) => s.evidence)
              .map((e) => (
                <EvidenceCard key={`${e.rule_id}-${e.segment_index}`} evidence={e} />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
