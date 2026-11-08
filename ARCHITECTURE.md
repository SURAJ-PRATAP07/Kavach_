# Kavach - System Architecture

## 1. Project Overview

Kavach is an AI-powered, multilingual voice safety companion designed to detect potential digital-arrest scams during conversations.

It aims to identify four major scam behaviours:
- Impersonation of police, government officials or other authorities.
- Threats, intimidation and fabricated legal consequences.
- Attempts to isolate victims from family members.
- Pressure to transfer money or disclose financial information.

Kavach is an assistance tool, not a guarantee against fraud or a replacement for law enforcement.

## 2. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend | Python, FastAPI | API and application services |
| Speech-to-text | Gnani Prisma | REST and streaming audio transcription |
| Text-to-speech | Gnani Timbre v3.0 | Standalone Hindi safety-warning generation |
| Gnani SDK | `gnani-vachana==0.9.0` | Streaming STT and TTS integration |
| HTTP client | HTTPX | Asynchronous REST requests |
| Async execution | Starlette thread pool | Run synchronous TTS SDK calls without blocking the event loop |
| Audio processing | Python standard library | PCM validation and WAV construction |
| Testing | Pytest | Automated verification |
| Frontend | Planned | Responsive safety dashboard |
| Database | Planned | Secure incident metadata storage |

## 3. High-Level Architecture

The current implementation provides transcription through two independent paths and a separate TTS endpoint.

```mermaid
flowchart TD
    A[User audio] --> B[Kavach FastAPI backend]

    B --> C[POST /transcribe]
    B --> D[WebSocket /ws/transcribe]

    C --> E[Gnani Prisma]
    D --> E
    E --> F[Transcript events]

    F --> G[Scam detection engine - planned]
    G --> H[Explainable risk scoring - planned]
    H --> I[Warning policy - planned]
    I --> J[Spoken warning workflow - planned]

    K[Client request] --> L[POST /synthesize-warning]
    L --> M[Gnani Timbre v3.0]
    M --> N[Standard WAV response]
```

The standalone TTS endpoint is implemented and live-tested. It is not yet triggered automatically by transcription, scam detection or risk scoring.

Components marked as planned are not yet implemented.

## 4. Current Backend Architecture

### 4.1 FastAPI Application

Main application entry point:

`backend/app/main.py`

Responsibilities:
- Initialise the FastAPI application.
- Register the health endpoint.
- Register REST transcription.
- Register standalone safety-warning synthesis.
- Register the WebSocket streaming router.
- Map service errors to appropriate HTTP responses.

### 4.2 Configuration Management

File:

`backend/app/config.py`

Responsibilities:
- Load environment variables.
- Read Gnani API credentials securely from the backend environment.
- Configure the transcription endpoint and language.
- Provide application settings through a cached settings function.

Secrets must remain in `backend/.env`. The file must never be committed to GitHub.

### 4.3 REST Transcription

Endpoint:

`POST /transcribe`

Flow:

1. The client uploads an audio file.
2. FastAPI validates the file extension and size.
3. The backend checks that the Gnani API key is configured.
4. The backend sends the audio to Gnani Prisma using HTTPX.
5. The backend validates the provider response.
6. The transcript and available metadata are returned.

Error handling covers missing configuration, invalid input, oversized files, provider HTTP errors, invalid responses and request timeouts.

Verification:
- One successful live Hindi transcription request through the Kavach backend.
- Automated REST tests use mocked provider responses.

### 4.4 WebSocket Streaming Transcription

File:

`backend/app/streaming.py`

Endpoint:

`/ws/transcribe`

Flow:

1. The browser establishes a WebSocket connection with Kavach.
2. The backend creates a Gnani streaming client.
3. The backend connects to Gnani using server-side credentials.
4. The backend starts a provider-event monitoring task.
5. The browser sends binary PCM audio frames.
6. The backend validates frame sizes and forwards valid frames to Gnani.
7. Gnani connection, processing and transcript events are forwarded to the browser as JSON messages.
8. Provider errors and unexpected provider event-stream termination are handled by notifying the browser and closing the session.
9. Invalid audio-frame errors are delivered before the browser connection is closed.
10. A Stop command causes the backend to send paced silence frames to help detect the end of speech.
11. The backend waits for a transcript event received after the Stop command, subject to a timeout.
12. The backend closes the provider connection and cleans up background tasks.

