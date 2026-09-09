import math
import re
import uuid
from datetime import timedelta
from pathlib import PurePath

from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounts.models import User
from core.models import FileAsset, ONE_GIB, SystemSettings, UploadPart, UploadSession
from core.object_storage import (
    abort_multipart_upload,
    begin_multipart_upload,
    checksum_header,
    complete_multipart_upload,
    head_asset,
    list_uploaded_parts,
    presign_upload_part,
)


SHA256_RE = re.compile(r"\A[0-9a-f]{64}\Z")
SAFE_NAME_RE = re.compile(r"\A[^\x00-\x1f\x7f/\\]{1,255}\Z")
ACTIVE_UPLOAD_STATES = {
    UploadSession.State.CREATED,
    UploadSession.State.UPLOADING,
    UploadSession.State.COMPLETING,
}

PURPOSE_RULES = {
    FileAsset.Purpose.PROFILE_PICTURE: {
        "max_size": 5 * 1024 * 1024,
        "extensions": {
            ".jpg": {"image/jpeg"},
            ".jpeg": {"image/jpeg"},
            ".png": {"image/png"},
            ".webp": {"image/webp"},
        },
    },
    FileAsset.Purpose.VERIFICATION_DOCUMENT: {
        "max_size": 25 * 1024 * 1024,
        "extensions": {
            ".jpg": {"image/jpeg"},
            ".jpeg": {"image/jpeg"},
            ".png": {"image/png"},
            ".pdf": {"application/pdf"},
        },
    },
    FileAsset.Purpose.CHAT_ATTACHMENT: {
        "max_size": ONE_GIB,
        "extensions": {
            ".jpg": {"image/jpeg"},
            ".jpeg": {"image/jpeg"},
            ".png": {"image/png"},
            ".webp": {"image/webp"},
            ".pdf": {"application/pdf"},
            ".stl": {"model/stl", "application/octet-stream"},
            ".obj": {"model/obj", "application/octet-stream", "text/plain"},
            ".ply": {"model/ply", "application/octet-stream", "text/plain"},
            ".dcm": {"application/dicom", "application/octet-stream"},
            ".dicom": {"application/dicom", "application/octet-stream"},
            ".zip": {"application/zip", "application/x-zip-compressed"},
        },
    },
}


class UploadError(ValueError):
    pass


class UploadQuotaError(UploadError):
    pass


def validate_upload_metadata(*, purpose, file_name, file_size, claimed_mime, sha256):
    if purpose not in PURPOSE_RULES:
        raise UploadError("Unsupported upload purpose.")
    if not SAFE_NAME_RE.fullmatch(file_name) or PurePath(file_name).name != file_name:
        raise UploadError("Invalid file name.")
    if not isinstance(file_size, int) or isinstance(file_size, bool) or file_size < 1:
        raise UploadError("Empty files are not supported.")
    mime = claimed_mime.split(";", 1)[0].strip().lower()
    extension = PurePath(file_name.lower()).suffix
    allowed_mimes = PURPOSE_RULES[purpose]["extensions"].get(extension)
    if not allowed_mimes or mime not in allowed_mimes:
        raise UploadError("Unsupported file type or extension/MIME mismatch.")
    max_size = PURPOSE_RULES[purpose]["max_size"]
    if purpose == FileAsset.Purpose.CHAT_ATTACHMENT:
        configured = SystemSettings.load().doctor_attachment_max_size_mb * 1024 * 1024
        max_size = min(max_size, configured)
    if file_size > max_size:
        raise UploadError(f"File exceeds the {max_size}-byte limit for this purpose.")
    if not SHA256_RE.fullmatch(sha256):
        raise UploadError("A lowercase SHA-256 digest is required.")
    return mime


def expected_part_size(session, part_number):
    if part_number < 1 or part_number > session.expected_part_count:
        raise UploadError("Part number is outside this upload session.")
    if part_number < session.expected_part_count:
        return session.part_size
    remainder = session.asset.expected_size % session.part_size
    return remainder or session.part_size


def expire_if_needed(session):
    if session.state in ACTIVE_UPLOAD_STATES and session.expires_at <= timezone.now():
        UploadSession.objects.filter(pk=session.pk, state=session.state).update(
            state=UploadSession.State.EXPIRED,
            updated_at=timezone.now(),
        )
        session.state = UploadSession.State.EXPIRED
    return session


