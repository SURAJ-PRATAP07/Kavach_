# Kavach — Test Report

## 1. Test environment

| Parameter | Value |
|---|---|
| Operating system | Windows |
| Python | 3.11.9 |
| Pytest | 8.4.2 |
| Backend framework | FastAPI |
| STT provider | Gnani Prisma v2.5 |
| Streaming SDK | gnani-vachana 0.9.0 |

---

## 2. Automated test summary

Latest complete backend test run on 2026-11-10:

**68 passed, 0 failed, 1 non-failing warning.**

| Test group | Tests | Result |
|---|---:|---|
| Health endpoint | 1 | PASS |
| REST transcription | 10 | PASS |
| WebSocket streaming and lifecycle | 10 | PASS |
| TTS service and endpoint | 8 | PASS |
| Detection data schemas | 8 | PASS |
| Detection engine | 31 | PASS |
| **Total** | **68** | **PASS** |
Command:

`powershell
python -m pytest backend/tests -q
`

The warning is a Starlette deprecation warning concerning the httpx TestClient integration. It did not cause test failures.

The warning remains under investigation. No dependency changes have been made solely to suppress it.

The earlier test outputs below are historical results from their respective development stages. They are not the latest complete test count.

git diff --check completed without reporting whitespace errors during the latest verification. Python compilation also passed.

### Historical test verification runs

Earlier verification run output:

`
.................. [100%]

18 passed, 1 warning in 2.07s
`

### Historical verification — Browser-disconnect cleanup

Commands executed:

`powershell
python -m py_compile backend\app\streaming.py backend\tests\test_streaming.py
python -m pytest backend/tests -q
git diff --check
`

Actual result at that historical verification point:

`
27 passed, 1 warning in 2.90s
`

The subsequent Milestone 4.1 verification added eight detection-schema tests (35 passed). The Milestone 4.2 verification added 27 detection-engine tests, bringing the complete backend total at that historical verification point to 62 passed, 0 failed and one non-failing warning. The latest complete backend result is reported in Section 2.

git diff --check completed without reporting whitespace errors.

The browser-disconnect test verifies provider cleanup using a mocked client. The latest complete backend run also includes eight TTS tests. Separately, live Gnani Prisma WebSocket integration was verified with one Hindi recording on 2026-11-08. See Sections 6 and 8 for live integration results and limitations.

---

## 3. REST transcription automated tests

The REST test suite uses mocked provider responses for predictable and isolated testing.

| ID | Test | Expected result | Result |
|---|---|---|---|
| REST-001 | Successful transcription | Transcript returned successfully | PASS |
| REST-002 | Unsupported extension | Request rejected | PASS |
| REST-003 | Missing API key | Configuration error returned | PASS |
| REST-004 | Empty audio upload | Request rejected | PASS |
| REST-005 | Oversized audio upload | Upload rejected | PASS |
| REST-006 | Provider timeout | Gateway timeout handled | PASS |
| REST-007 | Provider HTTP error | Upstream error handled | PASS |
| REST-008 | Invalid provider JSON | Invalid response handled | PASS |
| REST-009 | Detection result returned | Structured detection result included in response | PASS |
| REST-010 | Scam signal detected | Matching transcript produces stage evidence in response | PASS |

The two detection-integration tests use mocked provider responses. They verify Kavach's REST response and detection integration, not live provider behaviour or real-world detection accuracy.

The health endpoint is tested separately in `backend/tests/test_health.py` (1 test).

## 4. Live REST API integration verification

A real audio recording was submitted through the local Kavach backend to Gnani Prisma v2.5.

| Check | Actual result |
|---|---|
| Backend endpoint | `POST /transcribe` |
| Provider | Gnani Prisma v2.5 |
| HTTP status | 200 OK |
| Configured language | `hi-IN` |
| Transcription | Hindi transcript returned |
| Provider request ID | Returned |
| End-to-end latency | Approximately 0.228 seconds for this individual request |
| Result | PASS |

The live API test was performed separately from the automated test suite.

**Important:** The reported latency represents one successful request, not a statistically meaningful performance benchmark.

