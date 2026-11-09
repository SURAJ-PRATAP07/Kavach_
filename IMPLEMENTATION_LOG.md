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

---

## Milestone 2.2 — Browser-disconnect cleanup test

**Status: Implemented and automated-test verified**

Added a test verifying that the mocked Gnani streaming client is closed when the browser disconnects during an active WebSocket session.

Implementation details:
- Added a `threading.Event` to the fake Gnani client.
- The event is signalled when the client's asynchronous `close()` method executes.
- The test waits for the cleanup signal and verifies that the provider client is closed.
- This verifies the backend cleanup path with a mocked provider; it does not verify live Gnani WebSocket behaviour.

Latest complete backend test run:
- 19 passed, 0 failed, 1 warning.
- REST and health tests: 9.
- WebSocket tests: 10.

The Starlette/httpx deprecation warning remains non-failing.

Live Gnani WebSocket authentication, transcription and streaming latency remain unverified.


---

## Milestone 2.3 - Live Gnani Prisma WebSocket verification

**Status: Live integration verified with one Hindi recording on 2026-11-08.**

A real WAV recording was streamed through Kavach's FastAPI `/ws/transcribe` endpoint to the actual Gnani Prisma streaming service. This was not a mocked provider test.

### Observed configuration

- Provider model: `prisma-v2.5`.
- Language: `hi-IN`.
- Encoding: signed 16-bit little-endian PCM.
- Sample rate: 16 kHz.
- Channels: mono.
- Frame size: 1,024 bytes (512 samples).
- Frame duration: 32 ms.

### Actual provider event flow

- Received the Kavach `ready` event with the configured model and audio format.
- Received provider `processing`.
- Received a real Hindi `transcript` event.
- Received the final Kavach `stopped` event.
- Confirmed the transcript event used the `segment_id` field.
- A fresh source search found no `segment_idd` typo in the Python files.

### Observed transcript and latency

The provider returned a Hindi transcript for the test recording. The transcript contained recognition errors, so this run verifies connectivity and event delivery, not recognition accuracy.

The latest provider-reported segment latency was 194 ms. A previous run reported 207 ms. These are individual provider observations, not a statistically meaningful benchmark or end-to-end application latency measurement.

### Stop-event interpretation

The `stopped` response reported `transcript_received_after_stop_command: false`.

The transcript had been processed before the backend registered the Stop command. The flag therefore describes event timing; it does not mean the transcript was lost. It also does not establish that the provider exposes a definitive finalisation acknowledgement.

### Test and repository verification

- Complete backend automated tests: 19 passed, 0 failed, 1 warning.
- REST and health tests: 9.
- WebSocket tests: 10, using a mocked provider client.
- Live WebSocket integration: one Hindi recording successfully transcribed.
- Latest repository check before documentation changes: clean and synced with `origin/main` at `602efb5`.

### Remaining limitations

- Hindi/Hinglish accuracy has not been benchmarked.
- No systematic noisy or compressed audio evaluation has been completed.
- A single live recording does not establish production reliability or latency performance.
- WebSocket security, origin restrictions, authentication, connection limits and session-duration limits still require review.
- The Starlette/httpx deprecation warning remains under investigation.


---

## Milestone 3 - Gnani Timbre standalone safety-warning TTS

**Status: Implemented, automated-test verified and live endpoint playback verified on 2026-11-09.**

### Implementation

- Added `backend/app/tts.py` with a standalone Gnani Timbre synthesis service.
- Added `POST /synthesize-warning` to the FastAPI application.
- Used `gnani-vachana==0.9.0`, model `timbre-v3.0`, voice `Tarika`, language `hi-IN` and speed `0.85`.
- Synthesized two warning segments:
  1. `Apna one-time password.`
  2. `Kisi ke saath share na karein.`
- Inserted 350 ms of silence between the two segments.
- Validated the provider's WAV response and reconstructed a standard mono, 16 kHz, 16-bit PCM WAV.
- Executed the synchronous SDK request in a thread pool to avoid blocking the asynchronous FastAPI event loop.
- Added handling for missing credentials, malformed provider audio and synthesis failures.

### Automated verification

- TTS service tests: 5 passed.
- TTS endpoint tests: 3 passed.
- Total TTS tests: 8 passed.
- Tests use a mocked provider client and do not consume live API credits.

### Live endpoint verification

- Endpoint returned HTTP 200 with `audio/wav`.
- WAV contained 64,330 frames at 16,000 Hz.
- Duration: 64,330 / 16,000 = 4.020625 seconds.
- The user confirmed the playback was complete and understandable.

### Limitations

- Verification covers only the two tested romanized Hindi segments and the configured voice/settings.
- Devanagari quality, broader Hindi/Hinglish quality and other warning phrases have not been evaluated.
- TTS remains a standalone endpoint. It is not connected to streaming transcription, scam detection or an automatic warning policy.

---

## Milestone 4.1 - Scam-detection data schemas

**Status: Implemented and automated-test verified on 2026-11-09.**

### Implementation

Added:
- `backend/app/detection/__init__.py`
- `backend/app/detection/schemas.py`
- `backend/tests/test_detection_schemas.py`

The Pydantic data models define:
- Scam stages: impersonation, threats, isolation and financial extraction.
- Transcript sources: REST and streaming.
- Qualitative signal strengths: low, medium and high.
- Normalized transcript segments with optional provider metadata.
- Explainable detection evidence with rule ID, matched text, original transcript and reason.
- Per-stage evidence assessments.
- A complete detection result with a non-verdict disclaimer.

