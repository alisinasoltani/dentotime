import hashlib
import uuid
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import DoctorDocument, NormalUser
from core.file_safety import EICAR_MARKER, ScannerUnavailable, scan_asset
from core.models import FileAccessAudit, FileAsset
from core.object_storage import get_s3_client
from messaging.models import MessageThread


BUCKET = "dentotime-file-safety-tests"


def configure_storage(settings):
    settings.AWS_ACCESS_KEY_ID = "testing"
    settings.AWS_SECRET_ACCESS_KEY = "testing"
    settings.AWS_STORAGE_BUCKET_NAME = BUCKET
    settings.AWS_S3_ENDPOINT_URL = ""
    settings.AWS_S3_REGION_NAME = "us-east-1"
    settings.AWS_S3_DOWNLOAD_EXPIRY_SECONDS = 60
    settings.AWS_S3_SERVER_SIDE_ENCRYPTION = "AES256"
    settings.CLAMAV_HOST = ""
    settings.REQUIRE_CLAMAV = False
    get_s3_client().create_bucket(Bucket=BUCKET)


def quarantined_asset(*, owner, content, name="identity.pdf", claimed_mime="application/pdf", doctor=None, thread=None):
    digest = hashlib.sha256(content).hexdigest()
    purpose = (
        FileAsset.Purpose.CHAT_ATTACHMENT
        if thread is not None
        else FileAsset.Purpose.VERIFICATION_DOCUMENT
    )
    asset = FileAsset.objects.create(
        owner=owner,
        purpose=purpose,
        scope_thread=thread,
        scope_doctor=doctor,
        original_name=name,
        expected_size=len(content),
        actual_size=len(content),
        claimed_mime=claimed_mime,
        sha256=digest,
        storage_key=f"quarantine/tests/{uuid.uuid4()}/{name}",
        state=FileAsset.State.QUARANTINED,
        scan_status=FileAsset.ScanStatus.PENDING,
        completed_at=timezone.now(),
    )
    get_s3_client().put_object(Bucket=BUCKET, Key=asset.storage_key, Body=content)
    return asset


