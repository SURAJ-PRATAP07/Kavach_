import { useState } from 'react'
import { BellOff } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAsync } from '../hooks/useAsync'
import { acknowledgeWarning, listWarnings } from '../services/records'
import type { WarningSeverity } from '../types'
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '../components/ui'
import { WarningAlert } from '../components/WarningAlert'
import { cx } from '../lib/format'

type Filter = 'open' | 'all' | WarningSeverity

export function Alerts() {
  const { settings, live } = useApp()
  const { data, loading, error, reload, setData } = useAsync(listWarnings, [settings.useMock])
  const [filter, setFilter] = useState<Filter>('open')

  const ack = async (id: string) => {
    setData((prev) => prev?.map((w) => (w.id === id ? { ...w, acknowledged: true } : w)) ?? prev)
    try {
      await acknowledgeWarning(id)
    } catch {
      reload()
    }
  }

  const list = (data ?? []).filter((w) => (filter === 'all' ? true : filter === 'open' ? !w.acknowledged : w.severity === filter))
  const openCount = data?.filter((w) => !w.acknowledged).length ?? 0

  const filters: Array<[Filter, string]> = [
    ['open', `Open (${openCount})`],
    ['all', 'All'],
    ['danger', 'Danger'],
    ['caution', 'Caution'],
    ['info', 'Info'],
  ]

  return (
    <>
      <PageHeader title="Warnings & Alerts" subtitle="Every warning Kavach has shown, the reason behind it and what to do next. Tap play to hear the spoken Hindi warning." />

      {live.warning && (
        <div className="mb-6">
          <p className="label mb-2">Active now</p>
          <WarningAlert warning={live.warning} onDismiss={live.dismissWarning} />
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cx('rounded-full px-3.5 py-1.5 text-sm transition-colors', filter === k ? 'bg-ink-700 text-white' : 'bg-ink-900 text-ink-400 ring-1 ring-ink-700 hover:text-white')}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingBlock rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <EmptyState icon={<BellOff className="h-5 w-5" />} title={filter === 'open' ? 'No open warnings' : 'No warnings match this filter'} body="You are all caught up." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {list.map((w) => (
            <WarningAlert key={w.id} warning={w} onDismiss={() => ack(w.id)} />
          ))}
        </div>
      )}
    </>
  )
}
