import json
import time
from datetime import timedelta

import pytest
from asgiref.sync import async_to_sync
from django.test import AsyncClient
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from accounts.models import Doctor, NormalUser, User
from messaging.models import Message, MessageThread
from messaging.realtime import (
    chat_stream_key,
    publish_message_event,
    stream_thread_events,
)


def token_for(user) -> str:
    refresh = RefreshToken.for_user(user)
    refresh["auth_version"] = user.auth_version
    return str(refresh.access_token)


def create_thread(participant):
    return MessageThread.objects.create(
        participant=participant,
        thread_type=(
            MessageThread.ThreadType.DOCTOR_ADMIN
            if participant.is_doctor_role
            else MessageThread.ThreadType.USER_ADMIN
        ),
    )


def create_message(thread, sender, body, *, visibility=Message.Visibility.PARTICIPANTS):
    return Message.objects.create(
        thread=thread,
        sender=sender,
        sender_type=sender.role,
        sender_first_name=sender.first_name,
        sender_last_name=sender.last_name,
        body=body,
        visibility=visibility,
    )


@pytest.mark.django_db
def test_delta_endpoint_returns_only_new_authorized_messages(
    normal_user, admin_user, settings
):
    settings.CHAT_DELTA_PAGE_SIZE = 2
    thread = create_thread(normal_user)
    first = create_message(thread, normal_user, "first")
    create_message(thread, admin_user, "internal", visibility=Message.Visibility.ADMINS_ONLY)
    second = create_message(thread, admin_user, "second")
    third = create_message(thread, normal_user, "third")
    client = APIClient()
    client.force_authenticate(normal_user)

    page_one = client.get(
        f"/api/v1/chat/threads/{thread.pk}/messages/delta/?after={first.pk}&limit=999"
    )
    page_two = client.get(
        f"/api/v1/chat/threads/{thread.pk}/messages/delta/?after={page_one.data['cursor']}"
    )

    assert page_one.status_code == 200
    assert [row["id"] for row in page_one.data["results"]] == [
        str(second.pk),
        str(third.pk),
    ]
    assert page_one.data["has_more"] is False
    assert page_two.data == {
        "cursor": str(third.pk),
        "has_more": False,
        "results": [],
    }


@pytest.mark.django_db
def test_delta_cursor_and_thread_ownership_are_enforced(normal_user):
    other = NormalUser.objects.create_user(
        phone_number="+14155550991",
        password="SafePass123!",
        role=User.Role.USER,
    )
    own_thread = create_thread(normal_user)
    other_thread = create_thread(other)
    own_message = create_message(own_thread, normal_user, "own")
    other_message = create_message(other_thread, other, "other")
    client = APIClient()
    client.force_authenticate(normal_user)

    assert (
        client.get(
            f"/api/v1/chat/threads/{other_thread.pk}/messages/delta/?after={other_message.pk}"
        ).status_code
        == 404
    )
    assert (
        client.get(
            f"/api/v1/chat/threads/{own_thread.pk}/messages/delta/?after={other_message.pk}"
        ).status_code
        == 404
    )
    assert (
        client.get(f"/api/v1/chat/threads/{own_thread.pk}/messages/delta/").status_code
        == 400
    )
    assert own_message.pk


def test_publish_appends_bounded_safe_payload(monkeypatch, settings):
    captured = {}

    class FakeRedis:
        def xadd(self, key, fields, **options):
            captured.update(key=key, fields=fields, options=options)
            return "100-1"

        def close(self):
            captured["closed"] = True

    monkeypatch.setattr(
        "messaging.realtime.redis.from_url", lambda *args, **kwargs: FakeRedis()
    )
    settings.REDIS_URL = "redis://test"
    settings.CHAT_EVENT_STREAM_MAX_LENGTH = 50
    message_data = {
        "id": "message-1",
        "visibility": "PARTICIPANTS",
        "body": "safe",
    }

    event_id = publish_message_event(thread_id="thread-1", message_data=message_data)

    assert event_id == "100-1"
    assert captured["key"] == chat_stream_key("thread-1")
    assert captured["options"] == {"maxlen": 50, "approximate": True}
    assert json.loads(captured["fields"]["payload"]) == message_data
    assert "phone" not in captured["fields"]["payload"]
    assert captured["closed"] is True