def create_upload_session(
    *, owner, client_upload_id, purpose, file_name, file_size, claimed_mime, sha256, thread=None, doctor=None
):
    claimed_mime = validate_upload_metadata(
        purpose=purpose,
        file_name=file_name,
        file_size=file_size,
        claimed_mime=claimed_mime,
        sha256=sha256,
    )
    configured_part_size = max(5 * 1024 * 1024, min(settings.UPLOAD_PART_SIZE, 64 * 1024 * 1024))
    expected_part_count = math.ceil(file_size / configured_part_size)
    expires_at = timezone.now() + timedelta(seconds=settings.UPLOAD_SESSION_TTL_SECONDS)

    with transaction.atomic():
        User.objects.select_for_update().only("pk").get(pk=owner.pk)
        existing = (
            UploadSession.objects.select_related("asset")
            .filter(owner=owner, client_upload_id=client_upload_id)
            .first()
        )
        if existing:
            asset = existing.asset
            if (
                asset.purpose != purpose
                or asset.original_name != file_name
                or asset.expected_size != file_size
                or asset.claimed_mime != claimed_mime
                or asset.sha256 != sha256
                or asset.scope_thread_id != getattr(thread, "pk", None)
                or asset.scope_doctor_id != getattr(doctor, "pk", None)
            ):
                raise UploadError("The client upload ID is already bound to a different file.")
            return expire_if_needed(existing), False

        reserved_bytes = (
            FileAsset.objects.filter(owner=owner)
            .exclude(state__in=(FileAsset.State.FAILED, FileAsset.State.DELETED))
            .aggregate(total=Sum("expected_size"))["total"]
            or 0
        )
        if reserved_bytes + file_size > settings.FILE_UPLOAD_QUOTA_BYTES:
            raise UploadQuotaError("The file-storage quota for this account has been exceeded.")

        asset = FileAsset(
            owner=owner,
            purpose=purpose,
            scope_thread=thread,
            scope_doctor=doctor,
            original_name=file_name,
            expected_size=file_size,
            claimed_mime=claimed_mime,
            sha256=sha256,
            storage_key="pending",
            expires_at=expires_at,
        )
        asset.storage_key = (
            f"quarantine/{owner.pk}/{purpose.lower()}/{asset.pk}/{uuid.uuid4().hex}{PurePath(file_name).suffix.lower()}"
        )
        asset.full_clean()
        asset.save()
        session = UploadSession(
            owner=owner,
            asset=asset,
            client_upload_id=client_upload_id,
            part_size=configured_part_size,
            expected_part_count=expected_part_count,
            expires_at=expires_at,
        )
        session.full_clean()
        session.save()

    try:
        provider_upload_id = begin_multipart_upload(asset)
    except Exception as exc:
        with transaction.atomic():
            UploadSession.objects.filter(pk=session.pk).update(state=UploadSession.State.FAILED)
            FileAsset.objects.filter(pk=asset.pk).update(
                state=FileAsset.State.FAILED,
                failed_reason="Object storage could not initialize the upload.",
            )
        raise UploadError("Object storage could not initialize the upload.") from exc

    with transaction.atomic():
        session = UploadSession.objects.select_for_update().select_related("asset").get(pk=session.pk)
        session.provider_upload_id = provider_upload_id
        session.state = UploadSession.State.UPLOADING
        session.save(update_fields=("provider_upload_id", "state", "updated_at"))
        FileAsset.objects.filter(pk=asset.pk).update(state=FileAsset.State.UPLOADING)
        session.asset.state = FileAsset.State.UPLOADING
    return session, True


