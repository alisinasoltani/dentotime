import hashlib
import uuid
from datetime import timedelta

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import DoctorDocument
from core.models import FileAsset, ONE_GIB, UploadSession
from messaging.models import MessageAttachment, MessageThread


def available_asset(*, owner, purpose, thread=None, doctor=None, name="scan.stl"):
    content = b"trusted test bytes"
    digest = hashlib.sha256(content).hexdigest()
    return FileAsset.objects.create(
        owner=owner,
        purpose=purpose,
        scope_thread=thread,
        scope_doctor=doctor,
        original_name=name,
        expected_size=len(content),
        actual_size=len(content),
        claimed_mime="application/octet-stream",
        detected_mime="application/octet-stream",
        sha256=digest,
        verified_sha256=digest,
        storage_key=f"test/{uuid.uuid4()}",
        state=FileAsset.State.AVAILABLE,
        scan_status=FileAsset.ScanStatus.CLEAN,
        completed_at=timezone.now(),
        scanned_at=timezone.now(),
    )


def verification_payload(asset_ids):
    return {
        "first_name": "Secure",
        "last_name": "Doctor",
        "account_owner": "DOCTOR",
        "agreed_to_terms": True,
        "id_number": "0011223344",
        "medical_registration_number": "MED-123",
        "asset_ids": [str(asset_id) for asset_id in asset_ids],
    }


@pytest.mark.django_db
def test_arbitrary_attachment_metadata_is_rejected(doctor_client, doctor_user):
    doctor_user.verification_status = doctor_user.VerificationStatus.APPROVED
    doctor_user.save(update_fields=("verification_status",))
    thread = MessageThread.objects.create(
        participant=doctor_user,
        thread_type=MessageThread.ThreadType.DOCTOR_ADMIN,
    )

    response = doctor_client.post(
        f"/api/v1/chat/threads/{thread.pk}/messages/",
        {
            "body": "unsafe",
            "attachments": [
                {
                    "file_url": "https://attacker.example/scan.stl",
                    "file_key": "another/users/object",
                }
            ],
        },
        format="json",
    )

    assert response.status_code == 400
    assert "asset_ids" in response.data


