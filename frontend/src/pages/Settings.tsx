import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { BellRing, Database, Lock, Pencil, Plus, RefreshCw, ShieldCheck, SlidersHorizontal, Trash2, UserRound, Users } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAsync } from '../hooks/useAsync'
import { deleteContact, listContacts, saveContact } from '../services/records'
import { toErrorMessage } from '../services/api'
import { API_BASE_URL, ENDPOINTS, getStreamUrl } from '../services/config'
import type { ContactRelation, TrustedContact, WarningSeverity } from '../types'
import { formatDate } from '../lib/format'
import { CardHeader, EmptyState, ErrorState, LoadingBlock, Modal, PageHeader, SeverityBadge, Spinner, StatusDot, Toggle } from '../components/ui'

function Row({ title, body, children }: { title: string; body?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        {body && <p className="mt-0.5 text-sm text-ink-400">{body}</p>}
      </div>
      {children}
    </div>
  )
}

const RELATIONS: ContactRelation[] = ['family', 'friend', 'neighbour', 'caregiver', 'other']
const SEVERITIES: WarningSeverity[] = ['danger', 'caution', 'info']

type Draft = Omit<TrustedContact, 'id'> & { id?: string }
const EMPTY: Draft = { name: '', relation: 'family', phone: '', email: '', consent_given: false, consent_at: null, notify_on: ['danger'] }

