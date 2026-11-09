import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, ExternalLink, FileText, Printer, Radar } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAsync } from '../hooks/useAsync'
import { getIncident } from '../services/records'
import { detectedStages, formatDateTime, formatDuration } from '../lib/format'
import { languageLabel } from '../lib/meta'
import { CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader } from '../components/ui'
import { RiskCard } from '../components/RiskCard'
import { StageTracker } from '../components/StageTracker'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { EvidenceCard } from '../components/EvidenceCard'

export function IncidentDetails() {
  const { id = '' } = useParams()
  const { settings } = useApp()
  const { data: inc, loading, error, reload } = useAsync(() => getIncident(id), [id, settings.useMock])

  const exportJson = () => {
    if (!inc) return
    const blob = new Blob([JSON.stringify(inc, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kavach-${inc.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const back = (
    <Link to="/incidents" className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-white">
      <ArrowLeft className="h-4 w-4" /> All incidents
    </Link>
  )

  if (loading) return <>{back}<LoadingBlock rows={6} /></>
  if (error) return <>{back}<ErrorState message={error} onRetry={reload} /></>
  if (!inc) return <>{back}<EmptyState title="Incident not found" body={`No incident with ID ${id}.`} /></>

  const evidence = inc.detection.stage_assessments.flatMap((s) => s.evidence)

  return (
    <>
      {back}
      <PageHeader
        title={`Incident ${inc.id}`}
        subtitle={inc.summary}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Link to={`/analysis?incident=${inc.id}`} className="btn btn-ghost">
              <Radar className="h-4 w-4" /> Analysis
            </Link>
            <button className="btn btn-ghost" onClick={exportJson}>
              <Download className="h-4 w-4" /> Export
            </button>
            <button className="btn btn-ghost" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print report
            </button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          ['Started', formatDateTime(inc.started_at)],
          ['Duration', formatDuration(inc.duration_seconds)],
          ['Caller', inc.caller_label],
          ['Channel', inc.channel[0].toUpperCase() + inc.channel.slice(1)],
          ['Language', languageLabel(inc.language)],
        ].map(([k, v]) => (
          <div key={k} className="card px-4 py-3">
            <p className="label">{k}</p>
            <p className="mt-1 truncate text-sm text-white">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card card-pad">
            <CardHeader title="Scam stages" hint={`${detectedStages(inc.detection).length} of 4 detected`} />
            <StageTracker detection={inc.detection} />
          </div>
          <div className="card card-pad">
            <CardHeader title="Full transcript" hint={`${inc.transcript.length} segments`} icon={<FileText className="h-4 w-4" />} />
            <TranscriptPanel lines={inc.transcript} detection={inc.detection} showSpeakers={settings.showSpeakerLabels} maxHeight="none" />
          </div>
        </div>
        <div className="space-y-6">
          <RiskCard risk={inc.risk} detection={inc.detection} />
          <div className="card card-pad">
            <CardHeader title="Detected evidence" hint={`${evidence.length} signal${evidence.length === 1 ? '' : 's'}`} />
            {evidence.length ? (
              <div className="space-y-3">
                {evidence.map((e) => (
                  <EvidenceCard key={`${e.rule_id}-${e.segment_index}`} evidence={e} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-400">No scam signals were detected.</p>
            )}
          </div>
          <div className="card card-pad no-print">
            <p className="text-sm font-medium text-white">Report this incident</p>
            <p className="mt-1 text-sm text-ink-400">Use the printed report and transcript when filing a complaint.</p>
            <div className="mt-4 flex flex-col gap-2">
              <a href="tel:1930" className="btn btn-danger">Call 1930 helpline</a>
              <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer" className="btn btn-ghost">
                cybercrime.gov.in <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-6 text-xs text-ink-400">{inc.detection.disclaimer}</p>
    </>
  )
}
