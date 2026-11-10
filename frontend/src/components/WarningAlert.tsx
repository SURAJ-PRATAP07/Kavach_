import { Link } from 'react-router-dom'
import { CheckCircle2, Phone, ShieldAlert, Users } from 'lucide-react'
import type { SafetyWarning } from '../types'
import { SEVERITY_META } from '../lib/meta'
import { AudioPlayer } from './AudioPlayer'
import { SeverityBadge, StageChip } from './ui'
import { cx, formatDateTime } from '../lib/format'

interface Props {
  warning: SafetyWarning
  onDismiss?: () => void
  autoPlay?: boolean
  variant?: 'overlay' | 'card'
}

export function WarningAlert({ warning, onDismiss, autoPlay = false, variant = 'card' }: Props) {
  const meta = SEVERITY_META[warning.severity]
  const danger = warning.severity === 'danger'

  const body = (
    <div
      className={cx(
        'card relative overflow-hidden',
        variant === 'overlay' && 'animate-slide-up w-full max-w-xl shadow-2xl',
        danger && variant === 'overlay' && 'animate-shake',
        warning.acknowledged && variant === 'card' && 'opacity-75',
      )}
      style={{ borderColor: `${meta.color}55` }}
    >
      <div className="h-1 w-full" style={{ background: meta.color }} />
      <div className="card-pad">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: `${meta.color}1f`, color: meta.color }}>
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <SeverityBadge severity={warning.severity} />
              <span className="text-xs text-ink-400">{formatDateTime(warning.created_at)}</span>
              {warning.incident_id && (
                <Link to={`/incidents/${warning.incident_id}`} className="text-xs text-brand-400 hover:underline">
                  {warning.incident_id}
                </Link>
              )}
            </div>
            <h3 className={cx('font-semibold text-white', variant === 'overlay' ? 'text-xl' : 'text-base')}>{warning.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-100">{warning.message}</p>
            {warning.message_hi && <p className="mt-1 text-sm italic text-ink-300">"{warning.message_hi}"</p>}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="label mb-1.5">Why Kavach is warning you</p>
            <p className="text-sm text-ink-300">{warning.reason}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {warning.stages.map((s) => (
                <StageChip key={s} stage={s} />
              ))}
            </div>
          </div>

          <div>
            <p className="label mb-2">What to do now</p>
            <ol className="space-y-2">
              {warning.recommended_actions.map((a, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-ink-100">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink-800 text-[11px] font-semibold text-ink-300">{i + 1}</span>
                  {a}
                </li>
              ))}
            </ol>
          </div>

          <AudioPlayer autoPlay={autoPlay} tone={danger ? 'danger' : 'default'} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {onDismiss && (
            <button className={cx('btn', warning.acknowledged ? 'btn-ghost' : 'btn-primary')} onClick={onDismiss} disabled={warning.acknowledged && variant === 'card'}>
              <CheckCircle2 className="h-4 w-4" />
              {warning.acknowledged ? 'Acknowledged' : variant === 'overlay' ? 'I understand' : 'Acknowledge'}
            </button>
          )}
          <a href="tel:1930" className="btn btn-danger">
            <Phone className="h-4 w-4" /> Call 1930
          </a>
          <Link to="/settings" className="btn btn-ghost" onClick={variant === 'overlay' ? onDismiss : undefined}>
            <Users className="h-4 w-4" /> Trusted contacts
          </Link>
        </div>
      </div>
    </div>
  )

  if (variant === 'card') return body

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-ink-950/85 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-label={warning.title}>
      {body}
    </div>
  )
}
