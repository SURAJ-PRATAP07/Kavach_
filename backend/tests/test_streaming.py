
import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
import app.streaming as streaming

from starlette.websockets import WebSocketDisconnect


class StreamTranscriptEvent:
    """Small stand-in for a Gnani transcript event."""

    def __init__(self, text):
        self.text = text
        self.segment_id = "test-segment"
        self.segment_index = 0
        self.audio_duration_ms = 1000
        self.latency = 0.2
        self.timestamp = None
        self.detected_language_code = "hi-IN"


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
                await self.event_queue.put(
                    StreamTranscriptEvent("Namaste, yeh ek test hai.")
                )

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
        self.instances.append(self)

    async def close(self):
        self.closed = True
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

    fake_client = FakeGnaniStreamClient.instances[-1]

    assert fake_client.audio_chunks[0] == audio_frame
    assert fake_client.silence_count == 32
    assert len(fake_client.audio_chunks) == 33
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
