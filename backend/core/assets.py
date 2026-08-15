from django.db.models import Q
from django.utils import timezone

from core.models import FileAsset


class AssetBindingError(ValueError):
    pass


def lock_attachable_asset(*, asset_id, owner, purpose, thread=None, doctor=None):
    """Lock and validate a completed asset before binding it to another record."""

    asset = (
        FileAsset.objects.select_for_update()
        .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
        .filter(
            pk=asset_id,
            owner=owner,
            purpose=purpose,
            state=FileAsset.State.AVAILABLE,
            scan_status=FileAsset.ScanStatus.CLEAN,
        )
        .first()
    )
    if asset is None:
        raise AssetBindingError("The asset is unavailable, unsafe, expired, or not owned by you.")
    if asset.actual_size != asset.expected_size or asset.verified_sha256 != asset.sha256:
        raise AssetBindingError("The asset has not passed integrity verification.")
    if purpose == FileAsset.Purpose.CHAT_ATTACHMENT:
        if thread is None or asset.scope_thread_id != thread.pk:
            raise AssetBindingError("The asset is not scoped to this thread.")
        from messaging.models import MessageAttachment

        if MessageAttachment.objects.filter(asset_id=asset.pk).exists():
            raise AssetBindingError("The asset is already attached to a message.")
    elif purpose == FileAsset.Purpose.VERIFICATION_DOCUMENT:
        if doctor is None or asset.scope_doctor_id != doctor.pk:
            raise AssetBindingError("The asset is not scoped to this doctor.")
        from accounts.models import DoctorDocument

        if DoctorDocument.objects.filter(asset_id=asset.pk).exists():
            raise AssetBindingError("The asset is already attached to a verification submission.")
    else:
        raise AssetBindingError("This asset purpose cannot be attached here.")
    return asset
