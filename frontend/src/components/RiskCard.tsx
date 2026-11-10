import { Gauge, Info } from 'lucide-react'
import type { DetectionResult, RiskAssessment } from '../types'
import { RISK_META } from '../lib/meta'
import { detectedStages, evidenceCount, strongestSignal } from '../lib/format'
import { CardHeader, RiskBadge } from './ui'

/** Semicircle gauge. Draws only the score it is given. */
export function RiskGauge({ score, color, size = 200 }: { score: number | null; color: string; size?: number }) {
  const r = 80
  const c = Math.PI * r
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100
  return (
    <svg viewBox="0 0 200 116" width={size} height={size * 0.58} role="img" aria-label={score == null ? 'Risk score not provided' : `Risk score ${score} of 100`}>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--color-ink-700)" strokeWidth="14" strokeLinecap="round" />
      <path
        d="M20 100 A80 80 0 0 1 180 100"
        fill="none"
        stroke={color}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        style={{ transition: 'stroke-dasharray .6s ease' }}
      />
      <text x="100" y="88" textAnchor="middle" className="fill-white" style={{ fontSize: 38, fontWeight: 600 }}>
        {score == null ? '--' : score}
      </text>
      <text x="100" y="108" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--color-ink-400)' }}>
        {score == null ? 'no score yet' : 'out of 100'}
      </text>
    </svg>
  )
}

export function RiskCard({ risk, detection, title = 'Overall risk', compact }: { risk: RiskAssessment | null; detection?: DetectionResult | null; title?: string; compact?: boolean }) {
  const color = risk?.category ? RISK_META[risk.category].color : 'var(--color-ink-600)'
  const stages = detectedStages(detection)
  const strongest = strongestSignal(detection)

  return (
    <div className="card card-pad">
      <CardHeader title={title} icon={<Gauge className="h-4 w-4" />} action={<RiskBadge category={risk?.category} />} />
      <div className="flex flex-col items-center">
        <RiskGauge score={risk?.score ?? null} color={color} size={compact ? 170 : 210} />
        {risk?.summary && <p className="mt-2 text-center text-sm text-ink-300">{risk.summary}</p>}
      </div>
      {detection && (
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-ink-800 pt-4 text-center">
          <div>
            <p className="text-lg font-semibold text-white">{stages.length}/4</p>
            <p className="text-[11px] text-ink-400">stages</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-white">{evidenceCount(detection)}</p>
            <p className="text-[11px] text-ink-400">signals</p>
          </div>
          <div>
            <p className="text-lg font-semibold capitalize text-white">{strongest ?? '--'}</p>
            <p className="text-[11px] text-ink-400">strongest</p>
          </div>
        </div>
      )}
      {risk?.score == null && (
        <p className="mt-4 flex gap-2 rounded-lg bg-ink-850 p-3 text-xs text-ink-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The score appears only when the backend sends one. Kavach does not calculate risk in the browser.
        </p>
      )}
    </div>
  )
}
