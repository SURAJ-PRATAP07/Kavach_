
import asyncio
import json
import logging
import math
import struct
import wave
from io import BytesIO
from uuid import uuid4

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.config import Settings, get_settings
from app.detection.engine import detect_segments
from app.detection.schemas import TranscriptSegment
from app.detection.conversation import ConversationDetectionAccumulator
from app.detection.warning_policy import evaluate_warning_policy, WarningLevel
from app.tts import synthesize_digital_arrest_warning, TTSServiceError
from gnani.stt import GnaniSTTStreamClient

logger = logging.getLogger(__name__)

# Expected audio format constants for synthesized WAV validation
EXPECTED_WAV_CHANNELS = 1
EXPECTED_WAV_SAMPLE_RATE = 16000
EXPECTED_WAV_SAMPLE_WIDTH = 2
EXPECTED_WAV_COMPRESSION = "NONE"


def validate_synthesized_wav(audio_bytes: bytes) -> tuple[int, float]:
    """Validate synthesized WAV data matches the expected 16kHz mono 16-bit PCM format.

    Returns:
        tuple[int, float]: (byte_length, duration_seconds)

    Raises:
        ValueError: if the payload is not valid WAV, empty, or does not match format constraints.
    """
    if not isinstance(audio_bytes, bytes):
        raise ValueError("Audio payload must be raw bytes.")

    if len(audio_bytes) == 0:
        raise ValueError("Audio payload is empty.")

    try:
        with wave.open(BytesIO(audio_bytes), "rb") as reader:
            channels = reader.getnchannels()
            sample_rate = reader.getframerate()
            sample_width = reader.getsampwidth()
            comptype = reader.getcomptype()
            num_frames = reader.getnframes()

            if channels != EXPECTED_WAV_CHANNELS:
                raise ValueError(
                    f"Unexpected WAV channel count: {channels}. Expected {EXPECTED_WAV_CHANNELS}."
                )

            if sample_rate != EXPECTED_WAV_SAMPLE_RATE:
                raise ValueError(
                    f"Unexpected WAV sample rate: {sample_rate}. Expected {EXPECTED_WAV_SAMPLE_RATE}."
                )

            if sample_width != EXPECTED_WAV_SAMPLE_WIDTH:
                raise ValueError(
                    f"Unexpected WAV sample width: {sample_width}. Expected {EXPECTED_WAV_SAMPLE_WIDTH}."
                )

            if comptype != EXPECTED_WAV_COMPRESSION:
                raise ValueError(
                    f"Unexpected WAV compression type: {comptype}. Expected uncompressed PCM."
                )

            if num_frames <= 0:
                raise ValueError("WAV file contains zero audio frames.")

            duration = round(num_frames / sample_rate, 3)
            return len(audio_bytes), duration

    except (wave.Error, EOFError, struct.error) as exc:
        raise ValueError(f"Invalid WAV container: {exc}") from exc


router = APIRouter()

SAMPLE_RATE = 16000
FRAME_BYTES = 1024
FRAME_DURATION_SECONDS = 0.032
SILENCE_FRAMES_ON_STOP = 32

CONNECT_TIMEOUT_SECONDS = 10.0
SEND_AUDIO_TIMEOUT_SECONDS = 5.0
FINAL_TRANSCRIPT_TIMEOUT_SECONDS = 3.0
CLEANUP_TIMEOUT_SECONDS = 5.0
WARNING_PLAYBACK_STATUSES = {
    "received",
    "playback_started",
    "playback_completed",
    "playback_blocked",
    "playback_failed",
    "cancelled",
}
WARNING_PLAYBACK_TRANSITIONS = {
    "metadata_sent": {"playback_failed", "cancelled"},
    "transmitted": {"received", "playback_failed", "cancelled"},
    "received": {
        "playback_started",
        "playback_blocked",
        "playback_failed",
        "cancelled",
    },
    "playback_blocked": {
        "playback_started",
        "playback_failed",
        "cancelled",
    },
    "playback_started": {
        "playback_completed",
        "playback_failed",
        "cancelled",
    },
}


class SessionFailure(Exception):
    """Raised when a streaming session can no longer continue."""


