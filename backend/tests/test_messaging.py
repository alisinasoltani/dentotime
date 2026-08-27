import hashlib
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

import pytest
from django.db import IntegrityError, connections, transaction
from rest_framework.test import APIClient

from accounts.models import Doctor, NormalUser, User
from core.models import FileAsset
from messaging.models import (
    Message,
    MessageAttachment,
    MessageThread,
    ThreadReadState,
)


@pytest.fixture(autouse=True)
def disable_message_sms(monkeypatch):
    monkeypatch.setattr("messaging.views.queue_new_message", lambda *args, **kwargs: None)


def create_thread(participant):
    return MessageThread.objects.create(
        participant=participant,
        thread_type=(
            MessageThread.ThreadType.DOCTOR_ADMIN
            if participant.is_doctor_role
            else MessageThread.ThreadType.USER_ADMIN
        ),
    )


def create_message(thread, sender, body, **extra):
    return Message.objects.create(
        thread=thread,
        sender=sender,
        sender_type=sender.role,
        sender_first_name=sender.first_name,
        sender_last_name=sender.last_name,
        body=body,
        **extra,
    )


def response_path(url):
    parsed = urlsplit(url)
    return f"{parsed.path}?{parsed.query}" if parsed.query else parsed.path


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.django_db
def test_unverified_doctor_cannot_chat(doctor_client):
    response = doctor_client.post("/api/v1/chat/threads/get_or_create/")
    assert response.status_code == 403
    assert "chat privileges are disabled" in response.data["detail"]


@pytest.mark.django_db
def test_patient_can_send_and_receive_with_canonical_schema(
    normal_user, admin_user
):
    patient_client = client_for(normal_user)
    administrator_client = client_for(admin_user)
    thread = create_thread(normal_user)
    sent = patient_client.post(
        f"/api/v1/chat/threads/{thread.pk}/messages/",
        {"body": " patient message "},
        format="json",
    )
    received = administrator_client.post(
        f"/api/v1/chat/threads/{thread.pk}/messages/",
        {"body": "admin reply"},
        format="json",
    )
    history = patient_client.get(f"/api/v1/chat/threads/{thread.pk}/messages/")

    assert sent.status_code == 201
    assert sent.data["body"] == "patient message"
    assert received.status_code == 201
    assert history.status_code == 200
    assert [item["body"] for item in history.data["results"]] == [
        "admin reply",
        "patient message",
    ]
    assert set(history.data["results"][0]) == {
        "id",
        "thread",
        "sender",
        "sender_type",
        "body",
        "visibility",
        "is_internal_note",
        "created_at",
        "attachments",
    }
    assert history.data["results"][0]["sender"] == {
        "id": str(admin_user.pk),
        "role": "ADMIN",
        "first_name": admin_user.first_name,
        "last_name": admin_user.last_name,
    }
    assert "phone_number" not in history.data["results"][0]["sender"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    "body",
    ("", "   ", "x" * 4001),
)
def test_empty_whitespace_and_overlong_messages_are_rejected(
    authed_client, normal_user, body
):
    thread = create_thread(normal_user)
    response = authed_client.post(
        f"/api/v1/chat/threads/{thread.pk}/messages/",
        {"body": body},
        format="json",
    )
    assert response.status_code == 400
    assert Message.objects.count() == 0


@pytest.mark.django_db
def test_database_rejects_overlong_message(normal_user):
    thread = create_thread(normal_user)
    with pytest.raises(IntegrityError), transaction.atomic():
        create_message(thread, normal_user, "x" * 4001)


@pytest.mark.django_db
def test_patient_attachment_and_arbitrary_metadata_are_rejected(
    authed_client, normal_user
):
    thread = create_thread(normal_user)
    for payload in (
        {"body": "unsafe", "attachments": [{"file_url": "https://bad.example/x"}]},
        {"body": "unsafe", "asset_ids": ["00000000-0000-0000-0000-000000000001"]},
    ):
        response = authed_client.post(
            f"/api/v1/chat/threads/{thread.pk}/messages/", payload, format="json"
        )
        assert response.status_code == 400


@pytest.mark.django_db
def test_patient_cannot_delete_admin_thread(authed_client, normal_user):
    thread = create_thread(normal_user)
    response = authed_client.delete(f"/api/v1/admin/chat/threads/{thread.pk}/")
    assert response.status_code == 403
    assert MessageThread.objects.filter(pk=thread.pk, deleted_at__isnull=True).exists()


