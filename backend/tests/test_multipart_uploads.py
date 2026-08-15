import hashlib
import uuid
from datetime import timedelta

import pytest
from botocore.exceptions import ClientError
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import FileAsset, UploadSession
from core.object_storage import checksum_header, get_s3_client
from messaging.models import MessageThread


def configure_storage(settings):
    settings.AWS_ACCESS_KEY_ID = "testing"
    settings.AWS_SECRET_ACCESS_KEY = "testing"
    settings.AWS_STORAGE_BUCKET_NAME = "dentotime-upload-tests"
    settings.AWS_S3_ENDPOINT_URL = ""
    settings.AWS_S3_REGION_NAME = "us-east-1"
    settings.UPLOAD_PART_SIZE = 5 * 1024 * 1024
    settings.AWS_S3_PRESIGN_EXPIRY_SECONDS = 60
    get_s3_client().create_bucket(Bucket=settings.AWS_STORAGE_BUCKET_NAME)


def create_session(client, *, content, thread, client_upload_id=None, name="scan.stl"):
    response = client.post(
        "/api/v1/files/uploads/",
        {
            "client_upload_id": str(client_upload_id or uuid.uuid4()),
            "purpose": "chat_attachment",
            "thread_id": str(thread.pk),
            "file_name": name,
            "file_size": len(content),
            "file_content_type": "model/stl",
            "sha256": hashlib.sha256(content).hexdigest(),
        },
        format="json",
    )
    assert response.status_code in {200, 201}, response.data
    return response


def presign_and_upload(client, session_payload, part_number, content, *, record=True, etag=None):
    digest = hashlib.sha256(content).hexdigest()
    response = client.post(
        f"/api/v1/files/uploads/{session_payload['upload_id']}/parts/presign/",
        {"parts": [{"part_number": part_number, "checksum_sha256": digest}]},
        format="json",
    )
    assert response.status_code == 200, response.data
    session = UploadSession.objects.select_related("asset").get(pk=session_payload["upload_id"])
    uploaded = get_s3_client().upload_part(
        Bucket=session_payload["bucket"] if "bucket" in session_payload else "dentotime-upload-tests",
        Key=session.asset.storage_key,
        UploadId=session.provider_upload_id,
        PartNumber=part_number,
        Body=content,
        ChecksumSHA256=checksum_header(digest),
    )
    actual_etag = uploaded["ETag"]
    if record:
        recorded = client.post(
            f"/api/v1/files/uploads/{session.pk}/parts/record/",
            {
                "part_number": part_number,
                "size": len(content),
                "etag": etag or actual_etag,
                "checksum_sha256": digest,
            },
            format="json",
        )
        assert recorded.status_code == 200, recorded.data
    return actual_etag


@pytest.fixture
def approved_doctor_thread(doctor_user):
    doctor_user.verification_status = doctor_user.VerificationStatus.APPROVED
    doctor_user.save(update_fields=("verification_status",))
    return MessageThread.objects.create(
        participant=doctor_user,
        thread_type=MessageThread.ThreadType.DOCTOR_ADMIN,
    )


@pytest.mark.django_db
def test_one_byte_direct_multipart_upload_is_integral_and_idempotent(
    doctor_client, approved_doctor_thread, mock_s3, settings
):
    configure_storage(settings)
    content = b"x"
    created = create_session(doctor_client, content=content, thread=approved_doctor_thread)
    payload = created.data
    presign_and_upload(doctor_client, payload, 1, content)

    completed = doctor_client.post(
        f"/api/v1/files/uploads/{payload['upload_id']}/complete/", {}, format="json"
    )
    UploadSession.objects.filter(pk=payload["upload_id"]).update(
        state=UploadSession.State.COMPLETING,
        completed_at=None,
    )
    repeated = doctor_client.post(
        f"/api/v1/files/uploads/{payload['upload_id']}/complete/", {}, format="json"
    )

    assert completed.status_code == 200, completed.data
    assert repeated.status_code == 200, repeated.data
    assert completed.data["asset_id"] == repeated.data["asset_id"]
    assert completed.data["asset_state"] == FileAsset.State.QUARANTINED
    session = UploadSession.objects.select_related("asset").get(pk=payload["upload_id"])
    stored = get_s3_client().get_object(
        Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=session.asset.storage_key
    )["Body"].read()
    assert hashlib.sha256(stored).hexdigest() == hashlib.sha256(content).hexdigest()


