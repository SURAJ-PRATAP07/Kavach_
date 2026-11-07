import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def configure_test_settings():
    app.dependency_overrides[get_settings] = lambda: Settings(
        gnani_api_key="test-key"
    )
    yield
    app.dependency_overrides.clear()


class FakeGnaniResponse:
    status_code = 200

    def json(self):
        return {
            "success": True,
            "request_id": "test-request-123",
            "transcript": (
                "\u0928\u092e\u0938\u094d\u0924\u0947, "
                "\u0905\u092a\u0928\u093e OTP "
                "\u0915\u093f\u0938\u0940 \u0915\u0947 "
                "\u0938\u093e\u0925 \u0936\u0947\u092f\u0930 "
                "\u092e\u0924 \u0915\u0940\u091c\u093f\u090f\u0964"
            ),
            "model": "prisma-v2.5",
            "processing_time": 0.2,
            "end_to_end_latency": 0.3,
        }

    def raise_for_status(self):
        pass


class FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def post(self, url, headers, data, files):
        assert url == "https://api.vachana.ai/stt/v3"
        assert headers["X-API-Key-ID"] == "test-key"
        assert data["language_code"] == "hi-IN"
        assert files["audio_file"][0] == "audio.wav"
        assert files["audio_file"][2] == "audio/wav"

        return FakeGnaniResponse()


def test_transcribe_returns_transcript(monkeypatch):
    monkeypatch.setattr(
        "app.main.httpx.AsyncClient",
        FakeAsyncClient,
    )

    response = client.post(
        "/transcribe",
        files={
            "audio_file": (
                "sample.wav",
                b"test-audio-content",
                "audio/wav",
            )
        },
    )

    assert response.status_code == 200

    body = response.json()

    assert body["success"] is True
    assert "OTP" in body["transcript"]
    assert body["model"] == "prisma-v2.5"
    assert body["request_id"] == "test-request-123"


def test_transcribe_rejects_unsupported_format():
    response = client.post(
        "/transcribe",
        files={
            "audio_file": (
                "sample.txt",
                b"not-an-audio-file",
                "text/plain",
            )
        },
    )

    assert response.status_code == 415


def test_transcribe_rejects_missing_api_key():
    app.dependency_overrides[get_settings] = lambda: Settings(
        gnani_api_key=""
    )

    response = client.post(
        "/transcribe",
        files={
            "audio_file": (
                "sample.wav",
                b"test-audio-content",
                "audio/wav",
            )
        },
    )

    assert response.status_code == 503


def test_transcribe_rejects_empty_audio():
    response = client.post(
        "/transcribe",
        files={
            "audio_file": (
                "sample.wav",
                b"",
                "audio/wav",
            )
        },
    )

    assert response.status_code == 400


class FakeTimeoutClient(FakeAsyncClient):
    async def post(self, url, headers, data, files):
        raise httpx.TimeoutException("Simulated timeout")


class FakeHTTPErrorResponse:
    def raise_for_status(self):
        request = httpx.Request("POST", "https://api.vachana.ai/stt/v3")
        response = httpx.Response(500, request=request)
        raise httpx.HTTPStatusError(
            "Simulated server error",
            request=request,
            response=response,
        )


class FakeHTTPErrorClient(FakeAsyncClient):
    async def post(self, url, headers, data, files):
        return FakeHTTPErrorResponse()


class FakeInvalidJSONResponse:
    def raise_for_status(self):
        pass

    def json(self):
        raise ValueError("Simulated invalid JSON")


class FakeInvalidJSONClient(FakeAsyncClient):
    async def post(self, url, headers, data, files):
        return FakeInvalidJSONResponse()


def test_transcribe_rejects_oversized_audio():
    response = client.post(
        "/transcribe",
        files={
            "audio_file": (
                "large.wav",
                b"x" * (10 * 1024 * 1024 + 1),
                "audio/wav",
            )
        },
    )

    assert response.status_code == 413


def test_transcribe_handles_gnani_timeout(monkeypatch):
    monkeypatch.setattr(
        "app.main.httpx.AsyncClient",
        FakeTimeoutClient,
    )

    response = client.post(
        "/transcribe",
        files={
            "audio_file": ("sample.wav", b"audio", "audio/wav")
        },
    )

    assert response.status_code == 504
    assert "timed out" in response.json()["detail"]


def test_transcribe_handles_gnani_http_error(monkeypatch):
    monkeypatch.setattr(
        "app.main.httpx.AsyncClient",
        FakeHTTPErrorClient,
    )

    response = client.post(
        "/transcribe",
        files={
            "audio_file": ("sample.wav", b"audio", "audio/wav")
        },
    )

    assert response.status_code == 502
    assert "returned an error" in response.json()["detail"]


def test_transcribe_handles_invalid_gnani_json(monkeypatch):
    monkeypatch.setattr(
        "app.main.httpx.AsyncClient",
        FakeInvalidJSONClient,
    )

    response = client.post(
        "/transcribe",
        files={
            "audio_file": ("sample.wav", b"audio", "audio/wav")
        },
    )

    assert response.status_code == 502
    assert "invalid response" in response.json()["detail"]
