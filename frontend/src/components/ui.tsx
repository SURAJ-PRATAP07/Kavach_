import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react'
import type { RiskCategory, ScamStage, SignalStrength, WarningSeverity } from '../types'
import { RISK_META, SEVERITY_META, STAGE_META, STRENGTH_META } from '../lib/meta'
import { cx } from '../lib/format'

export function KavachLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 2.5 4.5 6.8v8.4c0 7.2 4.9 12.4 11.5 14.3 6.6-1.9 11.5-7.1 11.5-14.3V6.8L16 2.5Z"
        fill="url(#kv-g)"
        stroke="#2dd4aa"
        strokeOpacity=".55"
      />
      <path d="M10.5 16.2h2.2l1.6-3.6 2.6 7.4 1.9-5.1 1 1.3h1.7" stroke="#05080f" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="kv-g" x1="4" y1="3" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6ee7c8" />
          <stop offset="1" stopColor="#0e9677" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-ink-300">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardHeader({ title, icon, action, hint }: { title: string; icon?: ReactNode; action?: ReactNode; hint?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon && <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink-800 text-ink-300">{icon}</span>}
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {hint && <p className="text-xs text-ink-400">{hint}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function RiskBadge({ category, className }: { category: RiskCategory | null | undefined; className?: string }) {
  if (!category) return <span className={cx('chip bg-ink-800 text-ink-300 ring-ink-600', className)}>Not assessed</span>
  const m = RISK_META[category]
  return (
    <span className={cx('chip', m.cls, className)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  )
}

export function StrengthBadge({ strength }: { strength: SignalStrength }) {
  const m = STRENGTH_META[strength]
  return <span className={cx('chip', m.cls)}>{m.label} signal</span>
}

export function SeverityBadge({ severity }: { severity: WarningSeverity }) {
  const m = SEVERITY_META[severity]
  return <span className={cx('chip', m.cls)}>{m.label}</span>
}

export function StageChip({ stage, dim = false }: { stage: ScamStage; dim?: boolean }) {
  const m = STAGE_META[stage]
  return (
    <span
      className={cx('chip ring-1', dim && 'opacity-40')}
      style={{ color: m.color, background: `${m.color}1a`, ['--tw-ring-color' as string]: `${m.color}40` }}
    >
      {m.label}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('animate-spin', className ?? 'h-4 w-4')} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-ink-800', className)} />
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  )
}

export function EmptyState({ title, body, icon, action }: { title: string; body?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-700 px-6 py-12 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-ink-800 text-ink-300">{icon ?? <Inbox className="h-5 w-5" />}</div>
      <p className="text-sm font-medium text-white">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-400">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/5 px-6 py-10 text-center">
      <AlertTriangle className="mb-2 h-6 w-6 text-rose-400" />
      <p className="text-sm font-medium text-white">Could not load this data</p>
      <p className="mt-1 max-w-md text-sm text-ink-300">{message}</p>
      {onRetry && (
        <button className="btn btn-ghost mt-4" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      )}
    </div>
  )
}

export function StatusDot({ tone, pulse }: { tone: 'green' | 'amber' | 'red' | 'gray' | 'blue'; pulse?: boolean }) {
  const color = { green: 'text-emerald-400', amber: 'text-amber-400', red: 'text-rose-400', gray: 'text-ink-400', blue: 'text-sky-400' }[tone]
  return (
    <span className={cx('relative inline-flex h-2 w-2', color, pulse && 'pulse-ring')}>
      <span className="relative h-2 w-2 rounded-full bg-current" />
    </span>
  )
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-brand-500' : 'bg-ink-700',
      )}
    >
      <span className={cx('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  )
}

export function Modal({ open, onClose, children, title, wide }: { open: boolean; onClose: () => void; children: ReactNode; title: string; wide?: boolean }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={cx('card animate-slide-up w-full p-6', wide ? 'max-w-2xl' : 'max-w-md')} onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-base font-semibold text-white">{title}</h2>
        {children}
      </div>
    </div>
  )
}

/** Highlights the backend's matched_text inside a sentence. */
export function Highlight({ text, match, color = '#f43f5e' }: { text: string; match?: string | string[]; color?: string }) {
  const matches = (Array.isArray(match) ? match : match ? [match] : []).filter(Boolean)
  if (!matches.length) return <>{text}</>
  const escaped = matches.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'i'))
  return (
    <>
      {parts.map((p, i) =>
        matches.some((m) => m.toLowerCase() === p.toLowerCase()) ? (
          <mark key={i} className="rounded px-0.5 font-medium text-white" style={{ background: `${color}33`, boxShadow: `inset 0 -2px 0 ${color}` }}>
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}