@pytest.mark.django_db
def test_status_reconciles_storage_and_resumes_only_missing_parts(
    doctor_client, approved_doctor_thread, mock_s3, settings
):
    configure_storage(settings)
    part_size = settings.UPLOAD_PART_SIZE
    content = b"a" * part_size + b"tail"
    created = create_session(doctor_client, content=content, thread=approved_doctor_thread)
    payload = created.data
    first = content[:part_size]
    second = content[part_size:]
    presign_and_upload(doctor_client, payload, 1, first, record=False)

    status_response = doctor_client.get(f"/api/v1/files/uploads/{payload['upload_id']}/")
    assert status_response.status_code == 200
    assert [part["part_number"] for part in status_response.data["completed_parts"]] == [1]

    presign_and_upload(doctor_client, payload, 2, second)
    completed = doctor_client.post(f"/api/v1/files/uploads/{payload['upload_id']}/complete/")
    assert completed.status_code == 200, completed.data


@pytest.mark.django_db
@pytest.mark.parametrize("part_count", [1, 2])
def test_exact_part_size_multiples_preserve_every_byte(
    part_count, doctor_client, approved_doctor_thread, mock_s3, settings
):
    configure_storage(settings)
    content = bytes(range(256)) * ((settings.UPLOAD_PART_SIZE * part_count) // 256)
    payload = create_session(
        doctor_client, content=content, thread=approved_doctor_thread
    ).data
    for part_number in range(1, part_count + 1):
        start = (part_number - 1) * settings.UPLOAD_PART_SIZE
        presign_and_upload(
            doctor_client,
            payload,
            part_number,
            content[start : start + settings.UPLOAD_PART_SIZE],
        )
    completed = doctor_client.post(f"/api/v1/files/uploads/{payload['upload_id']}/complete/")
    assert completed.status_code == 200, completed.data
    session = UploadSession.objects.select_related("asset").get(pk=payload["upload_id"])
    stored = get_s3_client().get_object(
        Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=session.asset.storage_key
    )["Body"].read()
    assert hashlib.sha256(stored).digest() == hashlib.sha256(content).digest()


@pytest.mark.django_db
def test_parts_may_arrive_out_of_order_and_duplicate_records_are_idempotent(
    doctor_client, approved_doctor_thread, mock_s3, settings
):
    configure_storage(settings)
    part_size = settings.UPLOAD_PART_SIZE
    content = b"a" * part_size + b"tail"
    payload = create_session(
        doctor_client, content=content, thread=approved_doctor_thread
    ).data
    second = content[part_size:]
    first = content[:part_size]
    etag = presign_and_upload(doctor_client, payload, 2, second)
    duplicate = doctor_client.post(
        f"/api/v1/files/uploads/{payload['upload_id']}/parts/record/",
        {
            "part_number": 2,
            "size": len(second),
            "etag": etag,
            "checksum_sha256": hashlib.sha256(second).hexdigest(),
        },
        format="json",
    )
    presign_and_upload(doctor_client, payload, 1, first)

    assert duplicate.status_code == 200
    assert doctor_client.post(
        f"/api/v1/files/uploads/{payload['upload_id']}/complete/"
    ).status_code == 200


@pytest.mark.django_db
def test_missing_part_and_modified_etag_are_rejected(
    doctor_client, approved_doctor_thread, mock_s3, settings
):
    configure_storage(settings)
    part_size = settings.UPLOAD_PART_SIZE
    content = b"a" * part_size + b"tail"
    missing_payload = create_session(
        doctor_client, content=content, thread=approved_doctor_thread
    ).data
    presign_and_upload(doctor_client, missing_payload, 1, content[:part_size])
    missing = doctor_client.post(
        f"/api/v1/files/uploads/{missing_payload['upload_id']}/complete/"
    )
    assert missing.status_code == 409

    tampered_payload = create_session(
        doctor_client, content=b"safe", thread=approved_doctor_thread
    ).data
    presign_and_upload(
        doctor_client, tampered_payload, 1, b"safe", etag='"attacker-etag"'
    )
    tampered = doctor_client.post(
        f"/api/v1/files/uploads/{tampered_payload['upload_id']}/complete/"
    )
    assert tampered.status_code == 409


@pytest.mark.django_db
def test_session_creation_is_idempotent_and_rejects_changed_file(
    doctor_client, approved_doctor_thread, mock_s3, settings
):
    configure_storage(settings)
    client_id = uuid.uuid4()
    first = create_session(
        doctor_client,
        content=b"first",
        thread=approved_doctor_thread,
        client_upload_id=client_id,
    )
    repeated = create_session(
        doctor_client,
        content=b"first",
        thread=approved_doctor_thread,
        client_upload_id=client_id,
    )
    changed = doctor_client.post(
        "/api/v1/files/uploads/",
        {
            "client_upload_id": str(client_id),
            "purpose": "chat_attachment",
            "thread_id": str(approved_doctor_thread.pk),
            "file_name": "scan.stl",
            "file_size": 6,
            "file_content_type": "model/stl",
            "sha256": hashlib.sha256(b"second").hexdigest(),
        },
        format="json",
    )

    assert first.status_code == 201
    assert repeated.status_code == 200
    assert repeated.data["upload_id"] == first.data["upload_id"]
    assert changed.status_code == 400
    assert UploadSession.objects.count() == 1


@pytest.mark.django_db
def test_upload_access_thread_scope_expiry_and_cancellation(
    doctor_client,
    approved_doctor_thread,
    normal_user,
    admin_user,
    mock_s3,
    settings,
):
    configure_storage(settings)
    payload = create_session(
        doctor_client, content=b"cancel", thread=approved_doctor_thread
    ).data
    other_client = APIClient()
    other_client.force_authenticate(normal_user)
    assert other_client.get(f"/api/v1/files/uploads/{payload['upload_id']}/").status_code == 403
    admin_client = APIClient()
    admin_client.force_authenticate(admin_user)
    assert admin_client.get(f"/api/v1/files/uploads/{payload['upload_id']}/").status_code == 404

    session = UploadSession.objects.get(pk=payload["upload_id"])
    session.expires_at = timezone.now() - timedelta(seconds=1)
    session.save(update_fields=("expires_at",))
    expired = doctor_client.get(f"/api/v1/files/uploads/{payload['upload_id']}/")
    assert expired.status_code == 200
    assert expired.data["state"] == UploadSession.State.EXPIRED

    cancelled = doctor_client.delete(f"/api/v1/files/uploads/{payload['upload_id']}/")
    assert cancelled.status_code == 204
    session.refresh_from_db()
    assert session.state == UploadSession.State.ABORTED
    with pytest.raises(ClientError):
        get_s3_client().list_parts(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=session.asset.storage_key,
            UploadId=session.provider_upload_id,
        )


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("size", "expected_status"),
    [(0, 400), (100 * 1024 * 1024, 201), (1024 * 1024 * 1024, 201), (1024 * 1024 * 1024 + 1, 400)],
)
def test_upload_size_boundaries(
    size, expected_status, doctor_client, approved_doctor_thread, mock_s3, settings
):
    configure_storage(settings)
    settings.UPLOAD_PART_SIZE = 16 * 1024 * 1024
    response = doctor_client.post(
        "/api/v1/files/uploads/",
        {
            "client_upload_id": str(uuid.uuid4()),
            "purpose": "chat_attachment",
            "thread_id": str(approved_doctor_thread.pk),
            "file_name": "scan.stl",
            "file_size": size,
            "file_content_type": "model/stl",
            "sha256": "a" * 64,
        },
        format="json",
    )
    assert response.status_code == expected_status, response.data
    if expected_status == 201:
        assert response.data["expected_part_count"] == (size + settings.UPLOAD_PART_SIZE - 1) // settings.UPLOAD_PART_SIZE


