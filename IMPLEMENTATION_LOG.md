# Kavach — Implementation Log

## Milestone 0 — Project scaffold

- Created the Kavach GitHub repository.
- Established the initial backend project structure.
- Created a Python virtual environment.
- Added a FastAPI application.
- Implemented the `GET /health` endpoint.
- Added the initial automated health test.
- Created environment-variable templates and Git ignore rules.
- Added project documentation files.

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

Latest recorded result: **9 passed, 0 failed**.

## Known limitations

- The upload limit is enforced inside the endpoint; an additional request-body limit is needed at the deployment or reverse-proxy layer.
- File extension validation does not prove that uploaded bytes contain valid audio.
- The automated provider tests use mocked responses.
- A Starlette deprecation warning concerning the installed httpx TestClient integration remains under investigation.
- Real-time streaming, scam detection, risk scoring, TTS and frontend functionality have not yet been implemented.

## Next implementation milestone

Complete backend security and API contract review, reconcile documentation, inspect the repository changes and push the verified milestone to GitHub.