@pytest.mark.django_db
def test_other_patient_thread_is_consistently_hidden(
    authed_client, normal_user
):
    other = NormalUser.objects.create_user(
        phone_number="+14155550199", password="SafePass123!", role=User.Role.USER
    )
    thread = create_thread(other)
    assert (
        authed_client.get(f"/api/v1/chat/threads/{thread.pk}/messages/").status_code
        == 404
    )
    assert (
        authed_client.patch(f"/api/v1/chat/threads/{thread.pk}/read/").status_code
        == 404
    )


@pytest.mark.django_db
def test_each_admin_has_an_independent_read_cursor(
    normal_user, admin_user, admin_client
):
    admin_two = User.objects.create_user(
        phone_number="+14155550200", password="SafePass123!", role=User.Role.ADMIN
    )
    thread = create_thread(normal_user)
    create_message(thread, normal_user, "needs attention")

    admin_client.patch(f"/api/v1/chat/threads/{thread.pk}/read/")
    first_list = admin_client.get("/api/v1/chat/threads/")
    second_client = APIClient()
    second_client.force_authenticate(admin_two)
    second_list = second_client.get("/api/v1/chat/threads/")

    assert first_list.data["results"][0]["unread_count"] == 0
    assert second_list.data["results"][0]["unread_count"] == 1
    assert ThreadReadState.objects.filter(thread=thread).count() == 1


@pytest.mark.django_db
def test_patient_read_cursor_does_not_change_admin_receipts(
    normal_user, admin_user
):
    patient_client = client_for(normal_user)
    administrator_client = client_for(admin_user)
    thread = create_thread(normal_user)
    create_message(thread, admin_user, "for patient")
    create_message(thread, normal_user, "for admin")

    patient_client.patch(f"/api/v1/chat/threads/{thread.pk}/read/")
    patient_list = patient_client.get("/api/v1/chat/threads/")
    admin_list = administrator_client.get("/api/v1/chat/threads/")

    assert patient_list.data["results"][0]["unread_count"] == 0
    assert admin_list.data["results"][0]["unread_count"] == 1


@pytest.mark.django_db
def test_internal_notes_are_admin_only(
    normal_user, admin_user
):
    patient_client = client_for(normal_user)
    administrator_client = client_for(admin_user)
    thread = create_thread(normal_user)
    visible = administrator_client.post(
        f"/api/v1/chat/threads/{thread.pk}/messages/",
        {"body": "visible reply"},
        format="json",
    )
    internal = administrator_client.post(
        f"/api/v1/chat/threads/{thread.pk}/messages/",
        {"body": "private case note", "visibility": "ADMINS_ONLY"},
        format="json",
    )
    patient_history = patient_client.get(
        f"/api/v1/chat/threads/{thread.pk}/messages/"
    )
    admin_history = administrator_client.get(f"/api/v1/chat/threads/{thread.pk}/messages/")
    forbidden = patient_client.post(
        f"/api/v1/chat/threads/{thread.pk}/messages/",
        {"body": "pretend note", "visibility": "ADMINS_ONLY"},
        format="json",
    )

    assert visible.status_code == internal.status_code == 201
    assert [m["body"] for m in patient_history.data["results"]] == ["visible reply"]
    assert [m["body"] for m in admin_history.data["results"]] == [
        "private case note",
        "visible reply",
    ]
    assert admin_history.data["results"][0]["is_internal_note"] is True
    assert forbidden.status_code == 400


@pytest.mark.django_db
def test_internal_notes_never_appear_in_doctor_history(
    doctor_user, admin_user
):
    doctor_api = client_for(doctor_user)
    administrator_client = client_for(admin_user)
    doctor_user.verification_status = Doctor.VerificationStatus.APPROVED
    doctor_user.save(update_fields=("verification_status",))
    thread = create_thread(doctor_user)
    administrator_client.post(
        f"/api/v1/chat/threads/{thread.pk}/messages/",
        {"body": "doctor reply"},
        format="json",
    )
    administrator_client.post(
        f"/api/v1/chat/threads/{thread.pk}/messages/",
        {"body": "credential concern", "visibility": "ADMINS_ONLY"},
        format="json",
    )
    response = doctor_api.get(f"/api/v1/chat/threads/{thread.pk}/messages/")
    assert [message["body"] for message in response.data["results"]] == [
        "doctor reply"
    ]


