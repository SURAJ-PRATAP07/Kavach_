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

**Milestone 4.1 - Scam-detection data schemas: Implemented and automated-test verified**

Added `backend/app/detection/schemas.py` and the detection package.

The validated data contract contains:

- `ScamStage`: impersonation, threats, isolation and financial extraction.
- `TranscriptSource`: REST and streaming.
- `SignalStrength`: low, medium and high.
- `TranscriptSegment`: normalized transcript text and available source metadata.
- `DetectionEvidence`: rule ID, matched text, original transcript, explanation, stage and signal strength.
- `StageAssessment`: evidence associated with one scam stage.
- `DetectionResult`: stage assessments, segment count and a non-verdict disclaimer.

Validation rejects empty transcript/evidence text, negative segment indices and unexpected fields. Optional provider metadata remains optional because timestamp formats and some streaming fields are not guaranteed.

Automated verification:
- Detection-schema tests: 8 passed.
- Full backend suite: 35 passed, 0 failed, 1 non-failing warning.
- Python application compilation: passed.
- `git diff --check`: passed.

**Current detection status:** Milestone 4.2 has implemented an initial phrase-based rule engine in `backend/app/detection/engine.py` and `backend/app/detection/rules.py`.

The engine currently:
- Detects initial signals for impersonation, threats, isolation and financial extraction.
- Includes limited English, romanized Hindi/Hinglish and Devanagari phrase patterns.
- Preserves matched text, original transcript, rule ID, explanation, signal strength and available segment metadata.
- Suppresses duplicate evidence for the same rule within one transcript segment.
- Tolerates variable whitespace between words in configured phrases.
- Uses qualitative signal strengths; these are not calibrated probabilities or a numerical risk score.

**REST integration — implemented and automated-test verified:** The `/transcribe` endpoint validates the provider transcript, normalises it into a `TranscriptSegment` with source `rest`, invokes `detect_segments`, and includes the structured detection result in its response. Integration tests use mocked provider responses.

**WebSocket integration — implemented and automated-test verified:** Each WebSocket transcript event is independently converted into a `TranscriptSegment` with source `streaming` and analysed by `detect_segments`. Its structured detection result is attached to that transcript event while preserving the original provider transcript fields and available segment metadata.

The WebSocket integration handles empty or invalid transcript text without allowing detection to interrupt the streaming workflow. Automated tests cover scam-signal detection, harmless transcripts, metadata preservation and independent analysis of multiple transcript events.

**Current integration boundary:** Each WebSocket transcript event receives an independent detection result and a cumulative `conversation_detection` result. A connection-scoped `ConversationDetectionAccumulator` retains phrase-based evidence across transcript events within that WebSocket session. The warning policy evaluates cumulative evidence per transcript event, and when a qualifying WARNING decision is reached and session consent is granted, automatic digital-arrest warning speech is synthesized via Gnani Timbre and delivered through the WebSocket session. Automatic warning triggering is implemented and test-verified; frontend audio playback controls and revocation/cancellation handling remain pending.

**Limitations:** Phrase matching is not general contextual understanding. Negation, reported speech, speaker identity and legitimate conversational context are not comprehensively interpreted. No real-world detection accuracy, precision, recall, false-positive rate or false-negative rate has been established.

**Stage 4.1 - Explainable warning policy: Implemented and automated-test verified**

Added:
- `backend/app/detection/warning_policy.py`
- `backend/tests/test_warning_policy.py`

Implemented `evaluate_warning_policy()` with three decision levels:
- MONITOR: no evidence or one non-financial stage.
- ADVISORY: financial extraction alone or two non-financial stages.
- WARNING: financial extraction plus another distinct stage, or at least three distinct stages.

The policy:
- Counts distinct detected stages rather than evidence-record frequency.
- Preserves unique matched rule IDs.
- Produces deterministic stage ordering.
- Returns reason codes explaining each decision.
- Requires explicit consent before spoken warnings are permitted.
- Suppresses repeat speech when the caller indicates that a warning has already been sent.

The policy is a deterministic heuristic, not a calibrated fraud probability or confirmed fraud verdict.

**Integration boundary:** The policy is currently an independent Python module. It is not yet connected to WebSocket streaming or automatic Gnani Timbre playback. The caller must maintain session warning state.

**Stage 4.2 — Session-scoped spoken-warning consent protocol: Implemented and automated-test verified**

Added session-scoped consent handling to `backend/app/streaming.py`.

Implemented behaviour:

- Spoken safety-warning consent defaults to `False`.
- Consent belongs to one WebSocket connection and resets on disconnect/reconnect.
- The `ready` event reports `warning_consent_enabled: false` and `warning_consent_scope: "session"`.
- Clients can grant or revoke consent during an active connection using the `warning_consent` control command.
- Only strict JSON booleans (`true` and `false`) are accepted.
- Missing values, strings, integers and `null` are rejected without changing the current consent state.
- Valid changes receive a `warning_consent_updated` acknowledgement.
- Invalid values receive a `warning_consent_error` response.
- Existing Stop and unsupported-command handling is preserved.

