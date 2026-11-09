# Kavach Frontend

React + TypeScript dashboard for Kavach, the voice safety companion against digital-arrest scams.

It runs fully on **mock data** today, and is wired so the real FastAPI backend can be switched on from one toggle.

---

## Quick start

```bash
cd frontend
npm install
cp .env.example .env.local     # optional
npm run dev                    # http://localhost:5173
```

Production build:

```bash
npm run build
npm run preview
```

---

## Tech stack

| Tool | Use |
|---|---|
| React 19 + TypeScript | UI |
| Vite | Dev server, build, API proxy |
| Tailwind CSS v4 | Styling (dark security theme) |
| React Router | Pages |
| Axios | REST calls |
| Recharts | Charts |
| Lucide React | Icons |

---

## Pages

| Route | Page | What it shows |
|---|---|---|
| `/` | Dashboard | Protection status, stats, activity chart, latest risk, recent incidents and alerts |
| `/live` | Live Monitoring | Start/stop, waveform, connection info, live transcript with highlights, live stage tracker, upload tab |
| `/analysis` | Risk Analysis | Four scam stages, evidence per stage, timeline, raw signal table, disclaimer |
| `/alerts` | Warnings & Alerts | Warning cards with reason, actions, Hindi audio playback, acknowledge |
| `/incidents` | Incident History | Search, risk filter, date range filter |
| `/incidents/:id` | Incident Details | Full transcript, evidence, export JSON, print report |
| `/settings` | Contacts & Settings | Trusted contacts with consent, notification consent and revoke, privacy, mock/live toggle |

A full-screen warning pops up on any page when the live session returns a `warning`.

---

## Folder structure

```
src/
├── components/     Layout, RiskCard, StageTracker, TranscriptPanel,
│                   EvidenceCard, WarningAlert, AudioPlayer, Waveform, ui
├── context/        AppContext (settings, backend health, live session)
├── hooks/          useLiveSession (mic + WebSocket), useAsync
├── lib/            labels/colours per stage, formatters
├── mock/           mockData.ts (all sample data)
├── pages/          one file per route
├── services/       ONLY place that talks to the backend
│   ├── config.ts       endpoint map + mock switch
│   ├── api.ts          axios client + error messages
│   ├── transcription.ts  /health, /transcribe
│   ├── detection.ts      analysis endpoint (planned)
│   ├── records.ts        incidents, warnings, contacts, /synthesize-warning
│   └── audioCapture.ts   mic -> 16 kHz PCM -> 1024-byte frames
└── types/          index.ts (mirrors backend schemas)
```

---

## Mock vs real backend

Mock is on by default. Turn it off in **Contacts & Settings → Data source**, or set `VITE_USE_MOCK=false`.

In dev, Vite proxies calls so the backend needs no CORS setup:

| Frontend calls | Goes to |
|---|---|
| `/api/*` | `KAVACH_BACKEND_URL/*` (default `http://127.0.0.1:8000`) |
| `/ws/transcribe` | `ws://127.0.0.1:8000/ws/transcribe` |

Run the backend first: `cd backend && uvicorn app.main:app --reload`.

---

## Backend integration status

| Feature | Backend endpoint | Frontend status |
|---|---|---|
| Health | `GET /health` | **Connected** |
| Upload transcription | `POST /transcribe` (field `audio_file`) | **Connected** |
| Live transcription | `WS /ws/transcribe` | **Connected** (sends 1024-byte PCM frames, handles `ready`, `transcript`, `error`, `stopped`, sends `{"type":"stop"}`) |
| Spoken warning | `POST /synthesize-warning` | **Connected** (plays WAV) |
| Scam detection | not exposed yet | Mock. Expects `ConversationAnalysis` |
| Risk score | not built yet | Mock. Displayed only, never calculated here |
| Incidents | not built yet | Mock |
| Warnings list | not built yet | Mock |
| Trusted contacts | not built yet | Mock (saved in browser) |

Placeholder paths for the planned APIs are in `src/services/config.ts` under `ENDPOINTS`.
**Agree the real paths and payloads with the backend team, then edit only that file and `src/types/index.ts`.**

### Expected shape for the detection API

The frontend sends `{ segments: TranscriptSegment[] }` and expects:

```ts
{
  detection: DetectionResult,      // same as backend/app/detection/schemas.py
  risk: { score: number | null, category: 'low'|'moderate'|'high'|'critical'|null, summary?: string } | null,
  warning: SafetyWarning | null    // when present, the full-screen warning appears
}
```

---

## Rules followed

- No scam detection or risk calculation in the browser. Only backend values are shown.
- No API keys in frontend code. Gnani keys stay in `backend/.env`.
- Consent is asked before the mic starts and before notifications are enabled. Both can be revoked.
- Hindi (Devanagari), Hinglish and English render with Inter + Noto Sans Devanagari.

---

## Checks before a PR

```bash
npm run build     # must pass
npm run lint
```

Git flow:

```bash
git switch -c feature/frontend-dashboard
git add frontend/
git commit -m "feat(frontend): add Kavach dashboard with mock data"
git push -u origin feature/frontend-dashboard
```