---

## 5. WebSocket streaming automated tests

The WebSocket tests use a mocked Gnani streaming client. They verify the backend's WebSocket behaviour without making a live request to the Gnani streaming service.

### Detailed test assertions

| ID | Test | Expected result | Actual result | Status |
|---|---|---|---|---|
| WS-001 | WebSocket connection | Ready message received | Ready message received | PASS |
| WS-002 | Audio forwarding | 1024-byte frame forwarded | Frame forwarded | PASS |
| WS-003 | Stop handling | Stopped response received | Stopped response received | PASS |
| WS-004 | Transcript forwarding | Transcript event forwarded | Mock transcript received | PASS |
| WS-005 | Silence-frame handling | 32 frames sent | 32 frames sent | PASS |
| WS-006 | Missing API key | Connection rejected | Error and close received | PASS |
| WS-007 | Invalid audio frame | Error sent before connection closes | Error received, connection closed | PASS |
| WS-008 | Provider error event | Error forwarded and session terminated | Error received, connection closed | PASS |
| WS-009 | Unexpected provider stream end | Browser notified and session terminated | Error received, connection closed | PASS |
| WS-010 | Provider connection failure | Safe error returned and connection closed | Error received, connection closed | PASS |
| WS-011 | SDK constructor failure | Safe error returned and connection closed | Error received, connection closed | PASS |
| WS-012 | Browser disconnect cleanup | Provider client is closed after browser disconnect | Cleanup event received; client closed | PASS |

The twelve detailed assertions above are covered across ten WebSocket test functions in `backend/tests/test_streaming.py`.

### Streaming configuration verified by tests

| Parameter | Value |
|---|---|
| Sample rate | 16,000 Hz |
| Channels | 1 |
| Encoding | PCM signed 16-bit little-endian |
| Frame size | 1024 bytes |
| Samples per frame | 512 |
| Frame duration | 32 ms |
| Silence frames | 32 |
| Total silence duration | Approximately 1.024 seconds |
| Final transcript wait | Up to 3 seconds |

The Stop response reports whether a transcript event was received after the Stop command. This does not establish that the provider definitively finalised the last utterance, because the SDK does not expose a documented finalisation acknowledgement tied to that command.

### Audio duration calculation

For mono PCM signed 16-bit audio:

- Each sample occupies 2 bytes.
- Sample rate is 16,000 samples per second.
- Audio byte rate is 16,000 × 2 = 32,000 bytes per second.

Each frame contains 1024 bytes:

\[
\text{Frame duration} = \frac{1024}{32000}
= 0.032 \text{ seconds}
\]

For 32 silence frames:

\[
32 \times 0.032 = 1.024 \text{ seconds}
\]

These calculations describe the silence sent by Kavach. They do not establish the provider's actual transcript-finalisation time.

**WebSocket verification status:** Automated mocked tests PASS. Live Gnani WebSocket integration was also verified on 2026-11-08 using one real Hindi audio recording.

---


## 6. Live Gnani Prisma WebSocket integration verification

**Date:** 2026-11-08

A real WAV recording was streamed through the local Kavach FastAPI `/ws/transcribe` endpoint to the actual Gnani Prisma streaming service.

| Check | Actual observation |
|---|---|
| Endpoint | `/ws/transcribe` |
| Provider model | `prisma-v2.5` |
| Language | `hi-IN` |
| Encoding | `pcm_s16le` |
| Sample rate | 16,000 Hz |
| Channels | 1 (mono) |
| Frame size | 1,024 bytes |
| Frame duration | 32 ms |
| Ready event | Received |
| Processing event | Received |
| Transcript event | Received with Hindi text |
| Transcript segment ID | `segment_id` |
| Stopped event | Received |
| Result | PASS for this live integration sample |

The latest provider-reported segment latency was 194 ms. A previous run reported 207 ms. These are individual observations, not an end-to-end latency benchmark or a statistically meaningful performance evaluation.

The returned Hindi transcript contained recognition errors. Hindi/Hinglish accuracy must be evaluated separately using multiple labelled recordings.