Consent scope is deliberately limited to automatic spoken safety warnings. This flag does not represent consent for audio capture, transcription or analysis.

**Integration boundary:** This is a backend WebSocket protocol only. A frontend consent UI, warning-policy integration, automatic TTS triggering, audio delivery and playback/revocation handling remain pending.

Automated verification on 2026-11-10:
- WebSocket streaming tests: 22 passed.
- Complete backend suite: 95 passed, 0 failed, 1 non-failing warning.
- Python compilation: passed.
- `git diff --check`: passed (Git displayed an informational LF-to-CRLF notice).

**Stage 4.3 — General-purpose Hindi digital-arrest warning synthesis: Implemented, automated-test verified and live-verified**

Added `synthesize_digital_arrest_warning()` to `backend/app/tts.py` and `POST /synthesize-digital-arrest-warning` to `backend/app/main.py`.

Implemented behaviour:
- General-purpose Hindi safety warning specifically designed for digital-arrest scams, addressing impersonation, threats, financial extraction, and isolation.
- Four romanized Hindi warning segments:
  1. `Agar koi vyakti police, CBI ya kisi sarkari adhikari ke naam par aapko dhamka raha hai, toh ghabraiye nahi.`
  2. `Paise kisi bhi account mein transfer na karein, aur OTP ya bank details share na karein.`
  3. `Call band karein aur sambandhit agency ka number khud uski official website se lekar jaanch karein.`
  4. `Kisi bharosemand parivaar ke sadasya se baat karein.`
- Audio parameters: 16,000 Hz sample rate, mono channel, 16-bit linear PCM in standard WAV container, with 350 ms silence pauses between segments.
- Refactored `_synthesize_segments()` helper in `backend/app/tts.py` to support per-warning speaking speeds:
  - `POST /synthesize-warning`: OTP-specific warning, 2 segments, speaking speed `0.85` (duration ~4.021s).
  - `POST /synthesize-digital-arrest-warning`: digital-arrest warning, 4 segments, speaking speed `0.95`.
- Live endpoint verification:
  - Initial run at speed `0.85`: 28.438 seconds (455,012 frames).
  - Speed-adjusted run at `0.95`: 25.303 seconds (404,843 frames, 809,730 bytes).
  - HTTP 200 returned with content type `audio/wav`, `Content-Disposition: inline; filename="kavach-digital-arrest-warning.wav"`, and `Cache-Control: no-store`.
  - User playback evaluation confirmed that speech delivery at 0.95 was clear, natural, and complete across all four guidance sentences.

**Integration boundary:** The digital-arrest warning endpoint is currently standalone. Automatic detection-to-warning orchestration, WebSocket audio streaming, frontend audio delivery, and playback cancellation/revocation handling remain pending.

Automated verification on 2026-11-10:
- TTS unit and endpoint tests: 13 passed (5 service tests, 3 OTP endpoint tests, 5 digital-arrest tests).
- Complete backend suite: 100 passed, 0 failed, 1 non-failing warning.
- Python compilation: passed.
- `git diff --check`: passed.

**Stage 4.4 — Automatic scam warning triggering and Gnani Timbre WebSocket integration: Implemented and automated-test verified**

Integrated scam detection, warning policy, session-scoped consent and Gnani Timbre TTS into the WebSocket streaming pipeline (`backend/app/streaming.py`).

Implemented behaviour and hardened delivery lifecycle:
- Evaluates the explainable warning policy (`evaluate_warning_policy`) against cumulative evidence after every transcript segment.
- Transmits an explainable `warning_decision` payload on every WebSocket transcript event (`level`, `should_speak`, `reason_codes`, `matched_rule_ids`, `distinct_stages`).
- Automatic trigger condition: Triggers speech synthesis if and only if `decision.should_speak` is `True` (policy level is `WARNING`, session consent is granted, and no warning has previously been attempted or sent in this session).
- Session warning lifecycle states:
  - `warning_attempted`: session boolean flag set before initiating TTS synthesis to enforce a strict maximum of one automatic synthesis attempt per WebSocket session (preventing unbounded synthesis retries on subsequent qualifying transcripts upon failure).
  - `warning_in_progress`: active operation guard protecting the synthesis and transmission block.
  - `warning_already_sent`: marked `True` only after both metadata and binary audio frames have been successfully acknowledged by the WebSocket writer.
