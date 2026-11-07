# PROJECT_STATE.md

## Current milestone
Milestone 0 — repository and environment scaffold.

## Status
- [x] Project structure defined.
- [x] Initial documentation scaffold created.
- [ ] GitHub repository created and verified.
- [ ] Local Python environment installed and verified.
- [ ] Gnani Prisma API access verified.
- [ ] Gnani Timbre API access and actual model identifier verified.

## Architecture decisions
- Backend: Python + FastAPI.
- Frontend: React + TypeScript (to be added after backend API spike).
- Realtime transport: WebSocket, subject to verified Gnani API contract.
- Detection: deterministic, evidence-backed rules first; contextual model optional.
- Secrets: backend environment only; never commit `.env`.

## Known limitations
- No Gnani API integration exists yet.
- No audio capture, scam detection, TTS, family notifications, or benchmark is implemented yet.
- Model versions, endpoint URLs, headers, audio format and payload schema must be verified against the user's current Gnani access/docs before coding.

## Next step
Create the public GitHub repository, initialise Git, install dependencies, run `/health` and `pytest`, then perform the Prisma connectivity spike.


## Verified Progress

- FastAPI backend environment created and activated.
- Health endpoint tested successfully.
- Pytest executed successfully: 1 passed, 0 failed.
- Starlette/httpx deprecation warning noted for investigation.

## Pending

- Confirm GitHub repository creation and initial push.
- Verify Gnani API credentials and official API contracts.
- Implement and test Prisma transcription integration.