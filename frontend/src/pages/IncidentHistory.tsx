import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, FileSearch, Phone, Search, Upload, Video } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAsync } from '../hooks/useAsync'
import { listIncidents } from '../services/records'
import type { RiskCategory } from '../types'
import { detectedStages, formatDateTime, formatDuration } from '../lib/format'
import { EmptyState, ErrorState, LoadingBlock, PageHeader, RiskBadge, StageChip } from '../components/ui'

const CHANNEL_ICON = { phone: Phone, video: Video, upload: Upload }
const RISK_OPTIONS: Array<RiskCategory | 'all'> = ['all', 'critical', 'high', 'moderate', 'low']

export function IncidentHistory() {
  const { settings } = useApp()
  const { data, loading, error, reload } = useAsync(listIncidents, [settings.useMock])
  const [risk, setRisk] = useState<RiskCategory | 'all'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    return (data ?? []).filter((i) => {
      if (risk !== 'all' && i.risk?.category !== risk) return false
      const t = new Date(i.started_at).getTime()
      if (from && t < new Date(`${from}T00:00:00`).getTime()) return false
      if (to && t > new Date(`${to}T23:59:59`).getTime()) return false
      if (q) {
        const hay = `${i.id} ${i.caller_label} ${i.summary} ${i.transcript.map((l) => l.text).join(' ')}`.toLowerCase()
        if (!hay.includes(q.toLowerCase())) return false
      }
      return true
    })
  }, [data, risk, from, to, q])

  const clear = () => {
    setRisk('all')
    setFrom('')
    setTo('')
    setQ('')
  }
  const filtering = risk !== 'all' || from || to || q

  return (
    <>
      <PageHeader title="Incident History" subtitle="Past monitored conversations with their risk, detected stages and full transcript." />

      <div className="card card-pad mb-6 grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto] md:items-end">
        <label className="block">
          <span className="label mb-1.5 block">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" placeholder="Caller, ID or words in transcript" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </label>
        <label className="block">
          <span className="label mb-1.5 block">Risk level</span>
          <select className="input" value={risk} onChange={(e) => setRisk(e.target.value as RiskCategory | 'all')}>
            {RISK_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r === 'all' ? 'All levels' : r[0].toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label mb-1.5 block">From</span>
          <input type="date" className="input [color-scheme:dark]" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="label mb-1.5 block">To</span>
          <input type="date" className="input [color-scheme:dark]" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="btn btn-ghost" onClick={clear} disabled={!filtering}>
          Reset
        </button>
      </div>

      {loading ? (
        <LoadingBlock rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon={<FileSearch className="h-5 w-5" />} title="No incidents yet" body="Conversations you monitor will be listed here." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<FileSearch className="h-5 w-5" />} title="No incidents match these filters" action={<button className="btn btn-ghost" onClick={clear}>Clear filters</button>} />
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-400">
            {filtered.length} of {data.length} incidents
          </p>
          <div className="card divide-y divide-ink-800 overflow-hidden">
            {filtered.map((inc) => {
              const Icon = CHANNEL_ICON[inc.channel]
              const stages = detectedStages(inc.detection)
              return (
                <Link key={inc.id} to={`/incidents/${inc.id}`} className="flex flex-col gap-3 p-5 transition-colors hover:bg-ink-850 md:flex-row md:items-center md:gap-6">
                  <div className="flex items-center gap-3 md:w-56 md:shrink-0">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-800 text-ink-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-mono text-xs text-ink-400">{inc.id}</p>
                      <p className="text-sm font-medium text-white">{inc.caller_label}</p>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-ink-300">{inc.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {stages.length ? stages.map((s) => <StageChip key={s} stage={s} />) : <span className="text-xs text-ink-400">No scam stages detected</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 md:w-64 md:shrink-0 md:justify-end">
                    <div className="text-right">
                      <p className="text-xs text-ink-300">{formatDateTime(inc.started_at)}</p>
                      <p className="text-xs text-ink-400">{formatDuration(inc.duration_seconds)} · {inc.status}</p>
                    </div>
                    <RiskBadge category={inc.risk?.category} />
                    <ChevronRight className="hidden h-4 w-4 text-ink-400 md:block" />
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