@pytest.mark.django_db
def test_chat_binding_requires_owner_purpose_scope_and_safe_state(
    doctor_client, doctor_user, admin_user, monkeypatch
):
    monkeypatch.setattr("messaging.views.send_new_message", lambda *args, **kwargs: None)
    doctor_user.verification_status = doctor_user.VerificationStatus.APPROVED
    doctor_user.save(update_fields=("verification_status",))
    thread = MessageThread.objects.create(
        participant=doctor_user,
        thread_type=MessageThread.ThreadType.DOCTOR_ADMIN,
    )
    other_thread = MessageThread.objects.create(
        participant=admin_user,
        thread_type=MessageThread.ThreadType.DOCTOR_ADMIN,
    )
    cases = [
        available_asset(
            owner=admin_user,
            purpose=FileAsset.Purpose.CHAT_ATTACHMENT,
            thread=thread,
        ),
        available_asset(
            owner=doctor_user,
            purpose=FileAsset.Purpose.CHAT_ATTACHMENT,
            thread=other_thread,
        ),
        available_asset(
            owner=doctor_user,
            purpose=FileAsset.Purpose.VERIFICATION_DOCUMENT,
            doctor=doctor_user,
        ),
    ]
    expired = available_asset(
        owner=doctor_user,
        purpose=FileAsset.Purpose.CHAT_ATTACHMENT,
        thread=thread,
    )
    expired.expires_at = timezone.now() - timedelta(seconds=1)
    expired.save(update_fields=("expires_at",))
    cases.append(expired)

    for asset in cases:
        response = doctor_client.post(
            f"/api/v1/chat/threads/{thread.pk}/messages/",
            {"body": "blocked", "asset_ids": [str(asset.pk)]},
            format="json",
        )
        assert response.status_code == 400, response.data

    unsafe = available_asset(
        owner=doctor_user,
        purpose=FileAsset.Purpose.CHAT_ATTACHMENT,
        thread=thread,
    )
    unsafe.state = FileAsset.State.QUARANTINED
    unsafe.scan_status = FileAsset.ScanStatus.PENDING
    unsafe.verified_sha256 = ""
    unsafe.save(update_fields=("state", "scan_status", "verified_sha256"))
    response = doctor_client.post(
        f"/api/v1/chat/threads/{thread.pk}/messages/",
        {"body": "blocked", "asset_ids": [str(unsafe.pk)]},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_completed_asset_binds_once_without_exposing_storage_key(
    doctor_client, doctor_user, monkeypatch
):
    monkeypatch.setattr("messaging.views.send_new_message", lambda *args, **kwargs: None)
    doctor_user.verification_status = doctor_user.VerificationStatus.APPROVED
    doctor_user.save(update_fields=("verification_status",))
    thread = MessageThread.objects.create(
        participant=doctor_user,
        thread_type=MessageThread.ThreadType.DOCTOR_ADMIN,
    )
    asset = available_asset(
        owner=doctor_user,
        purpose=FileAsset.Purpose.CHAT_ATTACHMENT,
        thread=thread,
    )
    payload = {"body": "scan", "asset_ids": [str(asset.pk)]}

    created = doctor_client.post(
        f"/api/v1/chat/threads/{thread.pk}/messages/", payload, format="json"
    )
    repeated = doctor_client.post(
        f"/api/v1/chat/threads/{thread.pk}/messages/", payload, format="json"
    )

    assert created.status_code == 201, created.data
    assert created.data["attachments"][0]["asset_id"] == str(asset.pk)
    assert "file_url" not in created.data["attachments"][0]
    assert "file_key" not in created.data["attachments"][0]
    assert repeated.status_code == 400
    assert MessageAttachment.objects.filter(asset=asset).count() == 1


@pytest.mark.django_db
def test_verification_accepts_only_owned_scoped_verification_assets(
    doctor_client, doctor_user, admin_user
):
    good = available_asset(
        owner=doctor_user,
        purpose=FileAsset.Purpose.VERIFICATION_DOCUMENT,
        doctor=doctor_user,
        name="identity.pdf",
    )
    wrong_owner = available_asset(
        owner=admin_user,
        purpose=FileAsset.Purpose.VERIFICATION_DOCUMENT,
        doctor=doctor_user,
        name="other.pdf",
    )
    unsafe_payload = verification_payload([good.pk])
    unsafe_payload["documents"] = [{"file_url": "https://attacker.example/id.pdf"}]

    assert doctor_client.post(
        "/api/v1/doctors/verification/submit/", unsafe_payload, format="json"
    ).status_code == 400
    assert doctor_client.post(
        "/api/v1/doctors/verification/submit/",
        verification_payload([wrong_owner.pk]),
        format="json",
    ).status_code == 400

    accepted = doctor_client.post(
        "/api/v1/doctors/verification/submit/",
        verification_payload([good.pk]),
        format="json",
    )
    assert accepted.status_code == 200, accepted.data
    assert DoctorDocument.objects.filter(doctor=doctor_user, asset=good).count() == 1


@pytest.mark.django_db(transaction=True)
def test_database_constraints_reject_invalid_asset_and_upload_session(
    doctor_user, admin_user
):
    digest = hashlib.sha256(b"x").hexdigest()
    with pytest.raises(IntegrityError), transaction.atomic():
        FileAsset.objects.create(
            owner=doctor_user,
            purpose=FileAsset.Purpose.VERIFICATION_DOCUMENT,
            original_name="id.pdf",
            expected_size=1,
            actual_size=1,
            claimed_mime="application/pdf",
            sha256=digest,
            verified_sha256=digest,
            storage_key=f"test/{uuid.uuid4()}",
            state=FileAsset.State.AVAILABLE,
            scan_status=FileAsset.ScanStatus.CLEAN,
        )

    with pytest.raises(IntegrityError), transaction.atomic():
        FileAsset.objects.create(
            owner=doctor_user,
            purpose=FileAsset.Purpose.VERIFICATION_DOCUMENT,
            scope_doctor=doctor_user,
            original_name="id.pdf",
            expected_size=1,
            claimed_mime="application/pdf",
            sha256=digest,
            storage_key=f"test/{uuid.uuid4()}",
            state="NOT_A_STATE",
        )

    asset = available_asset(
        owner=doctor_user,
        purpose=FileAsset.Purpose.VERIFICATION_DOCUMENT,
        doctor=doctor_user,
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        UploadSession.objects.create(
            asset=asset,
            owner=admin_user,
            part_size=1024,
            expected_part_count=1,
            expires_at=timezone.now() + timedelta(hours=1),
        )


@pytest.mark.django_db
def test_model_validation_rejects_cross_owner_verification_scope(doctor_user, admin_user):
    asset = FileAsset(
        owner=admin_user,
        purpose=FileAsset.Purpose.VERIFICATION_DOCUMENT,
        scope_doctor=doctor_user,
        original_name="id.pdf",
        expected_size=1,
        claimed_mime="application/pdf",
        sha256=hashlib.sha256(b"x").hexdigest(),
        storage_key=f"test/{uuid.uuid4()}",
    )
    with pytest.raises(ValidationError):
        asset.full_clean()

    persisted_asset = available_asset(
        owner=doctor_user,
        purpose=FileAsset.Purpose.VERIFICATION_DOCUMENT,
        doctor=doctor_user,
    )
    session = UploadSession(
        asset=persisted_asset,
        owner=admin_user,
        part_size=8 * 1024 * 1024,
        expected_part_count=1,
        expires_at=timezone.now() + timedelta(hours=1),
    )
    with pytest.raises(ValidationError):
        session.full_clean()


@pytest.mark.django_db
def test_asset_size_constraint_rejects_more_than_one_gib(doctor_user):
    with pytest.raises(IntegrityError), transaction.atomic():
        FileAsset.objects.create(
            owner=doctor_user,
            purpose=FileAsset.Purpose.VERIFICATION_DOCUMENT,
            scope_doctor=doctor_user,
            original_name="too-large.bin",
            expected_size=ONE_GIB + 1,
            claimed_mime="application/octet-stream",
            sha256=hashlib.sha256(b"x").hexdigest(),
            storage_key=f"test/{uuid.uuid4()}",
        )


@pytest.mark.django_db
def test_verification_document_serialization_has_no_n_plus_one_queries(
    doctor_client, doctor_user, django_assert_max_num_queries
):
    for index in range(6):
        asset = available_asset(
            owner=doctor_user,
            purpose=FileAsset.Purpose.VERIFICATION_DOCUMENT,
            doctor=doctor_user,
            name=f"identity-{index}.pdf",
        )
        DoctorDocument.objects.create(doctor=doctor_user, asset=asset)

    with django_assert_max_num_queries(2):
        response = doctor_client.get("/api/v1/doctors/verification/")

    assert response.status_code == 200
    assert len(response.data["documents"]) == 6


@pytest.mark.django_db
def test_legacy_single_request_upload_is_gone(doctor_client):
    response = doctor_client.post(
        "/api/v1/files/upload/",
        {"purpose": "verification_document"},
        format="json",
    )
    assert response.status_code == 410
