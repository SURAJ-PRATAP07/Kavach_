import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import { Info, ListTree, Radar as RadarIcon, ScrollText } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAsync } from '../hooks/useAsync'
import { listIncidents } from '../services/records'
import type { ConversationAnalysis, DetectionEvidence } from '../types'
import { SCAM_STAGES } from '../types'
import { STAGE_META } from '../lib/meta'
import { formatDateTime, formatTime } from '../lib/format'
import { CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, StageChip, StrengthBadge } from '../components/ui'
import { RiskCard } from '../components/RiskCard'
import { StageTracker } from '../components/StageTracker'
import { STAGE_ICON } from '../lib/stageIcons'
import { EvidenceCard } from '../components/EvidenceCard'

export function RiskAnalysis() {
  const { live, settings } = useApp()
  const incidents = useAsync(listIncidents, [settings.useMock])
  const [params, setParams] = useSearchParams()
  const hasLive = live.lines.length > 0
  const [source, setSource] = useState<string>(params.get('incident') ?? (hasLive ? 'live' : ''))

  useEffect(() => {
    if (!source && incidents.data?.length) setSource(incidents.data[0].id)
  }, [source, incidents.data])

  const selected = useMemo((): { label: string; analysis: ConversationAnalysis } | null => {
    if (source === 'live') return { label: 'Current live session', analysis: live.analysis }
    const inc = incidents.data?.find((i) => i.id === source)
    if (!inc) return null
    return { label: `${inc.id} · ${formatDateTime(inc.started_at)}`, analysis: { detection: inc.detection, risk: inc.risk, warning: null } }
  }, [source, live.analysis, incidents.data])

  const choose = (v: string) => {
    setSource(v)
    setParams(v && v !== 'live' ? { incident: v } : {})
  }

  const detection = selected?.analysis.detection ?? null
  const radarData = SCAM_STAGES.map((s) => ({
    stage: STAGE_META[s].label,
    signals: detection?.stage_assessments.find((a) => a.stage === s)?.evidence.length ?? 0,
  }))
  const timeline: DetectionEvidence[] = (detection?.stage_assessments.flatMap((s) => s.evidence) ?? []).sort(
    (a, b) => (a.segment_index ?? 0) - (b.segment_index ?? 0),
  )

  return (
    <>
      <PageHeader
        title="Risk Analysis"
        subtitle="How Kavach reached its conclusion: which scam stages were found, the exact words that triggered them and why."
        actions={
          <select className="input w-auto min-w-64" value={source} onChange={(e) => choose(e.target.value)} aria-label="Select conversation">
            <option value="live" disabled={!hasLive}>
              Current live session{hasLive ? '' : ' (not started)'}
            </option>
            {incidents.data?.map((i) => (
              <option key={i.id} value={i.id}>
                {i.id} · {i.caller_label}
              </option>
            ))}
          </select>
        }
      />

      {incidents.loading && !selected ? (
        <LoadingBlock rows={4} />
      ) : incidents.error && !selected ? (
        <ErrorState message={incidents.error} onRetry={incidents.reload} />
      ) : !selected || !detection ? (
        <EmptyState title="Nothing to analyse yet" body="Start live monitoring or pick a past incident." />
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-ink-400">
            Showing <span className="text-ink-100">{selected.label}</span> · {detection.segments_analyzed} segments analysed
          </p>

          <div className="grid gap-6 lg:grid-cols-3">
            <RiskCard risk={selected.analysis.risk} detection={detection} />
            <div className="card card-pad lg:col-span-2">
              <CardHeader title="Digital-arrest scam chain" hint="A typical scam moves through these four stages" icon={<ListTree className="h-4 w-4" />} />
              <StageTracker detection={detection} />
              <div className="mt-5 grid gap-6 md:grid-cols-2">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="62%" margin={{ left: 30, right: 30 }}>
                      <PolarGrid stroke="#26334f" />
                      <PolarAngleAxis dataKey="stage" tick={{ fill: '#93a1bb', fontSize: 11 }} />
                      <Radar dataKey="signals" stroke="#2dd4aa" fill="#2dd4aa" fillOpacity={0.25} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="label mb-3 flex items-center gap-1.5">
                    <RadarIcon className="h-3.5 w-3.5" /> Detection timeline
                  </p>
                  {timeline.length ? (
                    <ol className="relative space-y-4 border-l border-ink-700 pl-5">
                      {timeline.map((e) => (
                        <li key={`${e.rule_id}-${e.segment_index}`} className="relative">
                          <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-ink-900" style={{ background: STAGE_META[e.stage].color }} />
                          <p className="text-sm text-white">{STAGE_META[e.stage].label}</p>
                          <p className="text-xs text-ink-400">
                            Segment {e.segment_index ?? '-'}
                            {typeof e.timestamp === 'string' && !Number.isNaN(Date.parse(e.timestamp)) ? ` · ${formatTime(e.timestamp)}` : ''}
                          </p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-ink-400">No signals detected in this conversation.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stage-by-stage */}
          <div className="card card-pad">
            <CardHeader title="Stage-by-stage explanation" icon={<ScrollText className="h-4 w-4" />} />
            <div className="divide-y divide-ink-800">
              {detection.stage_assessments.map((a) => {
                const m = STAGE_META[a.stage]
                const Icon = STAGE_ICON[a.stage]
                return (
                  <section key={a.stage} className="grid gap-4 py-5 first:pt-0 last:pb-0 md:grid-cols-[260px_1fr]">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: `${m.color}1f`, color: m.color }}>
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <div>
                          <p className="font-medium text-white">{m.label}</p>
                          <p className="text-xs text-ink-400">{a.evidence.length ? `${a.evidence.length} signal${a.evidence.length > 1 ? 's' : ''} found` : 'Not detected'}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-ink-300">{m.description}</p>
                      <p className="mt-2 text-xs text-ink-400">Examples: {m.examples.join(', ')}</p>
                    </div>
                    <div className="space-y-3">
                      {a.evidence.length ? (
                        a.evidence.map((e) => <EvidenceCard key={`${e.rule_id}-${e.segment_index}`} evidence={e} />)
                      ) : (
                        <div className="flex h-full min-h-20 items-center rounded-xl border border-dashed border-ink-700 px-4 text-sm text-ink-400">
                          No phrases for this stage were found in the transcript.
                        </div>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>

          {/* Signal table */}
          {timeline.length > 0 && (
            <div className="card card-pad overflow-x-auto">
              <CardHeader title="Raw signals" hint="As returned by the detection engine" />
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-ink-400">
                  <tr className="border-b border-ink-800">
                    <th className="pb-2 font-medium">Seg</th>
                    <th className="pb-2 font-medium">Stage</th>
                    <th className="pb-2 font-medium">Rule</th>
                    <th className="pb-2 font-medium">Matched text</th>
                    <th className="pb-2 font-medium">Strength</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((e) => (
                    <tr key={`${e.rule_id}-${e.segment_index}`} className="border-b border-ink-800/60 last:border-0">
                      <td className="py-2.5 font-mono text-xs text-ink-300">{e.segment_index ?? '-'}</td>
                      <td className="py-2.5"><StageChip stage={e.stage} /></td>
                      <td className="py-2.5 font-mono text-xs text-ink-300">{e.rule_id}</td>
                      <td className="py-2.5 text-ink-100">{e.matched_text}</td>
                      <td className="py-2.5"><StrengthBadge strength={e.signal_strength} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="flex gap-2 rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm text-ink-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
            {detection.disclaimer}
          </p>
        </div>
      )}
    </>
  )
}
