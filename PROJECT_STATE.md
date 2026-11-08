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

## Current Test Status

- Complete backend automated tests: 19 passed, 0 failed, 1 warning.
- REST and health tests: 9.
- WebSocket tests: 10.
- WebSocket automated tests use a mocked Gnani SDK client.
- Live REST integration: verified.
- Live WebSocket integration: verified with one Hindi recording.
- Python application compilation: previously verified successfully.
- The remaining Starlette/httpx deprecation warning is non-failing and requires compatibility investigation.

## Implemented Components

| Component | Status |
|---|---|
| FastAPI backend and health endpoint | Implemented and tested |
| Gnani Prisma REST transcription | Implemented and live-verified |
| Gnani Prisma WebSocket streaming | Implemented and live-verified |
| WebSocket failure and cleanup handling | Implemented and mock-tested |
| Hindi live transcription | One live sample verified; accuracy evaluation pending |
| Environment configuration | Implemented |
| Automated backend tests | 19 passing, 1 warning |

## Pending Components

1. Evaluate Hindi and Hinglish transcription quality using multiple labelled samples.
2. Test clean, noisy and telephony-compressed audio.
3. Complete backend security and API contract review.
4. Verify Gnani Timbre access and implement text-to-speech.
5. Implement scam-stage detection.
6. Implement hybrid rule-based and contextual detection.
7. Implement explainable risk scoring with transcript evidence and timestamps.
8. Implement spoken safety warnings.
9. Implement consent-based trusted-family notifications.
10. Implement incident summaries.
11. Develop Kavach-Bench.
12. Build the responsive frontend dashboard.
13. Complete end-to-end, privacy, performance and deployment testing.

## Important Engineering Constraints

- Never expose the Gnani API key to the frontend or GitHub.
- Distinguish mocked tests from live provider verification.
- Do not claim transcription accuracy based on a single sample.
- Preserve consent-based audio processing and minimise data retention.
- Record actual test results in `TEST_REPORT.md`.
- Kavach is an assistance tool, not a guarantee against fraud or a replacement for law enforcement.

## Immediate Next Steps

1. Close and document the verified Prisma streaming milestone.
2. Review backend security, validation and resource limits.
3. Verify Gnani Timbre access and its actual response format.
4. Design and test the scam-stage detection engine.
5. Implement explainable risk scoring and warning policy.
6. Build the frontend and consent workflow.
7. Add family notifications, incident summaries and Kavach-Bench.
8. Complete end-to-end testing, deployment and the hackathon demonstration.