The backend uses a single outgoing WebSocket writer task to avoid concurrent server-to-client writes. Important outgoing messages can be acknowledged before the session is closed.

The Stop response does not guarantee provider finalisation of the last utterance.

Current audio format:

| Parameter | Value |
|---|---|
| Sample rate | 16,000 Hz |
| Channels | 1 (mono) |
| Encoding | Signed 16-bit little-endian PCM |
| Frame size | 1,024 bytes |
| Frame duration | 32 milliseconds |

Calculation:

- 16,000 samples/second x 2 bytes/sample = 32,000 bytes/second.
- 1,024 bytes / 32,000 bytes/second = 0.032 seconds per frame.
- 32 silence frames x 0.032 seconds = 1.024 seconds.

Verification:
- WebSocket implementation: completed.
- Mocked WebSocket tests: 10 passed.
- Live streaming: verified with one Hindi recording on 2026-11-08.
- Actual provider events included `ready`, `processing`, `transcript` and `stopped`.
- The observed transcript contained recognition errors. This verifies connectivity and event delivery, not general recognition accuracy.
- The latest provider-reported segment latency was 194 ms in one run. This is not an end-to-end latency benchmark.

### 4.5 Standalone Gnani Timbre Text-to-Speech

Service file:

`backend/app/tts.py`

Endpoint:

`POST /synthesize-warning`

Purpose:

Generate Kavach's fixed Hindi safety warning as a WAV audio response. This endpoint currently operates independently of the detection workflow.

Synthesis configuration:

| Parameter | Value |
|---|---|
| Provider | Gnani Timbre |
| Model | `timbre-v3.0` |
| Voice | `Tarika` |
| Language | `hi-IN` |
| Speed | 0.85 |
| Sample rate | 16,000 Hz |
| Channels | Mono |
| Sample format | 16-bit linear PCM |
| Output container | WAV |
| Silence between segments | 350 milliseconds |

Warning segments:

1. `Apna one-time password.`
2. `Kisi ke saath share na karein.`

Processing flow:

1. FastAPI checks that the Gnani API key is configured.
2. The endpoint invokes `synthesize_warning()` through `run_in_threadpool`.
3. The TTS service creates a Gnani TTS client.
4. The synchronous SDK synthesizes the two warning segments separately.
5. The service validates the returned WAV audio format and extracts PCM data.
6. The service inserts 350 milliseconds of silence between the segments.
7. The PCM data is assembled into a standard WAV file.
8. FastAPI returns the audio with content type `audio/wav` and `Cache-Control: no-store`.

The thread-pool execution prevents the synchronous SDK request from directly blocking the asynchronous FastAPI event loop.

Error handling covers missing API configuration, malformed provider audio and synthesis failures. Provider-specific exception details are not exposed to the client.

Verification:
- Five TTS service tests passed.
- Three TTS endpoint tests passed.
- Live endpoint returned HTTP 200 with content type `audio/wav`.
- Live WAV contained 64,330 frames at 16 kHz.
- Duration calculation: 64,330 / 16,000 = 4.020625 seconds.
- The user confirmed that the tested playback was complete and understandable.

Verification scope is limited to these two romanized Hindi warning segments and the tested voice/settings. Devanagari quality, broader Hindi/Hinglish quality and other warning phrases have not been evaluated.

**Integration boundary:** TTS is implemented as a standalone service and endpoint. Automatic warning triggering from the WebSocket or scam-detection workflow remains planned.

## 5. Planned Scam Detection Architecture

The detection engine will combine two approaches.

### 5.1 Rule-Based Detection

Fast detection of high-risk phrases and patterns, including:
- Digital-arrest claims.
- Fake police or agency impersonation.
- Threats of immediate arrest.
- Instructions to remain isolated.
- Demands for money transfers.

Rules will generate evidence signals, not automatically establish that a scam has occurred.

### 5.2 Contextual Detection

