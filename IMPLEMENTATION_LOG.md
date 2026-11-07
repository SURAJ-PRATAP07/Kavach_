# Kavach — Implementation Log

## Milestone 0 — Project scaffold

### Completed work

- Created the Kavach GitHub repository.
- Established the initial backend project structure.
- Created a Python virtual environment.
- Added a FastAPI application.
- Implemented the `GET /health` endpoint.
- Added the initial automated health test.
- Created environment-variable templates and Git ignore rules.
- Added project documentation files.

---

## Milestone 1 — Gnani Prisma REST integration

### Configuration

- Added backend configuration management using Pydantic Settings.
- Configured the Gnani API key through a backend environment variable.
- Configured the Prisma STT endpoint.
- Configured Hindi (`hi-IN`) as the initial transcription language.
- Added `python-multipart` for handling audio uploads.

### Transcription endpoint

Implemented `POST /transcribe` using FastAPI.

The endpoint currently:

1. Checks whether the Gnani API key is configured.
2. Validates the uploaded file extension.
3. Rejects empty audio files.
4. Enforces a 10 MB application-level upload limit.
5. Uses server-controlled filenames and MIME types.
6. Sends the audio to the Gnani Prisma REST API.
7. Handles upstream timeouts, HTTP errors and connection errors.
8. Validates the provider's JSON response.
9. Returns the transcript and available provider metadata.

### Actual integration verification

- Tested the direct Gnani Prisma API using a real audio recording.
- Successfully tested transcription through the local Kavach backend.
- Received a Hindi transcript using Prisma v2.5.
- Received HTTP 200 from the local backend.
- Received provider request ID and latency metadata.
- Confirmed that the API key remained outside the repository.

### Automated testing

Added tests covering:

- Successful transcription using a mocked provider response.
- Unsupported audio extensions.
- Missing API credentials.
- Empty audio uploads.
- Oversized audio uploads.
- Gnani request timeouts.
- Gnani HTTP errors.
- Invalid provider JSON responses.
- Backend health endpoint.

Latest recorded REST test result: **9 passed, 0 failed.**

---

## Milestone 2 — Gnani Prisma WebSocket streaming backend

### SDK setup

- Installed and pinned `gnani-vachana==0.9.0`.
- Inspected the SDK connection, audio sending, event iteration and close methods.
- Verified the streaming router imports successfully.
- Integrated the Gnani streaming SDK into the FastAPI backend.

### WebSocket implementation

Implemented `WS /ws/transcribe`.

The endpoint currently:

1. Checks whether server-side Gnani API credentials are configured.
2. Establishes a connection to Gnani using the streaming SDK.
3. Configures the Prisma v2.5 model.
4. Uses the configured transcription language, initially `hi-IN`.
5. Configures a 16 kHz audio sample rate.
6. Accepts binary PCM audio frames of exactly 1024 bytes.
7. Validates incoming frame sizes.
8. Forwards provider connection, processing, transcript and error events to the frontend as JSON messages.
9. Monitors the provider event stream for errors and unexpected termination.
10. Handles JSON stop commands.
11. Sends 32 correctly sized and paced silence frames to help detect the end of speech.
12. Waits up to 3 seconds for a transcript event received after the Stop command.
13. Sends important outgoing messages through a single writer task.
14. Ensures invalid-frame errors are sent before the browser connection is closed.
15. Handles initial provider connection failures and performs session cleanup.

### Audio configuration

| Parameter | Configuration |
|---|---|
| Sample rate | 16,000 Hz |
| Channels | 1 (mono) |
| Encoding | Signed 16-bit little-endian PCM |
| Frame size | 1024 bytes |
| Samples per frame | 512 |
| Frame duration | 32 ms |
| Silence frames on stop | 32 |
| Total stop silence | Approximately 1.024 seconds |
| Final transcript wait | Up to 3 seconds |

The audio format is expected from the client. The backend currently validates frame size but does not independently decode and verify the PCM content.

### Automated verification

Added `backend/tests/test_streaming.py`.

The nine WebSocket test functions cover:

- WebSocket readiness, audio forwarding, Stop handling, transcript forwarding and silence-frame handling.
- Missing API key handling.
- Invalid audio-frame rejection and error delivery.
- Provider error-event handling.
- Unexpected provider event-stream termination.
- Initial provider connection failure.
- Provider error during Stop.
- Provider stream termination during Stop.
- SDK constructor failure.

Latest recorded complete backend test run:

**18 passed, 0 failed, 1 warning.**

Breakdown:

- REST and health tests: 9.
- WebSocket tests: 9.

The detailed WebSocket assertions are documented in `TEST_REPORT.md`.

### Verification status

- WebSocket endpoint implementation: completed.
- WebSocket lifecycle hardening: implemented.
- Mocked WebSocket tests: 9 passed.
- Complete backend automated tests: 18 passed, 1 warning.
- Live Gnani WebSocket transcription: not yet verified.

### Known limitations

- WebSocket automated tests use a mocked Gnani SDK client.
- Live provider authentication, transcription and streaming latency remain unverified.
- The Stop procedure sends approximately 1.024 seconds of silence; this does not guarantee provider transcript finalisation.
- A transcript event received after the Stop command is not definitive proof that the provider finalised the last utterance.
- WebSocket authentication, origin restrictions, connection limits and session-duration limits require implementation before production deployment.
- Audio frame-size validation does not independently verify the contents of the PCM payload.
- Provider reconnection and recovery behaviour have not yet been verified.

### Milestone 2.1 — Gnani Prisma WebSocket streaming hardening

- Hardened the WebSocket provider connection lifecycle.
- Added handling for provider error events.
- Added handling for unexpected provider event-stream termination.
- Added safe handling for initial provider connection failures.
- Ensured invalid audio-frame errors are sent before closing the browser connection.
- Improved outgoing message acknowledgement and cleanup handling.
- Clarified Stop response semantics to report transcript events received after the Stop command without claiming guaranteed provider finalisation.

### Automated verification

The WebSocket test suite now contains nine test functions covering:

- Connection readiness, audio forwarding and Stop handling.
- Missing API key handling.
- Invalid audio-frame rejection.
- Provider error events.
- Unexpected provider event-stream termination.
- Initial provider connection failure.
- Provider error during Stop.
- Provider stream termination during Stop.
- SDK constructor failure.

Additional lifecycle hardening:

- Moved SDK client construction inside the protected session lifecycle.
- Made cleanup safe when SDK construction fails.
- Tightened missing-API-key test assertions to expect WebSocketDisconnect.

Latest complete backend test result:

**18 passed, 0 failed, 1 warning.**

Breakdown:
- REST and health: 9 passed.
- WebSocket: 9 passed.

Live Gnani WebSocket integration remains pending.

---

## Current technical limitations

- The REST upload limit is enforced inside the endpoint; an additional request-body limit is needed at the deployment or reverse-proxy layer.
- File extension validation does not prove that uploaded bytes contain valid audio.
- Automated provider tests use mocked responses.
- A Starlette deprecation warning concerning the installed `httpx` TestClient integration remains under investigation.
- No scam-stage detection or risk scoring has been implemented.
- No Gnani Timbre speech generation has been implemented.
- No trusted-family notification functionality has been implemented.
- No incident report generation has been implemented.
- No Kavach-Bench evaluation has been implemented.
- No frontend has been implemented.
- Live WebSocket integration remains pending.

---

## Next implementation milestone

1. Verify live Gnani Prisma WebSocket authentication and connection.
2. Test real-time Hindi transcription and provider transcript events.
3. Verify Stop behaviour and connection cleanup with the actual provider.
4. Measure and document actual streaming latency.
5. Complete backend security and API contract review.
6. Verify Gnani Timbre access and actual response format.
7. Build the explainable scam-stage detection engine.
8. Implement the warning policy and speech generation.
9. Build the frontend and consent workflow.
10. Add trusted-family notifications, incident summaries and Kavach-Bench.
11. Complete deployment and hackathon demonstration.
