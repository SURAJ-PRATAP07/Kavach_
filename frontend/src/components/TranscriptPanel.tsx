import { useEffect, useRef } from 'react'
import { MessageSquareText, UserRound } from 'lucide-react'
import type { DetectionResult, TranscriptLine } from '../types'
import { STAGE_META, languageLabel } from '../lib/meta'
import { EmptyState, Highlight } from './ui'
import { cx, formatOffset, formatTime } from '../lib/format'

interface Props {
  lines: TranscriptLine[]
  detection?: DetectionResult | null
  showSpeakers?: boolean
  autoScroll?: boolean
  emptyText?: string
  maxHeight?: string
  typing?: boolean
}

const SPEAKER = {
  caller: { label: 'Caller', cls: 'bg-rose-500/10 text-rose-300' },
  user: { label: 'You', cls: 'bg-brand-500/10 text-brand-300' },
  unknown: { label: 'Speaker', cls: 'bg-ink-800 text-ink-300' },
}

export function TranscriptPanel({ lines, detection, showSpeakers = true, autoScroll = false, emptyText, maxHeight = '28rem', typing }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (autoScroll && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [lines.length, autoScroll, typing])

  // Map segment -> evidence (by segment_index or text) for inline highlights.
  const evidence = detection?.stage_assessments.flatMap((s) => s.evidence) ?? []

  if (!lines.length && !typing) {
    return <EmptyState icon={<MessageSquareText className="h-5 w-5" />} title="No transcript yet" body={emptyText ?? 'Speech will appear here as it is transcribed.'} />
  }

  return (
    <div ref={boxRef} className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight }}>
      {lines.map((line) => {
        const hits = evidence.filter((e) => (e.segment_index != null && e.segment_index === line.segment_index) || e.transcript_text === line.text || line.text.toLowerCase().includes(e.matched_text.toLowerCase()))
        const color = hits[0] ? STAGE_META[hits[0].stage].color : undefined
        const sp = SPEAKER[line.speaker ?? 'unknown']
        const time = line.offset_ms != null ? formatOffset(line.offset_ms) : formatTime(line.received_at)
        return (
          <div key={line.id} className="animate-slide-up flex gap-3">
            <div className="w-12 shrink-0 pt-1 text-right font-mono text-[11px] text-ink-400">{time}</div>
            <div className={cx('min-w-0 flex-1 rounded-xl border px-3.5 py-2.5', hits.length ? 'bg-ink-850' : 'border-ink-800 bg-ink-900')} style={color ? { borderColor: `${color}55` } : undefined}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {showSpeakers && (
                  <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium', sp.cls)}>
                    <UserRound className="h-3 w-3" /> {sp.label}
                  </span>
                )}
                <span className="rounded-md bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-300">{languageLabel(line.language_code)}</span>
                {hits.map((h) => (
                  <span key={h.rule_id} className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: STAGE_META[h.stage].color, background: `${STAGE_META[h.stage].color}1a` }}>
                    {STAGE_META[h.stage].label}
                  </span>
                ))}
              </div>
              <p className="text-[15px] leading-relaxed text-ink-100">
                <Highlight text={line.text} match={hits.map((h) => h.matched_text)} color={color} />
              </p>
            </div>
          </div>
        )
      })}
      {typing && (
        <div className="flex gap-3">
          <div className="w-12 shrink-0" />
          <div className="flex items-center gap-1 rounded-xl border border-ink-800 bg-ink-900 px-4 py-3">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}