A contextual reasoning component will analyse conversation meaning, progression and relationships between statements.

It will help distinguish legitimate discussions from coordinated scam behaviour and reduce reliance on individual keywords.

### 5.3 Explainable Risk Scoring

The risk engine will combine detection signals into a score and risk category.

Every important risk assessment should include:
- Detected behaviour.
- Supporting transcript evidence.
- Relevant timestamps.
- Explanation of the risk contribution.

Scoring weights and thresholds must be validated through testing rather than chosen arbitrarily.

## 6. Planned Safety Response and Integration

The future warning workflow will:

1. Receive transcript events from the transcription service.
2. Evaluate transcript content using rule-based and contextual detection.
3. Calculate an explainable risk score.
4. Apply a warning policy to determine whether a spoken warning is appropriate.
5. Invoke the existing Gnani Timbre service when the policy triggers.
6. Explain safe actions, such as ending the call and independently verifying the caller.
7. Offer trusted-family notification only with the user's consent.
8. Generate an incident summary that can support a cybercrime report.

The automatic detection-to-warning workflow is not yet implemented.

## 7. Privacy and Security

- Keep API credentials exclusively on the backend.
- Use secure communication between application components.
- Validate uploaded files and incoming audio frames.
- Avoid unnecessary audio retention.
- Obtain consent before sharing information with trusted contacts.
- Avoid exposing raw provider exceptions or sensitive credentials.
- Apply appropriate authentication, origin restrictions and rate limits before production deployment.
- Review connection limits, session duration and resource consumption.
- Treat transcripts and risk scores as sensitive information.

## 8. Testing Architecture

Automated tests are maintained under:

`backend/tests/`

Current test files:
- `test_transcribe.py`
- `test_streaming.py`
- `test_tts.py`

Latest complete automated verification on 2026-11-09:

| Test group | Passed |
|---|---:|
| Health and REST transcription | 9 |
| WebSocket streaming and lifecycle | 10 |
| TTS service and endpoint | 8 |
| **Total** | **27** |

Result: 27 passed, 0 failed, 1 non-failing Starlette deprecation warning.

Additional live integration checks:
- REST transcription: one successful live Hindi request.
- WebSocket streaming: one live Hindi recording.
- TTS: one live endpoint request with playback confirmed complete and understandable.

Automated WebSocket and TTS tests use mocked provider clients. Live integration checks are separate from automated tests.

Additional planned testing:
- Hindi and Hinglish recognition.
- Clean, compressed and noisy audio.
- Legitimate-call versus scam-call classification.
- False-positive and false-negative analysis.
- Risk scoring and warning latency.
- Network interruption and recovery.
- Privacy and security checks.
- End-to-end transcription-to-warning workflow.

## 9. Repository Structure

```text
Kavach/
|
+-- backend/
|   +-- app/
|   |   +-- main.py
|   |   +-- config.py
|   |   +-- streaming.py
|   |   +-- tts.py
|   |
|   +-- tests/
|   |   +-- test_transcribe.py
|   |   +-- test_streaming.py
|   |   +-- test_tts.py
|   |
|   +-- .env.example
|   +-- requirements.txt
|
+-- ARCHITECTURE.md
+-- IMPLEMENTATION_LOG.md
+-- PROJECT_STATE.md
+-- TEST_REPORT.md
+-- TROUBLESHOOTING.md
+-- README.md
+-- .gitignore
```

This structure reflects the current known implementation. Additional modules will be added as features are developed.

## 10. Immediate Engineering Priorities

1. Review backend security, validation and resource limits.
2. Evaluate Hindi and Hinglish transcription quality using multiple labelled samples.
3. Test clean, noisy and telephony-compressed audio conditions.
4. Design the scam-stage detection engine for impersonation, threats, isolation and financial extraction.
5. Implement hybrid rule-based and contextual detection.
6. Implement explainable risk scoring with transcript evidence and timestamps.
7. Define a safe warning policy and integrate the existing standalone TTS service.
8. Build the frontend and consent workflow.
9. Implement trusted-family notifications and incident summaries.
10. Develop Kavach-Bench and complete end-to-end testing.