The `transcript_received_after_stop_command` field was `false` in the observed run. The transcript event had been processed before the backend registered the Stop command. This flag describes event timing and does not indicate transcript loss or confirm provider finalisation.

**Scope:** This test verifies actual provider connectivity and transcript event delivery for one recording. It does not establish general recognition accuracy, noisy-audio robustness, production reliability or performance under concurrency.

---

## 7. Gnani Timbre TTS automated tests

The TTS test suite contains five service tests and three endpoint tests. Provider interactions are mocked in automated tests; these tests do not consume live Gnani API credits.

### TTS service tests

| ID | Test | Expected result | Result |
|---|---|---|---|
| TTS-001 | Successful warning synthesis | Two segments combined into a valid WAV with the configured silence interval | PASS |
| TTS-002 | Provider configuration | Correct model, voice, language, speed and audio configuration supplied | PASS |
| TTS-003 | Missing API key | Request rejected before provider client initialisation | PASS |
| TTS-004 | Malformed provider WAV | Invalid provider audio rejected safely | PASS |
| TTS-005 | Provider synthesis failure | Failure mapped to a safe service error identifying the segment | PASS |

### TTS endpoint tests

| ID | Test | Expected result | Result |
|---|---|---|---|
| TTS-006 | Successful endpoint response | WAV returned with `audio/wav` content type | PASS |
| TTS-007 | Missing API key | HTTP 503 returned | PASS |
| TTS-008 | Provider failure | HTTP 502 returned without exposing provider details | PASS |

### TTS configuration covered by tests

| Parameter | Value |
|---|---|
| Provider model | `timbre-v3.0` |
| Voice | `Tarika` |
| Language | `hi-IN` |
| Speed | `0.85` |
| Sample rate | 16,000 Hz |
| Channels | Mono |
| Sample width | 16-bit |
| Encoding | Linear PCM |
| Warning segments | 2 |
| Silence between segments | 350 ms |

The service validates the provider WAV response, extracts PCM audio and rebuilds a standard WAV response. The synchronous SDK call is executed in a thread pool by the asynchronous FastAPI endpoint.

---

## 8. Live Gnani Timbre TTS endpoint verification

**Date:** 2026-11-09

The live TTS endpoint was called through the local Kavach FastAPI backend using the actual Gnani Timbre service.

| Check | Actual observation |
|---|---|
| Endpoint | `POST /synthesize-warning` |
| Provider model | `timbre-v3.0` |
| Voice | `Tarika` |
| Language | `hi-IN` |
| Speed | `0.85` |
| HTTP status | 200 OK |
| Content type | `audio/wav` |
| Audio encoding | 16-bit PCM |
| Sample rate | 16,000 Hz |
| Channels | Mono |
| WAV frames | 64,330 |
| WAV duration | 4.020625 seconds (~4.021 seconds) |
| Playback | User-confirmed complete and understandable |
| Result | PASS for this live endpoint test |

The generated warning contained these two romanized Hindi segments:

1. `Apna one-time password.`
2. `Kisi ke saath share na karein.`

A 350 ms silence interval was inserted between the segments.

### WAV duration calculation

For the returned mono audio:

\[
\text{Duration} =
\frac{\text{Number of frames}}{\text{Sample rate}}
\]

\[
= \frac{64,330}{16,000}
= 4.020625 \text{ seconds}
\]

This is the duration of the combined WAV file, including the inserted silence.

**Scope and limitations:** The user confirmed that these two warning segments were complete and understandable during playback. This does not establish broad Hindi or Hinglish speech quality, Devanagari pronunciation quality, or quality across other warning phrases and voices.

**Integration boundary:** The TTS endpoint currently operates independently. It has not yet been connected to WebSocket transcription, scam-stage detection or an automated warning policy.

---

## 9. Detection data-schema automated tests

The detection schema tests validate the Pydantic data contract in `backend/app/detection/schemas.py`. They do not test scam detection accuracy or rule matching.

