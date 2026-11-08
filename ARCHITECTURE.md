# Kavach — System Architecture

## 1. Project Overview

Kavach is an AI-powered, multilingual voice safety companion designed to detect potential digital-arrest scams during conversations.

It aims to identify scam patterns such as:
- Impersonation of police, government officials or other authorities.
- Threats, intimidation and fabricated legal consequences.
- Attempts to isolate victims from family members.
- Pressure to transfer money or disclose financial information.

Kavach is an assistance tool, not a guarantee against fraud or a replacement for law enforcement.

## 2. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend | Python, FastAPI | API and application services |
| Speech-to-text | Gnani Prisma | Audio transcription |
| Text-to-speech | Gnani Timbre | Planned spoken warnings |
| Streaming SDK | `gnani-vachana==0.9.0` | Gnani streaming transcription |
| HTTP client | HTTPX | Asynchronous REST requests |
| Testing | Pytest | Automated verification |
| Frontend | Planned | Responsive safety dashboard |
| Database | Planned | Secure incident metadata storage |

## 3. High-Level Architecture

```text
                 User Audio
                     |
                     v
          Kavach Backend (FastAPI)
                     |
           +---------+---------+
           |                   |
           v                   v
    REST Transcription    WebSocket Streaming
           |                   |
           +---------+---------+
                     |
                     v
              Gnani Prisma
                     |
                     v
              Transcript Text
                     |
                     v
           Scam Detection Engine
                (Planned)
                     |
                     v
          Explainable Risk Scoring
                (Planned)
                     |
          +----------+----------+
          |                     |
          v                     v
     Spoken Warning       Incident Summary
     Gnani Timbre          (Planned)
          |
          v
    User / Trusted Family
       (Consent-based)
```

The diagram represents the intended system. Components marked as planned are not yet implemented.

## 4. Current Backend Architecture

### 4.1 FastAPI Application

Main application entry point:

`backend/app/main.py`

Responsibilities:
- Initialise the FastAPI application.
- Register the health endpoint.
- Register the REST transcription endpoint.
- Register the WebSocket streaming router.

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
6. The transcript and relevant metadata are returned.

Error handling covers missing configuration, invalid input, oversized files, provider HTTP errors, invalid responses and request timeouts.

Verification status: One successful live request through the Kavach backend has been recorded. Automated REST tests use mocked provider responses.

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

- 16,000 samples/second × 2 bytes/sample = 32,000 bytes/second.
- 1,024 bytes ÷ 32,000 bytes/second = 0.032 seconds per frame.
- 32 silence frames = 32 × 0.032 = 1.024 seconds.

Verification status:

- WebSocket implementation: completed.
- Mocked WebSocket tests: 10 passed.
- Complete backend automated tests: 19 passed, 1 warning.
- Live streaming with the actual Gnani provider: verified with one Hindi recording on 2026-11-08.

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

## 6. Planned Safety Response

When the system identifies sufficiently concerning behaviour:

1. Generate a clear explanation of the detected risk.
2. Produce a spoken warning using Gnani Timbre.
3. Explain safe actions, such as ending the call and independently verifying the caller.
4. Offer trusted-family notification only with the user's consent.
5. Generate an incident summary that can support a cybercrime report.

## 7. Privacy and Security

- Keep API credentials exclusively on the backend.
- Use secure communication between application components.
- Validate uploaded files and incoming audio frames.
- Avoid unnecessary audio retention.
- Obtain consent before sharing information with trusted contacts.
- Avoid exposing raw provider exceptions or sensitive credentials.
- Apply appropriate authentication, origin restrictions and rate limits before production deployment.

## 8. Testing Architecture

Automated tests are maintained under:

`backend/tests/`

Current test files:
- `test_transcribe.py`
- `test_streaming.py`

Current verification:
- 19 automated backend tests passing, with one Starlette deprecation warning.
- One successful live REST transcription request.
- Ten mocked WebSocket test functions covering normal operation and failure scenarios.
- Live Gnani WebSocket integration is not yet verified.

Additional planned testing:
- Hindi and Hinglish recognition.
- Clean, compressed and noisy audio.
- Legitimate-call versus scam-call classification.
- False-positive and false-negative analysis.
- Warning latency.
- Network interruption and recovery.
- Privacy and security checks.

## 9. Repository Structure

```text
Kavach/
|
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   └── streaming.py
│   │
│   ├── tests/
│   │   ├── test_transcribe.py
│   │   └── test_streaming.py
│   │
│   ├── .env.example
│   └── requirements.txt
│
├── ARCHITECTURE.md
├── IMPLEMENTATION_LOG.md
├── PROJECT_STATE.md
├── TEST_REPORT.md
├── TROUBLESHOOTING.md
├── README.md
└── .gitignore
```

This structure reflects the current known implementation. Additional modules will be added as features are developed.

## 10. Immediate Engineering Priorities

1. Expand live streaming tests across Hindi and Hinglish recordings.
2. Evaluate transcription accuracy under clean, noisy and compressed audio conditions.
3. Review WebSocket security, authentication and resource limits.
4. Verify Gnani Timbre access and integrate text-to-speech.
5. Implement the scam detection engine.
6. Add explainable risk scoring and safety responses.
7. Build the frontend and complete end-to-end testing.
