
"""Gnani Timbre TTS service for Kavach safety warnings."""

from io import BytesIO
import struct
import wave

from gnani.tts import AudioConfig, GnaniTTSClient


# Verified manually with the live Gnani API.
TTS_MODEL = "timbre-v3.0"
TTS_VOICE = "Tarika"
TTS_LANGUAGE = "hi-IN"
TTS_SPEED = 0.85

SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLE_WIDTH = 2
PAUSE_SECONDS = 0.350

WARNING_SEGMENTS = (
    "Apna one-time password.",
    "Kisi ke saath share na karein.",
)


class TTSServiceError(Exception):
    """Safe application-level error for TTS failures."""


def _extract_pcm(audio: bytes) -> bytes:
    """
    Validate the expected 44-byte PCM WAV header and extract PCM data.

    Gnani's tested response may contain 0xFFFFFFFF as the RIFF
    and data chunk sizes. Those placeholders are handled here.
    """

    if not isinstance(audio, bytes) or len(audio) < 44:
        raise TTSServiceError("Gnani returned an invalid audio file.")

    if audio[0:4] != b"RIFF" or audio[8:12] != b"WAVE":
        raise TTSServiceError("Gnani returned an invalid WAV file.")

    if audio[12:16] != b"fmt ":
        raise TTSServiceError("Unexpected WAV format chunk.")

    fmt_size = struct.unpack_from("<I", audio, 16)[0]
    if fmt_size != 16:
        raise TTSServiceError("Unsupported WAV format.")

    audio_format, channels, sample_rate = struct.unpack_from(
        "<HHI", audio, 20
    )
    byte_rate, block_align, bits_per_sample = struct.unpack_from(
        "<IHH", audio, 28
    )

    if (
        audio_format != 1
        or channels != CHANNELS
        or sample_rate != SAMPLE_RATE
        or byte_rate != SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH
        or block_align != CHANNELS * SAMPLE_WIDTH
        or bits_per_sample != SAMPLE_WIDTH * 8
    ):
        raise TTSServiceError("Gnani returned an unsupported audio format.")

    if audio[36:40] != b"data":
        raise TTSServiceError("Unexpected WAV data chunk.")

    pcm = audio[44:]

    if not pcm or len(pcm) % block_align != 0:
        raise TTSServiceError("Gnani returned incomplete PCM audio.")

    declared_data_size = struct.unpack_from("<I", audio, 40)[0]
    if declared_data_size not in (0xFFFFFFFF, len(pcm)):
        raise TTSServiceError("WAV data size does not match its payload.")

    declared_riff_size = struct.unpack_from("<I", audio, 4)[0]
    if declared_riff_size not in (0xFFFFFFFF, len(audio) - 8):
        raise TTSServiceError("WAV container size does not match its payload.")

    return pcm


def _build_wav(pcm: bytes) -> bytes:
    """Create a standard WAV file with correct size fields."""

    output = BytesIO()

    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(SAMPLE_WIDTH)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(pcm)

    return output.getvalue()


def synthesize_warning(api_key: str) -> bytes:
    """
    Generate the fixed Kavach warning using sentence-level synthesis.

    Returns a complete WAV file as bytes.
    """

    if not api_key or not api_key.strip():
        raise TTSServiceError("TTS is not configured on the server.")

    try:
        client = GnaniTTSClient(
            api_key=api_key.strip(),
            timeout=60,
        )
    except Exception as exc:
        raise TTSServiceError(
            "Could not initialise the speech synthesis service."
        ) from exc

    audio_config = AudioConfig(
        sample_rate=SAMPLE_RATE,
        encoding="linear_pcm",
        num_channels=CHANNELS,
        sample_width=SAMPLE_WIDTH,
        container="wav",
    )

    pcm_segments = []

    for index, text in enumerate(WARNING_SEGMENTS, start=1):
        try:
            audio = client.synthesize(
                text=text,
                voice=TTS_VOICE,
                model=TTS_MODEL,
                language=TTS_LANGUAGE,
                speed=TTS_SPEED,
                audio_config=audio_config,
            )
        except Exception as exc:
            raise TTSServiceError(
                f"Speech synthesis failed for warning segment {index}."
            ) from exc

        pcm_segments.append(_extract_pcm(audio))

    silence_samples = round(SAMPLE_RATE * PAUSE_SECONDS)
    silence = b"\x00" * (silence_samples * CHANNELS * SAMPLE_WIDTH)

    combined_pcm = (
        pcm_segments[0]
        + silence
        + pcm_segments[1]
    )

    return _build_wav(combined_pcm)