| ID | Test coverage | Expected result |
|---|---|---|
| 1 | Streaming transcript metadata | Valid segment accepted |
| 2 | REST transcript without streaming metadata | Valid segment accepted |
| 3 | Empty or whitespace-only transcript | Rejected |
| 4 | Negative segment index | Rejected |
| 5 | Detection evidence fields | Explanation and evidence preserved |
| 6 | Empty stage evidence | Accepted |
| 7 | JSON serialization and disclaimer | Valid serialization |
| 8 | Unexpected additional fields | Rejected |

Actual result:

```

8 passed in 0.33s

```

The latest reported complete backend suite contains 68 passing tests, 0 failures and one non-failing warning. The 31 detection-engine tests are reported separately in Section 10.

These tests verify schema validation and serialization only. They do not establish that any scam stage can be detected correctly.

---

## 10. Initial phrase-based detection engine automated tests

The detection engine is implemented in:

- `backend/app/detection/rules.py`
- `backend/app/detection/engine.py`

Tests are maintained in:

- `backend/tests/test_detection_engine.py`

The engine analyses supplied transcript segments and produces explainable evidence for four stages:

1. Impersonation.
2. Threats.
3. Isolation.
4. Financial extraction.

The current handcrafted patterns cover selected English, romanized Hindi/Hinglish and Devanagari Hindi phrases.

### Automated test coverage

The detection-engine test suite contains 31 passing tests.

Coverage includes:

- Positive phrase detection across all four scam stages.
- Selected English, romanized Hindi/Hinglish and Devanagari examples.
- Six generic legitimate-mention regression cases.
- Three explicitly negated-sentence regression cases.
- Reported arrest-threat detection.
- Empty input and all-stage output.
- Multiple transcript segments and source metadata.
- Duplicate suppression for the same rule within a segment.
- Preservation of matched text and timestamp metadata.
- Five variable-whitespace regression tests covering Hindi and English phrases.

Actual result:

**31 passed.**

The current phrase matcher tolerates variable whitespace between words in its configured patterns. Five regression tests cover this behaviour. Python Unicode inspection confirmed the current Devanagari source strings are correctly encoded. This source inspection does not establish real-world speech recognition or scam-detection accuracy.

### Interpretation and limitations

These tests verify the current handcrafted patterns and evidence-generation behaviour. They do not establish real-world scam-detection accuracy.

The negative-sentence tests only verify that the specific tested sentences do not match the current affirmative patterns. They do not establish general negation understanding.

The engine does not yet:
- Reliably understand full conversational context.
- Distinguish speakers or quoted speech.
- Handle all negation and legitimate exceptions.
- Calculate a numerical or calibrated risk score.
- Integrate with WebSocket streaming.
- Trigger automatic Gnani Timbre warnings.

No labelled real-world evaluation dataset, detection accuracy, precision, recall, false-positive rate or false-negative rate has been established.

### Latest complete backend result

| Test group | Passed |
|---|---:|
| Health endpoint | 1 |
| REST transcription | 10 |
| WebSocket streaming and lifecycle | 10 |
| TTS service and endpoint | 8 |
| Detection data schemas | 8 |
| Detection engine | 31 |
| **Total** | **68** |

Result: **68 passed, 0 failed, 1 non-failing warning.**

---

## 11. Warnings

One Starlette deprecation warning was reported:

```text
StarletteDeprecationWarning:
Using `httpx` with `starlette.testclient` is deprecated;
install `httpx2` instead.
```

This warning did not cause test failures.

The installed dependency combination requires further compatibility investigation before changing packages.

---

## 12. Important test limitations

- Automated REST provider responses are mocked.
- Only the separately documented live REST request establishes actual REST API connectivity.
- WebSocket tests use a mocked Gnani SDK client.
- Live WebSocket transcription has been verified with one Hindi recording; broader language and audio-condition evaluation remains pending.
- No systematic Hindi or Hinglish recognition accuracy benchmark has been performed.
- No noisy or compressed audio benchmark has been completed.
- No scam-versus-legitimate classification test has been completed.
- No false-positive or false-negative evaluation has been completed.
- No family notification test has been completed.
- Gnani Timbre has been tested through one live endpoint playback using two warning segments; broader language and phrase evaluation remains pending.
- No production load or concurrency test has been completed.

