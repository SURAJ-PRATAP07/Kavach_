import { Check } from 'lucide-react'
import type { DetectionResult } from '../types'
import { SCAM_STAGES } from '../types'
import { STAGE_META } from '../lib/meta'
import { cx } from '../lib/format'
import { STAGE_ICON } from '../lib/stageIcons'

/** The four digital-arrest stages as a progress chain. */
export function StageTracker({ detection, layout = 'row' }: { detection: DetectionResult | null; layout?: 'row' | 'grid' }) {
  const counts = new Map(detection?.stage_assessments.map((s) => [s.stage, s.evidence.length]) ?? [])

  return (
    <div className={cx(layout === 'row' ? 'grid grid-cols-2 gap-3 md:grid-cols-4' : 'grid grid-cols-2 gap-3')}>
      {SCAM_STAGES.map((stage, i) => {
        const m = STAGE_META[stage]
        const Icon = STAGE_ICON[stage]
        const n = counts.get(stage) ?? 0
        const hit = n > 0
        return (
          <div
            key={stage}
            className={cx('relative rounded-xl border p-4 transition-all duration-500', hit ? 'bg-ink-850' : 'border-ink-700/70 bg-ink-900')}
            style={hit ? { borderColor: `${m.color}66`, boxShadow: `0 0 0 1px ${m.color}22, 0 8px 30px -12px ${m.color}55` } : undefined}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] text-ink-400">STAGE {i + 1}</span>
              {hit ? (
                <span className="chip px-2 py-0.5 text-[10px]" style={{ color: m.color, background: `${m.color}1f` }}>
                  {n} signal{n > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-ink-400">
                  <Check className="h-3 w-3" /> clear
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: hit ? `${m.color}22` : 'var(--color-ink-800)', color: hit ? m.color : 'var(--color-ink-400)' }}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className={cx('text-sm font-medium', hit ? 'text-white' : 'text-ink-300')}>{m.label}</p>
                <p className="text-xs text-ink-400">{m.labelHi}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
