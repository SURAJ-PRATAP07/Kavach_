import asyncio
import json
import threading

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
import app.streaming as streaming

from starlette.websockets import WebSocketDisconnect


class StreamTranscriptEvent:
    """Small stand-in for a Gnani transcript event."""

    def __init__(
        self,
        text,
        segment_id="test-segment",
        segment_index=0,
        timestamp=None,
        audio_duration_ms=1000,
        detected_language_code="hi-IN",
    ):
        self.text = text
        self.segment_id = segment_id
        self.segment_index = segment_index
        self.audio_duration_ms = audio_duration_ms
        self.latency = 0.2
        self.timestamp = timestamp
        self.detected_language_code = detected_language_code


class StreamErrorEvent:
    """Stand-in for a Gnani streaming error event."""

    def __init__(self, message):
        self.message = message


class FakeGnaniStreamClient:
    """Mock provider that simulates the Gnani streaming interface."""

    instances = []

    provider_error_on_connect = False
    end_events_on_connect = False
    connect_failure = False
    constructor_failure = False
    provider_error_after_silence_frames = None
    end_events_after_silence_frames = None

    async def connect(self):
        if self.__class__.connect_failure:
            raise RuntimeError("Simulated Gnani connection failure")

        if self.__class__.provider_error_on_connect:
            await self.event_queue.put(
                StreamErrorEvent("Simulated provider error")
            )

        if self.__class__.end_events_on_connect:
            await self.event_queue.put(None)

    async def send_audio(self, chunk):
        self.audio_chunks.append(chunk)

        if chunk == bytes(streaming.FRAME_BYTES):
            self.silence_count += 1

            if (
                self.__class__.provider_error_after_silence_frames
                == self.silence_count
            ):
                await self.event_queue.put(
                    StreamErrorEvent("Simulated error during Stop")
                )

            if (
                self.__class__.end_events_after_silence_frames
                == self.silence_count
            ):
                await self.event_queue.put(None)

            if self.silence_count == streaming.SILENCE_FRAMES_ON_STOP:
                transcript_events = getattr(
                    self.__class__,
                    "transcript_events",
                    None,
                )
                if transcript_events is None:
                    transcript_events = [
                        StreamTranscriptEvent("Namaste, yeh ek test hai.")
                    ]
                for transcript_event in transcript_events:
                    await self.event_queue.put(transcript_event)

    async def events(self):
        while True:
            event = await self.event_queue.get()

            if event is None:
                return

            yield event

    def __init__(self, **kwargs):
        if self.__class__.constructor_failure:
            raise RuntimeError("Simulated SDK constructor failure")

        self.kwargs = kwargs
        self.audio_chunks = []
        self.silence_count = 0
        self.event_queue = asyncio.Queue()
        self.closed = False
        self.cleanup_event = threading.Event()
        self.instances.append(self)

    async def close(self):
        self.closed = True
        self.cleanup_event.set()
        await self.event_queue.put(None)


@pytest.fixture
def configured_client(monkeypatch):
    """Provide a test API key and replace the real Gnani SDK."""

    FakeGnaniStreamClient.instances.clear()
    FakeGnaniStreamClient.provider_error_on_connect = False
    FakeGnaniStreamClient.end_events_on_connect = False
    FakeGnaniStreamClient.connect_failure = False
    FakeGnaniStreamClient.constructor_failure = False
    FakeGnaniStreamClient.provider_error_after_silence_frames = None
    FakeGnaniStreamClient.end_events_after_silence_frames = None
    FakeGnaniStreamClient.transcript_events = None

    settings = Settings(
        gnani_api_key="test-api-key",
        gnani_stt_language="hi-IN",
    )

    app.dependency_overrides[get_settings] = lambda: settings
    monkeypatch.setattr(
        streaming,
        "GnaniSTTStreamClient",
        FakeGnaniStreamClient,
    )

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.pop(get_settings, None)


def receive_streaming_transcripts(configured_client):
    """Run a streaming session and collect transcript messages."""
    with configured_client.websocket_connect(
        "/ws/transcribe"
    ) as websocket:
        ready = websocket.receive_json()
        assert ready["type"] == "ready"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        received_messages = []
        while True:
            message = websocket.receive_json()
            received_messages.append(message)
            if message["type"] == "stopped":
                break

    return [
        message
        for message in received_messages
        if message["type"] == "transcript"
    ]