@pytest.mark.django_db
def test_stream_scan_verifies_whole_file_signature_and_makes_clean_pdf_available(
    doctor_user, mock_s3, settings
):
    configure_storage(settings)
    content = b"%PDF-1.7\ntrusted identity document\n%%EOF\n"
    asset = quarantined_asset(owner=doctor_user, doctor=doctor_user, content=content)

    scanned = scan_asset(asset.pk)

    assert scanned.state == FileAsset.State.AVAILABLE
    assert scanned.scan_status == FileAsset.ScanStatus.CLEAN
    assert scanned.detected_mime == "application/pdf"
    assert scanned.actual_size == len(content)
    assert scanned.verified_sha256 == hashlib.sha256(content).hexdigest()
    assert scanned.retention_until > timezone.now()
    assert FileAccessAudit.objects.filter(
        asset=asset, action=FileAccessAudit.Action.SCAN_CLEAN
    ).exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("content", "expected_status"),
    [
        (b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$" + EICAR_MARKER + b"!$H+H*", FileAsset.ScanStatus.INFECTED),
        (b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", FileAsset.ScanStatus.FAILED),
        (b"\xff\xd8\xff\xe0jpeg-disguised-as-pdf\xff\xd9", FileAsset.ScanStatus.FAILED),
    ],
)
def test_infected_active_or_signature_mismatched_objects_remain_unavailable(
    content, expected_status, doctor_user, mock_s3, settings
):
    configure_storage(settings)
    asset = quarantined_asset(owner=doctor_user, doctor=doctor_user, content=content)

    scanned = scan_asset(asset.pk)

    assert scanned.state == FileAsset.State.FAILED
    assert scanned.scan_status == expected_status
    assert scanned.verified_sha256 == ""
    assert FileAccessAudit.objects.filter(
        asset=asset, action=FileAccessAudit.Action.SCAN_REJECTED
    ).exists()


@pytest.mark.django_db
def test_private_download_requires_authorization_and_a_clean_asset(
    doctor_user, admin_user, normal_user, mock_s3, settings
):
    configure_storage(settings)
    content = b"%PDF-1.7\nprivate\n%%EOF"
    clean = scan_asset(
        quarantined_asset(owner=doctor_user, doctor=doctor_user, content=content).pk
    )
    quarantined = quarantined_asset(
        owner=doctor_user,
        doctor=doctor_user,
        content=b"%PDF-1.7\nwaiting\n%%EOF",
        name="waiting.pdf",
    )
    endpoint = f"/api/v1/files/assets/{clean.pk}/download/"

    anonymous = APIClient()
    outsider = APIClient()
    outsider.force_authenticate(user=normal_user)
    owner = APIClient()
    owner.force_authenticate(user=doctor_user)
    administrator = APIClient()
    administrator.force_authenticate(user=admin_user)

    assert anonymous.post(endpoint).status_code == 401
    assert outsider.post(endpoint).status_code == 404
    assert owner.post(f"/api/v1/files/assets/{quarantined.pk}/download/").status_code == 404

    granted = owner.post(endpoint)
    admin_granted = administrator.post(endpoint)

    assert granted.status_code == 200
    assert admin_granted.status_code == 200
    assert granted.data["expires_in"] == 60
    query = parse_qs(urlparse(granted.data["url"]).query)
    assert query["X-Amz-Expires"] == ["60"]
    assert "X-Amz-Signature" in query
    assert FileAccessAudit.objects.filter(
        asset=clean, action=FileAccessAudit.Action.DOWNLOAD_GRANTED
    ).count() == 2


@pytest.mark.django_db
def test_chat_participant_can_download_admin_owned_thread_asset(
    doctor_client, doctor_user, admin_user, mock_s3, settings
):
    configure_storage(settings)
    thread = MessageThread.objects.create(
        participant=doctor_user,
        thread_type=MessageThread.ThreadType.DOCTOR_ADMIN,
    )
    content = b"solid scan\nendsolid scan\n"
    asset = quarantined_asset(
        owner=admin_user,
        thread=thread,
        content=content,
        name="scan.stl",
        claimed_mime="model/stl",
    )
    scanned = scan_asset(asset.pk)

    assert scanned.state == FileAsset.State.AVAILABLE
    assert doctor_client.post(f"/api/v1/files/assets/{asset.pk}/download/").status_code == 200


@pytest.mark.django_db
def test_download_content_disposition_neutralizes_header_injection(
    doctor_client, doctor_user, mock_s3, settings
):
    configure_storage(settings)
    content = b"%PDF-1.7\nprivate\n%%EOF"
    asset = quarantined_asset(owner=doctor_user, doctor=doctor_user, content=content)
    asset.original_name = 'identity"\r\nX-Evil: injected.pdf'
    asset.save(update_fields=("original_name",))
    asset = scan_asset(asset.pk)

    response = doctor_client.post(f"/api/v1/files/assets/{asset.pk}/download/")
    disposition = parse_qs(urlparse(response.data["url"]).query)["response-content-disposition"][0]

    assert "\r" not in disposition and "\n" not in disposition
    assert "X-Evil" in disposition
    assert disposition.startswith("attachment;")


@pytest.mark.django_db
def test_account_storage_quota_is_reserved_atomically(
    doctor_client, doctor_user, mock_s3, settings
):
    configure_storage(settings)
    settings.FILE_UPLOAD_QUOTA_BYTES = 100
    existing = b"x" * 80
    FileAsset.objects.create(
        owner=doctor_user,
        purpose=FileAsset.Purpose.VERIFICATION_DOCUMENT,
        scope_doctor=doctor_user,
        original_name="existing.pdf",
        expected_size=len(existing),
        claimed_mime="application/pdf",
        sha256=hashlib.sha256(existing).hexdigest(),
        storage_key=f"quarantine/tests/{uuid.uuid4()}/existing.pdf",
    )
    response = doctor_client.post(
        "/api/v1/files/uploads/",
        {
            "client_upload_id": str(uuid.uuid4()),
            "purpose": "verification_document",
            "file_name": "new.pdf",
            "file_size": 30,
            "file_content_type": "application/pdf",
            "sha256": hashlib.sha256(b"n" * 30).hexdigest(),
        },
        format="json",
    )

    assert response.status_code == 413
    assert FileAsset.objects.filter(owner=doctor_user).count() == 1


@pytest.mark.django_db
def test_retention_cleanup_deletes_only_unattached_eligible_objects_and_keeps_audit_metadata(
    doctor_user, mock_s3, settings
):
    configure_storage(settings)
    content = b"%PDF-1.7\nretained\n%%EOF"
    eligible = quarantined_asset(owner=doctor_user, doctor=doctor_user, content=content)
    eligible.state = FileAsset.State.FAILED
    eligible.scan_status = FileAsset.ScanStatus.FAILED
    eligible.retention_until = timezone.now() - timedelta(minutes=1)
    eligible.save(update_fields=("state", "scan_status", "retention_until"))

    attached = scan_asset(
        quarantined_asset(
            owner=doctor_user,
            doctor=doctor_user,
            content=content,
            name="attached.pdf",
        ).pk
    )
    attached.retention_until = timezone.now() - timedelta(minutes=1)
    attached.save(update_fields=("retention_until",))
    DoctorDocument.objects.create(doctor=doctor_user, asset=attached)

    call_command("cleanup_file_assets")

    eligible.refresh_from_db()
    attached.refresh_from_db()
    assert eligible.state == FileAsset.State.DELETED
    assert eligible.deleted_at is not None
    assert attached.state == FileAsset.State.AVAILABLE
    assert FileAccessAudit.objects.filter(
        asset=eligible, action=FileAccessAudit.Action.RETENTION_DELETE
    ).exists()
    response = get_s3_client().get_object(Bucket=BUCKET, Key=attached.storage_key)
    assert response["Body"].read() == content


@pytest.mark.django_db
def test_bucket_configuration_enforces_private_encrypted_storage(mock_s3, settings):
    configure_storage(settings)
    settings.CORS_ALLOWED_ORIGINS = ["https://clinic.example"]

    call_command("configure_upload_bucket")

    encryption = get_s3_client().get_bucket_encryption(Bucket=BUCKET)
    default = encryption["ServerSideEncryptionConfiguration"]["Rules"][0][
        "ApplyServerSideEncryptionByDefault"
    ]
    assert default["SSEAlgorithm"] == "AES256"
    access = get_s3_client().get_public_access_block(Bucket=BUCKET)[
        "PublicAccessBlockConfiguration"
    ]
    assert all(access.values())


@pytest.mark.django_db
def test_scanner_outage_keeps_object_quarantined_for_retry(doctor_user, mock_s3, settings):
    configure_storage(settings)
    settings.REQUIRE_CLAMAV = True
    asset = quarantined_asset(
        owner=doctor_user,
        doctor=doctor_user,
        content=b"%PDF-1.7\nretry later\n%%EOF",
    )

    with pytest.raises(ScannerUnavailable):
        scan_asset(asset.pk)

    asset.refresh_from_db()
    assert asset.state == FileAsset.State.QUARANTINED
    assert asset.scan_status == FileAsset.ScanStatus.PENDING
    assert not FileAccessAudit.objects.filter(
        asset=asset, action=FileAccessAudit.Action.SCAN_REJECTED
    ).exists()
