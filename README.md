# Kavach

**When scammers isolate you, Kavach reconnects.**

Kavach is a multilingual, AI-powered voice safety companion designed to identify coercive digital-arrest scams and related financial fraud patterns in consented audio.

The project is being developed for the Gnani AI Great Indian AI Internship Challenge.

## Current development status

**Milestones 0–4.2 + Detection Integrations + Stages 3, 4.1, 4.2, 4.3 & 4.4: Backend scaffold, Gnani speech integrations, detection schemas, initial phrase-based detection engine, REST/WebSocket detection integrations, conversation-level evidence aggregation, explainable warning policy, session-scoped warning consent protocol, digital-arrest warning synthesis, and automated warning triggering via WebSockets.**

Currently implemented and verified:

- FastAPI backend and health-check endpoint.
- Gnani Prisma v2.5 REST transcription integration with detection assessments.
- Gnani Prisma WebSocket streaming integration with per-event detection assessments and cumulative conversation-level evidence aggregation, live-verified with one Hindi recording.
- Hindi transcription configuration (`hi-IN`).
- Audio upload validation and application-level 10 MB upload limit.
- Provider error and timeout handling.
- Standalone Gnani Timbre v3.0 safety-warning TTS endpoints: `POST /synthesize-warning` (OTP warning, speed 0.85) and `POST /synthesize-digital-arrest-warning` (general-purpose digital-arrest warning, speed 0.95), live-verified.
- Detection data schemas for transcript segments, scam stages, evidence and stage assessments.
- Initial phrase-based detection for impersonation, threats, isolation and financial extraction.
- Selected English, romanized Hindi/Hinglish and Devanagari phrase patterns.
- Explainable detection evidence with rule IDs, matched phrases, reasons and available transcript metadata.
- `ConversationDetectionAccumulator`: connection-scoped cumulative phrase-based evidence aggregation across WebSocket transcript events.
- Explainable warning policy (`evaluate_warning_policy`): deterministic heuristic evaluation with distinct-stage thresholds (MONITOR, ADVISORY, WARNING), consent gating, and repeat-warning suppression.
- Backend WebSocket consent protocol for automatic spoken safety warnings, with strict Boolean validation, grant/revoke acknowledgements and session reset on reconnect.
- Automated warning triggering pipeline: evaluates warning policy against cumulative evidence on every transcript event, synthesizes digital-arrest warning audio via Gnani Timbre upon reaching `WARNING` level with granted consent, and delivers JSON `safety_warning` metadata followed by binary WAV audio frames.
- Automated backend tests: **106 passed, 0 failed, 1 non-failing deprecation warning**.

The live transcription checks verify integration and event delivery, not general recognition accuracy. The live TTS check verifies the tested warning phrases and voice/settings, not broad Hindi/Hinglish quality.

**Not yet implemented:** contextual scam reasoning, general negation and quoted-speech understanding, calibrated numerical risk scoring, frontend consent UI and audio player, playback cancellation/revocation handling (Stage 4.5), trusted-family notifications, incident summaries, the frontend dashboard and Kavach-Bench.

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
Consented audio input (REST / WebSocket)
        |
        v
   Kavach Backend
        |
        v
  Gnani Prisma STT
        |
        v
   Transcript Output
        |
        +------> Phrase-based detection engine (REST & WebSocket per-event)
        |                  |
        |                  v
        |          Explainable stage evidence
        |                  |
        |                  v
        |   ConversationDetectionAccumulator (WebSocket cumulative evidence)
        |                  |
        |                  v
        |       Warning Policy Evaluation
        |                  |
        +------> Triggered Warning Audio via Gnani Timbre TTS (Binary WebSocket WAV)
        |
        +------> Standalone TTS Endpoints (Verified)
        |
        +------> Future contextual detection & calibrated risk scoring
        |
        +------> Future consented family notification
        |
        v
 Future incident summary
```

The phrase-based detection engine is integrated with both REST transcription and WebSocket streaming.

Each WebSocket transcript event receives an independent `detection` result and a cumulative `conversation_detection` result. The WebSocket session also maintains a separate, session-scoped consent flag for automatic spoken safety warnings.

When consent is granted and scam escalation reaches `WARNING` level, digital-arrest warning speech is synthesized via Gnani Timbre and delivered to the client as metadata followed by binary audio frames. Standalone warning policy and TTS endpoints also remain independently functional.

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

`	ext
Kavach/
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
|   |       |-- conversation.py
|   |       |-- warning_policy.py
|   |
|   |-- tests/
|   |   |-- test_health.py
|   |   |-- test_transcribe.py
|   |   |-- test_streaming.py
|   |   |-- test_tts.py
|   |   |-- test_detection_schemas.py
|   |   |-- test_detection_engine.py
|   |   |-- test_conversation_detection.py
|   |   |-- test_warning_policy.py
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

Synthesizes the currently configured standalone Hindi safety warning for OTP protection using Gnani Timbre (`timbre-v3.0`, voice `Tarika`, speed `0.85`). The response is WAV audio (`audio/wav`). This endpoint is not yet automatically triggered by scam detection.