def test_websocket_stream_and_stop(configured_client):
    """Test connection, audio forwarding and final transcript."""

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        ready = websocket.receive_json()

        assert ready["type"] == "ready"
        assert ready["sample_rate"] == 16000
        assert ready["frame_bytes"] == 1024
        assert ready["encoding"] == "pcm_s16le"
        assert ready["warning_consent_enabled"] is False
        assert ready["warning_consent_scope"] == "session"

        audio_frame = b"\x01" * 1024
        websocket.send_bytes(audio_frame)

        websocket.send_text(json.dumps({"type": "stop"}))

        received_messages = []

        while True:
            message = websocket.receive_json()
            received_messages.append(message)

            if message["type"] == "stopped":
                break

        transcript_messages = [
            message
            for message in received_messages
            if message["type"] == "transcript"
        ]

        assert len(transcript_messages) == 1
        assert transcript_messages[0]["text"] == (
            "Namaste, yeh ek test hai."
        )

        stopped = received_messages[-1]
        assert stopped["type"] == "stopped"
        assert stopped["transcript_received_after_stop_command"] is True

        websocket.close()

    fake_client = FakeGnaniStreamClient.instances[-1]

    assert fake_client.audio_chunks[0] == audio_frame
    assert fake_client.silence_count == 32
    assert len(fake_client.audio_chunks) == 33
    assert fake_client.closed is True


def test_websocket_detects_arrest_threat(
    configured_client,
):
    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("You will be arrested.")
    ]
    transcripts = receive_streaming_transcripts(configured_client)
    assert len(transcripts) == 1
    detection = transcripts[0]["detection"]
    threat_assessment = next(
        assessment
        for assessment in detection["stage_assessments"]
        if assessment["stage"] == "threats"
    )
    assert len(threat_assessment["evidence"]) == 1
    evidence = threat_assessment["evidence"][0]
    assert evidence["rule_id"] == "THREAT_ARREST"
    assert evidence["matched_text"] == "You will be arrested"
    assert evidence["source"] == "streaming"


def test_websocket_harmless_transcript_has_no_evidence(
    configured_client,
):
    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Namaste, yeh ek test hai.")
    ]
    transcripts = receive_streaming_transcripts(configured_client)
    assert len(transcripts) == 1
    detection = transcripts[0]["detection"]
    assert detection["segments_analyzed"] == 1
    assert all(
        not assessment["evidence"]
        for assessment in detection["stage_assessments"]
    )


def test_websocket_detection_preserves_metadata(
    configured_client,
):
    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent(
            text="You will be arrested.",
            segment_id="metadata-test-1",
            segment_index=7,
            timestamp=12.5,
            audio_duration_ms=1500,
            detected_language_code="en-IN",
        )
    ]
    transcripts = receive_streaming_transcripts(configured_client)
    assert len(transcripts) == 1
    transcript = transcripts[0]
    detection = transcript["detection"]
    threat_assessment = next(
        assessment
        for assessment in detection["stage_assessments"]
        if assessment["stage"] == "threats"
    )
    evidence = threat_assessment["evidence"][0]
    assert transcript["segment_id"] == "metadata-test-1"
    assert transcript["segment_index"] == 7
    assert transcript["timestamp"] == 12.5
    assert transcript["detected_language_code"] == "en-IN"
    assert evidence["segment_id"] == "metadata-test-1"
    assert evidence["segment_index"] == 7


def test_websocket_multiple_transcripts_have_independent_detection(
    configured_client,
):
    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent(
            text="You will be arrested.",
            segment_id="segment-1",
            segment_index=0,
        ),
        StreamTranscriptEvent(
            text="Namaste, yeh ek test hai.",
            segment_id="segment-2",
            segment_index=1,
        ),
    ]
    transcripts = receive_streaming_transcripts(configured_client)
    assert len(transcripts) == 2
    first_detection = transcripts[0]["detection"]
    second_detection = transcripts[1]["detection"]
    first_threat = next(
        assessment
        for assessment in first_detection["stage_assessments"]
        if assessment["stage"] == "threats"
    )
    second_threat = next(
        assessment
        for assessment in second_detection["stage_assessments"]
        if assessment["stage"] == "threats"
    )
    assert len(first_threat["evidence"]) == 1
    assert len(second_threat["evidence"]) == 0


def test_websocket_closes_provider_when_browser_disconnects(
    configured_client,
):
    """Provider resources must be released when the browser disconnects."""

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        ready = websocket.receive_json()

        assert ready["type"] == "ready"

        fake_client = FakeGnaniStreamClient.instances[-1]
        assert fake_client.closed is False

        # Simulate the browser closing its WebSocket connection.
        websocket.close()

    # Wait for the server's asynchronous cleanup to finish.
    assert fake_client.cleanup_event.wait(timeout=2.0), (
        "The Gnani provider session was not closed after browser disconnect."
    )

    assert fake_client.closed is True

def test_websocket_rejects_missing_api_key(monkeypatch):
    """The endpoint must not connect to Gnani without credentials."""

    settings = Settings(gnani_api_key="")
    app.dependency_overrides[get_settings] = lambda: settings

    try:
        with TestClient(app) as client:
            with client.websocket_connect("/ws/transcribe") as websocket:
                response = websocket.receive_json()

                assert response["type"] == "error"
                assert "not configured" in response["message"]

                with pytest.raises(WebSocketDisconnect):
                    websocket.receive_json()
    finally:
        app.dependency_overrides.pop(get_settings, None)


