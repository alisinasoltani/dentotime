from django.db import transaction

from core.models import FileAccessAudit, FileAsset
from core.object_storage import presign_asset_download


class AssetDownloadDenied(ValueError):
    pass


def _can_download(user, asset):
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_admin_role or asset.owner_id == user.pk:
        return True
    if asset.purpose == FileAsset.Purpose.CHAT_ATTACHMENT:
        return asset.scope_thread_id is not None and asset.scope_thread.participant_id == user.pk
    if asset.purpose == FileAsset.Purpose.VERIFICATION_DOCUMENT:
        return asset.scope_doctor_id == user.pk
    return False


def grant_asset_download(*, asset, actor, ip_address=None, user_agent=""):
    if (
        asset.state != FileAsset.State.AVAILABLE
        or asset.scan_status != FileAsset.ScanStatus.CLEAN
        or asset.actual_size != asset.expected_size
        or asset.verified_sha256 != asset.sha256
        or not _can_download(actor, asset)
    ):
        raise AssetDownloadDenied("The file is unavailable.")
    url = presign_asset_download(asset)
    with transaction.atomic():
        FileAccessAudit.objects.create(
            asset=asset,
            actor=actor,
            action=FileAccessAudit.Action.DOWNLOAD_GRANTED,
            ip_address=ip_address,
            user_agent=(user_agent or "")[:255],
        )
    return url
