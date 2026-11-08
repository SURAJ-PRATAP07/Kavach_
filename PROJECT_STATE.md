# Kavach - Project State

## Project Overview

Kavach is an AI-powered, multilingual voice safety companion designed to identify potential digital-arrest scams and provide timely, explainable warnings.

The project uses Gnani AI speech models for transcription and speech generation.

## Current Development Status

**Milestone 0 - Project scaffold: Completed**

- Created the GitHub repository and initial backend structure.
- Configured the Python virtual environment and FastAPI application.
- Added environment-variable templates, Git ignore rules and automated tests.

**Milestone 1 - Gnani Prisma REST transcription: Implemented and live-verified**

- Integrated Gnani Prisma REST transcription through `POST /transcribe`.
- Added API-key configuration, input validation, upload limits and provider error handling.
- Successfully tested a real Hindi audio recording through the local Kavach backend.

**Milestone 2 - Gnani Prisma WebSocket streaming: Implemented, mock-tested and live-verified**

- Implemented `/ws/transcribe` using `gnani-vachana==0.9.0`.
- Added PCM frame validation, provider event forwarding, Stop handling and lifecycle cleanup.
- Added provider failure handling, unexpected event-stream termination handling and browser-disconnect cleanup.
- Verified a real Hindi audio recording through the local Kavach WebSocket endpoint and actual Gnani Prisma streaming service on 2026-11-08.
- Received provider `ready`, `processing`, `transcript` and `stopped` events.
- Confirmed the transcript event contains the expected `segment_id` field.

### Live streaming verification details

| Parameter | Observed configuration/result |
|---|---|
| Provider | Gnani Prisma v2.5 |
| Language | `hi-IN` |
| Audio encoding | `pcm_s16le` |
| Sample rate | 16,000 Hz |
| Channels | Mono |
| Frame size | 1,024 bytes |
| Frame duration | 32 ms |
| Live transcript | Hindi transcript received |
| Provider-reported latency | 194 ms in the latest run |
| Result | Live integration PASS |

The returned transcript contained recognition errors. This was a connectivity and event-flow verification, not an accuracy benchmark. The 194 ms value is a single provider-reported observation, not an end-to-end latency benchmark.

The `transcript_received_after_stop_command` value was `false` in the observed run because the transcript event was processed before the backend registered the Stop command. The transcript had already been received; this value does not indicate transcript loss or prove provider finalisation.

**Milestone 3 - Gnani Timbre standalone safety-warning TTS: Implemented, mock-tested and live-verified**

- Integrated Gnani Timbre through the installed `gnani-vachana==0.9.0` SDK.
- Added the `backend/app/tts.py` TTS service.
- Added `POST /synthesize-warning` to the FastAPI backend.
- Used Timbre v3.0, voice `Tarika`, language `hi-IN` and speed `0.85`.
- Synthesized two separate romanized Hindi warning segments:
  1. `Apna one-time password.`
  2. `Kisi ke saath share na karein.`
- Added a 350 ms silence interval between the segments.
- Validated the provider WAV response and rebuilt a standard WAV containing mono, 16 kHz, 16-bit PCM audio.
- Executed the synchronous SDK operation in a thread pool to avoid blocking the asynchronous FastAPI event loop.
- Added handling for missing API credentials and provider/synthesis failures.

### Live TTS endpoint verification details

| Parameter | Observed configuration/result |
|---|---|
| Endpoint | `POST /synthesize-warning` |
| Provider | Gnani Timbre v3.0 |
| Voice | `Tarika` |
| Language | `hi-IN` |
| Speed | `0.85` |
| Audio encoding | 16-bit PCM |
| Sample rate | 16,000 Hz |
| Channels | Mono |
| HTTP status | 200 |
| Content type | `audio/wav` |
| WAV frames | 64,330 |
| WAV duration | 4.020625 seconds (~4.021 seconds) |
| Playback | User-confirmed complete and understandable |
| Result | Live endpoint verification PASS |

The playback verification covers the two warning segments and the tested voice/settings only. Devanagari speech quality, broader Hindi/Hinglish quality and other warning phrases have not yet been evaluated.

**Important integration boundary:** The TTS endpoint currently operates independently. It is not yet connected to the WebSocket transcription workflow, scam-stage detection or automated warning policy.

## Current Test Status

Latest fresh backend verification on 2026-11-09:

- Complete backend automated tests: **27 passed, 0 failed, 1 warning**.
- REST and health tests: 9.
- WebSocket tests: 10.
- TTS tests: 8.
- Python application compilation: passed.
- `git diff --check`: passed.
- Live REST integration: verified.
- Live WebSocket integration: verified with one Hindi recording.
- Live TTS endpoint: HTTP 200 and playback confirmed complete and understandable.

WebSocket automated tests use a mocked Gnani SDK client. TTS automated tests use a mocked provider client; they do not consume live API credits.

The remaining Starlette/httpx deprecation warning is non-failing and requires compatibility investigation. It has not been treated as a test failure.

## Implemented Components

| Component | Status |
|---|---|
| FastAPI backend and health endpoint | Implemented and tested |
| Gnani Prisma REST transcription | Implemented and live-verified |
| Gnani Prisma WebSocket streaming | Implemented and live-verified |
| WebSocket failure and cleanup handling | Implemented and mock-tested |
| Gnani Timbre standalone TTS service | Implemented and mock-tested |
| `POST /synthesize-warning` | Implemented and live-verified |
| Hindi live transcription | One live sample verified; accuracy evaluation pending |
| Safety-warning playback | Two tested segments confirmed complete and understandable |
| Environment configuration | Implemented |
| Automated backend tests | 27 passing, 1 warning |

## Pending Components

1. Evaluate Hindi and Hinglish transcription quality using multiple labelled samples.
2. Test clean, noisy and telephony-compressed audio.
3. Complete backend security and API contract review.
4. Integrate TTS warnings with the scam-detection and WebSocket workflow.
5. Implement scam-stage detection for impersonation, threats, isolation and financial extraction.
6. Implement hybrid rule-based and contextual detection.
7. Implement explainable risk scoring with transcript evidence and timestamps.
8. Design and implement warning prioritisation and triggering policy.
9. Implement consent-based trusted-family notifications.
10. Implement incident summaries for cybercrime reporting.
11. Develop Kavach-Bench.
12. Build the responsive frontend dashboard.
13. Complete end-to-end, privacy, performance and deployment testing.

## Important Engineering Constraints

- Never expose the Gnani API key to the frontend or GitHub.
- Distinguish mocked tests from live provider verification.
- Do not claim transcription accuracy based on a single sample.
- Do not claim broad TTS quality based on two tested warning segments.
- Preserve consent-based audio processing and minimise data retention.
- Record actual test results in `TEST_REPORT.md`.
- Keep the standalone TTS endpoint distinct from an integrated automated warning workflow.
- Kavach is an assistance tool, not a guarantee against fraud or a replacement for law enforcement.

## Immediate Next Steps

1. Update and verify all project documentation for Milestone 3.
2. Review backend security, validation and resource limits.
3. Design and implement the scam-stage detection engine.
4. Implement explainable risk scoring and warning policy.
5. Integrate the verified TTS service with the detection workflow.
6. Build the frontend and consent workflow.
7. Add family notifications, incident summaries and Kavach-Bench.
8. Complete end-to-end testing, deployment and the hackathon demonstration.