def presign_parts(session, part_specs):
    expire_if_needed(session)
    if session.state != UploadSession.State.UPLOADING:
        raise UploadError("This upload session is not accepting parts.")
    if not session.provider_upload_id:
        raise UploadError("This upload session is not initialized.")
    if not part_specs or len(part_specs) > 50:
        raise UploadError("Request between 1 and 50 parts per batch.")

    normalized = []
    seen = set()
    with transaction.atomic():
        locked = UploadSession.objects.select_for_update().select_related("asset").get(pk=session.pk)
        for spec in sorted(part_specs, key=lambda item: item["part_number"]):
            number = spec["part_number"]
            digest = spec["checksum_sha256"]
            if number in seen:
                raise UploadError("Duplicate part number.")
            seen.add(number)
            if not SHA256_RE.fullmatch(digest):
                raise UploadError("Each part requires a lowercase SHA-256 digest.")
            size = expected_part_size(locked, number)
            manifest, created = UploadPart.objects.get_or_create(
                session=locked,
                part_number=number,
                defaults={"size": size, "checksum_sha256": digest, "etag": ""},
            )
            if not created and (manifest.checksum_sha256 != digest or manifest.size != size):
                raise UploadError("This part number is already bound to different bytes.")
            normalized.append((number, digest))

    return [
        {
            "part_number": number,
            "url": presign_upload_part(session, number, digest),
            "checksum_sha256": checksum_header(digest),
            "expires_in": settings.AWS_S3_PRESIGN_EXPIRY_SECONDS,
        }
        for number, digest in normalized
    ]


def record_uploaded_part(session, *, part_number, size, etag, checksum_sha256):
    expire_if_needed(session)
    if session.state != UploadSession.State.UPLOADING:
        raise UploadError("This upload session is not accepting part records.")
    expected_size = expected_part_size(session, part_number)
    if size != expected_size or not SHA256_RE.fullmatch(checksum_sha256):
        raise UploadError("Invalid uploaded-part metadata.")
    with transaction.atomic():
        manifest = UploadPart.objects.select_for_update().filter(
            session=session, part_number=part_number
        ).first()
        if manifest is None or manifest.checksum_sha256 != checksum_sha256:
            raise UploadError("Presign this exact part checksum before recording it.")
        if manifest.etag and manifest.etag != etag:
            raise UploadError("The part was already recorded with a different ETag.")
        manifest.etag = etag
        manifest.save(update_fields=("etag", "recorded_at"))
    return manifest


def reconcile_uploaded_parts(session):
    if session.state == UploadSession.State.COMPLETED:
        return list(session.recorded_parts.exclude(etag="").order_by("part_number"))
    expire_if_needed(session)
    if session.state not in {UploadSession.State.UPLOADING, UploadSession.State.COMPLETING}:
        return []
    storage_parts = {part["PartNumber"]: part for part in list_uploaded_parts(session)}
    manifests = list(session.recorded_parts.order_by("part_number"))
    completed = []
    changed = []
    for manifest in manifests:
        stored = storage_parts.get(manifest.part_number)
        if not stored or stored.get("Size") != manifest.size:
            continue
        stored_checksum = stored.get("ChecksumSHA256")
        if stored_checksum and stored_checksum != checksum_header(manifest.checksum_sha256):
            continue
        etag = stored.get("ETag", "")
        if not etag:
            continue
        if manifest.etag != etag:
            manifest.etag = etag
            manifest.recorded_at = timezone.now()
            changed.append(manifest)
        completed.append(manifest)
    if changed:
        UploadPart.objects.bulk_update(changed, ("etag", "recorded_at"))
    return completed


def _validate_completed_object(asset):
    metadata = head_asset(asset)
    if metadata.get("ContentLength") != asset.expected_size:
        raise UploadError("The completed object has the wrong size.")
    if metadata.get("Metadata", {}).get("sha256") != asset.sha256:
        raise UploadError("The completed object metadata failed integrity verification.")


def _finalize_completed_session(session):
    now = timezone.now()
    with transaction.atomic():
        locked = UploadSession.objects.select_for_update().select_related("asset").get(pk=session.pk)
        if locked.state == UploadSession.State.COMPLETED:
            return locked.asset
        if locked.state != UploadSession.State.COMPLETING:
            raise UploadError("This upload session cannot be finalized.")
        locked.state = UploadSession.State.COMPLETED
        locked.completed_at = now
        locked.save(update_fields=("state", "completed_at", "updated_at"))
        FileAsset.objects.filter(pk=locked.asset_id).update(
            state=FileAsset.State.QUARANTINED,
            scan_status=FileAsset.ScanStatus.PENDING,
            actual_size=locked.asset.expected_size,
            completed_at=now,
            expires_at=None,
        )
        locked.asset.refresh_from_db()
        return locked.asset


