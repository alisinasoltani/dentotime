import hashlib
import socket
import struct
from datetime import timedelta
from pathlib import PurePath

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from core.models import FileAccessAudit, FileAsset
from core.object_storage import stream_asset
from core.uploads import PURPOSE_RULES


EICAR_MARKER = b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE"
HTML_PREFIXES = (b"<!doctype html", b"<html", b"<script", b"<svg")


class FileScanError(RuntimeError):
    pass


class ScannerUnavailable(FileScanError):
    pass


class BuiltInTestScanner:
    """Deterministic local scanner used only outside production and in tests."""

    def __init__(self):
        self._tail = b""
        self.infected = False

    def feed(self, chunk):
        combined = self._tail + chunk
        if EICAR_MARKER in combined:
            self.infected = True
        self._tail = combined[-len(EICAR_MARKER):]

    def finish(self):
        return "EICAR-Test-Signature" if self.infected else None

    def close(self):
        return None


class ClamAVStreamScanner:
    """Streams bytes to a private ClamAV daemon using its INSTREAM protocol."""

    def __init__(self):
        self._socket = socket.create_connection(
            (settings.CLAMAV_HOST, settings.CLAMAV_PORT),
            timeout=settings.CLAMAV_TIMEOUT_SECONDS,
        )
        self._socket.settimeout(settings.CLAMAV_TIMEOUT_SECONDS)
        self._socket.sendall(b"zINSTREAM\0")

    def feed(self, chunk):
        self._socket.sendall(struct.pack("!I", len(chunk)))
        self._socket.sendall(chunk)

    def finish(self):
        self._socket.sendall(struct.pack("!I", 0))
        response = bytearray()
        while not response.endswith(b"\0"):
            part = self._socket.recv(4096)
            if not part:
                break
            response.extend(part)
        decoded = response.rstrip(b"\0\n").decode("utf-8", "replace")
        if decoded.endswith(" OK"):
            return None
        if decoded.endswith(" FOUND"):
            return decoded.rsplit(": ", 1)[-1].removesuffix(" FOUND")[:160]
        raise ScannerUnavailable("The malware scanner returned an invalid response.")

    def close(self):
        self._socket.close()


def build_malware_scanner():
    if settings.CLAMAV_HOST:
        try:
            return ClamAVStreamScanner()
        except OSError as exc:
            raise ScannerUnavailable("The private malware scanner is unavailable.") from exc
    if settings.REQUIRE_CLAMAV:
        raise ScannerUnavailable("The production malware scanner is not configured.")
    return BuiltInTestScanner()


def _looks_like_binary_stl(head, size):
    if len(head) < 84:
        return False
    triangle_count = int.from_bytes(head[80:84], "little")
    return size == 84 + triangle_count * 50


