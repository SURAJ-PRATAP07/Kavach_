import type { DetectionResult, ScamStage, SignalStrength } from '../types'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} day${d > 1 ? 's' : ''} ago`
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function formatOffset(ms?: number): string {
  if (ms == null) return '--:--'
  return formatDuration(ms / 1000)
}

/** Pure display helpers over backend detection output (no scoring). */
export function detectedStages(result: DetectionResult | null | undefined): ScamStage[] {
  if (!result) return []
  return result.stage_assessments.filter((s) => s.evidence.length > 0).map((s) => s.stage)
}

export function evidenceCount(result: DetectionResult | null | undefined): number {
  if (!result) return 0
  return result.stage_assessments.reduce((n, s) => n + s.evidence.length, 0)
}

const ORDER: SignalStrength[] = ['low', 'medium', 'high']

export function strongestSignal(result: DetectionResult | null | undefined): SignalStrength | null {
  let best: SignalStrength | null = null
  for (const s of result?.stage_assessments ?? []) {
    for (const e of s.evidence) {
      if (best === null || ORDER.indexOf(e.signal_strength) > ORDER.indexOf(best)) best = e.signal_strength
    }
  }
  return best
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}
