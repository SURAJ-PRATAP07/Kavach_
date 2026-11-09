import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppSettings } from '../types'
import { DEFAULT_USE_MOCK, setUseMock } from '../services/config'
import { checkHealth } from '../services/transcription'
import { useLiveSession } from '../hooks/useLiveSession'
import type { LiveSession } from '../hooks/useLiveSession'

const SETTINGS_KEY = 'kavach.settings.v1'

const DEFAULT_SETTINGS: AppSettings = {
  useMock: DEFAULT_USE_MOCK,
  autoPlayWarning: true,
  showSpeakerLabels: true,
  storeTranscripts: true,
  retentionDays: 30,
  notificationsConsent: false,
  notificationsConsentAt: null,
  notifyChannels: { sms: true, whatsapp: false, email: false },
  uiLanguage: 'en',
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_SETTINGS
}

export type BackendStatus = 'checking' | 'online' | 'offline' | 'mock'

interface AppContextValue {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  resetSettings: () => void
  backend: BackendStatus
  refreshBackend: () => void
  live: LiveSession
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const s = loadSettings()
    setUseMock(s.useMock)
    return s
  })
  const [backend, setBackend] = useState<BackendStatus>('checking')

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      setUseMock(next.useMock)
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      } catch {
        /* storage unavailable */
      }
      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    try {
      localStorage.removeItem(SETTINGS_KEY)
    } catch {
      /* storage unavailable */
    }
    setUseMock(DEFAULT_SETTINGS.useMock)
    setSettings(DEFAULT_SETTINGS)
  }, [])

  const refreshBackend = useCallback(() => {
    if (settings.useMock) {
      setBackend('mock')
      return
    }
    setBackend('checking')
    checkHealth()
      .then((h) => setBackend(h.status === 'ok' ? 'online' : 'offline'))
      .catch(() => setBackend('offline'))
  }, [settings.useMock])

  useEffect(() => {
    refreshBackend()
    if (settings.useMock) return
    const id = window.setInterval(refreshBackend, 20_000)
    return () => window.clearInterval(id)
  }, [refreshBackend, settings.useMock])

  const live = useLiveSession(settings.useMock)

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings, backend, refreshBackend, live }),
    [settings, updateSettings, resetSettings, backend, refreshBackend, live],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