def complete_upload(session):
    recovering = False
    with transaction.atomic():
        locked = UploadSession.objects.select_for_update().select_related("asset").get(pk=session.pk)
        expire_if_needed(locked)
        if locked.state == UploadSession.State.COMPLETED:
            return locked.asset
        if locked.state == UploadSession.State.COMPLETING:
            recovering = True
        elif locked.state != UploadSession.State.UPLOADING:
            raise UploadError("This upload session cannot be completed.")
        else:
            locked.state = UploadSession.State.COMPLETING
            locked.save(update_fields=("state", "updated_at"))

    if recovering:
        try:
            _validate_completed_object(locked.asset)
        except (BotoCoreError, ClientError) as exc:
            raise UploadError("Upload completion is already in progress.") from exc
        except UploadError as exc:
            UploadSession.objects.filter(pk=locked.pk).update(state=UploadSession.State.FAILED)
            FileAsset.objects.filter(pk=locked.asset_id).update(
                state=FileAsset.State.FAILED,
                failed_reason=str(exc)[:255],
            )
            raise
        return _finalize_completed_session(locked)

    provider_completed = False
    try:
        parts = list_uploaded_parts(locked)
        parts.sort(key=lambda item: item["PartNumber"])
        manifests = {
            item.part_number: item for item in locked.recorded_parts.order_by("part_number")
        }
        if len(parts) != locked.expected_part_count:
            raise UploadError("The upload has missing parts.")
        for expected_number, stored in enumerate(parts, start=1):
            manifest = manifests.get(expected_number)
            if stored["PartNumber"] != expected_number or manifest is None:
                raise UploadError("The upload has missing or unordered parts.")
            if stored.get("Size") != expected_part_size(locked, expected_number):
                raise UploadError("An uploaded part has the wrong size.")
            if stored.get("ChecksumSHA256") and stored["ChecksumSHA256"] != checksum_header(
                manifest.checksum_sha256
            ):
                raise UploadError("An uploaded part failed checksum verification.")
            if manifest.etag and manifest.etag != stored.get("ETag"):
                raise UploadError("An uploaded part has a modified ETag.")

        complete_multipart_upload(locked, parts)
        provider_completed = True
        _validate_completed_object(locked.asset)
    except Exception as exc:
        if not provider_completed:
            UploadSession.objects.filter(pk=locked.pk, state=UploadSession.State.COMPLETING).update(
                state=UploadSession.State.UPLOADING
            )
        elif isinstance(exc, UploadError):
            UploadSession.objects.filter(pk=locked.pk).update(state=UploadSession.State.FAILED)
            FileAsset.objects.filter(pk=locked.asset_id).update(
                state=FileAsset.State.FAILED,
                failed_reason=str(exc)[:255],
            )
        if isinstance(exc, UploadError):
            raise
        raise UploadError("Object storage could not complete the upload.") from exc
    return _finalize_completed_session(locked)


def cancel_upload(session):
    with transaction.atomic():
        locked = UploadSession.objects.select_for_update().select_related("asset").get(pk=session.pk)
        if locked.state == UploadSession.State.ABORTED:
            return
        if locked.state in {UploadSession.State.COMPLETED, UploadSession.State.COMPLETING}:
            raise UploadError("A completed upload cannot be cancelled.")
        if locked.state not in {
            UploadSession.State.CREATED,
            UploadSession.State.UPLOADING,
            UploadSession.State.EXPIRED,
            UploadSession.State.FAILED,
        }:
            raise UploadError("This upload session cannot be cancelled.")
        locked.state = UploadSession.State.ABORTING
        locked.save(update_fields=("state", "updated_at"))
    try:
        if locked.provider_upload_id:
            abort_multipart_upload(locked)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") != "NoSuchUpload":
            UploadSession.objects.filter(pk=locked.pk).update(state=UploadSession.State.FAILED)
            raise UploadError("Object storage could not cancel the upload.") from exc
    with transaction.atomic():
        UploadSession.objects.filter(pk=locked.pk).update(state=UploadSession.State.ABORTED)
        FileAsset.objects.filter(pk=locked.asset_id).update(state=FileAsset.State.DELETED)