export function Settings() {
  const { settings, updateSettings, resetSettings, backend, refreshBackend } = useApp()
  const contacts = useAsync(listContacts, [settings.useMock])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<TrustedContact | null>(null)
  const [cleared, setCleared] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!draft) return
    if (!draft.name.trim()) return setFormError('Please enter a name.')
    if (!/^\+?[\d\s-]{10,15}$/.test(draft.phone.trim())) return setFormError('Please enter a valid phone number.')
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email)) return setFormError('Please enter a valid email or leave it empty.')
    setSaving(true)
    setFormError(null)
    try {
      await saveContact({ ...draft, consent_at: draft.consent_given ? (draft.consent_at ?? new Date().toISOString()) : null })
      setDraft(null)
      contacts.reload()
    } catch (err) {
      setFormError(toErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (c: TrustedContact) => {
    await saveContact({ ...c, consent_given: false, consent_at: null })
    contacts.reload()
  }

  const remove = async () => {
    if (!confirmDelete) return
    await deleteContact(confirmDelete.id)
    setConfirmDelete(null)
    contacts.reload()
  }

  const clearLocal = () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('kavach.'))
        .forEach((k) => localStorage.removeItem(k))
    } catch {
      /* storage unavailable */
    }
    resetSettings()
    contacts.reload()
    setCleared(true)
  }

  return (
    <>
      <PageHeader title="Contacts & Settings" subtitle="Choose who Kavach can alert, what you agree to share and how the app behaves." />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Trusted contacts */}
          <section className="card card-pad">
            <CardHeader
              title="Trusted contacts"
              hint="People Kavach may alert when a call looks dangerous"
              icon={<Users className="h-4 w-4" />}
              action={
                <button className="btn btn-primary py-2" onClick={() => { setFormError(null); setDraft({ ...EMPTY }) }}>
                  <Plus className="h-4 w-4" /> Add contact
                </button>
              }
            />
            {contacts.loading ? (
              <LoadingBlock rows={2} />
            ) : contacts.error ? (
              <ErrorState message={contacts.error} onRetry={contacts.reload} />
            ) : !contacts.data?.length ? (
              <EmptyState icon={<UserRound className="h-5 w-5" />} title="No trusted contacts" body="Add a family member or friend who can step in when a scammer tries to isolate you." />
            ) : (
              <ul className="divide-y divide-ink-800">
                {contacts.data.map((c) => (
                  <li key={c.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                    <div className="flex flex-1 items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-800 text-sm font-semibold text-ink-100">
                        {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">
                          {c.name} <span className="font-normal capitalize text-ink-400">· {c.relation}</span>
                        </p>
                        <p className="text-sm text-ink-400">{c.phone}{c.email ? ` · ${c.email}` : ''}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {c.consent_given ? (
                            <span className="chip bg-emerald-500/10 text-emerald-300 ring-emerald-500/30">
                              <ShieldCheck className="h-3 w-3" /> Consent {c.consent_at ? `since ${formatDate(c.consent_at)}` : 'given'}
                            </span>
                          ) : (
                            <span className="chip bg-amber-500/10 text-amber-300 ring-amber-500/30">Awaiting consent</span>
                          )}
                          {c.notify_on.map((s) => <SeverityBadge key={s} severity={s} />)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {c.consent_given && (
                        <button className="btn btn-ghost py-2 text-xs" onClick={() => revoke(c)}>
                          Revoke consent
                        </button>
                      )}
                      <button className="btn btn-ghost p-2" aria-label={`Edit ${c.name}`} onClick={() => { setFormError(null); setDraft({ ...c }) }}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="btn btn-ghost p-2 hover:text-rose-300" aria-label={`Delete ${c.name}`} onClick={() => setConfirmDelete(c)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Notifications */}
          <section className="card card-pad">
            <CardHeader title="Notifications" hint="Alerts to your trusted contacts" icon={<BellRing className="h-4 w-4" />} />
            <div className="mb-4 rounded-xl border border-ink-700 bg-ink-850 p-4">
              {settings.notificationsConsent ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-2 text-sm text-ink-100">
                    <StatusDot tone="green" /> You allowed Kavach to notify consenting contacts
                    {settings.notificationsConsentAt && <span className="text-ink-400">on {formatDate(settings.notificationsConsentAt)}</span>}
                  </p>
                  <button className="btn btn-ghost py-2 text-xs" onClick={() => updateSettings({ notificationsConsent: false, notificationsConsentAt: null })}>
                    Revoke my consent
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-ink-300">Notifications are off. Kavach will not contact anyone until you agree.</p>
                  <button className="btn btn-primary py-2" onClick={() => setConsentOpen(true)}>
                    Review & enable
                  </button>
                </div>
              )}
            </div>
            <div className="divide-y divide-ink-800">
              {(
                [
                  ['sms', 'SMS', 'Short text alert with the warning reason'],
                  ['whatsapp', 'WhatsApp', 'Message with a link to the incident summary'],
                  ['email', 'Email', 'Detailed incident summary'],
                ] as const
              ).map(([key, title, body]) => (
                <Row key={key} title={title} body={body}>
                  <Toggle
                    label={title}
                    checked={settings.notifyChannels[key]}
                    disabled={!settings.notificationsConsent}
                    onChange={(v) => updateSettings({ notifyChannels: { ...settings.notifyChannels, [key]: v } })}
                  />
                </Row>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-400">Preview only: sending is not active yet and will be switched on once the backend and privacy review are complete.</p>
          </section>

          {/* Monitoring */}
          <section className="card card-pad">
            <CardHeader title="Monitoring" icon={<SlidersHorizontal className="h-4 w-4" />} />
            <div className="divide-y divide-ink-800">
              <Row title="Play spoken warning automatically" body="Speak the Hindi warning as soon as a danger alert appears">
                <Toggle label="Auto-play warning" checked={settings.autoPlayWarning} onChange={(v) => updateSettings({ autoPlayWarning: v })} />
              </Row>
              <Row title="Show speaker labels" body="Label transcript lines as Caller or You when available">
                <Toggle label="Speaker labels" checked={settings.showSpeakerLabels} onChange={(v) => updateSettings({ showSpeakerLabels: v })} />
              </Row>
            </div>
          </section>

          {/* Privacy */}
          <section className="card card-pad">
            <CardHeader title="Privacy" icon={<Lock className="h-4 w-4" />} />
            <div className="divide-y divide-ink-800">
              <Row title="Keep transcripts of flagged calls" body="Needed for incident reports. Turn off to keep only the risk summary.">
                <Toggle label="Store transcripts" checked={settings.storeTranscripts} onChange={(v) => updateSettings({ storeTranscripts: v })} />
              </Row>
              <Row title="Delete incidents after" body="Older incidents are removed automatically">
                <select className="input w-32" value={settings.retentionDays} onChange={(e) => updateSettings({ retentionDays: Number(e.target.value) })}>
                  {[7, 30, 90, 365].map((d) => (
                    <option key={d} value={d}>{d} days</option>
                  ))}
                </select>
              </Row>
              <Row title="Clear data on this device" body="Removes saved settings and local contacts from this browser">
                <button className="btn btn-ghost py-2 text-xs hover:text-rose-300" onClick={clearLocal}>
                  <Trash2 className="h-3.5 w-3.5" /> {cleared ? 'Cleared' : 'Clear'}
                </button>
              </Row>
            </div>
            <ul className="mt-5 space-y-1.5 rounded-xl bg-ink-850 p-4 text-xs text-ink-400">
              <li>• API keys stay on the Kavach server and are never sent to this app.</li>
              <li>• The browser does not save raw audio.</li>
              <li>• Risk results are guidance, not legal findings.</li>
            </ul>
          </section>
        </div>

        {/* Connection */}
        <aside className="space-y-6">
          <section className="card card-pad">
            <CardHeader title="Data source" icon={<Database className="h-4 w-4" />} />
            <Row title="Use mock data" body="Turn off to use the real Kavach backend">
              <Toggle label="Use mock data" checked={settings.useMock} onChange={(v) => updateSettings({ useMock: v })} />
            </Row>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-ink-850 px-4 py-3 text-sm">
              <span className="flex items-center gap-2 text-ink-100">
                <StatusDot tone={backend === 'online' ? 'green' : backend === 'offline' ? 'red' : backend === 'mock' ? 'blue' : 'amber'} />
                {backend === 'mock' ? 'Mock mode' : backend === 'online' ? 'Backend online' : backend === 'offline' ? 'Backend unreachable' : 'Checking...'}
              </span>
              <button className="text-ink-400 hover:text-white" onClick={refreshBackend} aria-label="Re-check backend">
                {backend === 'checking' ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-4 space-y-1.5 font-mono text-[11px] text-ink-400">
              <p className="label mb-2 font-sans">Endpoints</p>
              <p>REST base: {API_BASE_URL}</p>
              <p>Stream: {getStreamUrl()}</p>
              <p>{ENDPOINTS.health} · {ENDPOINTS.transcribe}</p>
              <p>{ENDPOINTS.synthesizeWarning}</p>
            </div>
          </section>
        </aside>
      </div>

      {/* Contact modal */}
      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit trusted contact' : 'Add trusted contact'}>
        {draft && (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="label mb-1.5 block">Name</span>
                <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
              </label>
              <label className="block">
                <span className="label mb-1.5 block">Relation</span>
                <select className="input capitalize" value={draft.relation} onChange={(e) => setDraft({ ...draft, relation: e.target.value as ContactRelation })}>
                  {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label mb-1.5 block">Phone</span>
                <input className="input" inputMode="tel" placeholder="+91 98765 43210" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </label>
              <label className="block sm:col-span-2">
                <span className="label mb-1.5 block">Email (optional)</span>
                <input className="input" type="email" value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </label>
            </div>
            <div>
              <span className="label mb-2 block">Alert them for</span>
              <div className="flex flex-wrap gap-2">
                {SEVERITIES.map((s) => {
                  const on = draft.notify_on.includes(s)
                  return (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setDraft({ ...draft, notify_on: on ? draft.notify_on.filter((x) => x !== s) : [...draft.notify_on, s] })}
                      className={`rounded-full px-3 py-1.5 text-sm capitalize ring-1 ${on ? 'bg-brand-500/15 text-brand-300 ring-brand-500/40' : 'text-ink-400 ring-ink-700'}`}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-850 p-3.5 text-sm text-ink-300">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#14b892]" checked={draft.consent_given} onChange={(e) => setDraft({ ...draft, consent_given: e.target.checked })} />
              <span>
                <span className="font-medium text-white">{draft.name || 'This person'} has agreed</span> to receive safety alerts from Kavach about me, including a short reason for the alert.
              </span>
            </label>
            {formError && <p className="text-sm text-rose-300">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving && <Spinner />} Save contact</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Notification consent */}
      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Allow Kavach to alert your contacts?">
        <p className="mb-3 text-sm text-ink-300">If you agree, when Kavach detects a high-risk call it may send your consenting trusted contacts:</p>
        <ul className="mb-4 space-y-1.5 text-sm text-ink-300">
          <li>• that you may be on a scam call, and the time</li>
          <li>• which scam stages were detected</li>
          <li>• a short reason (no audio is shared)</li>
        </ul>
        <p className="mb-5 text-sm text-ink-400">You can revoke this at any time from this page.</p>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setConsentOpen(false)}>Not now</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              updateSettings({ notificationsConsent: true, notificationsConsentAt: new Date().toISOString() })
              setConsentOpen(false)
            }}
          >
            I agree
          </button>
        </div>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Remove trusted contact?">
        <p className="mb-5 text-sm text-ink-300">{confirmDelete?.name} will no longer receive alerts.</p>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={remove}>Remove</button>
        </div>
      </Modal>
    </>
  )
}
