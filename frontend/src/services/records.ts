/*
 * Incidents, warnings, contacts and the warning audio.
 * Only POST /synthesize-warning exists in the backend today;
 * the others use mock data until their APIs are agreed.
 */
import type { Incident, SafetyWarning, TrustedContact } from '../types'
import { http, mockDelay } from './api'
import { ENDPOINTS, getUseMock } from './config'
import { MOCK_CONTACTS, MOCK_INCIDENTS, MOCK_WARNINGS } from '../mock/mockData'
import { uid } from '../lib/format'

/* ---------------- Incidents ---------------- */

export async function listIncidents(): Promise<Incident[]> {
  if (getUseMock()) return mockDelay(MOCK_INCIDENTS)
  const { data } = await http.get<Incident[]>(ENDPOINTS.incidents)
  return data
}

export async function getIncident(id: string): Promise<Incident | null> {
  if (getUseMock()) return mockDelay(MOCK_INCIDENTS.find((i) => i.id === id) ?? null)
  const { data } = await http.get<Incident>(ENDPOINTS.incident(id))
  return data
}

/* ---------------- Warnings ---------------- */

let mockWarnings = structuredClone(MOCK_WARNINGS)

export async function listWarnings(): Promise<SafetyWarning[]> {
  if (getUseMock()) return mockDelay(mockWarnings)
  const { data } = await http.get<SafetyWarning[]>(ENDPOINTS.warnings)
  return data
}

export async function acknowledgeWarning(id: string): Promise<void> {
  if (getUseMock()) {
    mockWarnings = mockWarnings.map((w) => (w.id === id ? { ...w, acknowledged: true } : w))
    await mockDelay(null, 150)
    return
  }
  await http.post(ENDPOINTS.acknowledgeWarning(id))
}

/**
 * POST /synthesize-warning (real backend endpoint).
 * Returns an object URL for a WAV blob. Caller must revoke it when done.
 */
export async function fetchWarningAudio(): Promise<string> {
  if (getUseMock()) {
    await mockDelay(null, 400)
    return URL.createObjectURL(makeChimeWav())
  }
  const { data } = await http.post<Blob>(ENDPOINTS.synthesizeWarning, null, { responseType: 'blob' })
  return URL.createObjectURL(data)
}

/** Two-tone alert chime used as stand-in audio in mock mode. */
function makeChimeWav(): Blob {
  const rate = 16000
  const tones = [880, 660, 880, 660]
  const toneLen = Math.round(rate * 0.22)
  const gap = Math.round(rate * 0.06)
  const total = tones.length * (toneLen + gap)
  const buffer = new ArrayBuffer(44 + total * 2)
  const v = new DataView(buffer)
  const write = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  write(0, 'RIFF'); v.setUint32(4, 36 + total * 2, true); write(8, 'WAVE')
  write(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  write(36, 'data'); v.setUint32(40, total * 2, true)
  let p = 44
  for (const f of tones) {
    for (let i = 0; i < toneLen; i++) {
      const env = Math.min(1, i / 400, (toneLen - i) / 400)
      v.setInt16(p, Math.sin((2 * Math.PI * f * i) / rate) * 9000 * env, true)
      p += 2
    }
    p += gap * 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/* ---------------- Trusted contacts ---------------- */

const CONTACTS_KEY = 'kavach.mock.contacts'

function readMockContacts(): TrustedContact[] {
  try {
    const raw = localStorage.getItem(CONTACTS_KEY)
    if (raw) return JSON.parse(raw) as TrustedContact[]
  } catch {
    /* storage unavailable */
  }
  return structuredClone(MOCK_CONTACTS)
}

function writeMockContacts(list: TrustedContact[]): void {
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable */
  }
}

export async function listContacts(): Promise<TrustedContact[]> {
  if (getUseMock()) return mockDelay(readMockContacts(), 200)
  const { data } = await http.get<TrustedContact[]>(ENDPOINTS.contacts)
  return data
}

export async function saveContact(contact: Omit<TrustedContact, 'id'> & { id?: string }): Promise<TrustedContact> {
  if (getUseMock()) {
    const list = readMockContacts()
    const saved: TrustedContact = { ...contact, id: contact.id ?? uid('CT') }
    const next = contact.id ? list.map((c) => (c.id === contact.id ? saved : c)) : [...list, saved]
    writeMockContacts(next)
    return mockDelay(saved, 200)
  }
  const { data } = contact.id
    ? await http.put<TrustedContact>(ENDPOINTS.contact(contact.id), contact)
    : await http.post<TrustedContact>(ENDPOINTS.contacts, contact)
  return data
}

export async function deleteContact(id: string): Promise<void> {
  if (getUseMock()) {
    writeMockContacts(readMockContacts().filter((c) => c.id !== id))
    await mockDelay(null, 150)
    return
  }
  await http.delete(ENDPOINTS.contact(id))
}