- Strict WAV format validation: Before delivery, audio bytes are checked for non-empty bytes, valid WAV container, 16,000 Hz sample rate, 1 mono channel, 2-byte sample width, uncompressed PCM format, and positive frame count. Any validation failure emits a `warning_synthesis_error` and aborts delivery.
- Two-part delivery with acknowledgement:
  1. JSON metadata message (`type: "safety_warning"`, `level: "warning"`, `audio_format: "wav"`, `audio_bytes`, `audio_duration_seconds`, reason codes, matched rules, distinct stages) sent with `wait_until_sent=True`.
  2. Binary frame containing the complete WAV audio payload sent with `wait_until_sent=True`.
- Resilient error handling: Server missing API key, `TTSServiceError`, or format validation error yields a `warning_synthesis_error` event without crashing the streaming session or terminating ongoing transcription.

Automated verification on 2026-11-10:
- WebSocket streaming tests: 39 passed (including 18 Stage 4.4 integration and lifecycle tests).
- Complete backend suite: 117 passed, 0 failed, 1 non-failing warning.
- Python compilation: passed.
- `git diff --check`: passed.

## Current Test Status

Latest complete backend verification on 2026-11-10:

| Test group | Passed |
|---|---:|
| Health endpoint | 1 |
| REST transcription | 10 |
| WebSocket streaming, lifecycle, detection, consent and warning triggering | 39 |
| TTS | 13 |
| Detection schemas | 8 |
| Detection engine | 31 |
| Conversation detection | 4 |
| Warning policy | 11 |
| **Total** | **117** |

Result: **117 passed, 0 failed, 1 non-failing warning.**

Environment: Windows, Python 3.11.9, pytest 8.4.2.

Additional verification:
- Python compilation using `python -m compileall -q backend\app backend\tests`: passed.
- `git diff --check`: passed; Git displayed an informational LF-to-CRLF notice.

The WebSocket tests include per-event detection, cumulative conversation evidence, session-scoped consent grant/revoke, invalid consent rejection and consent reset after reconnect.

Provider tests use mocked Gnani clients. Live integration checks remain separate from automated tests.

The existing Starlette/httpx deprecation warning is non-failing and remains under investigation.

## Implemented Components

| Component | Status |
|---|---|
| FastAPI backend and health endpoint | Implemented and tested |
| Gnani Prisma REST transcription | Implemented and live-verified |
| Gnani Prisma WebSocket streaming | Implemented and live-verified |
| WebSocket failure and cleanup handling | Implemented and mock-tested |
| Gnani Timbre standalone TTS service | Implemented and mock-tested (13 tests) |
| `POST /synthesize-warning` | Implemented and live-verified (OTP warning, speed 0.85) |
| `POST /synthesize-digital-arrest-warning` | Implemented and live-verified (digital-arrest warning, speed 0.95) |
| Scam-detection data schemas | Implemented and tested (8 tests) |
| Phrase-based scam detection engine | Implemented and tested (31 tests) |
| REST transcription-to-detection integration | Implemented and automated-test verified |
| WebSocket streaming per-event detection and cumulative conversation evidence | Implemented and automated-test verified |
| Conversation-level cumulative detection | Implemented and automated-test verified |
| Explainable warning policy | Implemented and tested (11 tests) |
| Session-scoped spoken-warning consent protocol | Implemented and tested (7 consent tests) |
| Contextual and hybrid scam detection | Pending |
| Calibrated explainable risk scoring | Pending |
| Hindi live transcription | One live sample verified; accuracy evaluation pending |
| Safety-warning playback | Tested for OTP (4.021s at 0.85) and digital-arrest (25.303s at 0.95); confirmed clear and understandable |
| Environment configuration | Implemented |
| Automated backend tests | 117 passing, 1 non-failing warning |
| Automatic warning triggering | Implemented and automated-test verified (WebSocket metadata + binary WAV) |

## Pending Components

1. Frontend consent UI and audio player for spoken safety warnings.
2. Playback cancellation/revocation handling.
3. Evaluate Hindi and Hinglish transcription quality using multiple labelled samples.
6. Test clean, noisy and telephony-compressed audio.
7. Complete backend security and API contract review.
8. Expand and evaluate rule-based scam-stage detection against labelled legitimate and scam conversations.
9. Implement contextual reasoning and hybrid detection.
10. Implement explainable and calibrated risk scoring.
11. Implement consent-based trusted-family notifications.
12. Implement incident summaries for cybercrime reporting.
13. Develop Kavach-Bench.
14. Build the responsive frontend dashboard.
15. Complete end-to-end, privacy, performance and deployment testing.

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

1. Implement frontend consent controls and audio playback in the dashboard.
2. Define playback cancellation and revocation protocols (Stage 4.5).
3. Evaluate detection against labelled legitimate and scam conversations.
4. Implement contextual reasoning and explainable risk scoring.
5. Continue with trusted-family notifications, incident summaries, Kavach-Bench and dashboard development.