@pytest.mark.django_db
def test_cursor_pages_have_no_duplicates_or_gaps(normal_user, authed_client):
    thread = create_thread(normal_user)
    created_ids = [
        str(create_message(thread, normal_user, f"message {index:03}").pk)
        for index in range(123)
    ]
    url = f"/api/v1/chat/threads/{thread.pk}/messages/"
    returned_ids = []
    page_sizes = []
    while url:
        response = authed_client.get(url)
        assert response.status_code == 200
        page_ids = [str(item["id"]) for item in response.data["results"]]
        page_sizes.append(len(page_ids))
        returned_ids.extend(page_ids)
        url = response_path(response.data["next"]) if response.data["next"] else None

    expected = list(
        Message.objects.filter(thread=thread)
        .order_by("-created_at", "-id")
        .values_list("id", flat=True)
    )
    assert page_sizes == [50, 50, 23]
    assert returned_ids == [str(pk) for pk in expected]
    assert set(returned_ids) == set(created_ids)
    assert len(returned_ids) == len(set(returned_ids))


@pytest.mark.django_db(transaction=True)
def test_simultaneous_sends_are_retained_in_deterministic_order(
    normal_user, monkeypatch
):
    monkeypatch.setattr("messaging.views.queue_new_message", lambda *args, **kwargs: None)
    thread = create_thread(normal_user)
    user_id = normal_user.pk

    def send(index):
        connections.close_all()
        user = User.objects.get(pk=user_id)
        client = APIClient()
        client.force_authenticate(user)
        response = client.post(
            f"/api/v1/chat/threads/{thread.pk}/messages/",
            {"body": f"parallel {index}"},
            format="json",
        )
        connections.close_all()
        return response.status_code

    with ThreadPoolExecutor(max_workers=6) as executor:
        statuses = list(executor.map(send, range(12)))

    ordered = list(
        Message.objects.filter(thread=thread)
        .order_by("-created_at", "-id")
        .values_list("body", flat=True)
    )
    assert statuses == [201] * 12
    assert len(ordered) == len(set(ordered)) == 12
    assert ordered == list(
        Message.objects.filter(thread=thread)
        .order_by("-created_at", "-id")
        .values_list("body", flat=True)
    )


@pytest.mark.django_db
def test_guest_message_uses_contact_snapshot_without_account_mutation(api_client):
    existing = NormalUser.objects.create_user(
        phone_number="+14155550201",
        password="SafePass123!",
        role=User.Role.USER,
        first_name="Existing",
        last_name="Patient",
    )
    before_count = User.objects.count()
    response = api_client.post(
        "/api/v1/chat/guest-message/",
        {
            "phone_number": existing.phone_number,
            "first_name": "Guest",
            "last_name": "Name",
            "body": "please contact me",
        },
        format="json",
    )
    existing.refresh_from_db()
    thread = MessageThread.objects.get(guest_phone=existing.phone_number)
    message = thread.messages.get()

    assert response.status_code == 201
    assert User.objects.count() == before_count
    assert (existing.first_name, existing.last_name) == ("Existing", "Patient")
    assert thread.participant_id is None
    assert (thread.guest_first_name, thread.guest_last_name) == ("Guest", "Name")
    assert message.sender_id is None
    assert message.sender_type == Message.SenderType.GUEST


@pytest.mark.django_db
def test_admin_soft_delete_preserves_messages_attachments_and_asset(
    admin_client, admin_user, doctor_user
):
    doctor_user.verification_status = Doctor.VerificationStatus.APPROVED
    doctor_user.save(update_fields=("verification_status",))
    thread = create_thread(doctor_user)
    message = create_message(thread, admin_user, "scan attached")
    content = b"solid scan\nendsolid scan\n"
    digest = hashlib.sha256(content).hexdigest()
    asset = FileAsset.objects.create(
        owner=admin_user,
        purpose=FileAsset.Purpose.CHAT_ATTACHMENT,
        scope_thread=thread,
        original_name="scan.stl",
        expected_size=len(content),
        actual_size=len(content),
        claimed_mime="model/stl",
        detected_mime="model/stl",
        sha256=digest,
        verified_sha256=digest,
        storage_key=f"tests/{digest}",
        state=FileAsset.State.AVAILABLE,
        scan_status=FileAsset.ScanStatus.CLEAN,
    )
    attachment = MessageAttachment.objects.create(
        message=message, asset=asset, is_3d_scan=True
    )

    first = admin_client.delete(f"/api/v1/admin/chat/threads/{thread.pk}/")
    second = admin_client.delete(f"/api/v1/admin/chat/threads/{thread.pk}/")
    thread.refresh_from_db()

    assert first.status_code == second.status_code == 204
    assert thread.deleted_at is not None
    assert thread.deleted_by_id == admin_user.pk
    assert thread.status == MessageThread.Status.ARCHIVED
    assert Message.objects.filter(pk=message.pk).exists()
    assert MessageAttachment.objects.filter(pk=attachment.pk).exists()
    assert FileAsset.objects.filter(pk=asset.pk).exists()


