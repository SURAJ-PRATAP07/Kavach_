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

Latest complete backend test run:

**27 passed, 0 failed, 1 warning.**

| Test group | Tests | Result |
|---|---:|---|
| Health and REST transcription | 9 | PASS |
| WebSocket streaming and lifecycle | 10 | PASS |
| TTS service and endpoint | 8 | PASS |
| **Total** | **27** | **PASS** |

Command:

```powershell
python -m pytest backend/tests -q
```

Previous verification run output:

```
.................. [100%]

18 passed, 1 warning in 2.07s
```

The warning is a Starlette deprecation warning concerning the
`httpx` TestClient integration. It did not cause test failures.

The warning remains under investigation. No dependency changes have been made solely to suppress it.

### Latest verification — Browser-disconnect cleanup

Commands executed:

```powershell
python -m py_compile backend\app\streaming.py backend\tests\test_streaming.py
python -m pytest backend/tests -q
git diff --check
```

Actual result:

```
27 passed, 1 warning in 2.90s
```

`git diff --check` completed without reporting whitespace errors.

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
| REST-009 | Health endpoint | Healthy response returned | PASS |

---

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

## 9. Warnings

One Starlette deprecation warning was reported:

```text
StarletteDeprecationWarning:
Using `httpx` with `starlette.testclient` is deprecated;
install `httpx2` instead.
```

This warning did not cause test failures.

The installed dependency combination requires further compatibility investigation before changing packages.

---

## 10. Important test limitations

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

## 11. Pending tests

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

## 12. Overall test assessment

| Component | Current assessment |
|---|---|
| FastAPI health endpoint | Automated tests PASS |
| Gnani Prisma REST integration | Live integration PASS |
| REST automated tests | 9 PASS |
| WebSocket endpoint | Implemented and live integration verified |
| WebSocket mocked tests | 10 PASS |
| TTS service and endpoint tests | 8 PASS |
| Complete backend automated tests | 27 PASS, 1 warning |
| Live WebSocket integration | One Hindi recording successfully transcribed |
| Scam detection | Not implemented |
| Risk scoring | Not implemented |
| Gnani Timbre standalone TTS service | Implemented and mock-tested |
| `POST /synthesize-warning` | Live endpoint verified; playback confirmed for two segments |
| Trusted-family notifications | Not implemented |
| Frontend | Not implemented |
| Kavach-Bench | Not implemented |

**Conclusion:** The backend has 27 passing automated tests and one non-failing deprecation warning. Gnani Prisma REST integration has been live verified, and live Prisma WebSocket streaming has been verified with one Hindi recording. Gnani Timbre TTS has eight passing mocked automated tests and a separately verified live endpoint playback using two warning segments. The TTS endpoint remains standalone and is not yet integrated with scam detection or WebSocket transcription. These results establish basic integration and tested backend behaviour, not transcription accuracy, scam-detection accuracy, broad TTS quality, or production readiness.