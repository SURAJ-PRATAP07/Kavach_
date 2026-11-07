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

**18 passed, 0 failed, 1 warning.**

| Test group | Tests | Result |
|---|---:|---|
| Health and REST transcription | 9 | PASS |
| WebSocket streaming and lifecycle | 9 | PASS |
| **Total** | **18** | **PASS** |

Command:

```powershell
python -m pytest backend/tests -q
```

Actual output:

```
.................. [100%]

18 passed, 1 warning in 2.07s
```

The warning is a Starlette deprecation warning concerning the
`httpx` TestClient integration. It did not cause test failures.

The warning remains under investigation. No dependency changes have been made solely to suppress it.

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

The eleven detailed assertions above are covered across nine WebSocket test functions in `backend/tests/test_streaming.py`.

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

**WebSocket verification status:** Automated mocked tests PASS. Live Gnani WebSocket integration remains NOT TESTED.

---

## 6. Warnings

One Starlette deprecation warning was reported:

```text
StarletteDeprecationWarning:
Using `httpx` with `starlette.testclient` is deprecated;
install `httpx2` instead.
```

This warning did not cause test failures.

The installed dependency combination requires further compatibility investigation before changing packages.

---

## 7. Important test limitations

- Automated REST provider responses are mocked.
- Only the separately documented live REST request establishes actual REST API connectivity.
- WebSocket tests use a mocked Gnani SDK client.
- No live WebSocket transcription test has been completed.
- No systematic Hindi or Hinglish recognition accuracy benchmark has been performed.
- No noisy or compressed audio benchmark has been completed.
- No scam-versus-legitimate classification test has been completed.
- No false-positive or false-negative evaluation has been completed.
- No family notification test has been completed.
- No Gnani Timbre TTS test has been completed.
- No production load or concurrency test has been completed.

---

## 8. Pending tests

### Backend and audio validation

- Validate malformed audio content.
- Test unsupported or corrupted audio payloads.
- Test REST connection failures.
- Test actual provider error response variations.
- Verify supported audio formats against the live API.
- Test upload limits at the deployment or reverse-proxy layer.

### WebSocket streaming

- Verify live Gnani Prisma WebSocket authentication and connection.
- Verify live partial and final transcript events.
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

- Verify Gnani Timbre speech generation.
- Test warning delivery and cooldown behaviour.
- Test trusted-family notification consent.
- Test incident summary generation.
- Test end-to-end frontend and backend integration.

---

## 9. Overall test assessment

| Component | Current assessment |
|---|---|
| FastAPI health endpoint | Automated tests PASS |
| Gnani Prisma REST integration | Live integration PASS |
| REST automated tests | 9 PASS |
| WebSocket endpoint | Implemented |
| WebSocket mocked tests | 9 PASS |
| Complete backend automated tests | 18 PASS, 1 warning |
| Live WebSocket integration | NOT TESTED |
| Scam detection | Not implemented |
| Risk scoring | Not implemented |
| Gnani Timbre TTS | Not implemented |
| Trusted-family notifications | Not implemented |
| Frontend | Not implemented |
| Kavach-Bench | Not implemented |

**Conclusion:** The current backend has 18 passing automated tests and one separately verified live Gnani Prisma REST integration. WebSocket streaming and its tested failure-handling paths have passed mocked automated tests. Live WebSocket integration remains pending. No scam-detection accuracy or production-readiness claims can yet be made.