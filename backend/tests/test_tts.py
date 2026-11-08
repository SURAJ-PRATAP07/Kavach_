from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
import struct
import wave
from io import BytesIO

import pytest

import app.tts as tts
from app.tts import TTSServiceError

def make_provider_wav(sample_count=1600):
    """Create a fake WAV matching Gnani's observed placeholder headers."""

    pcm = b"\x01\x00" * sample_count
    output = BytesIO()

    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(pcm)

    audio = bytearray(output.getvalue())

    # Reproduce the unknown-length sizes observed in live Gnani responses.
    struct.pack_into("<I", audio, 4, 0xFFFFFFFF)
    struct.pack_into("<I", audio, 40, 0xFFFFFFFF)

    return bytes(audio)


class FakeGnaniTTSClient:
    """Fake SDK client: no real API requests or credit consumption."""

    instances = []
    audio_response = make_provider_wav()
    should_fail = False

    def __init__(self, api_key=None, timeout=60):
        self.api_key = api_key
        self.timeout = timeout
        self.calls = []
        self.__class__.instances.append(self)

    def synthesize(self, **kwargs):
        self.calls.append(kwargs)

        if self.__class__.should_fail:
            raise RuntimeError("Simulated provider failure")

        return self.__class__.audio_response


@pytest.fixture
def fake_tts_client(monkeypatch):
    FakeGnaniTTSClient.instances.clear()
    FakeGnaniTTSClient.audio_response = make_provider_wav()
    FakeGnaniTTSClient.should_fail = False

    monkeypatch.setattr(
        tts,
        "GnaniTTSClient",
        FakeGnaniTTSClient,
    )

    return FakeGnaniTTSClient


@pytest.fixture
def api_client():
    """Create a test client with a temporary API-key configuration."""

    previous_overrides = app.dependency_overrides.copy()

    app.dependency_overrides[get_settings] = lambda: Settings(
        gnani_api_key="test-api-key"
    )

    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def test_synthesize_warning_returns_valid_wav(fake_tts_client):
    result = tts.synthesize_warning("test-api-key")

    assert result[:4] == b"RIFF"
    assert result[8:12] == b"WAVE"

    with wave.open(BytesIO(result), "rb") as wav:
        assert wav.getnchannels() == 1
        assert wav.getsampwidth() == 2
        assert wav.getframerate() == 16000

        # Each fake segment has 1600 samples.
        # Pause: 16000 * 0.350 = 5600 samples.
        # Total: 1600 + 5600 + 1600 = 8800 samples.
        assert wav.getnframes() == 8800

        pcm = wav.readframes(wav.getnframes())

    # Verify the two speech segments and the inserted silence.
    assert pcm[:3200] == b"\x01\x00" * 1600
    assert pcm[3200:14400] == b"\x00" * 11200
    assert pcm[14400:] == b"\x01\x00" * 1600


def test_synthesis_uses_expected_gnani_settings(fake_tts_client):
    tts.synthesize_warning("test-api-key")

    client = FakeGnaniTTSClient.instances[-1]

    assert client.api_key == "test-api-key"
    assert len(client.calls) == 2

    assert [call["text"] for call in client.calls] == list(
        tts.WARNING_SEGMENTS
    )

    for call in client.calls:
        assert call["model"] == "timbre-v3.0"
        assert call["voice"] == "Tarika"
        assert call["language"] == "hi-IN"
        assert call["speed"] == 0.85

        assert call["audio_config"].sample_rate == 16000
        assert call["audio_config"].container == "wav"


def test_synthesis_rejects_missing_api_key(fake_tts_client):
    with pytest.raises(tts.TTSServiceError, match="not configured"):
        tts.synthesize_warning("")

    assert FakeGnaniTTSClient.instances == []


def test_synthesis_rejects_malformed_provider_audio(
    fake_tts_client,
):
    FakeGnaniTTSClient.audio_response = b"invalid audio"

    with pytest.raises(tts.TTSServiceError):
        tts.synthesize_warning("test-api-key")


def test_synthesis_handles_provider_failure(fake_tts_client):
    FakeGnaniTTSClient.should_fail = True

    with pytest.raises(
        tts.TTSServiceError,
        match="segment 1",
    ):
        tts.synthesize_warning("test-api-key")


def test_warning_endpoint_returns_wav(api_client, monkeypatch):
    fake_audio = b"RIFF" + b"\x00" * 40
    received_keys = []

    def fake_synthesize(api_key):
        received_keys.append(api_key)
        return fake_audio

    monkeypatch.setattr(
        "app.main.synthesize_warning",
        fake_synthesize,
    )

    response = api_client.post("/synthesize-warning")

    assert response.status_code == 200
    assert response.content == fake_audio
    assert response.headers["content-type"] == "audio/wav"
    assert "kavach-warning.wav" in response.headers[
        "content-disposition"
    ]
    assert response.headers["cache-control"] == "no-store"
    assert received_keys == ["test-api-key"]


def test_warning_endpoint_rejects_missing_api_key(
    api_client,
    monkeypatch,
):
    app.dependency_overrides[get_settings] = lambda: Settings(
        gnani_api_key=""
    )

    def unexpected_synthesis(api_key):
        raise AssertionError("Synthesis must not be called.")

    monkeypatch.setattr(
        "app.main.synthesize_warning",
        unexpected_synthesis,
    )

    response = api_client.post("/synthesize-warning")

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Speech synthesis is not configured on the server."
    )


def test_warning_endpoint_handles_provider_failure(
    api_client,
    monkeypatch,
):
    def failed_synthesis(api_key):
        raise TTSServiceError(
            "Simulated provider failure with internal details"
        )

    monkeypatch.setattr(
        "app.main.synthesize_warning",
        failed_synthesis,
    )

    response = api_client.post("/synthesize-warning")

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "Gnani speech synthesis failed."
    )
    assert "internal details" not in response.text
