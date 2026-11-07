# Kavach — System Architecture

## 1. Project overview

Kavach is a consent-based, multilingual voice safety companion designed to identify coercive digital-arrest scams and related financial fraud patterns.

The system is intended to analyse speech, identify suspicious conversational patterns, explain its risk assessment and provide timely safety warnings.

The architecture is being implemented incrementally. The components described as planned below must not be treated as completed functionality.

## 2. Current implementation

The currently implemented backend flow is:

```text
User uploads an audio file
          |
          v
FastAPI POST /transcribe
          |
          v
Upload validation
          |
          v
Gnani Prisma v2.5 REST API
          |
          v
Hindi transcription
          |
          v
JSON response to client
```

### Implemented components

| Component | Technology | Status |
|---|---|---|
| Backend API | FastAPI | Implemented |
| Configuration | Pydantic Settings | Implemented |
| HTTP communication | HTTPX | Implemented |
| Speech-to-text | Gnani Prisma v2.5 REST | Live integration verified |
| Audio upload | FastAPI multipart upload | Implemented |
| Automated tests | Pytest | 9 tests passing in latest recorded run |

## 3. Target architecture

```text
       CONSENTED AUDIO INPUT
                 |
                 v
       AUDIO CAPTURE / UPLOAD
                 |
                 v
          KAVACH BACKEND
                 |
                 v
       GNANI PRISMA SPEECH-TO-TEXT
                 |
                 v
       TRANSCRIPT + TIMESTAMPS
                 |
                 v
       SCAM-STAGE DETECTION
                 |
          +------+------+
          |             |
          v             v
     RULE ENGINE   CONTEXTUAL ANALYSIS
          |             |
          +------+------+
                 |
                 v
        EXPLAINABLE RISK ENGINE
                 |
                 v
          WARNING POLICY
                 |
          +------+------+
          |             |
          v             v
     GNANI TIMBRE   FAMILY NOTIFICATION
          |             |
          +------+------+
                 |
                 v
         INCIDENT SUMMARY
```

This is the intended architecture, not a representation of the current implementation.

## 4. Backend architecture

The backend is responsible for:

- Receiving audio uploads.
- Validating input and configuration.
- Communicating securely with Gnani services.
- Processing transcription responses.
- Running detection and risk-assessment components when implemented.
- Applying warning and notification policies.
- Exposing API endpoints to the frontend.

The backend must remain the trusted boundary for API credentials and sensitive processing.

## 5. Speech transcription — Gnani Prisma

### Current integration

- Provider: Gnani AI.
- Model: Prisma v2.5.
- Integration type: REST.
- Endpoint: `https://api.vachana.ai/stt/v3`
- Initial language configuration: `hi-IN`.

The current endpoint accepts an uploaded audio file and returns the transcription and available provider metadata.

### Planned real-time integration

The next speech milestone is to investigate and implement the documented Prisma WebSocket streaming interface.

The implementation must verify:

- Authentication headers.
- Supported model identifiers.
- Audio encoding and sample rate.
- Frame size and message format.
- Partial and final transcription events.
- Error messages and connection closure.
- Reconnection and recovery behaviour.

Do not assume that the REST and WebSocket APIs use identical request formats.

## 6. Scam-stage detection

The planned detection engine will identify four major conversational patterns:

1. **Impersonation:** Someone claims to represent police, government agencies, courts or another authority.
2. **Threats and fear:** The caller uses arrest threats, legal consequences or intimidation.
3. **Isolation:** The caller instructs the victim not to speak with family, friends or other trusted people.
4. **Financial extraction:** The caller requests money transfers, payments, OTPs, banking credentials or other sensitive financial information.

The detection system will combine:

- Fast, deterministic rule-based triggers.
- Contextual analysis for interpreting conversational meaning.
- Evidence-backed stage classification.
- A risk engine that considers the combination and progression of suspicious signals.

A single keyword must not automatically establish that a call is fraudulent. Legitimate conversations can contain words associated with scams.

## 7. Explainable risk engine

Every detected risk signal should retain:

- Detection category.
- Supporting transcript excerpt.
- Timestamp or available timing reference.
- Detection method.
- Confidence or severity information, where supported.

Risk thresholds must be calibrated using a validation dataset.

The system must distinguish between:

- No detected warning signals.
- Suspicious conversational behaviour.
- High-risk coercive behaviour.
- Explicit financial or credential extraction attempts.

The score is an assistance signal, not a legal finding or a guarantee of fraud.

## 8. Warning and speech generation

Gnani Timbre is planned for generating spoken safety warnings.

The warning policy should:

- Prioritise clear and actionable guidance.
- Avoid repeatedly interrupting the conversation.
- Apply warning cooldowns.
- Avoid generating unsupported accusations.
- Support Hindi and other verified languages.

TTS integration must be tested against the actual account's available model, voice and response format.

The audio pipeline must also prevent Kavach's own generated speech from being incorrectly treated as caller speech.

## 9. Trusted-family notifications

Notifications will be optional and consent-based.

Planned safeguards:

- Explicit user consent.
- Verified trusted-contact registration.
- Minimal information sharing.
- No default sharing of complete audio recordings.
- Clear indication that a notification is an automated safety alert.

The notification system must not contact arbitrary numbers or share sensitive information without authorisation.

## 10. Incident summaries

Kavach will generate a structured incident summary containing, where available:

- Incident date and time.
- Detected scam stages.
- Relevant transcript excerpts.
- Supporting timestamps.
- Requested financial or credential actions.
- Warnings issued.
- User-provided incident notes.

The document will be an assistance tool for reporting, not an official police record or independently authenticated evidence.

## 11. Kavach-Bench

The planned benchmark will evaluate detection under:

- Clean audio.
- Telephony-style compressed audio.
- Noisy audio.

Evaluation metrics will include:

- Precision.
- Recall.
- False-positive rate.
- False-negative rate.
- Stage-level F1 score.
- Time-to-warning.
- p50 and p95 processing latency.

Synthetic test data must be clearly labelled. Synthetic results alone cannot establish real-world detection accuracy.

## 12. Security and privacy

- Keep Gnani API keys on the backend.
- Never commit `.env`.
- Obtain consent before analysing audio.
- Minimise sensitive data retention.
- Validate uploaded files and enforce request-size limits.
- Avoid logging API keys, complete transcripts or sensitive personal information.
- Secure all trusted-contact and notification workflows.
- Apply appropriate access controls before deployment.

## 13. Platform limitations

The initial prototype analyses uploaded recordings or consented speakerphone/room audio.

It does not directly intercept native cellular-call audio.

Browser microphone access and native mobile call recording are different capabilities and must not be presented as equivalent.

## 14. Architectural implementation policy

Implement the architecture incrementally.

Before adding a new component:

1. Verify its official API contract.
2. Confirm account and model access.
3. Define request and response schemas.
4. Implement error handling.
5. Add automated tests.
6. Test actual integration where credentials and access permit.
7. Update project documentation.

Optional models or fallback services must be disclosed accurately.