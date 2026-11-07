
# Kavach — Test Report

## Environment

- Operating system: Windows
- Python: 3.11.9
- Pytest: 8.4.2
- Backend: FastAPI
- STT provider: Gnani Prisma v2.5

## Automated test run

Latest recorded run: 9 tests passed, 0 failed.

| ID | Test | Expected result | Actual result | Status |
|---|---|---|---|---|
| SETUP-001 | GET /health | HTTP 200 and status ok | HTTP 200, status ok | PASS |
| STT-001 | Successful transcription | Transcript returned | Mocked provider response returned | PASS |
| STT-002 | Unsupported extension | HTTP 415 | HTTP 415 | PASS |
| STT-003 | Missing API key | HTTP 503 | HTTP 503 | PASS |
| STT-004 | Empty audio | HTTP 400 | HTTP 400 | PASS |
| STT-005 | Audio larger than 10 MB | HTTP 413 | HTTP 413 | PASS |
| STT-006 | Gnani timeout | HTTP 504 | HTTP 504 | PASS |
| STT-007 | Gnani HTTP error | HTTP 502 | HTTP 502 | PASS |
| STT-008 | Invalid Gnani JSON | HTTP 502 | HTTP 502 | PASS |

## Live API integration verification

A real audio recording was submitted through the local Kavach backend.

| Check | Actual result |
|---|---|
| Backend endpoint | POST /transcribe |
| Provider | Gnani Prisma v2.5 |
| HTTP status | 200 OK |
| Language configured | hi-IN |
| Transcription | Hindi transcript returned |
| Provider request ID | Returned |
| End-to-end latency | Approximately 0.228 seconds for this request |
| Result | PASS |

The live API test was performed separately from the automated test suite.

## Warnings

One Starlette deprecation warning was reported:

Using httpx with starlette.testclient is deprecated; the installed dependency combination requires investigation.

This warning did not cause test failures.

## Important test limitations

- Automated provider responses are mocked.
- Only the separately documented live request establishes real API connectivity.
- No systematic Hindi/Hinglish accuracy benchmark has been performed.
- No noisy or compressed audio benchmark has been completed.
- No real-time WebSocket test has been completed.
- No scam-versus-legitimate classification test has been completed.
- No family notification or TTS test has been completed.

## Next tests

- Validate malformed audio content.
- Test connection failures.
- Test actual provider error response variations.
- Verify supported audio formats against the live API.
- Verify real-time WebSocket transcription.
- Test Hindi and Hinglish under clean, noisy and compressed conditions.
- Measure warning latency and false-positive rates.
