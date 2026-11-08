# Kavach — Project State

## Project Overview

Kavach is an AI-powered, multilingual voice safety companion designed to identify potential digital-arrest scams and provide timely, explainable warnings.

The project uses Gnani AI speech models for transcription and speech generation.

## Current Development Status

**Milestone 0 — Project scaffold: Completed**

- Created the GitHub repository and initial backend structure.
- Configured the Python virtual environment.
- Created the FastAPI application and `/health` endpoint.
- Added environment-variable templates and Git ignore rules.
- Created initial project documentation and automated tests.

**Milestone 1 — Gnani Prisma REST transcription: Implemented and verified**

- Integrated Gnani Prisma REST transcription.
- Added `POST /transcribe` for audio uploads.
- Added API-key configuration through environment variables.
- Added input validation, file-size limits and provider error handling.
- Verified one real audio request through the Kavach backend.
- Added automated tests for REST transcription.

## Milestone 2 — Gnani Prisma WebSocket streaming

**Implemented and mock-tested; live integration pending.**

- Added `backend/app/streaming.py`.
- Implemented the `/ws/transcribe` WebSocket endpoint.
- Integrated the Gnani streaming SDK.
- Added PCM audio-frame validation and forwarding.
- Added provider-event forwarding to the browser.
- Added Stop handling and paced silence frames.
- Added provider error handling and unexpected event-stream termination handling.
- Added invalid-frame rejection and initial provider connection failure handling.
- Improved WebSocket message delivery and cleanup behaviour.
- Added nine mocked WebSocket test functions covering normal operation and lifecycle failures.
- Added SDK constructor failure handling and its automated test.

Important limitation: Live WebSocket transcription against Gnani has not yet been verified. Passing mocked tests does not establish live provider connectivity.

## Current Test Status

- Automated backend tests: 19 passed, 0 failed, 1 warning.
- REST and health automated tests: 9 passed.
- WebSocket automated tests: 10 passed.
- WebSocket tests use a mocked Gnani SDK client.
- REST integration: One successful live request verified.
- Live Gnani WebSocket integration: Not yet verified.

## Implemented Components

| Component | Status |
|---|---|
| FastAPI backend | Implemented |
| Health endpoint | Implemented and tested |
| Gnani Prisma REST transcription | Implemented and live-tested |
| Gnani Prisma WebSocket endpoint | Implemented and mock-tested |
| WebSocket failure handling | Implemented and mock-tested |
| Environment configuration | Implemented |
| Automated tests | 19 passing, 1 warning |

## Pending Components

1. Verify live Gnani WebSocket transcription.
2. Integrate Gnani Timbre text-to-speech.
3. Implement scam-stage detection.
4. Implement hybrid rule-based and contextual detection.
5. Implement explainable risk scoring.
6. Implement spoken safety warnings.
7. Implement consent-based trusted-family notifications.
8. Implement incident summaries.
9. Develop Kavach-Bench.
10. Build the frontend dashboard.
11. Complete security, performance and end-to-end testing.

## Important Engineering Constraints

- Never expose the Gnani API key to the frontend or GitHub.
- Never claim mocked functionality has been verified against a live provider.
- Preserve consent-based audio processing and minimise data retention.
- Record actual test results in `TEST_REPORT.md`.
- Update project documentation after every verified milestone.

## Immediate Next Steps

1. Verify live Gnani Prisma WebSocket authentication and connection.
2. Test real-time Hindi transcription and transcript events.
3. Verify Stop behaviour and connection cleanup with the actual provider.
4. Record actual streaming behaviour and latency.
5. Complete the backend security and API contract review.
6. Commit and push the verified WebSocket implementation after code review.
7. Verify Gnani Timbre access and actual response format.
8. Begin scam-stage detection implementation.