### `POST /synthesize-digital-arrest-warning`

Synthesizes the general-purpose Hindi digital-arrest safety warning using Gnani Timbre (`timbre-v3.0`, voice `Tarika`, speed `0.95`). The warning consists of four guidance sentences advising victims not to panic, never to transfer funds or share credentials, to disconnect and independently verify through official portals, and to consult trusted family members. The response is standard WAV audio (`audio/wav`). This endpoint operates as a standalone service and is not yet automatically triggered by scam detection.

### `WS /ws/transcribe`

Streams audio to Gnani Prisma and forwards streaming events. The current implementation has been live-verified with one Hindi recording. See `TEST_REPORT.md` for verification scope and limitations.

### Scam-stage detection

Kavach currently implements an initial phrase-based detection engine covering four potential scam stages:

1. Impersonation and authority claims.
2. Threats and arrest-related intimidation.
3. Isolation and secrecy instructions.
4. Financial extraction and purported safe-account transfers.

The engine supports selected English, romanized Hindi/Hinglish and Devanagari Hindi phrases.

Detection is integrated with both transcription workflows:

- REST: detection results are included in the /transcribe response.
- WebSocket: each transcript event receives an independent structured detection result and a cumulative `conversation_detection` result aggregating evidence across all valid segments in that connection.

The system preserves matched phrases, original transcript text, rule identifiers, explanations, qualitative signal strengths and available segment metadata.

### Explainable warning policy

Stage 4.1 implements `evaluate_warning_policy()` in `backend/app/detection/warning_policy.py`. It translates cumulative detection evidence into explainable decision levels based on distinct detected stages:

- **MONITOR**: No evidence or a single non-financial stage.
- **ADVISORY**: Financial extraction alone, or two non-financial stages.
- **WARNING**: Financial extraction plus another distinct stage, or three or more distinct stages.

The policy uses deterministic heuristics, collects unique matched rule IDs, gates spoken warnings behind explicit user consent, and suppresses repeat spoken warnings within a session. It does not yet automatically trigger Gnani Timbre playback or manage live session state.

**Current limitations:** Detection remains phrase-based. Cumulative WebSocket evidence is aggregated within a single connection, but the system does not perform contextual conversation understanding or calculate calibrated probabilities. Automatic warning triggering is not yet integrated.

### WebSocket spoken-warning consent

The WebSocket backend supports a `warning_consent` control command:

```json
{"type": "warning_consent", "granted": true}
```

Set `granted` to `false` to revoke consent.

Only JSON Boolean values are accepted. The backend acknowledges valid changes and rejects invalid or missing values. Consent defaults to disabled and resets on reconnect.

This protocol controls automatic spoken safety warnings only. It does not represent consent for audio capture, transcription or analysis.

The frontend consent UI and automatic warning/TTS integration are not yet implemented.

### Automated testing

Latest complete backend verification on 2026-11-10:

- 100 tests passed.
- 0 tests failed.
- 1 non-failing deprecation warning.

The test suite covers REST and WebSocket transcription, 22 WebSocket streaming and consent tests, 13 TTS service and endpoint tests, phrase-based detection, cumulative evidence aggregation, and the explainable warning policy.

Automated provider tests use mocked responses. Separate live checks have verified Prisma REST transcription, Prisma WebSocket event delivery and standalone Timbre warning synthesis for both OTP and digital-arrest warnings.

These results do not establish real-world transcription or scam-detection accuracy.

## Testing and evaluation

The project maintains:

- TEST_REPORT.md — Recorded test cases and actual results.
- TROUBLESHOOTING.md — Known errors and fixes.
- PROJECT_STATE.md — Current implementation status.
- ARCHITECTURE.md — System architecture and design decisions.
- IMPLEMENTATION_LOG.md — Development history.

The 100 passing automated backend tests do not establish real-world scam detection accuracy. Systematic accuracy, noisy-audio and false-positive evaluations remain pending.

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
- [x] REST transcription-to-detection integration.
- [x] Real-time WebSocket transcript-event-to-detection integration.
- [x] Cumulative conversation-level evidence aggregation (WebSocket, per-connection).
- [x] Explainable warning policy (standalone decision heuristics & consent gating).
- [x] Backend session-scoped consent protocol for automatic spoken safety warnings.
- [ ] Frontend consent UI for spoken safety warnings.
- [ ] Contextual scam-stage detection and improved negation/context handling.
- [ ] Evaluation against labelled legitimate and scam conversations.
- [ ] Warning-policy integration with WebSocket streaming.
- [x] Standalone Gnani Timbre TTS endpoints for OTP and digital-arrest warnings (live-verified).
- [ ] Automatic warning triggering and TTS audio delivery.
- [ ] Frontend dashboard and consent workflow.
- [ ] Trusted-family notifications.
- [ ] Incident summary generation.
- [ ] Kavach-Bench evaluation.
- [ ] Deployment and final demonstration.

## Repository

GitHub: https://github.com/vaibhavi466/Kavach