---

## 13. Pending tests

### Backend and audio validation

- Validate malformed audio content.
- Test unsupported or corrupted audio payloads.
- Test REST connection failures.
- Test actual provider error response variations.
- Verify supported audio formats against the live API.
- Test upload limits at the deployment or reverse-proxy layer.

### WebSocket streaming

- Expand live Gnani Prisma WebSocket testing across multiple recordings and sessions.
- Evaluate transcript quality and event behaviour for Hindi and Hinglish.
- Test provider connection failures.
- Test provider error events and unexpected connection closure.
- Test invalid audio-frame handling.
- Test session timeouts and connection cleanup.
- Measure actual streaming latency.

### Language and audio robustness

- Test Hindi under clean conditions.
- Test Hinglish and code-mixed speech.
- Test telephony-compressed audio.
- Test noisy audio.
- Measure transcription accuracy using a labelled evaluation dataset.

### Scam detection and safety

- Test impersonation detection.
- Test threats and intimidation detection.
- Test isolation instructions.
- Test financial extraction detection.
- Test legitimate conversations containing scam-related keywords.
- Evaluate false positives, false negatives and warning latency.

### Future functionality

- Evaluate additional Gnani Timbre warning phrases, voices and Devanagari/Hinglish output.
- Integrate and test warning delivery, prioritisation and cooldown behaviour.
- Test trusted-family notification consent.
- Test incident summary generation.
- Test end-to-end frontend and backend integration.

---

## 14. Overall test assessment

| Component | Current assessment |
|---|---|
| FastAPI health endpoint | 1 automated test PASS |
| Gnani Prisma REST integration | Live integration PASS |
| REST transcription and detection tests | 10 automated tests PASS |
| WebSocket endpoint | Implemented and live integration verified |
| WebSocket mocked tests | 10 automated test functions PASS |
| TTS service and endpoint tests | 8 automated tests PASS |
| Detection data-schema tests | 8 automated tests PASS |
| Detection engine tests | 31 automated tests PASS |
| Complete backend automated tests | 68 PASS, 0 failed, 1 warning |
| Live WebSocket integration | One Hindi recording successfully transcribed |
| REST detection integration | Implemented; automated tests use mocked provider responses |
| Contextual detection and risk scoring | Not implemented |
| Gnani Timbre standalone TTS service | Implemented and mock-tested |
| `POST /synthesize-warning` | Live endpoint verified; playback confirmed for two segments |
| Trusted-family notifications | Not implemented |
| Frontend | Not implemented |
| Kavach-Bench | Not implemented |

**Conclusion:** The latest complete backend test run contains 68 passing tests, no failures and one non-failing deprecation warning. Gnani Prisma REST integration has been live-verified, and live Prisma WebSocket streaming has been verified with one Hindi recording. Gnani Timbre TTS has eight passing mocked automated tests and a separately verified live endpoint playback using two warning segments.

The initial phrase-based detection engine has 31 passing automated tests and produces explainable evidence for four scam stages. It is integrated with the REST transcription endpoint; two additional REST tests verify that the endpoint returns structured detection results and detects a configured scam signal using mocked provider responses.

These tests verify implemented patterns, evidence behaviour and REST integration. They do not establish real-world scam-detection accuracy. Contextual detection, calibrated risk scoring, WebSocket detection integration and automatic warning delivery remain unimplemented.

These results establish tested backend behaviour and selected live integrations, not production readiness or guaranteed fraud prevention.


---

## Test Report — WebSocket Detection Integration

**Date:** 2026-11-10

**Milestone:** Stage 2 — WebSocket streaming and detection integration

### Environment:
- Operating system: Windows
- Python: 3.13.5
- pytest: 9.2.0
- Backend framework: FastAPI
- Streaming SDK: `gnani-vachana==0.9.0`

### 1. Complete backend test suite

Result: **72 passed, 0 failed, 1 non-failing warning.**