def test_websocket_rejects_invalid_audio_frame(configured_client):
    """Invalid frame must produce an error before the connection closes."""

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"

        websocket.send_bytes(b"invalid-frame")

        error = websocket.receive_json()

        assert error["type"] == "error"
        assert "Invalid audio frame" in error["message"]

        with pytest.raises(WebSocketDisconnect):
            websocket.receive_json()


def test_websocket_handles_provider_error(configured_client):
    """Provider errors must be forwarded before closing the session."""

    FakeGnaniStreamClient.provider_error_on_connect = True

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"

        error = websocket.receive_json()

        assert error["type"] == "error"
        assert error["message"] == "Simulated provider error"

        with pytest.raises(WebSocketDisconnect):
            websocket.receive_json()


def test_websocket_handles_unexpected_provider_stream_end(
    configured_client,
):
    """An ended provider event stream must not leave the browser waiting."""

    FakeGnaniStreamClient.end_events_on_connect = True

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"

        error = websocket.receive_json()

        assert error["type"] == "error"
        assert "connection ended" in error["message"]

        with pytest.raises(WebSocketDisconnect):
            websocket.receive_json()


def test_websocket_handles_provider_connection_failure(
    configured_client,
):
    """A failed initial Gnani connection must return a safe error."""

    FakeGnaniStreamClient.connect_failure = True

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        error = websocket.receive_json()

        assert error["type"] == "error"
        assert error["message"] == (
            "The streaming transcription session failed."
        )

        with pytest.raises(WebSocketDisconnect):
            websocket.receive_json()


def test_websocket_handles_provider_error_during_stop(
    configured_client,
):
    """Provider errors during Stop must terminate the session."""

    FakeGnaniStreamClient.provider_error_after_silence_frames = 2

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"

        websocket.send_text(json.dumps({"type": "stop"}))

        error = websocket.receive_json()

        assert error["type"] == "error"
        assert error["message"] == "Simulated error during Stop"

        with pytest.raises(WebSocketDisconnect):
            websocket.receive_json()


def test_websocket_handles_provider_stream_end_during_stop(
    configured_client,
):
    """An ended provider stream during Stop must terminate the session."""

    FakeGnaniStreamClient.end_events_after_silence_frames = 2

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"

        websocket.send_text(json.dumps({"type": "stop"}))

        error = websocket.receive_json()

        assert error["type"] == "error"
        assert "connection ended" in error["message"]

        with pytest.raises(WebSocketDisconnect):
            websocket.receive_json()


def test_websocket_handles_sdk_constructor_failure(
    configured_client,
):
    """SDK constructor failures must return a safe error."""

    FakeGnaniStreamClient.constructor_failure = True

    with configured_client.websocket_connect(
        "/ws/transcribe"
    ) as websocket:
        error = websocket.receive_json()

        assert error["type"] == "error"
        assert error["message"] == (
            "The streaming transcription session failed."
        )

        with pytest.raises(WebSocketDisconnect):
            websocket.receive_json()

def test_websocket_includes_cumulative_conversation_detection(
    configured_client,
):
    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent(
            text="You will be arrested.",
            segment_id="conversation-segment-1",
            segment_index=0,
        ),
        StreamTranscriptEvent(
            text="Namaste, yeh ek test hai.",
            segment_id="conversation-segment-2",
            segment_index=1,
        ),
    ]

    transcripts = receive_streaming_transcripts(configured_client)

    assert len(transcripts) == 2

    # Each transcript retains independent detection.
    assert transcripts[0]["detection"]["segments_analyzed"] == 1
    assert transcripts[1]["detection"]["segments_analyzed"] == 1

    second_event_threats = next(
        assessment
        for assessment in transcripts[1]["detection"]["stage_assessments"]
        if assessment["stage"] == "threats"
    )
    assert second_event_threats["evidence"] == []

    # Cumulative detection includes both transcript segments.
    cumulative = transcripts[1]["conversation_detection"]

    assert cumulative["segments_analyzed"] == 2

    cumulative_threats = next(
        assessment
        for assessment in cumulative["stage_assessments"]
        if assessment["stage"] == "threats"
    )

    assert len(cumulative_threats["evidence"]) == 1
    assert (
        cumulative_threats["evidence"][0]["segment_id"]
        == "conversation-segment-1"
    )



