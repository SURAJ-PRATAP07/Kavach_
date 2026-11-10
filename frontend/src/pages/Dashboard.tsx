import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, ArrowRight, Bell, FileClock, PhoneCall, Radio, ShieldCheck, ShieldAlert, Users } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAsync } from '../hooks/useAsync'
import { listContacts, listIncidents, listWarnings } from '../services/records'
import { MOCK_DAILY_STATS, MOCK_SUMMARY } from '../mock/mockData'
import { SCAM_STAGES } from '../types'
import { STAGE_META } from '../lib/meta'
import { detectedStages, formatDuration, timeAgo } from '../lib/format'
import { CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, RiskBadge, SeverityBadge, StageChip, StatusDot } from '../components/ui'
import { RiskCard } from '../components/RiskCard'

function Stat({ label, value, icon, note }: { label: string; value: string | number; icon: ReactNode; note?: string }) {
  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between">
        <p className="label">{label}</p>
        <span className="text-ink-400">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-400">{note}</p>}
    </div>
  )
}

const tooltipStyle = {
  contentStyle: { background: '#0e1525', border: '1px solid #26334f', borderRadius: 10, fontSize: 12 },
  labelStyle: { color: '#dbe3f1' },
  itemStyle: { color: '#93a1bb' },
}

export function Dashboard() {
  const { live, settings, backend } = useApp()
  const incidents = useAsync(listIncidents, [settings.useMock])
  const warnings = useAsync(listWarnings, [settings.useMock])
  const contacts = useAsync(listContacts, [settings.useMock])

  const monitoring = live.state === 'streaming'
  const latest = incidents.data?.[0]
  const activeAlerts = warnings.data?.filter((w) => !w.acknowledged).length ?? 0
  const consented = contacts.data?.filter((c) => c.consent_given).length ?? 0

  const stageCounts = SCAM_STAGES.map((s) => ({
    stage: STAGE_META[s].label,
    count: incidents.data?.filter((i) => detectedStages(i.detection).includes(s)).length ?? 0,
    color: STAGE_META[s].color,
  }))

  const chart = MOCK_DAILY_STATS.map((d) => ({
    day: new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    Monitored: d.monitored,
    Flagged: d.flagged,
  }))

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Your protection at a glance. Kavach listens only when you start monitoring and explains every warning it gives."
        actions={
          <Link to="/live" className="btn btn-primary">
            <Radio className="h-4 w-4" /> {monitoring ? 'Open live session' : 'Start monitoring'}
          </Link>
        }
      />

      {/* Protection status hero */}
      <section className="card grid-bg relative mb-6 overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="card-pad relative flex flex-col gap-6 md:flex-row md:items-center">
          <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/30">
            {activeAlerts > 0 ? <ShieldAlert className="h-10 w-10 text-amber-300" /> : <ShieldCheck className="h-10 w-10" />}
          </div>
          <div className="flex-1">
            <p className="label mb-1">Protection status</p>
            <h2 className="text-xl font-semibold text-white">
              {monitoring ? 'Monitoring an active call' : activeAlerts > 0 ? `${activeAlerts} warning${activeAlerts > 1 ? 's' : ''} need your attention` : 'You are protected'}
            </h2>
            <p className="mt-1 text-sm text-ink-300">
              Kavach is watching for impersonation, threats, isolation and money requests in Hindi, Hinglish and English.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-ink-400">Live monitoring</p>
              <p className="mt-0.5 flex items-center gap-2 text-white">
                <StatusDot tone={monitoring ? 'red' : 'gray'} pulse={monitoring} />
                {monitoring && live.startedAt ? `On · ${formatDuration((Date.now() - live.startedAt) / 1000)}` : 'Off'}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-400">Speech engine</p>
              <p className="mt-0.5 flex items-center gap-2 text-white">
                <StatusDot tone={backend === 'online' ? 'green' : backend === 'mock' ? 'blue' : backend === 'offline' ? 'red' : 'amber'} />
                {backend === 'mock' ? 'Demo' : backend === 'online' ? 'Online' : backend === 'offline' ? 'Offline' : '...'}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-400">Trusted contacts</p>
              <p className="mt-0.5 text-white">{contacts.data ? `${consented} of ${contacts.data.length} active` : '...'}</p>
            </div>
            <div>
              <p className="text-xs text-ink-400">Protected since</p>
              <p className="mt-0.5 text-white">{timeAgo(MOCK_SUMMARY.protectedSince)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Calls monitored" value={MOCK_SUMMARY.callsMonitored} icon={<PhoneCall className="h-4 w-4" />} note="Last 14 days" />
        <Stat label="Scams flagged" value={MOCK_SUMMARY.scamsFlagged} icon={<ShieldAlert className="h-4 w-4" />} note="Moderate risk or above" />
        <Stat label="Warnings given" value={MOCK_SUMMARY.warningsPlayed} icon={<Bell className="h-4 w-4" />} note="Spoken + on screen" />
        <Stat label="Open alerts" value={activeAlerts} icon={<Activity className="h-4 w-4" />} note={activeAlerts ? 'Review in Alerts' : 'All acknowledged'} />
      </section>

      <section className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="card card-pad lg:col-span-2">
          <CardHeader title="Detection activity" hint="Calls monitored vs flagged per day" icon={<Activity className="h-4 w-4" />} />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gMon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2dd4aa" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2dd4aa" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gFlag" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1b2640" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#6b7a96', fontSize: 11 }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fill: '#6b7a96', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="Monitored" stroke="#2dd4aa" strokeWidth={2} fill="url(#gMon)" />
                <Area type="monotone" dataKey="Flagged" stroke="#f43f5e" strokeWidth={2} fill="url(#gFlag)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {latest ? (
          <RiskCard risk={latest.risk} detection={latest.detection} title="Latest call risk" compact />
        ) : (
          <div className="card card-pad">{incidents.loading ? <LoadingBlock /> : <EmptyState title="No calls yet" />}</div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card card-pad lg:col-span-2">
          <CardHeader
            title="Recent incidents"
            icon={<FileClock className="h-4 w-4" />}
            action={
              <Link to="/incidents" className="flex items-center gap-1 text-xs text-brand-400 hover:underline">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {incidents.loading ? (
            <LoadingBlock />
          ) : incidents.error ? (
            <ErrorState message={incidents.error} onRetry={incidents.reload} />
          ) : !incidents.data?.length ? (
            <EmptyState title="No incidents recorded" body="Monitored calls with scam signals will appear here." />
          ) : (
            <ul className="divide-y divide-ink-800">
              {incidents.data.slice(0, 4).map((inc) => (
                <li key={inc.id}>
                  <Link to={`/incidents/${inc.id}`} className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 hover:bg-ink-850">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-400">{inc.id}</span>
                        <span className="truncate text-sm font-medium text-white">{inc.caller_label}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-ink-400">{inc.summary}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {detectedStages(inc.detection).map((s) => (
                          <StageChip key={s} stage={s} />
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <RiskBadge category={inc.risk?.category} />
                      <span className="text-xs text-ink-400">{timeAgo(inc.started_at)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-6">
          <div className="card card-pad">
            <CardHeader title="Stages seen in incidents" icon={<ShieldAlert className="h-4 w-4" />} />
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageCounts} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="stage" width={110} tick={{ fill: '#93a1bb', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: '#121b2f' }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={14} shape={(p: unknown) => {
                    const { x, y, width, height, payload } = p as { x: number; y: number; width: number; height: number; payload: { color: string } }
                    return <rect x={x} y={y} width={width} height={height} rx={6} fill={payload.color} />
                  }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card card-pad">
            <CardHeader
              title="Recent alerts"
              icon={<Bell className="h-4 w-4" />}
              action={
                <Link to="/alerts" className="flex items-center gap-1 text-xs text-brand-400 hover:underline">
                  All <ArrowRight className="h-3 w-3" />
                </Link>
              }
            />
            {warnings.loading ? (
              <LoadingBlock rows={2} />
            ) : (
              <ul className="space-y-3">
                {warnings.data?.slice(0, 3).map((w) => (
                  <li key={w.id} className="flex items-start gap-3">
                    <SeverityBadge severity={w.severity} />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{w.title}</p>
                      <p className="text-xs text-ink-400">
                        {timeAgo(w.created_at)} · {w.acknowledged ? 'acknowledged' : 'open'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link to="/settings" className="card card-pad flex items-center gap-3 hover:border-ink-600">
            <Users className="h-5 w-5 text-brand-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Trusted contacts</p>
              <p className="text-xs text-ink-400">Who Kavach can alert when you are at risk</p>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-400" />
          </Link>
        </div>
      </section>
    </>
  )
}