@pytest.mark.django_db
def test_extension_mime_cross_user_and_thread_controls(
    doctor_client, doctor_user, admin_user, approved_doctor_thread, mock_s3, settings
):
    configure_storage(settings)
    invalid = doctor_client.post(
        "/api/v1/files/uploads/",
        {
            "client_upload_id": str(uuid.uuid4()),
            "purpose": "chat_attachment",
            "thread_id": str(approved_doctor_thread.pk),
            "file_name": "malware.exe",
            "file_size": 1,
            "file_content_type": "application/octet-stream",
            "sha256": "a" * 64,
        },
        format="json",
    )
    assert invalid.status_code == 400
    assert "Unsupported file type" in str(invalid.data["detail"])

    other_thread = MessageThread.objects.create(
        participant=admin_user,
        thread_type=MessageThread.ThreadType.DOCTOR_ADMIN,
    )
    unauthorized = doctor_client.post(
        "/api/v1/files/uploads/",
        {
            "client_upload_id": str(uuid.uuid4()),
            "purpose": "chat_attachment",
            "thread_id": str(other_thread.pk),
            "file_name": "scan.stl",
            "file_size": 1,
            "file_content_type": "model/stl",
            "sha256": "a" * 64,
        },
        format="json",
    )
    assert unauthorized.status_code == 404


@pytest.mark.django_db
def test_upload_bucket_cors_exposes_only_required_direct_upload_headers(
    mock_s3, settings
):
    configure_storage(settings)
    settings.CORS_ALLOWED_ORIGINS = ["https://clinic.example"]

    call_command("configure_upload_bucket")

    cors = get_s3_client().get_bucket_cors(Bucket=settings.AWS_STORAGE_BUCKET_NAME)
    rule = cors["CORSRules"][0]
    assert rule["AllowedOrigins"] == ["https://clinic.example"]
    assert rule["AllowedMethods"] == ["PUT"]
    assert "ETag" in rule["ExposeHeaders"]
    assert rule["AllowedHeaders"] == ["x-amz-checksum-sha256"]