| Test group | Passed | Failed |
|---|---:|---:|
| Health endpoint | 1 | 0 |
| REST transcription | 10 | 0 |
| WebSocket streaming, lifecycle and detection | 14 | 0 |
| TTS service and endpoint | 8 | 0 |
| Detection schemas | 8 | 0 |
| Detection engine | 31 | 0 |
| **Total** | **72** | **0** |

Latest reported execution time: 6.39 seconds.

### 2. WebSocket detection integration tests

| Test | Expected behaviour | Result |
|---|---|---|
| `test_websocket_detects_arrest_threat` | Arrest-threat phrase produces `THREAT_ARREST` evidence | PASS |
| `test_websocket_harmless_transcript_has_no_evidence` | Harmless transcript produces no scam evidence | PASS |
| `test_websocket_detection_preserves_metadata` | Transcript and detection evidence retain relevant metadata | PASS |
| `test_websocket_multiple_transcripts_have_independent_detection` | Each transcript event receives an independent detection result | PASS |

These tests use a mocked Gnani SDK client and controlled transcript events. They establish application-level integration behaviour, not real-world detection accuracy.

### 3. Additional verification

| Check | Expected result | Observed result |
|---|---|---|
| Python compilation | No syntax or compilation errors | PASS |
| `git diff --check` | No whitespace errors in diff | PASS |
| Full backend pytest suite | All tests pass | PASS |

### 4. Live integration evidence

| Component | Verification performed | Result |
|---|---|---|
| Prisma REST | One live Hindi transcription request | HTTP 200 |
| Prisma WebSocket | One live Hindi audio recording | Provider event flow received |
| Timbre TTS | One live warning synthesis request | HTTP 200 |
| TTS playback | Two romanized Hindi warning segments | Playback confirmed complete and understandable |

Live transcription and TTS checks are separate from mocked automated tests. The WebSocket detection integration has not yet been evaluated against a real labelled scam conversation.

### 5. Warning and known issues

The test suite reports one non-failing Starlette deprecation warning related to using `httpx` with `starlette.testclient`. This warning does not cause the current test suite to fail. Dependency compatibility remains under investigation.

Earlier WebSocket disconnect-test attempts produced intermittent failures. The final reported complete suite passed, but the underlying cause of those earlier failures should not be considered resolved solely from the final passing run.

### 6. Testing limitations

The current tests do not establish:
- Hindi/Hinglish transcription accuracy across a representative dataset.
- Robustness against noisy or telephony-compressed audio.
- Scam-detection precision, recall, false-positive rate or false-negative rate.
- Conversation-level contextual understanding.
- Automatic warning latency or warning effectiveness.
- Trusted-family notification correctness.
- Production-scale concurrency or performance.

The pilot evaluation dataset remains empty. No benchmark metrics have been calculated.

### 7. Overall milestone conclusion

Stage 2 WebSocket detection integration is implemented and automated-test verified.

The backend can now attach an independent structured detection result to each WebSocket transcript event.

Cumulative conversation-level detection, contextual reasoning, calibrated risk scoring, automatic TTS warning delivery and evaluation against labelled conversations remain pending.


---

## Test Report — Stage 3 Conversation-level Evidence Aggregation

**Date:** 2026-11-10

**Milestone:** Stage 3

### Environment

- Operating system: Windows
- Python: 3.11.9
- pytest: 8.4.2

### New tests

`backend/tests/test_conversation_detection.py`:

- `test_accumulator_collects_evidence_across_segments`
- `test_accumulator_preserves_evidence_from_repeated_segments`
- `test_accumulator_keeps_harmless_segments_without_evidence`
- `test_accumulators_are_isolated_between_sessions`

`backend/tests/test_streaming.py`:

- `test_websocket_includes_cumulative_conversation_detection`

### Full suite results

| Metric | Result |
|---|---:|
| Passed | 77 |
| Failed | 0 |
| Warnings | 1 |
| Duration | 10.03 seconds |

Compilation using `python -m compileall -q backend\app backend\tests` completed successfully.

### Limitations

These tests verify implementation behaviour, not real-world scam-detection accuracy.

They do not establish contextual understanding, calibrated risk probabilities, precision, recall, false-positive rate or false-negative rate.