@pytest.mark.django_db
def test_thread_list_is_paginated_and_searches_server_side(admin_client):
    for index in range(25):
        patient = NormalUser.objects.create_user(
            phone_number=f"+1415556{index:04}",
            password="SafePass123!",
            role=User.Role.USER,
            first_name=f"Patient{index:02}",
        )
        create_thread(patient)
    first_page = admin_client.get("/api/v1/chat/threads/")
    searched = admin_client.get("/api/v1/chat/threads/?search=Patient17")
    assert first_page.data["count"] == 25
    assert len(first_page.data["results"]) == 20
    assert len(searched.data["results"]) == 1
    assert searched.data["results"][0]["participant"]["first_name"] == "Patient17"


@pytest.mark.django_db
def test_users_can_search_contacts_and_start_direct_conversations(
    authed_client, normal_user, doctor_user
):
    doctor_user.verification_status = Doctor.VerificationStatus.APPROVED
    doctor_user.save(update_fields=("verification_status",))

    contacts = authed_client.get("/api/v1/chat/contacts/?search=Doc&role=DOCTOR")
    assert contacts.status_code == 200
    assert contacts.data["can_pin"] is False
    assert [item["id"] for item in contacts.data["results"]] == [doctor_user.pk]

    created = authed_client.post(
        "/api/v1/chat/threads/direct/",
        {"contact_id": doctor_user.pk},
        format="json",
    )
    assert created.status_code == 201
    assert created.data["thread_type"] == MessageThread.ThreadType.DIRECT

    duplicate = authed_client.post(
        "/api/v1/chat/threads/direct/",
        {"contact_id": doctor_user.pk},
        format="json",
    )
    assert duplicate.status_code == 200
    assert duplicate.data["id"] == created.data["id"]


@pytest.mark.django_db
def test_admin_conversation_history_includes_direct_participants_and_messages(
    admin_client, admin_user, normal_user, doctor_user
):
    doctor_user.verification_status = Doctor.VerificationStatus.APPROVED
    doctor_user.save(update_fields=("verification_status",))
    thread = MessageThread.objects.create(
        direct_participant_one_id=min(normal_user.pk, doctor_user.pk),
        direct_participant_two_id=max(normal_user.pk, doctor_user.pk),
        thread_type=MessageThread.ThreadType.DIRECT,
    )
    create_message(thread, normal_user, "سلام پزشک")
    create_message(thread, doctor_user, "سلام، در خدمتم")

    listing = admin_client.get("/api/v1/admin/chat/history/?search=Doc")
    assert listing.status_code == 200
    row = next(item for item in listing.data["results"] if item["id"] == str(thread.pk))
    assert {item["role"] for item in row["participants"]} == {User.Role.USER, User.Role.DOCTOR}
    assert row["message_count"] == 2

    detail = admin_client.get(f"/api/v1/admin/chat/history/{thread.pk}/")
    assert detail.status_code == 200
    assert [item["body"] for item in detail.data["messages"]] == ["سلام پزشک", "سلام، در خدمتم"]
    assert {item["sender_type"] for item in detail.data["messages"]} == {"USER", "DOCTOR"}


@pytest.mark.django_db
def test_admin_conversation_history_is_admin_only(normal_user, api_client):
    api_client.force_authenticate(user=normal_user)
    response = api_client.get("/api/v1/admin/chat/history/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_message_history_query_count_is_constant(
    django_assert_num_queries, normal_user
):
    thread = create_thread(normal_user)
    for index in range(50):
        create_message(thread, normal_user, f"message {index}")
    client = client_for(normal_user)
    with django_assert_num_queries(3):
        response = client.get(f"/api/v1/chat/threads/{thread.pk}/messages/")
    assert response.status_code == 200
    assert len(response.data["results"]) == 50


@pytest.mark.django_db
def test_thread_inbox_query_count_is_constant(
    django_assert_num_queries, admin_user
):
    for index in range(10):
        patient = NormalUser.objects.create_user(
            phone_number=f"+1415557{index:04}",
            password="SafePass123!",
            role=User.Role.USER,
        )
        thread = create_thread(patient)
        create_message(thread, patient, f"inbox {index}")
    client = client_for(admin_user)
    with django_assert_num_queries(2):
        response = client.get("/api/v1/chat/threads/")
    assert response.status_code == 200
    assert response.data["count"] == 10
