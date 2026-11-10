import { Clock, Hash } from 'lucide-react'
import type { DetectionEvidence } from '../types'
import { STAGE_META } from '../lib/meta'
import { Highlight, StageChip, StrengthBadge } from './ui'
import { formatTime } from '../lib/format'

function showTimestamp(ts: DetectionEvidence['timestamp']): string | null {
  if (ts == null) return null
  if (typeof ts === 'string' && !Number.isNaN(Date.parse(ts))) return formatTime(ts)
  return String(ts)
}

/** One piece of explainable evidence exactly as the backend returned it. */
export function EvidenceCard({ evidence }: { evidence: DetectionEvidence }) {
  const m = STAGE_META[evidence.stage]
  const time = showTimestamp(evidence.timestamp)
  return (
    <div className="rounded-xl border border-ink-700/70 bg-ink-850 p-4" style={{ borderLeft: `3px solid ${m.color}` }}>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <StageChip stage={evidence.stage} />
        <StrengthBadge strength={evidence.signal_strength} />
        <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-ink-400">
          {evidence.segment_index != null && (
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              seg {evidence.segment_index}
            </span>
          )}
          {time && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {time}
            </span>
          )}
        </span>
      </div>
      <p className="text-[15px] leading-relaxed text-ink-100">
        "<Highlight text={evidence.transcript_text} match={evidence.matched_text} color={m.color} />"
      </p>
      <p className="mt-2 text-sm text-ink-300">{evidence.reason}</p>
      <p className="mt-2 font-mono text-[11px] text-ink-400">
        {evidence.rule_id} · {evidence.source}
      </p>
    </div>
  )
}
