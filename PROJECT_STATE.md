
# Kavach — Project State

## Current milestone

Milestone 1 — Backend setup and Gnani Prisma REST transcription integration.

## Overall status

Backend scaffold and initial real API integration are implemented and verified.

## Completed

- [x] GitHub repository created: https://github.com/vaibhavi466/Kavach
- [x] Initial repository scaffold pushed to the main branch.
- [x] Python 3.11.9 virtual environment configured.
- [x] FastAPI backend created.
- [x] GET /health endpoint implemented and tested.
- [x] Gnani API credentials configured through backend environment variables.
- [x] Gnani Prisma v2.5 REST API connectivity verified.
- [x] POST /transcribe endpoint implemented.
- [x] Hindi transcription tested using an actual audio recording.
- [x] Upload extension validation and 10 MB application-level limit implemented.
- [x] Upstream timeout, HTTP error and invalid JSON handling implemented.
- [x] Client-provided filenames and MIME types are not forwarded directly.
- [x] Nine automated backend tests passing.

## Current backend implementation

- Framework: FastAPI
- Language: Python 3.11.9
- STT provider: Gnani Prisma v2.5
- Integration: REST API
- STT endpoint: https://api.vachana.ai/stt/v3
- Configured language: hi-IN
- Upload formats allowed by extension: WAV, MP3, OGG, FLAC, AAC and M4A.
- Maximum application-level upload size: 10 MB.

## Architecture decisions

- Frontend: React + TypeScript, planned.
- Backend: Python + FastAPI.
- Realtime transport: WebSocket, subject to API contract verification.
- Detection: deterministic, evidence-backed rules first; contextual reasoning optional.
- Secrets: backend environment only. Never commit .env.
- Audio analysis: consent-based.
- Initial demo: consented speakerphone or room audio; no native cellular-call interception.

## Verified live integration

A real audio recording was submitted through the Kavach backend to Gnani Prisma v2.5.

- HTTP response: 200 OK
- Transcript returned successfully in Hindi.
- Provider request ID and latency fields returned.
- The actual API key was kept outside the repository.

This live request is separate from the automated tests, which mock the Gnani service.

## Known issues and limitations

- Starlette emits a deprecation warning concerning its httpx TestClient integration.
- The 10 MB check is performed inside the endpoint; deployment-level request-body limits are still required.
- File extension validation does not establish that uploaded bytes contain valid audio.
- No real-time WebSocket transcription yet.
- No scam-stage detection or risk scoring yet.
- No Gnani Timbre speech generation yet.
- No trusted-family notifications yet.
- No incident report generation yet.
- No Kavach-Bench evaluation yet.
- No frontend yet.

## Pending milestones

1. Complete backend security and API contract review.
2. Reconcile documentation and commit the verified backend milestone.
3. Verify Gnani Timbre access and actual response format.
4. Implement and test real-time Prisma WebSocket transcription.
5. Build the explainable scam-stage detection engine.
6. Implement warning policy and speech generation.
7. Build frontend and consent workflow.
8. Add family notifications and incident summaries.
9. Build Kavach-Bench and evaluate false positives, false negatives and latency.
10. Complete deployment and hackathon demonstration.

## Next action

Finish documentation, inspect Git changes, verify secrets and audio files are excluded, rerun tests, then commit and push the verified milestone.
