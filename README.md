# Kavach

A multilingual voice safety companion prototype for detecting coercive scam patterns in consented audio.

## Status
Initial project scaffold only. Gnani Prisma/Timbre integrations are not yet implemented or verified.

## Prerequisites
- Python 3.11+
- Node.js 22 LTS (frontend setup will be added in a later milestone)
- Git and GitHub CLI (`gh`)
- Gnani API credentials (keep them server-side; never commit them)

## Backend setup (Windows PowerShell)

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/health and http://127.0.0.1:8000/docs.

## Tests

```powershell
pytest
```

## Safety and privacy
- Analyse audio only with appropriate user consent.
- Do not expose API keys in browser code.
- Do not treat model output as a legal determination.
- This prototype is not native cellular-call interception and is not a guarantee against fraud.