Validation covers empty text, whitespace stripping, non-negative segment indices, optional metadata, enum values, JSON serialization and rejection of unexpected fields.

### Automated verification

- Detection-schema tests: 8 passed.
- Full backend suite: 35 passed, 0 failed, 1 non-failing warning.
- Python application compilation: passed.
- `git diff --check`: passed.

### Scope and limitations

This milestone implements data contracts only. Rule matching, contextual detection, numerical risk scoring, timestamps derived from audio, warning prioritisation and automatic warning integration remain unimplemented.

---

## Milestone 4.2 - Initial rule-based scam detection engine

**Status: Implemented and automated-test verified on 2026-11-09.**

### Implementation

Added:
- `backend/app/detection/rules.py`
- `backend/app/detection/engine.py`
- `backend/tests/test_detection_engine.py`

Implemented an initial standalone phrase-based detection engine for four stages:

1. Impersonation / authority claims.
2. Threats / arrest threats.
3. Isolation / secrecy instructions.
4. Financial extraction / purported safe-account transfers.

The initial handcrafted patterns cover selected English, romanized Hindi/Hinglish and Devanagari Hindi phrases.

The engine:
- Associates each match with a stable rule ID.
- Preserves the matched phrase and original transcript.
- Includes an explanation and qualitative signal strength.
- Carries forward available source and segment metadata.
- Produces an assessment for each of the four stages.
- Suppresses duplicate evidence for the same rule within one segment.

### Automated verification

Detection-engine tests: **27 passed.**

Coverage includes:
- Positive phrase detection across the four stages.
- Selected English, romanized Hindi and Devanagari examples.
- Six generic legitimate-mention regression cases.
- Three explicitly negated sentence regression cases.
- Reported arrest-threat detection.
- Empty input and all-stage output.
- Multiple segments and source metadata.
- Duplicate suppression.
- Exact matched text and timestamp preservation.

Latest complete backend test result:

**62 passed, 0 failed, 1 non-failing warning.**

Breakdown:
- REST and health: 9.
- WebSocket: 10.
- TTS: 8.
- Detection schemas: 8.
- Detection engine: 27.

Python compilation passed and `git diff --check` passed.

### Scope and limitations

This is an initial phrase-based signal detector, not a contextual scam classifier.

The negative-sentence tests only verify that the tested sentences do not match the current affirmative patterns. They do not establish general negation understanding.

The engine does not yet:
- Understand full conversational context.
- Reliably distinguish speakers or quoted speech.
- Interpret all negation or legitimate exceptions.
- Calculate a numerical or calibrated risk score.
- Trigger automatic warnings.
- Integrate detection with WebSocket streaming.
- Invoke Gnani Timbre automatically.

No real-world detection accuracy or false-positive/false-negative rate has been established.

### Stage 1 ? REST transcription and detection integration

**Status:** Implemented and automated-test verified; Git commit pending.

**Date:** 2026-11-10

#### Changes

- Integrated the detection engine with the `POST /transcribe` REST endpoint.
- After successful provider transcript validation, normalised the transcript into a `TranscriptSegment`.
- Set the segment source to `rest` and retained the configured language metadata.
- Invoked `detect_segments` on the normalised transcript segment.
- Added the structured detection result to the existing REST response without removing the original transcription fields.
- Added `test_transcribe_returns_detection_result` to verify the detection response structure.
- Added `test_transcribe_detects_scam_signal` to verify that a configured scam phrase produces detection evidence.

#### Verification

- REST transcription test file: 10 tests collected.
- Complete backend suite: 68 passed, 0 failed, 1 non-failing warning in the latest run.
- The two integration tests use mocked provider responses. They verify application integration, not live provider behaviour or real-world detection accuracy.
- Python compilation and `git diff --check` passed during the 2026-11-10 verification.

#### Scope and limitations

This integration applies to REST transcription only. WebSocket detection integration and automatic Timbre warning triggering remain pending.

The phrase-based detector is not a contextual scam classifier. No real-world detection accuracy, precision, recall, false-positive rate or false-negative rate has been established.

#### Repository status

The implementation, tests and documentation changes are awaiting final review and Git commit/push.
---

## Follow-up - Detection matching robustness

**Status: Implemented and automated-test verified on 2026-11-09; Git commit pending.**

### Changes

Updated `backend/app/detection/engine.py` to tolerate variable whitespace between words in configured detection phrases.

The matcher now allows one or more whitespace characters where a configured phrase contains a space. The original transcript and matched text are preserved in the generated evidence. Existing rule IDs, explanations, signal strengths, segment metadata and duplicate suppression behaviour remain intact.

Reviewed `backend/app/detection/rules.py`. Its only Git diff is removal of an initial blank line; no Devanagari pattern correction was required. Python Unicode inspection confirmed the current source strings are correctly encoded.

### Regression tests

Added five variable-whitespace tests covering:
- Hindi impersonation.
- Hindi arrest threat.
- Hindi isolation.
- Hindi financial extraction.
- English impersonation.

Detection-engine test suite: **31 passed**.

Complete backend suite: **66 passed, 0 failed, 1 non-failing warning**.

Additional verification:
- `python -m compileall -q app tests`: passed.
- `git diff --check`: passed.

### Scope and limitations

This update improves matching when whitespace varies in a transcript. It does not add contextual language understanding, general negation handling, speaker identification, calibrated risk scoring or real-world detection accuracy.

The five regression tests establish behaviour for their specific test inputs. They do not establish robustness across all Hindi/Hinglish speech or transcription errors.

The pilot evaluation dataset remains empty and has not been used to calculate detection metrics.