def test_websocket_can_grant_and_revoke_warning_consent(
    configured_client,
):
    """Consent can be enabled and revoked during one session."""
    with configured_client.websocket_connect(
        "/ws/transcribe"
    ) as websocket:
        ready = websocket.receive_json()
        assert ready["type"] == "ready"
        assert ready["warning_consent_enabled"] is False

        # Grant consent.
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        granted = websocket.receive_json()
        assert granted["type"] == "warning_consent_updated"
        assert granted["enabled"] is True
        assert granted["scope"] == "session"

        # Revoke consent.
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": False,
        }))
        revoked = websocket.receive_json()
        assert revoked["type"] == "warning_consent_updated"
        assert revoked["enabled"] is False
        assert revoked["scope"] == "session"

        websocket.close()
        FakeGnaniStreamClient.instances[-1].cleanup_event.wait(timeout=2.0)


@pytest.mark.parametrize(
    "invalid_granted",
    ["true", 1, 0, None],
)
def test_websocket_rejects_non_boolean_warning_consent(
    configured_client,
    invalid_granted,
):
    """Only strict booleans can change consent."""
    with configured_client.websocket_connect(
        "/ws/transcribe"
    ) as websocket:
        ready = websocket.receive_json()
        assert ready["type"] == "ready"
        assert ready["warning_consent_enabled"] is False

        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": invalid_granted,
        }))
        error = websocket.receive_json()
        assert error["type"] == "warning_consent_error"
        assert error["enabled"] is False
        assert error["scope"] == "session"

        websocket.close()
        FakeGnaniStreamClient.instances[-1].cleanup_event.wait(timeout=2.0)

def test_websocket_rejects_missing_warning_consent_value(
    configured_client,
):
    """A consent command without 'granted' must not enable consent."""
    with configured_client.websocket_connect(
        "/ws/transcribe"
    ) as websocket:
        ready = websocket.receive_json()
        assert ready["type"] == "ready"
        assert ready["warning_consent_enabled"] is False

        websocket.send_text(json.dumps({
            "type": "warning_consent",
        }))

        error = websocket.receive_json()
        assert error["type"] == "warning_consent_error"
        assert error["enabled"] is False
        assert error["scope"] == "session"

        websocket.close()
        FakeGnaniStreamClient.instances[-1].cleanup_event.wait(
            timeout=2.0
        )

def test_websocket_warning_consent_resets_on_reconnect(
    configured_client,
):
    """Consent belongs to one connection and resets when reconnecting."""
    with configured_client.websocket_connect(
        "/ws/transcribe"
    ) as first_session:
        first_ready = first_session.receive_json()
        assert first_ready["warning_consent_enabled"] is False

        first_session.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        first_granted = first_session.receive_json()
        assert first_granted["type"] == "warning_consent_updated"
        assert first_granted["enabled"] is True

        first_session.close()
        FakeGnaniStreamClient.instances[-1].cleanup_event.wait(timeout=2.0)

    # Reconnect and ensure consent is back to disabled.
    with configured_client.websocket_connect(
        "/ws/transcribe"
    ) as second_session:
        second_ready = second_session.receive_json()
        assert second_ready["type"] == "ready"
        assert second_ready["warning_consent_enabled"] is False

        second_session.close()
        FakeGnaniStreamClient.instances[-1].cleanup_event.wait(timeout=2.0)


def _make_dummy_wav():
    """Create a minimal valid WAV file for mocking synthesis."""
    from io import BytesIO
    import wave

    buf = BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\x00\x00" * 1600)  # 0.1s
    return buf.getvalue()


def test_transcript_includes_warning_decision(configured_client):
    """Transcript events include explainable warning_decision metadata."""
    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("You will be arrested.")
    ]
    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        received = []
        while True:
            msg = websocket.receive_json()
            received.append(msg)
            if msg["type"] == "stopped":
                break

    transcripts = [m for m in received if m["type"] == "transcript"]
    assert len(transcripts) == 1
    wd = transcripts[0]["warning_decision"]
    assert wd["level"] == "monitor"
    assert wd["should_speak"] is False
    assert "threats" in wd["distinct_stages"]
    assert "THREAT_ARREST" in wd["matched_rule_ids"]


def test_automatic_warning_triggered_when_consent_granted(
    configured_client,
    monkeypatch,
):
    """When consent is granted and scam escalation reaches WARNING, audio is synthesized and delivered."""
    dummy_wav = _make_dummy_wav()
    synthesize_calls = []

    def mock_synthesize(api_key):
        synthesize_calls.append(api_key)
        return dummy_wav

    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        mock_synthesize,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"

        # Grant consent first
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        # Collect messages (both JSON and binary)
        json_messages = []
        binary_frames = []

        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                binary_frames.append(raw["bytes"])

    # Verify synthesis was invoked with the right key
    assert len(synthesize_calls) == 1
    assert synthesize_calls[0] == "test-api-key"

    # Verify safety_warning event
    safety_warnings = [
        m for m in json_messages if m["type"] == "safety_warning"
    ]
    assert len(safety_warnings) == 1
    sw = safety_warnings[0]
    assert sw["level"] == "warning"
    assert sw["audio_format"] == "wav"
    assert sw["audio_bytes"] == len(dummy_wav)
    assert sw["audio_duration_seconds"] == 0.1
    assert "WARNING_TRIGGERED" in sw["reason_codes"]
    assert set(sw["distinct_stages"]) == {"financial_extraction", "threats"}

    # Verify binary frame delivered
    assert len(binary_frames) == 1
    assert binary_frames[0] == dummy_wav


