
import asyncio
import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.config import Settings, get_settings
from gnani.stt import GnaniSTTStreamClient


router = APIRouter()

SAMPLE_RATE = 16000
FRAME_BYTES = 1024
FRAME_DURATION_SECONDS = 0.032
SILENCE_FRAMES_ON_STOP = 32

CONNECT_TIMEOUT_SECONDS = 10.0
SEND_AUDIO_TIMEOUT_SECONDS = 5.0
FINAL_TRANSCRIPT_TIMEOUT_SECONDS = 3.0
CLEANUP_TIMEOUT_SECONDS = 5.0


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

    async def enqueue_message(payload: dict, wait_until_sent=False):
        """Queue a message without leaving acknowledgement waiters hanging."""

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

        async for event in client.events():
            payload = serialize_provider_event(event)

            if payload["type"] == "error":
                await enqueue_message(payload, wait_until_sent=True)
                provider_error.set()
                return

            await enqueue_message(payload)

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

            if not isinstance(command, dict) or command.get("type") != "stop":
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
