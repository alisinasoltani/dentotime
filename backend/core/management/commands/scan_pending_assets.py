import time
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from core.file_safety import FileScanError, scan_asset
from core.models import FileAsset


class Command(BaseCommand):
    help = "Scan quarantined objects using the configured private malware scanner."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=25)
        parser.add_argument("--watch", action="store_true")
        parser.add_argument("--poll-seconds", type=float, default=2.0)

    def handle(self, *args, **options):
        processed = 0
        while True:
            stale_before = timezone.now() - timedelta(minutes=30)
            asset_ids = list(
                FileAsset.objects.filter(state=FileAsset.State.QUARANTINED)
                .filter(
                    Q(scan_status=FileAsset.ScanStatus.PENDING)
                    | Q(scan_status=FileAsset.ScanStatus.SCANNING, updated_at__lt=stale_before)
                )
                .order_by("created_at")
                .values_list("pk", flat=True)[: options["limit"]]
            )
            for asset_id in asset_ids:
                try:
                    scan_asset(asset_id)
                except FileScanError as exc:
                    self.stderr.write(f"Asset {asset_id}: {exc}")
                processed += 1
            if not options["watch"]:
                break
            if not asset_ids:
                time.sleep(options["poll_seconds"])
        self.stdout.write(self.style.SUCCESS(f"Processed {processed} quarantined asset(s)."))
