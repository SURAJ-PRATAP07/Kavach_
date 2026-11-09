import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Bell,
  FileClock,
  LayoutDashboard,
  Menu,
  Phone,
  Radar,
  Radio,
  Settings as SettingsIcon,
  X,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { KavachLogo, LoadingBlock, StatusDot } from './ui'
import { WarningAlert } from './WarningAlert'
import { cx, formatDuration } from '../lib/format'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/live', label: 'Live Monitoring', icon: Radio },
  { to: '/analysis', label: 'Risk Analysis', icon: Radar },
  { to: '/alerts', label: 'Warnings & Alerts', icon: Bell },
  { to: '/incidents', label: 'Incident History', icon: FileClock },
  { to: '/settings', label: 'Contacts & Settings', icon: SettingsIcon },
]

function useElapsed(startedAt: number | null, running: boolean) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => force((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [running])
  return startedAt ? (Date.now() - startedAt) / 1000 : 0
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { settings } = useApp()
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-6 pt-5">
        <KavachLogo size={34} />
        <div>
          <p className="text-[17px] font-semibold leading-none tracking-tight text-white">Kavach</p>
          <p className="mt-1 text-[11px] text-ink-400">Voice scam shield</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                isActive ? 'bg-brand-500/10 text-white ring-1 ring-inset ring-brand-500/25' : 'text-ink-300 hover:bg-ink-850 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cx('h-[18px] w-[18px]', isActive ? 'text-brand-400' : 'text-ink-400 group-hover:text-ink-300')} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="m-3 rounded-xl border border-ink-700/70 bg-ink-850 p-4">
        <p className="text-xs font-medium text-white">Under pressure on a call?</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-400">Police never arrest anyone over video call. Hang up and dial the cyber helpline.</p>
        <a href="tel:1930" className="btn btn-danger mt-3 w-full py-2 text-xs">
          <Phone className="h-3.5 w-3.5" /> Call 1930
        </a>
      </div>
      <p className="px-5 pb-4 text-[11px] text-ink-400">{settings.useMock ? 'Demo data mode' : 'Connected to Kavach API'}</p>
    </div>
  )
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { backend, settings, live } = useApp()
  const running = live.state === 'streaming' || live.state === 'connecting'
  const elapsed = useElapsed(live.startedAt, running)
  const backendTone = { online: 'green', offline: 'red', checking: 'amber', mock: 'blue' } as const
  const backendLabel = { online: 'Backend online', offline: 'Backend offline', checking: 'Checking backend', mock: 'Mock data' }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-800 bg-ink-950/85 px-4 backdrop-blur sm:px-6">
      <button className="btn btn-ghost p-2 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2 lg:hidden">
        <KavachLogo size={26} />
        <span className="font-semibold text-white">Kavach</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {running && (
          <NavLink to="/live" className="chip bg-rose-500/10 text-rose-300 ring-rose-500/30">
            <StatusDot tone="red" pulse /> Monitoring {formatDuration(elapsed)}
          </NavLink>
        )}
        <span className="chip hidden bg-ink-850 text-ink-300 ring-ink-700 sm:inline-flex" title={settings.useMock ? 'Switch to the live backend in Settings' : undefined}>
          <StatusDot tone={backendTone[backend]} pulse={backend === 'online'} />
          {backendLabel[backend]}
        </span>
      </div>
    </header>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)
  const { live, settings } = useApp()
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])

  return (
    <div className="flex min-h-full">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-ink-800 bg-ink-900 lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/80" onClick={() => setOpen(false)} />
          <aside className="animate-slide-up absolute inset-y-0 left-0 w-72 border-r border-ink-800 bg-ink-900">
            <button className="absolute right-3 top-4 p-2 text-ink-300" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<LoadingBlock rows={4} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {live.warning && (
        <WarningAlert warning={live.warning} autoPlay={settings.autoPlayWarning} onDismiss={live.dismissWarning} variant="overlay" />
      )}
    </div>
  )
}
