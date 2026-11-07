# Kavach

**When scammers isolate you, Kavach reconnects.**

Kavach is a multilingual, AI-powered voice safety companion designed to identify coercive digital-arrest scams and related financial fraud patterns in consented audio.

The project is being developed for the Gnani AI Great Indian AI Internship Challenge.

## Current development status

**Milestone 1 — Backend setup and Gnani Prisma REST transcription integration.**

Currently implemented:

- FastAPI backend.
- Health-check endpoint.
- Gnani Prisma v2.5 REST transcription integration.
- Hindi transcription configuration (`hi-IN`).
- Audio upload validation.
- Application-level 10 MB upload limit.
- Upstream error and timeout handling.
- Automated backend tests.

A real Hindi audio recording has been successfully transcribed through the local Kavach backend.

Features such as real-time streaming, scam detection, risk scoring, voice warnings and the dashboard are planned but not yet implemented.

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
10. A responsive web dashboard.

## Architecture overview

```text
Consented audio input
        |
        v
   Kavach Backend
        |
        v
 Gnani Prisma STT
        |
        v
 Timestamped transcript
        |
        v
 Scam-stage detection
        |
        v
 Explainable risk engine
        |
        v
 Warning and response policy
        |
        +------> Gnani Timbre TTS
        |
        +------> Consented family notification
        |
        v
 Incident summary
```

The architecture is a development target. Not every component shown above is implemented yet.

## Technology stack

| Component | Technology |
|---|---|
| Backend | Python, FastAPI |
| Configuration | Pydantic Settings |
| HTTP client | HTTPX |
| Speech transcription | Gnani Prisma v2.5 |
| Frontend | React, TypeScript (planned) |
| Testing | Pytest |
| Version control | Git, GitHub |

Additional technologies will be documented when implemented and verified.

## Repository structure

```text
Kavach/
|
|-- backend/
|   |-- app/
|   |   |-- main.py
|   |   |-- config.py
|   |
|   |-- tests/
|   |   |-- test_health.py
|   |   |-- test_transcribe.py
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
```

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

## Testing and evaluation

The project maintains:

- `TEST_REPORT.md` — Recorded test cases and actual results.
- `TROUBLESHOOTING.md` — Known errors and fixes.
- `PROJECT_STATE.md` — Current implementation status.
- `ARCHITECTURE.md` — System architecture and design decisions.
- `IMPLEMENTATION_LOG.md` — Development history.

Do not interpret the current nine passing automated tests as proof of real-world scam detection accuracy. Systematic accuracy, noisy-audio and false-positive evaluations remain pending.

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
- [ ] Real-time Prisma WebSocket integration.
- [ ] Explainable scam-stage detection.
- [ ] Risk scoring and warning policy.
- [ ] Gnani Timbre speech generation.
- [ ] Frontend and consent workflow.
- [ ] Trusted-family notifications.
- [ ] Incident summary generation.
- [ ] Kavach-Bench evaluation.
- [ ] Deployment and final demonstration.

## Repository

GitHub: https://github.com/vaibhavi466/Kavach