def serialize_provider_event(event) -> dict:
    """Convert SDK events into safe, frontend-friendly JSON messages."""

    event_name = type(event).__name__

    if event_name == "StreamConnectedEvent":
        return {
            "type": "connected",
            "sample_rate": getattr(event, "sample_rate", SAMPLE_RATE),
            "chunk_size": getattr(event, "chunk_size", FRAME_BYTES),
        }

    if event_name == "StreamProcessingEvent":
        return {
            "type": "processing",
            "timestamp": getattr(event, "timestamp", None),
        }

    if event_name == "StreamTranscriptEvent":
        return {
            "type": "transcript",
            "text": getattr(event, "text", ""),
            "segment_id": getattr(event, "segment_id", None),
            "segment_index": getattr(event, "segment_index", None),
            "audio_duration_ms": getattr(event, "audio_duration_ms", None),
            "latency": getattr(event, "latency", None),
            "timestamp": getattr(event, "timestamp", None),
            "detected_language_code": getattr(
                event, "detected_language_code", None
            ),
        }

    if event_name == "StreamErrorEvent":
        return {
            "type": "error",
            "message": getattr(
                event, "message", "The speech provider reported an error."
            ),
        }

    return {"type": "provider_event", "event": event_name}


def build_stream_segment(payload: dict) -> TranscriptSegment | None:
    """Convert a provider transcript event into a validated segment."""
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        return None
    segment_data = {
        "text": text,
        "source": "streaming",
    }
    segment_id = payload.get("segment_id")
    if isinstance(segment_id, str):
        segment_data["segment_id"] = segment_id
    segment_index = payload.get("segment_index")
    if (
        isinstance(segment_index, int)
        and not isinstance(segment_index, bool)
        and segment_index >= 0
    ):
        segment_data["segment_index"] = segment_index
    timestamp = payload.get("timestamp")
    if isinstance(timestamp, str):
        segment_data["timestamp"] = timestamp
    elif (
        isinstance(timestamp, (int, float))
        and not isinstance(timestamp, bool)
        and math.isfinite(timestamp)
    ):
        segment_data["timestamp"] = timestamp
    audio_duration_ms = payload.get("audio_duration_ms")
    if (
        isinstance(audio_duration_ms, (int, float))
        and not isinstance(audio_duration_ms, bool)
        and math.isfinite(audio_duration_ms)
        and audio_duration_ms >= 0
    ):
        segment_data["audio_duration_ms"] = audio_duration_ms
    language_code = payload.get("detected_language_code")
    if isinstance(language_code, str):
        segment_data["language_code"] = language_code
    return TranscriptSegment(**segment_data)


