from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from core.models import FileAccessAudit, FileAsset, UploadSession
from core.object_storage import delete_asset_object
from core.uploads import UploadError, cancel_upload


class Command(BaseCommand):
    help = "Abort expired multipart sessions and purge only retention-eligible unattached objects."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        now = timezone.now()
        expired = list(
            UploadSession.objects.select_related("asset")
            .filter(
                expires_at__lte=now,
                state__in=(
                    UploadSession.State.CREATED,
                    UploadSession.State.UPLOADING,
                    UploadSession.State.EXPIRED,
                    UploadSession.State.FAILED,
                ),
            )
            .order_by("expires_at")[: options["limit"]]
        )
        aborted = 0
        for session in expired:
            try:
                cancel_upload(session)
                aborted += 1
            except UploadError as exc:
                self.stderr.write(f"Upload {session.pk}: {exc}")

        candidates = list(
            FileAsset.objects.filter(retention_until__lte=now)
            .filter(Q(state=FileAsset.State.FAILED) | Q(state=FileAsset.State.AVAILABLE))
            .filter(message_attachment__isnull=True, doctor_document__isnull=True)
            .order_by("retention_until")[: options["limit"]]
        )
        purged = 0
        for asset in candidates:
            with transaction.atomic():
                locked = FileAsset.objects.select_for_update().get(pk=asset.pk)
                if hasattr(locked, "message_attachment") or hasattr(locked, "doctor_document"):
                    continue
                locked.state = FileAsset.State.DELETED
                locked.deleted_at = now
                locked.save(update_fields=("state", "deleted_at", "updated_at"))
            try:
                delete_asset_object(asset)
            except Exception:
                FileAsset.objects.filter(pk=asset.pk, state=FileAsset.State.DELETED).update(
                    state=FileAsset.State.FAILED,
                    deleted_at=None,
                    failed_reason="Retention cleanup could not remove the private object.",
                )
                raise
            with transaction.atomic():
                locked = FileAsset.objects.select_for_update().get(pk=asset.pk)
                FileAccessAudit.objects.create(
                    asset=locked,
                    action=FileAccessAudit.Action.RETENTION_DELETE,
                    detail="Object removed after its retention period.",
                )
                purged += 1
        self.stdout.write(
            self.style.SUCCESS(f"Aborted {aborted} upload(s); purged {purged} retained object(s).")
        )