def test_warning_not_triggered_without_consent(
    configured_client,
    monkeypatch,
):
    """Escalation reaches WARNING, but consent is False -> no TTS synthesis or audio."""
    synthesize_calls = []

    def mock_synthesize(api_key):
        synthesize_calls.append(api_key)
        return _make_dummy_wav()

    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        mock_synthesize,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        # No consent granted (defaults to False)

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        binary_frames = []

        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                binary_frames.append(raw["bytes"])

    assert len(synthesize_calls) == 0
    assert len(binary_frames) == 0
    assert not any(m["type"] == "safety_warning" for m in json_messages)

    # Check transcript warning decision
    transcripts = [m for m in json_messages if m["type"] == "transcript"]
    assert len(transcripts) == 2
    second_decision = transcripts[1]["warning_decision"]
    assert second_decision["level"] == "warning"
    assert second_decision["should_speak"] is False
    assert "CONSENT_NOT_GRANTED" in second_decision["reason_codes"]


def test_duplicate_warning_suppression_in_same_session(
    configured_client,
    monkeypatch,
):
    """Warning is triggered once per session even if further scam segments arrive."""
    dummy_wav = _make_dummy_wav()
    synthesize_calls = []

    def mock_synthesize(api_key):
        synthesize_calls.append(api_key)
        return dummy_wav

    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        mock_synthesize,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
        StreamTranscriptEvent("Do not tell anyone about this call."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"

        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        binary_frames = []

        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                binary_frames.append(raw["bytes"])

    # Only synthesized once
    assert len(synthesize_calls) == 1
    assert len(binary_frames) == 1

    safety_warnings = [
        m for m in json_messages if m["type"] == "safety_warning"
    ]
    assert len(safety_warnings) == 1

    transcripts = [m for m in json_messages if m["type"] == "transcript"]
    assert len(transcripts) == 3
    third_decision = transcripts[2]["warning_decision"]
    assert third_decision["level"] == "warning"
    assert third_decision["should_speak"] is False
    assert "WARNING_ALREADY_SENT" in third_decision["reason_codes"]


def test_warning_synthesis_failure_handled_gracefully(
    configured_client,
    monkeypatch,
):
    """TTS service failure emits warning_synthesis_error without breaking the session."""
    def mock_failing_synthesize(api_key):
        from app.tts import TTSServiceError
        raise TTSServiceError("Gnani TTS provider unavailable")

    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        mock_failing_synthesize,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"

        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        binary_frames = []

        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                binary_frames.append(raw["bytes"])

    # No audio frame sent
    assert len(binary_frames) == 0

    # warning_synthesis_error received
    synth_errors = [
        m for m in json_messages if m["type"] == "warning_synthesis_error"
    ]
    assert len(synth_errors) == 1
    assert "error" in synth_errors[0]["message"].lower()

    # Session completed normally with 'stopped'
    assert json_messages[-1]["type"] == "stopped"


def test_session_isolation_for_warning_trigger(
    configured_client,
    monkeypatch,
):
    """Two separate WebSocket sessions have independent warning states and consent."""
    dummy_wav = _make_dummy_wav()
    synthesize_calls = []

    def mock_synthesize(api_key):
        synthesize_calls.append(api_key)
        return dummy_wav

    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        mock_synthesize,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
    ]

    # Session 1: Consent granted -> warning triggered
    with configured_client.websocket_connect("/ws/transcribe") as session1:
        assert session1.receive_json()["type"] == "ready"
        session1.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert session1.receive_json()["type"] == "warning_consent_updated"

        session1.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        session1.send_text(json.dumps({"type": "stop"}))

        while True:
            raw = session1.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                if msg["type"] == "stopped":
                    break

        FakeGnaniStreamClient.instances[-1].cleanup_event.wait(timeout=2.0)

    assert len(synthesize_calls) == 1

    # Session 2: Fresh session, consent defaults False -> no warning
    with configured_client.websocket_connect("/ws/transcribe") as session2:
        assert session2.receive_json()["type"] == "ready"

        session2.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        session2.send_text(json.dumps({"type": "stop"}))

        s2_binary = []
        while True:
            raw = session2.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                s2_binary.append(raw["bytes"])

        FakeGnaniStreamClient.instances[-1].cleanup_event.wait(timeout=2.0)

    # Still only 1 call across sessions; session 2 didn't trigger
    assert len(synthesize_calls) == 1
    assert len(s2_binary) == 0


