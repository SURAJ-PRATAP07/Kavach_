/*
 * Runtime configuration. The data-source mode can be flipped in Settings,
 * so services read it through getUseMock() instead of a constant.
 */
const envMock = (import.meta.env.VITE_USE_MOCK ?? 'true').toString().toLowerCase() !== 'false'

let useMock = envMock

export function getUseMock(): boolean {
  return useMock
}

export function setUseMock(value: boolean): void {
  useMock = value
}

export const DEFAULT_USE_MOCK = envMock

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || '/api'

export function getStreamUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL
  if (explicit) return explicit
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/ws/transcribe`
}

/*
 * Endpoint map. The first four exist in the backend today.
 * The rest are PLACEHOLDERS: confirm the real paths with the backend team
 * and edit them here only. No component uses these strings directly.
 */
export const ENDPOINTS = {
  health: '/health',
  transcribe: '/transcribe',
  synthesizeWarning: '/synthesize-warning',
  stream: '/ws/transcribe',

  // TODO(backend): confirm paths and payloads before turning mock mode off.
  analyze: '/detect',
  incidents: '/incidents',
  incident: (id: string) => `/incidents/${encodeURIComponent(id)}`,
  warnings: '/warnings',
  acknowledgeWarning: (id: string) => `/warnings/${encodeURIComponent(id)}/acknowledge`,
  contacts: '/contacts',
  contact: (id: string) => `/contacts/${encodeURIComponent(id)}`,
} as const
