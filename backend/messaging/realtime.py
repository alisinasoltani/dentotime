"""Redis-backed, cursor-resumable chat event delivery."""

import json
import logging
import re
import time
from collections.abc import AsyncIterator, Mapping

import redis
import redis.asyncio as async_redis
from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder

from messaging.models import Message


logger = logging.getLogger(__name__)
REDIS_STREAM_ID = re.compile(r"\A(?:\$|\d+-\d+)\Z")


def chat_stream_key(thread_id) -> str:
    return f"{settings.CHAT_EVENT_STREAM_PREFIX}:{thread_id}"


def normalize_event_cursor(value: str | None) -> str:
    candidate = (value or "$").strip()
    return candidate if len(candidate) <= 64 and REDIS_STREAM_ID.fullmatch(candidate) else "$"


def publish_message_event(*, thread_id, message_data: Mapping) -> str | None:
    """Append a bounded event without allowing a Redis failure to undo a message."""
    if not settings.REDIS_URL:
        return None
    payload = json.dumps(dict(message_data), cls=DjangoJSONEncoder, ensure_ascii=False)
    try:
        client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=2,
        )
        try:
            return client.xadd(
                chat_stream_key(thread_id),
                {
                    "message_id": str(message_data["id"]),
                    "visibility": str(
                        message_data.get("visibility", Message.Visibility.PARTICIPANTS)
                    ),
                    "payload": payload,
                },
                maxlen=settings.CHAT_EVENT_STREAM_MAX_LENGTH,
                approximate=True,
            )
        finally:
            client.close()
    except redis.RedisError as exc:
        logger.warning(
            "Chat realtime publish failed for thread %s: %s",
            thread_id,
            type(exc).__name__,
        )
        return None


def encode_sse(*, event: str, data: Mapping, event_id: str | None = None) -> bytes:
    lines = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event}")
    encoded = json.dumps(dict(data), cls=DjangoJSONEncoder, ensure_ascii=False)
    for line in encoded.splitlines() or [""]:
        lines.append(f"data: {line}")
    return ("\n".join(lines) + "\n\n").encode("utf-8")


async def stream_thread_events(
    *,
    thread_id,
    user_is_admin: bool,
    last_event_id: str | None,
    token_expires_at: int,
) -> AsyncIterator[bytes]:
    """Yield new Redis Stream records until auth or connection lifetime expires."""
    cursor = normalize_event_cursor(last_event_id)
    stream_key = chat_stream_key(thread_id)
    started_at = time.monotonic()
    connection_deadline = started_at + settings.CHAT_SSE_MAX_CONNECTION_SECONDS
    client = async_redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=1,
        socket_timeout=None,
        health_check_interval=30,
    )
    yield b"retry: 1000\n\n"
    try:
        while True:
            now_epoch = time.time()
            if now_epoch >= token_expires_at or time.monotonic() >= connection_deadline:
                yield encode_sse(
                    event="reauthenticate",
                    data={"detail": "The event stream must reconnect."},
                )
                return
            remaining_ms = int(
                min(
                    settings.CHAT_SSE_BLOCK_MILLISECONDS,
                    max(1, (token_expires_at - now_epoch) * 1000),
                    max(1, (connection_deadline - time.monotonic()) * 1000),
                )
            )
            try:
                records = await client.xread(
                    {stream_key: cursor},
                    count=100,
                    block=remaining_ms,
                )
            except redis.RedisError as exc:
                logger.warning(
                    "Chat realtime stream failed for thread %s: %s",
                    thread_id,
                    type(exc).__name__,
                )
                yield encode_sse(
                    event="unavailable",
                    data={"detail": "Realtime delivery is temporarily unavailable."},
                )
                return
            if not records:
                yield b": keep-alive\n\n"
                continue
            for _key, entries in records:
                for event_id, fields in entries:
                    cursor = event_id
                    if (
                        fields.get("visibility") == Message.Visibility.ADMINS_ONLY
                        and not user_is_admin
                    ):
                        continue
                    try:
                        message = json.loads(fields["payload"])
                    except (KeyError, TypeError, json.JSONDecodeError):
                        logger.warning("Discarded malformed chat event %s", event_id)
                        continue
                    yield encode_sse(
                        event="message",
                        event_id=event_id,
                        data={"message": message},
                    )
    finally:
        await client.aclose()