def detect_file_type(file_name, head, tail, size):
    lowered = head.lstrip().lower()
    if any(lowered.startswith(prefix) for prefix in HTML_PREFIXES):
        raise FileScanError("Active HTML or SVG content is not accepted.")
    extension = PurePath(file_name.lower()).suffix
    if head.startswith(b"\xff\xd8\xff") and tail.endswith(b"\xff\xd9"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n") and b"IEND" in tail:
        return "image/png"
    if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
        return "image/webp"
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        return "application/zip"
    if len(head) >= 132 and head[128:132] == b"DICM":
        return "application/dicom"
    if extension == ".ply" and lowered.startswith(b"ply"):
        return "model/ply"
    if extension == ".obj" and any(
        lowered.startswith(prefix) for prefix in (b"v ", b"vn ", b"vt ", b"f ", b"o ", b"#")
    ):
        return "model/obj"
    if extension == ".stl" and (lowered.startswith(b"solid") or _looks_like_binary_stl(head, size)):
        return "model/stl"
    raise FileScanError("The file signature does not match an allowed format.")


def _detected_type_is_allowed(asset, detected_mime):
    extension = PurePath(asset.original_name.lower()).suffix
    allowed = PURPOSE_RULES[asset.purpose]["extensions"].get(extension, set())
    equivalents = {
        "application/zip": {"application/zip", "application/x-zip-compressed"},
        "model/stl": {"model/stl", "application/octet-stream"},
        "model/obj": {"model/obj", "application/octet-stream", "text/plain"},
        "model/ply": {"model/ply", "application/octet-stream", "text/plain"},
        "application/dicom": {"application/dicom", "application/octet-stream"},
    }
    return asset.claimed_mime in equivalents.get(detected_mime, {detected_mime}) and bool(allowed)


def _record_scan_result(asset, *, status, state, reason, detected_mime="", digest="", size=None):
    now = timezone.now()
    retention_days = (
        settings.FILE_RETENTION_DAYS[asset.purpose]
        if state == FileAsset.State.AVAILABLE
        else settings.FILE_FAILED_RETENTION_DAYS
    )
    with transaction.atomic():
        locked = FileAsset.objects.select_for_update().get(pk=asset.pk)
        locked.scan_status = status
        locked.state = state
        locked.scanned_at = now
        locked.retention_until = now + timedelta(days=retention_days)
        locked.failed_reason = reason[:255]
        if detected_mime:
            locked.detected_mime = detected_mime
        if size is not None:
            locked.actual_size = size
        locked.verified_sha256 = digest if state == FileAsset.State.AVAILABLE else ""
        locked.save(
            update_fields=(
                "scan_status", "state", "scanned_at", "retention_until", "failed_reason",
                "detected_mime", "actual_size", "verified_sha256", "updated_at",
            )
        )
        FileAccessAudit.objects.create(
            asset=locked,
            action=(
                FileAccessAudit.Action.SCAN_CLEAN
                if state == FileAsset.State.AVAILABLE
                else FileAccessAudit.Action.SCAN_REJECTED
            ),
            outcome="SUCCESS" if state == FileAsset.State.AVAILABLE else "REJECTED",
            detail=reason[:255],
        )
        return locked


def _restore_pending_scan(asset, reason):
    FileAsset.objects.filter(pk=asset.pk).update(
        state=FileAsset.State.QUARANTINED,
        scan_status=FileAsset.ScanStatus.PENDING,
        failed_reason=reason[:255],
        updated_at=timezone.now(),
    )


def scan_asset(asset_id, *, scanner_factory=build_malware_scanner):
    with transaction.atomic():
        asset = FileAsset.objects.select_for_update().get(pk=asset_id)
        if asset.state == FileAsset.State.AVAILABLE and asset.scan_status == FileAsset.ScanStatus.CLEAN:
            return asset
        if asset.state != FileAsset.State.QUARANTINED or asset.scan_status not in {
            FileAsset.ScanStatus.PENDING,
            FileAsset.ScanStatus.SCANNING,
        }:
            raise FileScanError("This asset is not awaiting a scan.")
        if (
            asset.scan_status == FileAsset.ScanStatus.SCANNING
            and asset.updated_at > timezone.now() - timedelta(minutes=30)
        ):
            raise FileScanError("This asset is already being scanned.")
        asset.scan_status = FileAsset.ScanStatus.SCANNING
        asset.save(update_fields=("scan_status", "updated_at"))

    body = None
    scanner = None
    digest = hashlib.sha256()
    total = 0
    head = bytearray()
    tail = b""
    try:
        scanner = scanner_factory()
        body = stream_asset(asset)
        for chunk in body.iter_chunks(chunk_size=1024 * 1024):
            if not chunk:
                continue
            total += len(chunk)
            if total > asset.expected_size:
                raise FileScanError("The stored object is larger than declared.")
            digest.update(chunk)
            scanner.feed(chunk)
            if len(head) < 4096:
                head.extend(chunk[: 4096 - len(head)])
            tail = (tail + chunk)[-64:]
        malware_name = scanner.finish()
        if malware_name:
            return _record_scan_result(
                asset,
                status=FileAsset.ScanStatus.INFECTED,
                state=FileAsset.State.FAILED,
                reason=f"Malware detected: {malware_name}",
                size=total,
            )
        hex_digest = digest.hexdigest()
        if total != asset.expected_size or hex_digest != asset.sha256:
            raise FileScanError("The stored object failed whole-file integrity verification.")
        detected_mime = detect_file_type(asset.original_name, bytes(head), tail, total)
        if not _detected_type_is_allowed(asset, detected_mime):
            raise FileScanError("The declared MIME type does not match the file signature.")
        return _record_scan_result(
            asset,
            status=FileAsset.ScanStatus.CLEAN,
            state=FileAsset.State.AVAILABLE,
            reason="",
            detected_mime=detected_mime,
            digest=hex_digest,
            size=total,
        )
    except Exception as exc:
        if isinstance(exc, ScannerUnavailable) or not isinstance(exc, FileScanError):
            reason = "The malware scanner or private storage is temporarily unavailable."
            _restore_pending_scan(asset, reason)
            raise ScannerUnavailable(reason) from exc
        if isinstance(exc, FileScanError):
            reason = str(exc)
        _record_scan_result(
            asset,
            status=FileAsset.ScanStatus.FAILED,
            state=FileAsset.State.FAILED,
            reason=reason,
            size=total or None,
        )
        return FileAsset.objects.get(pk=asset.pk)
    finally:
        if body is not None:
            try:
                body.close()
            except Exception:
                pass
        if scanner is not None:
            try:
                scanner.close()
            except Exception:
                pass