def test_stream_deduplicates_transport_scope_and_filters_internal_notes(
    monkeypatch, settings
):
    settings.REDIS_URL = "redis://test"
    settings.CHAT_SSE_BLOCK_MILLISECONDS = 10
    settings.CHAT_SSE_MAX_CONNECTION_SECONDS = 30
    internal = {
        "id": "internal",
        "visibility": "ADMINS_ONLY",
        "body": "secret",
    }
    visible = {
        "id": "visible",
        "visibility": "PARTICIPANTS",
        "body": "hello",
    }

    class FakeAsyncRedis:
        def __init__(self):
            self.returned = False
            self.closed = False

        async def xread(self, streams, **kwargs):
            if self.returned:
                return []
            self.returned = True
            key = next(iter(streams))
            return [
                (
                    key,
                    [
                        (
                            "1-0",
                            {
                                "visibility": "ADMINS_ONLY",
                                "payload": json.dumps(internal),
                            },
                        ),
                        (
                            "2-0",
                            {
                                "visibility": "PARTICIPANTS",
                                "payload": json.dumps(visible),
                            },
                        ),
                    ],
                )
            ]

        async def aclose(self):
            self.closed = True

    async def exercise():
        patient_redis = FakeAsyncRedis()
        monkeypatch.setattr(
            "messaging.realtime.async_redis.from_url",
            lambda *args, **kwargs: patient_redis,
        )
        patient_stream = stream_thread_events(
            thread_id="thread-1",
            user_is_admin=False,
            last_event_id=None,
            token_expires_at=int(time.time()) + 60,
        )
        assert await anext(patient_stream) == b"retry: 1000\n\n"
        patient_event = (await anext(patient_stream)).decode()
        assert "id: 2-0" in patient_event
        assert "hello" in patient_event
        assert "secret" not in patient_event
        await patient_stream.aclose()
        assert patient_redis.closed is True

        admin_redis = FakeAsyncRedis()
        monkeypatch.setattr(
            "messaging.realtime.async_redis.from_url",
            lambda *args, **kwargs: admin_redis,
        )
        admin_stream = stream_thread_events(
            thread_id="thread-1",
            user_is_admin=True,
            last_event_id="0-0",
            token_expires_at=int(time.time()) + 60,
        )
        await anext(admin_stream)
        assert "secret" in (await anext(admin_stream)).decode()
        await admin_stream.aclose()

    async_to_sync(exercise)()


def test_stream_closes_when_access_token_expires(monkeypatch, settings):
    settings.REDIS_URL = "redis://test"

    class FakeAsyncRedis:
        async def aclose(self):
            pass

    monkeypatch.setattr(
        "messaging.realtime.async_redis.from_url",
        lambda *args, **kwargs: FakeAsyncRedis(),
    )
    async def exercise():
        stream = stream_thread_events(
            thread_id="thread-1",
            user_is_admin=False,
            last_event_id=None,
            token_expires_at=int(time.time()) - 1,
        )
        await anext(stream)
        assert "event: reauthenticate" in (await anext(stream)).decode()
        with pytest.raises(StopAsyncIteration):
            await anext(stream)

    async_to_sync(exercise)()


@pytest.mark.django_db(transaction=True)
def test_sse_authentication_and_thread_authorization(normal_user, settings):
    settings.REDIS_URL = "redis://127.0.0.1:56379/1"
    own_thread = create_thread(normal_user)
    other = NormalUser.objects.create_user(
        phone_number="+14155550992", role=User.Role.USER
    )
    other_thread = create_thread(other)
    access_token = token_for(normal_user)

    async def exercise():
        client = AsyncClient()
        headers = {"Authorization": f"Bearer {access_token}"}
        own = await client.get(
            f"/api/v1/chat/threads/{own_thread.pk}/events/", headers=headers
        )
        forbidden = await client.get(
            f"/api/v1/chat/threads/{other_thread.pk}/events/", headers=headers
        )
        anonymous = await AsyncClient().get(
            f"/api/v1/chat/threads/{own_thread.pk}/events/"
        )

        assert own.status_code == 200, own.content
        assert own["Content-Type"].startswith("text/event-stream")
        assert forbidden.status_code == 404
        assert anonymous.status_code == 401
        await own.streaming_content.aclose()

    async_to_sync(exercise)()


@pytest.mark.django_db(transaction=True)
def test_expired_token_is_rejected_before_sse_connect(normal_user, settings):
    settings.REDIS_URL = "redis://127.0.0.1:56379/1"
    thread = create_thread(normal_user)
    token = AccessToken()
    token["user_id"] = str(normal_user.pk)
    token["auth_version"] = normal_user.auth_version
    token.set_exp(from_time=token.current_time, lifetime=timedelta(seconds=-1))

    async def exercise():
        client = AsyncClient()
        response = await client.get(
            f"/api/v1/chat/threads/{thread.pk}/events/",
            headers={"Authorization": f"Bearer {str(token)}"},
        )
        assert response.status_code == 401

    async_to_sync(exercise)()