@router.websocket("/ws/transcribe")
async def stream_transcription(
    websocket: WebSocket,
    settings: Settings = Depends(get_settings),
):
    await websocket.accept()

    if not settings.gnani_api_key.strip():
        await websocket.send_json({
            "type": "error",
            "message": "Speech transcription is not configured on the server.",
        })
        await websocket.close(code=1011)
        return

    outgoing = asyncio.Queue()
    conversation_detection = ConversationDetectionAccumulator()
    # Spoken safety warnings require explicit consent.
    # Consent belongs to this WebSocket connection only.
    warning_consent_enabled = False
    warning_attempted = False
    warning_already_sent = False
    warning_in_progress = False
    active_warning_id = None
    warning_playback_status = None
    stop_requested = asyncio.Event()
    transcript_received_after_stop = asyncio.Event()
    provider_error = asyncio.Event()

    client = None

    writer_task = None
    event_task = None
    failure_task = None
    stop_disconnect_task = None
    receive_task = None

    async def send_outgoing_messages():
        """Ensure only one task writes messages to the browser."""

        try:
            while True:
                item = await outgoing.get()

                if item is None:
                    return

                payload, acknowledgement = item

                try:
                    if isinstance(payload, bytes):
                        await websocket.send_bytes(payload)
                    else:
                        await websocket.send_json(payload)
                except BaseException as exc:
                    if (
                        acknowledgement is not None
                        and not acknowledgement.done()
                    ):
                        if isinstance(exc, asyncio.CancelledError):
                            acknowledgement.set_exception(
                                RuntimeError("WebSocket writer was cancelled.")
                            )
                        else:
                            acknowledgement.set_exception(exc)
                    raise
                else:
                    if (
                        acknowledgement is not None
                        and not acknowledgement.done()
                    ):
                        acknowledgement.set_result(None)

        finally:
            # Release callers waiting for messages still in the queue.
            while True:
                try:
                    item = outgoing.get_nowait()
                except asyncio.QueueEmpty:
                    break

                if item is None:
                    continue

                _, acknowledgement = item

                if (
                    acknowledgement is not None
                    and not acknowledgement.done()
                ):
                    acknowledgement.set_exception(
                        RuntimeError("WebSocket writer stopped.")
                    )

    async def enqueue_message(payload, wait_until_sent=False):
        """Queue a JSON or binary message for the WebSocket writer."""

        if writer_task is None or writer_task.done():
            return False

        acknowledgement = (
            asyncio.get_running_loop().create_future()
            if wait_until_sent
            else None
        )

        await outgoing.put((payload, acknowledgement))

        if acknowledgement is not None:
            done, _ = await asyncio.wait(
                {acknowledgement, writer_task},
                return_when=asyncio.FIRST_COMPLETED,
            )

            if acknowledgement not in done:
                return False

            try:
                acknowledgement.result()
            except BaseException:
                return False

        return not writer_task.done() if acknowledgement is None else True

    async def forward_provider_events():
        """Forward provider events and detect provider errors."""

        nonlocal warning_attempted, warning_already_sent, warning_in_progress
        nonlocal active_warning_id, warning_playback_status

        async for event in client.events():
            payload = serialize_provider_event(event)

            if payload["type"] == "transcript":
                segment = build_stream_segment(payload)

                if segment is not None:
                    payload["detection"] = detect_segments(
                        [segment]
                    ).model_dump(mode="json")

                    cumulative_result = (
                        conversation_detection
                        .add_segment(segment)
                    )
                    payload["conversation_detection"] = (
                        cumulative_result.model_dump(mode="json")
                    )
                else:
                    payload["detection"] = detect_segments(
                        []
                    ).model_dump(mode="json")

                    cumulative_result = (
                        conversation_detection
                        .get_result()
                    )
                    payload["conversation_detection"] = (
                        cumulative_result.model_dump(mode="json")
                    )

                # Evaluate the warning policy against cumulative evidence.
                decision = evaluate_warning_policy(
                    cumulative_result,
                    consent_enabled=warning_consent_enabled,
                    warning_already_sent=warning_already_sent,
                )

                payload["warning_decision"] = {
                    "level": decision.level.value,
                    "should_speak": decision.should_speak,
                    "reason_codes": list(decision.reason_codes),
                    "matched_rule_ids": list(decision.matched_rule_ids),
                    "distinct_stages": list(decision.distinct_stages),
                }

            if payload["type"] == "error":
                await enqueue_message(payload, wait_until_sent=True)
                provider_error.set()
                return

            await enqueue_message(payload)

            # Trigger automatic spoken warning after the transcript
            # event has been sent to the browser.
            if (
                payload["type"] == "transcript"
                and decision.should_speak
                and not warning_attempted
                and not warning_in_progress
            ):
                warning_attempted = True
                warning_in_progress = True

                try:
                    api_key = settings.gnani_api_key

                    if not api_key or not api_key.strip():
                        logger.warning(
                            "Cannot synthesize warning: API key not configured."
                        )
                        await enqueue_message({
                            "type": "warning_synthesis_error",
                            "message": (
                                "Could not generate a spoken safety warning. "
                                "Speech synthesis is not configured."
                            ),
                        })
                        continue

                    audio_bytes = await run_in_threadpool(
                        synthesize_digital_arrest_warning,
                        api_key,
                    )

                    try:
                        audio_len, duration = validate_synthesized_wav(
                            audio_bytes
                        )
                    except ValueError as val_err:
                        logger.warning(
                            "Synthesized WAV validation failed: %s", val_err
                        )
                        await enqueue_message({
                            "type": "warning_synthesis_error",
                            "message": (
                                "Could not generate a spoken safety warning. "
                                "Invalid audio format received from synthesis."
                            ),
                        })
                        continue

                    # Transmit JSON metadata first and wait for successful delivery.
                    warning_id = uuid4().hex
                    active_warning_id = warning_id
                    warning_playback_status = "metadata_sent"
                    meta_sent = await enqueue_message(
                        {
                            "type": "safety_warning",
                            "warning_id": warning_id,
                            "level": decision.level.value,
                            "reason_codes": list(decision.reason_codes),
                            "matched_rule_ids": list(decision.matched_rule_ids),
                            "distinct_stages": list(decision.distinct_stages),
                            "audio_format": "wav",
                            "audio_bytes": audio_len,
                            "audio_duration_seconds": duration,
                            "message": (
                                "Kavach has detected multiple scam indicators "
                                "in this conversation. A safety warning has "
                                "been generated."
                            ),
                        },
                        wait_until_sent=True,
                    )

                    if not meta_sent:
                        active_warning_id = None
                        warning_playback_status = None
                        logger.warning(
                            "Failed to deliver safety_warning metadata to client."
                        )
                        continue

                    # Deliver the actual WAV audio as a binary frame and wait for delivery.
                    if warning_playback_status == "metadata_sent":
                        warning_playback_status = "transmitted"
                    binary_sent = await enqueue_message(
                        audio_bytes,
                        wait_until_sent=True,
                    )

                    if not binary_sent:
                        active_warning_id = None
                        warning_playback_status = None
                        logger.warning(
                            "Failed to deliver safety_warning binary audio to client."
                        )
                        continue

                    warning_already_sent = True

                except TTSServiceError as exc:
                    logger.warning(
                        "Warning synthesis failed: %s", exc
                    )
                    await enqueue_message({
                        "type": "warning_synthesis_error",
                        "message": (
                            "Could not generate a spoken safety warning. "
                            "The speech synthesis service reported an error."
                        ),
                    })

                except Exception:
                    logger.exception(
                        "Unexpected error during warning synthesis."
                    )
                    await enqueue_message({
                        "type": "warning_synthesis_error",
                        "message": (
                            "Could not generate a spoken safety warning."
                        ),
                    })

                finally:
                    warning_in_progress = False

            if (
                payload["type"] == "transcript"
                and stop_requested.is_set()
            ):
                transcript_received_after_stop.set()

    async def monitor_session():
        """Detect provider, event-stream and writer failures."""

        provider_error_task = asyncio.create_task(provider_error.wait())

        try:
            done, _ = await asyncio.wait(
                {provider_error_task, event_task, writer_task},
                return_when=asyncio.FIRST_COMPLETED,
            )

            if provider_error_task in done and provider_error.is_set():
                return "provider_error"

            if writer_task in done:
                return "writer_failure"

            if event_task in done:
                return "provider_stream_ended"

            return "session_failure"

        finally:
            if not provider_error_task.done():
                provider_error_task.cancel()

            await asyncio.gather(
                provider_error_task,
                return_exceptions=True,
            )

    async def monitor_browser_disconnect():
        """Watch for browser disconnection after Stop is requested."""

        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                return "browser_disconnected"

    async def run_while_healthy(awaitable):
        """Run an operation while monitoring session failures."""

        operation_task = asyncio.create_task(awaitable)

        try:
            watched_tasks = {operation_task, failure_task}

            if stop_disconnect_task is not None:
                watched_tasks.add(stop_disconnect_task)

            done, _ = await asyncio.wait(
                watched_tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )

            if (
                stop_disconnect_task is not None
                and stop_disconnect_task in done
            ):
                raise SessionFailure("browser_disconnected")

            if failure_task in done:
                raise SessionFailure(failure_task.result())

            return operation_task.result()

        finally:
            if not operation_task.done():
                operation_task.cancel()

            await asyncio.gather(
                operation_task,
                return_exceptions=True,
            )

    async def close_browser_connection(code: int):
        try:
            await websocket.close(code=code)
        except Exception:
            pass

    async def cleanup():
        """Stop background tasks and release provider resources."""

        tasks = [
            task
            for task in (
                receive_task,
                stop_disconnect_task,
                failure_task,
                event_task,
            )
            if task is not None
        ]

        for task in tasks:
            if not task.done():
                task.cancel()

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        if client is not None:
            try:
                await asyncio.wait_for(
                    client.close(),
                    timeout=CLEANUP_TIMEOUT_SECONDS,
                )
            except Exception:
                pass

        if writer_task is not None and not writer_task.done():
            await outgoing.put(None)

            try:
                await asyncio.wait_for(
                    writer_task,
                    timeout=CLEANUP_TIMEOUT_SECONDS,
                )
            except Exception:
                writer_task.cancel()
                await asyncio.gather(
                    writer_task,
                    return_exceptions=True,
                )

        elif writer_task is not None:
            await asyncio.gather(
                writer_task,
                return_exceptions=True,
            )

    writer_task = asyncio.create_task(send_outgoing_messages())

    try:
        client = GnaniSTTStreamClient(
            api_key=settings.gnani_api_key.strip(),
            language_code=settings.gnani_stt_language,
            model="prisma-v2.5",
            sample_rate=SAMPLE_RATE,
        )

        # Establish the upstream connection with a timeout.
        await asyncio.wait_for(
            client.connect(),
            timeout=CONNECT_TIMEOUT_SECONDS,
        )

        ready_sent = await enqueue_message(
            {
                "type": "ready",
                "message": "Connected to Kavach streaming transcription.",
                "language": settings.gnani_stt_language,
                "model": "prisma-v2.5",
                "sample_rate": SAMPLE_RATE,
                "channels": 1,
                "encoding": "pcm_s16le",
                "frame_bytes": FRAME_BYTES,
                "warning_consent_enabled": False,
                "warning_consent_scope": "session",
            },
            wait_until_sent=True,
        )
        if not ready_sent:
            raise SessionFailure("writer_failure")

        event_task = asyncio.create_task(forward_provider_events())
        failure_task = asyncio.create_task(monitor_session())

        while True:
            receive_task = asyncio.create_task(websocket.receive())

            done, _ = await asyncio.wait(
                {receive_task, failure_task},
                return_when=asyncio.FIRST_COMPLETED,
            )

            if failure_task in done:
                receive_task.cancel()
                await asyncio.gather(
                    receive_task,
                    return_exceptions=True,
                )
                receive_task = None

                failure_reason = failure_task.result()

                if failure_reason == "provider_error":
                    await close_browser_connection(1011)
                    break

                if failure_reason == "provider_stream_ended":
                    await enqueue_message(
                        {
                            "type": "error",
                            "message": (
                                "The speech provider streaming connection ended."
                            ),
                        },
                        wait_until_sent=True,
                    )

                await close_browser_connection(1011)
                break

            message = receive_task.result()
            receive_task = None

            if message["type"] == "websocket.disconnect":
                break

            audio_chunk = message.get("bytes")

            if audio_chunk is not None:
                if len(audio_chunk) != FRAME_BYTES:
                    await enqueue_message(
                        {
                            "type": "error",
                            "message": (
                                "Invalid audio frame. Expected exactly "
                                "1024 bytes of 16 kHz mono PCM audio."
                            ),
                        },
                        wait_until_sent=True,
                    )

                    await close_browser_connection(1003)
                    break

                await run_while_healthy(
                    asyncio.wait_for(
                        client.send_audio(audio_chunk),
                        timeout=SEND_AUDIO_TIMEOUT_SECONDS,
                    )
                )
                continue

            text_message = message.get("text")

            if text_message is None:
                continue

            try:
                command = json.loads(text_message)
            except json.JSONDecodeError:
                await enqueue_message({
                    "type": "error",
                    "message": "Invalid control message. Expected JSON.",
                })
                continue

            if not isinstance(command, dict):
                await enqueue_message({
                    "type": "error",
                    "message": "Invalid control command. Expected a JSON object.",
                })
                continue

            if command.get("type") == "warning_playback":
                warning_id = command.get("warning_id")
                status = command.get("status")

                if (
                    not isinstance(warning_id, str)
                    or not isinstance(status, str)
                    or status not in WARNING_PLAYBACK_STATUSES
                ):
                    await enqueue_message({
                        "type": "warning_playback_status_error",
                        "message": (
                            "Invalid warning playback status. A warning ID and "
                            "supported lifecycle status are required."
                        ),
                    })
                    continue

                if warning_id != active_warning_id:
                    await enqueue_message({
                        "type": "warning_playback_status_error",
                        "message": "The warning is not active in this session.",
                    })
                    continue

                allowed_statuses = WARNING_PLAYBACK_TRANSITIONS.get(
                    warning_playback_status,
                    set(),
                )
                if status not in allowed_statuses:
                    await enqueue_message({
                        "type": "warning_playback_status_error",
                        "message": "Invalid warning playback lifecycle transition.",
                    })
                    continue

                warning_playback_status = status
                logger.info(
                    "Client reported warning playback status: %s",
                    status,
                )
                await enqueue_message({
                    "type": "warning_playback_status_updated",
                    "warning_id": warning_id,
                    "status": status,
                    "message": "Warning playback status received.",
                })
                continue

            # Handle explicit consent for automatic spoken safety warnings.
            if command.get("type") == "warning_consent":
                granted = command.get("granted")
                # Strict boolean validation:
                # True and False are accepted.
                # Strings, integers, null and missing values are rejected.
                if type(granted) is not bool:
                    await enqueue_message({
                        "type": "warning_consent_error",
                        "message": (
                            "Invalid consent value. The 'granted' field "
                            "must be a boolean."
                        ),
                        "enabled": warning_consent_enabled,
                        "scope": "session",
                    })
                    continue

                # Update consent only after successful validation.
                warning_consent_enabled = granted
                await enqueue_message({
                    "type": "warning_consent_updated",
                    "enabled": warning_consent_enabled,
                    "scope": "session",
                    "message": (
                        "Automatic spoken safety warnings enabled."
                        if warning_consent_enabled
                        else "Automatic spoken safety warnings disabled."
                    ),
                })
                continue

            if command.get("type") != "stop":
                await enqueue_message({
                    "type": "error",
                    "message": "Unsupported control command.",
                })
                continue

            stop_requested.set()

            # The main receive loop stops here. A separate task watches
            # for browser disconnection during the Stop operation.
            stop_disconnect_task = asyncio.create_task(
                monitor_browser_disconnect()
            )

            silence_frame = bytes(FRAME_BYTES)

            # Send 32 paced silence frames to help the provider detect
            # the end of speech.
            for _ in range(SILENCE_FRAMES_ON_STOP):
                await run_while_healthy(
                    asyncio.wait_for(
                        client.send_audio(silence_frame),
                        timeout=SEND_AUDIO_TIMEOUT_SECONDS,
                    )
                )

                await run_while_healthy(
                    asyncio.sleep(FRAME_DURATION_SECONDS)
                )

            try:
                await run_while_healthy(
                    asyncio.wait_for(
                        transcript_received_after_stop.wait(),
                        timeout=FINAL_TRANSCRIPT_TIMEOUT_SECONDS,
                    )
                )
            except asyncio.TimeoutError:
                pass

            await enqueue_message(
                {
                    "type": "stopped",
                    "transcript_received_after_stop_command": (
                        transcript_received_after_stop.is_set()
                    ),
                },
                wait_until_sent=True,
            )

            break

    except WebSocketDisconnect:
        pass

    except SessionFailure as exc:
        failure_reason = str(exc)

        if failure_reason == "provider_stream_ended":
            await enqueue_message(
                {
                    "type": "error",
                    "message": (
                        "The speech provider streaming connection ended."
                    ),
                },
                wait_until_sent=True,
            )

        elif failure_reason not in {
            "provider_error",
            "writer_failure",
            "browser_disconnected",
        }:
            await enqueue_message(
                {
                    "type": "error",
                    "message": "The streaming transcription session failed.",
                },
                wait_until_sent=True,
            )

        if failure_reason != "browser_disconnected":
            await close_browser_connection(1011)

    except Exception:
        # Do not expose credentials, raw audio or provider internals.
        await enqueue_message(
            {
                "type": "error",
                "message": "The streaming transcription session failed.",
            },
            wait_until_sent=True,
        )

        await close_browser_connection(1011)

    finally:
        await cleanup()