def _make_custom_wav(
    channels=1,
    sample_rate=16000,
    sample_width=2,
    num_samples=1600,
):
    """Create custom WAV bytes for testing format validation."""
    from io import BytesIO
    import wave

    buf = BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(sample_width)
        w.setframerate(sample_rate)
        w.writeframes(b"\x00" * (channels * sample_width * num_samples))
    return buf.getvalue()


def test_warning_delivery_acknowledgement_marks_sent_on_success(
    configured_client,
    monkeypatch,
):
    """Successful metadata transmission followed by successful binary transmission marks the warning as sent."""
    dummy_wav = _make_dummy_wav()
    synthesize_calls = []

    def mock_synthesize(api_key):
        synthesize_calls.append(api_key)
        return dummy_wav

    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        mock_synthesize,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        binary_frames = []

        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                binary_frames.append(raw["bytes"])

    assert len(synthesize_calls) == 1
    assert len(binary_frames) == 1
    assert binary_frames[0] == dummy_wav
    assert any(m["type"] == "safety_warning" for m in json_messages)


def test_client_warning_playback_lifecycle_is_acknowledged(
    configured_client,
    monkeypatch,
):
    """Browser receipt and playback transitions are distinct from server delivery."""
    dummy_wav = _make_dummy_wav()
    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        lambda api_key: dummy_wav,
    )
    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
    ]

    original_send_audio = FakeGnaniStreamClient.send_audio

    async def send_audio_with_transcripts(client, chunk):
        await original_send_audio(client, chunk)
        if chunk != bytes(streaming.FRAME_BYTES) and not getattr(
            client,
            "warning_test_events_sent",
            False,
        ):
            client.warning_test_events_sent = True
            for event in FakeGnaniStreamClient.transcript_events:
                await client.event_queue.put(event)

    monkeypatch.setattr(
        FakeGnaniStreamClient,
        "send_audio",
        send_audio_with_transcripts,
    )

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"
        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)

        warning = None
        audio = None
        while audio is None:
            raw = websocket.receive()
            if "text" in raw:
                message = json.loads(raw["text"])
                if message["type"] == "safety_warning":
                    warning = message
            elif "bytes" in raw:
                audio = raw["bytes"]

        assert warning is not None
        assert len(warning["warning_id"]) == 32
        assert audio == dummy_wav

        warning_id = warning["warning_id"]
        websocket.send_text(json.dumps({
            "type": "warning_playback",
            "warning_id": warning_id,
            "status": "playback_completed",
        }))
        invalid_transition = websocket.receive_json()
        assert invalid_transition["type"] == "warning_playback_status_error"

        for status in ("received", "playback_started", "playback_completed"):
            websocket.send_text(json.dumps({
                "type": "warning_playback",
                "warning_id": warning_id,
                "status": status,
            }))
            acknowledgement = websocket.receive_json()
            assert acknowledgement["type"] == "warning_playback_status_updated"
            assert acknowledgement["warning_id"] == warning_id
            assert acknowledgement["status"] == status

        websocket.send_text(json.dumps({"type": "stop"}))
        while True:
            message = websocket.receive_json()
            if message["type"] == "stopped":
                break


