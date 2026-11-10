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
