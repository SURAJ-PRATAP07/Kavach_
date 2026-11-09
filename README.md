# Kavach

**When scammers isolate you, Kavach reconnects.**

Kavach is a multilingual, AI-powered voice safety companion designed to identify coercive digital-arrest scams and related financial fraud patterns in consented audio.

The project is being developed for the Gnani AI Great Indian AI Internship Challenge.

## Current development status

**Milestones 0–4.2: Backend scaffold, Gnani speech integrations, detection schemas and initial phrase-based detection engine. The mock-first React dashboard is now available in `frontend/`.**

Currently implemented and verified:

- FastAPI backend and health-check endpoint.
- Gnani Prisma v2.5 REST transcription integration.
- Gnani Prisma WebSocket streaming integration, live-verified with one Hindi recording.
- Hindi transcription configuration (`hi-IN`).
- Audio upload validation and application-level 10 MB upload limit.
- Provider error and timeout handling.
- Standalone Gnani Timbre v3.0 safety-warning TTS endpoint (`POST /synthesize-warning`), live-verified with two romanized Hindi warning segments.
- Detection data schemas for transcript segments, scam stages, evidence and stage assessments.
- Initial standalone phrase-based detection for impersonation, threats, isolation and financial extraction.
- Selected English, romanized Hindi/Hinglish and Devanagari phrase patterns.
- Explainable detection evidence with rule IDs, matched phrases, reasons and available transcript metadata.
- Automated backend tests: **62 passed, 0 failed, 1 non-failing deprecation warning**.
- React + TypeScript frontend dashboard in `frontend/`, with mock data enabled by default.
- Frontend production build and browser checks across all primary routes.

The live transcription checks verify integration and event delivery, not general recognition accuracy. The live TTS check verifies the tested warning phrases and voice/settings, not broad Hindi/Hinglish quality.

**Not yet implemented:** contextual scam reasoning, general negation and quoted-speech understanding, calibrated numerical risk scoring, automatic warning decisions, integration of detection with REST/WebSocket transcription, trusted-family notifications, incident summaries and Kavach-Bench. Frontend features that depend on unfinished backend endpoints remain in mock mode.

The detection engine is currently standalone. The TTS endpoint is also standalone and is not automatically triggered by detection.

## Planned capabilities

1. Real-time multilingual speech transcription.
2. Hindi and Hinglish speech support.
3. Detection of impersonation, threats, isolation and financial extraction.
4. Hybrid rule-based and contextual scam detection.
5. Explainable risk scores with transcript evidence.
6. Spoken safety warnings using Gnani Timbre.
7. Consent-based trusted-family notifications.
8. Incident summaries for cybercrime reporting.
9. Kavach-Bench for evaluating detection under different audio conditions.
10. Complete backend integration for the responsive web dashboard.

## Architecture overview

`	ext
Consented audio input
        |
        v
   Kavach Backend
        |
        v
 Gnani Prisma STT
        |
        v
      Transcript
        |
        +------> Standalone phrase-based detection engine
        |                  |
        |                  v
        |          Explainable stage evidence
        |
        v
 Future contextual detection and risk scoring
        |
        v
 Future warning and response policy
        |
        +------> Gnani Timbre TTS
        |
        +------> Consented family notification
        |
        v
 Future incident summary
`

The phrase-based detection engine and the standalone TTS endpoint are implemented, but neither is yet integrated into an automatic transcription-to-warning workflow. Contextual reasoning, risk scoring, notifications and incident summaries remain planned.

## Technology stack

| Component | Technology |
|---|---|
| Backend | Python, FastAPI |
| Configuration | Pydantic Settings |
| HTTP client | HTTPX |
| Speech transcription | Gnani Prisma v2.5 |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Testing | Pytest |
| Version control | Git, GitHub |

Additional technologies will be documented when implemented and verified.

## Repository structure

`	ext
Kavach/
|
|-- frontend/
|   |-- src/
|   |-- package.json
|   |-- package-lock.json
|   |-- vite.config.ts
|
|-- backend/
|   |-- app/
|   |   |-- main.py
|   |   |-- config.py
|   |   |-- streaming.py
|   |   |-- tts.py
|   |   |-- detection/
|   |       |-- __init__.py
|   |       |-- schemas.py
|   |       |-- rules.py
|   |       |-- engine.py
|   |
|   |-- tests/
|   |   |-- test_health.py
|   |   |-- test_transcribe.py
|   |   |-- test_streaming.py
|   |   |-- test_tts.py
|   |   |-- test_detection_schemas.py
|   |   |-- test_detection_engine.py
|   |
|   |-- .env.example
|   |-- requirements.txt
|
|-- PROJECT_STATE.md
|-- ARCHITECTURE.md
|-- IMPLEMENTATION_LOG.md
|-- TEST_REPORT.md
|-- TROUBLESHOOTING.md
|-- README.md
|-- .gitignore
`

## Frontend setup

The frontend defaults to mock data, so it can be run without the backend:

```powershell
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). See [`frontend/README.md`](frontend/README.md) for available routes and backend integration details.

## Prerequisites

- Windows 10 or 11.
- Python 3.11.
- Git.
- Gnani API credentials with access to the required speech service.

## Backend setup — Windows PowerShell

### 1. Clone the repository

```powershell
git clone https://github.com/vaibhavi466/Kavach.git
cd Kavach
```

### 2. Create and activate the virtual environment

```powershell
cd backend

py -3.11 -m venv .venv

.\.venv\Scripts\Activate.ps1
```

### 3. Install dependencies

```powershell
python -m pip install --upgrade pip

python -m pip install -r requirements.txt
```

### 4. Configure environment variables

Create your local environment file:

```powershell
Copy-Item .env.example .env
```

Open `backend/.env` and configure your credentials:

```text
GNANI_API_KEY=YOUR_GNANI_API_KEY
GNANI_STT_URL=https://api.vachana.ai/stt/v3
GNANI_STT_LANGUAGE=hi-IN
```

Replace the placeholder with your actual API key locally.

**Security requirements:**

- Never commit `.env`.
- Never expose API credentials in frontend code.
- Never share API keys in screenshots, public repositories or chat messages.

### 5. Start the backend

From the `backend` directory:

```powershell
uvicorn app.main:app --reload
```

The development server should be available at:

- Health endpoint: http://127.0.0.1:8000/health
- API documentation: http://127.0.0.1:8000/docs

### 6. Run automated tests

Open another PowerShell terminal, activate the same virtual environment and run:

```powershell
cd C:\Users\Vaibhavi\Kavach\backend

.\.venv\Scripts\Activate.ps1

python -m pytest -v
```

## Current API endpoint

### `POST /transcribe`

Accepts an audio file and forwards it to the configured Gnani Prisma transcription service.

**Multipart form field:**

`audio_file`

**Currently accepted filename extensions:**

- WAV
- MP3
- OGG
- FLAC
- AAC
- M4A

**Application-level maximum upload size:** 10 MB.

The endpoint returns the transcription and available provider metadata.

### `POST /synthesize-warning`

Synthesizes the currently configured standalone Hindi safety warning using Gnani Timbre. The response is WAV audio (`audio/wav`). This endpoint is not yet automatically triggered by scam detection.

### `WS /ws/transcribe`

Streams audio to Gnani Prisma and forwards streaming events. The current implementation has been live-verified with one Hindi recording. See `TEST_REPORT.md` for verification scope and limitations.

### Detection schemas and initial rule-based engine

The backend includes validated Pydantic models in ackend/app/detection/schemas.py. These define transcript segments, scam stages and explainable evidence structures.

The standalone detection engine in ackend/app/detection/engine.py uses handcrafted phrase patterns from ackend/app/detection/rules.py to identify selected signals across four stages:

- Impersonation.
- Threats.
- Isolation.
- Financial extraction.

The initial patterns cover selected English, romanized Hindi/Hinglish and Devanagari phrases. The engine preserves matched text, original transcript text, rule IDs, explanations and available segment metadata.

The engine has **27 passing automated tests**. The complete backend suite has **62 passing tests**.

This is an initial phrase-based signal detector, not a contextual scam classifier. It does not provide a calibrated numerical risk score and is not yet connected to REST transcription, WebSocket streaming or automatic warning delivery.

## Testing and evaluation

The project maintains:

- TEST_REPORT.md — Recorded test cases and actual results.
- TROUBLESHOOTING.md — Known errors and fixes.
- PROJECT_STATE.md — Current implementation status.
- ARCHITECTURE.md — System architecture and design decisions.
- IMPLEMENTATION_LOG.md — Development history.

The 62 passing automated backend tests do not establish real-world scam detection accuracy. Systematic accuracy, noisy-audio and false-positive evaluations remain pending.

## Privacy and responsible use

- Audio analysis must be consent-based.
- API credentials must remain server-side.
- Sensitive recordings should not be retained unnecessarily.
- Family notifications must require appropriate user consent.
- Risk scores are assistance signals, not legal determinations.
- Kavach does not guarantee fraud prevention or replace law enforcement.
- The initial prototype does not intercept native cellular-call audio.

## Project roadmap

- [x] Repository and backend scaffold.
- [x] FastAPI health endpoint.
- [x] Gnani Prisma REST integration.
- [x] Hindi transcription through the local backend.
- [x] Initial automated backend tests.
- [ ] Backend security and validation hardening.
- [x] Real-time Prisma WebSocket integration (one live Hindi sample verified).
- [x] Detection data schemas and evidence structures.
- [x] Initial standalone phrase-based scam-stage detection.
- [ ] Contextual scam-stage detection and improved negation/context handling.
- [ ] Evaluation against labelled legitimate and scam conversations.
- [ ] Risk scoring and warning policy.
- [x] Standalone Gnani Timbre TTS endpoint (live-verified).
- [ ] Automatic warning policy and TTS integration.
- [ ] Frontend and consent workflow.
- [ ] Trusted-family notifications.
- [ ] Incident summary generation.
- [ ] Kavach-Bench evaluation.
- [ ] Deployment and final demonstration.

## Repository

GitHub: https://github.com/vaibhavi466/Kavach