def test_warning_tts_failure_does_not_retry_on_later_transcripts(
    configured_client,
    monkeypatch,
):
    """TTS synthesis failure on a qualifying transcript does not trigger repeated synthesis on later events."""
    synthesize_calls = []

    def mock_failing_synthesize(api_key):
        synthesize_calls.append(api_key)
        from app.tts import TTSServiceError
        raise TTSServiceError("TTS provider error")

    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        mock_failing_synthesize,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
        StreamTranscriptEvent("Do not tell anyone about this call."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break

    # Synthesize was only called once, despite 2 subsequent qualifying transcript events
    assert len(synthesize_calls) == 1
    assert any(m["type"] == "warning_synthesis_error" for m in json_messages)
    # Session continued normally and received all transcripts and stopped event
    transcripts = [m for m in json_messages if m["type"] == "transcript"]
    assert len(transcripts) == 3


def test_invalid_wav_bytes_rejected_before_delivery(
    configured_client,
    monkeypatch,
):
    """Corrupted/non-WAV bytes are rejected before safety_warning metadata or binary delivery."""
    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        lambda api_key: b"corrupted-not-a-wav-file",
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        binary_frames = []
        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                binary_frames.append(raw["bytes"])

    # No safety_warning metadata or binary audio sent
    assert not any(m["type"] == "safety_warning" for m in json_messages)
    assert len(binary_frames) == 0
    # Safe error emitted
    errors = [m for m in json_messages if m["type"] == "warning_synthesis_error"]
    assert len(errors) == 1
    assert "invalid audio format" in errors[0]["message"].lower()


def test_empty_wav_payload_rejected(
    configured_client,
    monkeypatch,
):
    """Empty bytes payload is rejected before delivery."""
    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        lambda api_key: b"",
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        binary_frames = []
        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                binary_frames.append(raw["bytes"])

    assert not any(m["type"] == "safety_warning" for m in json_messages)
    assert len(binary_frames) == 0
    assert any(m["type"] == "warning_synthesis_error" for m in json_messages)


def test_incorrect_sample_rate_rejected(
    configured_client,
    monkeypatch,
):
    """WAV with incorrect sample rate (e.g. 24000 Hz) is rejected."""
    bad_wav = _make_custom_wav(channels=1, sample_rate=24000, sample_width=2)
    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        lambda api_key: bad_wav,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        binary_frames = []
        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                binary_frames.append(raw["bytes"])

    assert not any(m["type"] == "safety_warning" for m in json_messages)
    assert len(binary_frames) == 0
    assert any(m["type"] == "warning_synthesis_error" for m in json_messages)


def test_incorrect_channel_count_rejected(
    configured_client,
    monkeypatch,
):
    """WAV with stereo channels (2) instead of mono (1) is rejected."""
    bad_wav = _make_custom_wav(channels=2, sample_rate=16000, sample_width=2)
    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        lambda api_key: bad_wav,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        binary_frames = []
        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                binary_frames.append(raw["bytes"])

    assert not any(m["type"] == "safety_warning" for m in json_messages)
    assert len(binary_frames) == 0
    assert any(m["type"] == "warning_synthesis_error" for m in json_messages)


def test_incorrect_sample_width_rejected(
    configured_client,
    monkeypatch,
):
    """WAV with 1-byte (8-bit) sample width instead of 2-byte (16-bit) is rejected."""
    bad_wav = _make_custom_wav(channels=1, sample_rate=16000, sample_width=1)
    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        lambda api_key: bad_wav,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        binary_frames = []
        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                binary_frames.append(raw["bytes"])

    assert not any(m["type"] == "safety_warning" for m in json_messages)
    assert len(binary_frames) == 0
    assert any(m["type"] == "warning_synthesis_error" for m in json_messages)


def test_metadata_transmission_failure_prevents_warning_marked_sent(
    configured_client,
    monkeypatch,
):
    """If metadata delivery acknowledgement fails, binary audio is not sent and warning is not marked sent."""
    orig_queue = streaming.asyncio.Queue

    class InterceptMetadataQueue(asyncio.Queue):
        async def put(self, item):
            if item is not None and isinstance(item, tuple) and len(item) == 2:
                payload, ack = item
                if isinstance(payload, dict) and payload.get("type") == "safety_warning":
                    if ack is not None and not ack.done():
                        ack.set_exception(
                            RuntimeError("Simulated metadata delivery acknowledgement failure")
                        )
                    return
            await super().put(item)

    monkeypatch.setattr(streaming.asyncio, "Queue", InterceptMetadataQueue)

    synth_calls = []
    dummy_wav = _make_dummy_wav()

    def mock_synthesize(api_key):
        synth_calls.append(api_key)
        return dummy_wav

    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        mock_synthesize,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
        StreamTranscriptEvent("Do not tell anyone about this call."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        binary_frames = []

        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                binary_frames.append(raw["bytes"])

    # 1. Synthesis was invoked once
    assert len(synth_calls) == 1
    # 2. Metadata message was NOT received by the client (intercepted/failed)
    assert not any(m.get("type") == "safety_warning" for m in json_messages)
    # 3. Binary audio was NOT sent
    assert len(binary_frames) == 0
    # 4. Third transcript reflects that warning was not successfully sent (warning_already_sent is False)
    transcripts = [m for m in json_messages if m.get("type") == "transcript"]
    assert len(transcripts) == 3
    third_decision = transcripts[2]["warning_decision"]
    assert "WARNING_ALREADY_SENT" not in third_decision["reason_codes"]
    # 5. Session remained healthy and completed normally with stopped event
    assert json_messages[-1]["type"] == "stopped"


def test_binary_transmission_failure_prevents_warning_marked_sent(
    configured_client,
    monkeypatch,
):
    """If metadata succeeds but binary audio delivery fails, warning is not marked sent and no retry occurs."""
    class InterceptBinaryQueue(asyncio.Queue):
        async def put(self, item):
            if item is not None and isinstance(item, tuple) and len(item) == 2:
                payload, ack = item
                if isinstance(payload, bytes):
                    if ack is not None and not ack.done():
                        ack.set_exception(
                            RuntimeError("Simulated binary audio delivery failure")
                        )
                    return
            await super().put(item)

    monkeypatch.setattr(streaming.asyncio, "Queue", InterceptBinaryQueue)

    synth_calls = []
    dummy_wav = _make_dummy_wav()

    def mock_synthesize(api_key):
        synth_calls.append(api_key)
        return dummy_wav

    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        mock_synthesize,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account."),
        StreamTranscriptEvent("You will be arrested."),
        StreamTranscriptEvent("Do not tell anyone about this call."),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        binary_frames = []

        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break
            elif "bytes" in raw:
                binary_frames.append(raw["bytes"])

    # 1. Synthesis was invoked once
    assert len(synth_calls) == 1
    # 2. Metadata message succeeded and was received by client
    safety_warnings = [m for m in json_messages if m.get("type") == "safety_warning"]
    assert len(safety_warnings) == 1
    # 3. Binary audio delivery failed and was NOT received
    assert len(binary_frames) == 0
    # 4. Third transcript reflects that warning_already_sent is False (never marked successfully sent)
    transcripts = [m for m in json_messages if m.get("type") == "transcript"]
    assert len(transcripts) == 3
    third_decision = transcripts[2]["warning_decision"]
    assert "WARNING_ALREADY_SENT" not in third_decision["reason_codes"]
    # 5. Bounded retry policy ensures no second synthesis attempt occurred
    assert len(synth_calls) == 1
    # 6. Session remained operational and completed normally
    assert json_messages[-1]["type"] == "stopped"


def test_validate_synthesized_wav_helper_direct():
    """Unit test for validate_synthesized_wav covering all format validations."""
    from app.streaming import validate_synthesized_wav

    # Valid WAV
    valid_wav = _make_custom_wav(channels=1, sample_rate=16000, sample_width=2, num_samples=1600)
    byte_len, dur = validate_synthesized_wav(valid_wav)
    assert byte_len == len(valid_wav)
    assert dur == 0.1

    # Empty payload
    with pytest.raises(ValueError, match="empty"):
        validate_synthesized_wav(b"")

    # Non-bytes payload
    with pytest.raises(ValueError, match="raw bytes"):
        validate_synthesized_wav("not-bytes")  # type: ignore

    # Non-WAV bytes
    with pytest.raises(ValueError, match="Invalid WAV container"):
        validate_synthesized_wav(b"garbage-content-not-wav")

    # Bad channels
    with pytest.raises(ValueError, match="channel count: 2"):
        validate_synthesized_wav(_make_custom_wav(channels=2))

    # Bad sample rate
    with pytest.raises(ValueError, match="sample rate: 8000"):
        validate_synthesized_wav(_make_custom_wav(sample_rate=8000))

    # Bad sample width
    with pytest.raises(ValueError, match="sample width: 1"):
        validate_synthesized_wav(_make_custom_wav(sample_width=1))

    # Truncated header (triggers EOFError inside wave.open)
    with pytest.raises(ValueError, match="Invalid WAV container"):
        validate_synthesized_wav(b"RIFF")

    # Truncated partial chunk (triggers wave.Error / struct.error)
    with pytest.raises(ValueError, match="Invalid WAV container"):
        validate_synthesized_wav(b"RIFF\x20\x00\x00\x00WAV")


def test_transcription_continues_after_tts_error(
    configured_client,
    monkeypatch,
):
    """Transcription pipeline remains fully functional after a TTS synthesis error occurs."""
    def mock_failing_synthesize(api_key):
        from app.tts import TTSServiceError
        raise TTSServiceError("Gnani TTS provider unavailable")

    monkeypatch.setattr(
        streaming,
        "synthesize_digital_arrest_warning",
        mock_failing_synthesize,
    )

    FakeGnaniStreamClient.transcript_events = [
        StreamTranscriptEvent("Transfer your money to a safe account.", segment_index=0),
        StreamTranscriptEvent("You will be arrested.", segment_index=1),
        StreamTranscriptEvent("This is a later legitimate transcript segment.", segment_index=2),
    ]

    with configured_client.websocket_connect("/ws/transcribe") as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_text(json.dumps({
            "type": "warning_consent",
            "granted": True,
        }))
        assert websocket.receive_json()["type"] == "warning_consent_updated"

        websocket.send_bytes(b"\x01" * streaming.FRAME_BYTES)
        websocket.send_text(json.dumps({"type": "stop"}))

        json_messages = []
        while True:
            raw = websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                json_messages.append(msg)
                if msg["type"] == "stopped":
                    break

    # Verify that the subsequent transcript segment was processed normally
    transcripts = [m for m in json_messages if m["type"] == "transcript"]
    assert len(transcripts) == 3
    assert transcripts[2]["text"] == "This is a later legitimate transcript segment."
    assert transcripts[2]["segment_index"] == 2
    # Verify stopped was delivered
    assert json_messages[-1]["type"] == "stopped"