The cumulative accumulator is in-memory and connection-scoped. It does not persist data across reconnects.


---

## Test Report - Stage 4.1 Explainable Warning Policy

**Date:** 2026-11-10

### Environment

- Operating system: Windows
- Python: 3.11.9
- pytest: 8.4.2
- Virtual environment: `backend/.venv`

### New test file

`backend/tests/test_warning_policy.py`

11 tests cover:
1. Empty evidence.
2. Single threat.
3. Financial extraction alone.
4. Two non-financial stages.
5. Financial extraction plus threat.
6. Three distinct stages.
7. Consent disabled.
8. Consent enabled.
9. Repeat-warning suppression.
10. Unique matched rule collection.
11. Advisory without spoken warning.

Tests use the actual local phrase-based detection engine to construct their input evidence.

### Results

| Metric | Result |
|---|---:|
| Warning policy tests | 11 passed |
| Complete backend suite | 88 passed |
| Failed tests | 0 |
| Non-failing warnings | 1 |

The complete backend suite passed twice consecutively, with observed runtimes of 9.39 and 9.57 seconds.

The targeted warning-policy suite passed in 0.27 seconds.

Python compilation completed successfully.

`git diff --check` completed without errors.

### Warning

One non-failing Starlette deprecation warning concerns using `httpx` with `starlette.testclient`. It does not currently cause test failures.

### Limitations

These tests establish deterministic policy behaviour for the tested evidence combinations. They do not establish real-world scam-detection accuracy or validate the policy thresholds against a labelled dataset.

Automatic WebSocket warning orchestration, session-state management and Gnani Timbre audio delivery are not yet implemented.


---

## Test Report — Stage 4.2 Session-scoped Warning Consent Protocol

**Date:** 2026-11-10

### Environment

- Operating system: Windows
- Python: 3.11.9
- pytest: 8.4.2
- Virtual environment: `backend/.venv`

### New and updated tests

File: `backend/tests/test_streaming.py`

Consent-related coverage:

| Test case | Expected behaviour | Result |
|---|---|---|
| Grant and revoke consent | Both valid Boolean values update session state and receive acknowledgements | PASS |
| String `"true"` | Rejected; consent remains disabled | PASS |
| Integer `1` | Rejected; consent remains disabled | PASS |
| Integer `0` | Rejected; consent remains disabled | PASS |
| `null` | Rejected; consent remains disabled | PASS |
| Missing `granted` field | Rejected; consent remains disabled | PASS |
| Reconnect | New connection starts with consent disabled | PASS |

The existing ready-event test also verifies that the initial consent state is disabled and its scope is `session`.

### Targeted WebSocket test results

| Metric | Result |
|---|---:|
| Passed | 22 |
| Failed | 0 |
| Warnings | 1 |
| Duration | 9.57 seconds |

### Complete backend test results

| Test group | Passed |
|---|---:|
| Health endpoint | 1 |
| REST transcription | 10 |
| WebSocket streaming, lifecycle, detection and consent | 22 |
| TTS | 8 |
| Detection schemas | 8 |
| Detection engine | 31 |
| Conversation detection | 4 |
| Warning policy | 11 |
| **Total** | **95** |

Result: **95 passed, 0 failed, 1 non-failing warning.**

Complete suite duration: 10.29 seconds.

### Additional verification

- `python -m compileall -q backend\app backend\tests`: passed.
- `git diff --check`: passed.
- Git displayed an informational LF-to-CRLF line-ending notice for `backend/tests/test_streaming.py`.

### Warning

One non-failing Starlette deprecation warning concerns using `httpx` with `starlette.testclient`. It does not currently cause test failures.

### Limitations

These tests verify backend WebSocket consent protocol behaviour. They do not verify a frontend consent interface or end-to-end user interaction.

The consent state is not yet connected to warning-policy evaluation, automatic TTS triggering or audio playback.

The consent flag applies only to automatic spoken safety warnings. It does not establish consent for audio capture, transcription or analysis.

No real-world scam-detection accuracy or warning effectiveness is established by these tests.
