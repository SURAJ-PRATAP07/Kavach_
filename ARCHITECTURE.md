# ARCHITECTURE.md

## Initial target architecture

Browser microphone (explicit consent)
  -> backend audio gateway
  -> Gnani Prisma streaming STT (only after API contract verification)
  -> timestamped transcript segments
  -> deterministic scam-stage/risk engine
  -> warning policy
  -> Gnani Timbre TTS (only after API contract verification)
  -> browser playback

Optional later components:
- Evon or another disclosed contextual reasoning model.
- Consent-based trusted-contact notifications.
- Incident summary export.
- Kavach-Bench synthetic evaluation suite.

## Important boundaries
- The initial demo uses consented speakerphone/room audio; it does not intercept native cellular calls.
- Keep API credentials on the backend.
- Preserve evidence provenance: every red flag must map to an actual transcript excerpt and timestamp.
- A risk score is an assistance signal, not a legal finding.
