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

**Current integration boundary:** Each WebSocket transcript event receives an independent detection result and a cumulative `conversation_detection` result. A connection-scoped `ConversationDetectionAccumulator` retains phrase-based evidence across transcript events within that WebSocket session. This is evidence aggregation, not contextual conversation understanding or a calibrated conversation-level risk assessment. Automatic Gnani Timbre warning triggering remains pending.

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

## Current Test Status

Latest complete backend verification on 2026-11-10:

| Test group | Passed |
|---|---:|
| Health endpoint | 1 |
| REST transcription | 10 |
| WebSocket streaming, lifecycle and detection | 15 |
| TTS | 8 |
| Detection schemas | 8 |
| Detection engine | 31 |
| Conversation detection | 4 |
| Warning policy | 11 |
| **Total** | **88** |

Result: **88 passed, 0 failed, 1 non-failing warning.**

Environment: Windows, Python 3.11.9, pytest 8.4.2.

Additional verification:
- Python compilation using `python -m compileall`: passed.
- `git diff --check`: passed.

The WebSocket suite includes four detection-integration tests. These use a mocked Gnani SDK client and verify application behaviour, not live provider detection accuracy.

Live integration checks:
- REST transcription: verified with one real Hindi audio recording.
- WebSocket transcription: verified with one Hindi recording through the actual Gnani Prisma streaming service.
- TTS endpoint: HTTP 200; playback of two warning segments confirmed complete and understandable.
- REST detection integration: automated tests verify the response structure and a detected scam signal using mocked provider responses.
- WebSocket detection integration: automated tests verify per-event detection using mocked transcript events.
- Detection-engine unit tests: selected Devanagari phrases across all four scam stages successfully matched. These are local rule-engine tests, not live Gnani integration tests.

The live WebSocket transcription verification does not establish live scam-detection accuracy. No labelled real-world scam conversation has yet been evaluated.

Mocked provider tests are distinct from live integration checks. These results do not establish broad transcription accuracy, TTS quality or real-world scam-detection accuracy.

The existing Starlette/httpx deprecation warning is non-failing and remains under investigation.

## Implemented Components

| Component | Status |
|---|---|
| FastAPI backend and health endpoint | Implemented and tested |
| Gnani Prisma REST transcription | Implemented and live-verified |
| Gnani Prisma WebSocket streaming | Implemented and live-verified |
| WebSocket failure and cleanup handling | Implemented and mock-tested |
| Gnani Timbre standalone TTS service | Implemented and mock-tested |
| `POST /synthesize-warning` | Implemented and live-verified |
| Scam-detection data schemas | Implemented and tested (8 tests) |
| Phrase-based scam detection engine | Implemented and tested (31 tests) |
| REST transcription-to-detection integration | Implemented and automated-test verified |
| WebSocket transcript-event-to-detection integration | Implemented and automated-test verified |
| Conversation-level cumulative detection | Implemented and automated-test verified |
| Explainable warning policy | Implemented and tested (11 tests) |
| Contextual and hybrid scam detection | Pending |
| Calibrated explainable risk scoring | Pending |
| Hindi live transcription | One live sample verified; accuracy evaluation pending |
| Safety-warning playback | Two tested segments confirmed complete and understandable |
| Environment configuration | Implemented |
| Automated backend tests | 88 passing, 1 non-failing warning |

## Pending Components

1. Evaluate Hindi and Hinglish transcription quality using multiple labelled samples.
2. Test clean, noisy and telephony-compressed audio.
3. Complete backend security and API contract review.
4. Expand and evaluate rule-based scam-stage detection against labelled legitimate and scam conversations.
5. Implement contextual reasoning and hybrid detection.
6. Implement explainable and calibrated risk scoring.
7. Design and implement warning prioritisation and triggering policy.
8. Integrate automatic Gnani Timbre warning delivery with detection and WebSocket streaming.
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

1. Complete documentation review and GitHub push for Stage 3 (conversation-level detection).
2. Review backend security, validation and resource limits.
3. Evaluate detection rules against labelled scam and legitimate conversations.
4. Design a safe warning policy and integrate the verified TTS service.
5. Implement contextual reasoning and explainable risk scoring.
6. Build the frontend and consent workflow.
7. Add family notifications, incident summaries and Kavach-Bench.
8. Complete end-to-end testing, deployment and the hackathon demonstration.
