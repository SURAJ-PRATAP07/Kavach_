# Kavach — Troubleshooting Guide

This document records known setup and integration issues and their verified or recommended solutions.

## 1. PowerShell virtual environment activation blocked

**Symptom:** PowerShell refuses to execute `Activate.ps1`.

**Solution:** Allow script execution for the current terminal session only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

.\.venv\Scripts\Activate.ps1
```

This does not permanently change the machine-wide execution policy.

## 2. Incorrect virtual environment activation command

**Incorrect command:**

```powershell
python venv .venv
```

This attempts to execute a Python file named `venv`.

**Correct activation command from the backend directory:**

```powershell
.\.venv\Scripts\Activate.ps1
```

If the environment does not exist, create it first:

```powershell
py -3.11 -m venv .venv
```

## 3. Python version mismatch

Check the active Python version:

```powershell
python --version
```

The current project environment was configured with Python 3.11.9.

If necessary, recreate the environment:

```powershell
py -3.11 -m venv .venv

.\.venv\Scripts\Activate.ps1

python -m pip install -r requirements.txt
```

Do not delete an existing environment until its contents and project requirements have been checked.

## 4. Missing Gnani API key

**Possible symptom:** Gnani returns an authentication error, or Kavach reports that transcription is not configured.

Check that the local file exists:

```powershell
Test-Path .env
```

Check the environment variable without printing its value:

```powershell
if ($env:GNANI_API_KEY) {
    Write-Host "GNANI_API_KEY is loaded."
} else {
    Write-Host "GNANI_API_KEY is not loaded in this terminal."
}
```

The application loads configuration from `backend/.env` through Pydantic Settings.

Never paste the API key into chat, screenshots or GitHub.

## 5. Gnani authentication error

Verify:

- The API key is valid.
- The correct key type is being used.
- The authentication header matches the official API contract.
- The account has access to the requested service.

The current integration uses the `X-API-Key-ID` header.

Do not expose authentication values while debugging.

## 6. Audio upload rejected

The current endpoint accepts these filename extensions:

- `.wav`
- `.mp3`
- `.ogg`
- `.flac`
- `.aac`
- `.m4a`

The application-level size limit is 10 MB.

Check the actual file:

```powershell
Get-Item .\test_audio.wav |
    Select-Object Name, Length
```

A supported extension does not prove that the underlying file contains valid audio.

## 7. Audio conversion problems

If FFmpeg is installed, inspect the recording:

```powershell
ffprobe .\test_audio.mp4
```

A WAV conversion to mono, 16-bit PCM and 16 kHz can be performed with:

```powershell
ffmpeg -i .\test_audio.mp4 -ac 1 -ar 16000 -c:a pcm_s16le .\test_audio.wav
```

Verify the resulting file before submitting it.

Do not assume every audio format or sample rate is accepted by every Gnani endpoint. Check the current API contract.

## 8. Gnani request timeout

**Possible symptom:** Kavach returns HTTP 504.

Investigate:

- Network connectivity.
- Provider service availability.
- Audio file duration and size.
- Provider latency.
- Current configured timeout.

Do not repeatedly retry indefinitely. If retries are introduced, use a bounded retry policy and avoid duplicating unnecessary requests.

## 9. Gnani HTTP or connection errors

The current backend maps upstream HTTP and connection failures to HTTP 502.

Investigate:

- Endpoint URL.
- Authentication configuration.
- Provider status.
- Request format.
- Network restrictions.

The backend intentionally avoids returning sensitive upstream response details to the client.

For diagnosis, use safe server-side logging without API keys or sensitive audio/transcript contents.

## 10. Invalid provider response

The current endpoint expects a JSON object containing:

- `success`
- `transcript`

It also returns available metadata such as model, request ID and latency.

If the response format changes, verify the official provider documentation and update the response validation and tests.

## 11. Pytest deprecation warning

**Observed warning:**

Starlette reports that using httpx with its TestClient integration is deprecated and suggests investigating `httpx2`.

The warning did not cause the latest recorded nine tests to fail.

Do not change dependencies blindly.

Before changing the testing stack:

1. Inspect installed FastAPI, Starlette and HTTPX versions.
2. Review their compatibility requirements.
3. Check the relevant official release notes.
4. Make a controlled dependency change.
5. Rerun the complete test suite.

## 12. Uvicorn server already running

If port 8000 is occupied, check which process is using it:

```powershell
netstat -ano | findstr :8000
```

Stop only the process you have identified as the Kavach development server.

Alternatively, run the development server on another port:

```powershell
uvicorn app.main:app --reload --port 8001
```

## 13. Git accidentally stages sensitive files

Before committing, inspect:

```powershell
git status --short
```

Check whether environment and audio files are ignored:

```powershell
git check-ignore .env test_audio.wav
```

Never commit:

- `.env`
- API credentials
- Private audio recordings
- Virtual environments
- Other sensitive user data

If a secret is accidentally pushed, revoke or rotate it immediately. Removing it in a later commit does not make the exposed secret safe.

## 14. General debugging procedure

For every new issue:

1. Reproduce the error.
2. Capture the complete error message without exposing secrets.
3. Identify the failing layer.
4. Inspect the relevant code and dependency versions.
5. Verify the expected API contract.
6. Apply the smallest justified fix.
7. Add or update a regression test.
8. Run the complete test suite.
9. Update this guide if the issue is likely to recur.

Never mark a fix as verified without observing the actual result.