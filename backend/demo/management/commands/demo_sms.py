import json

from django.core.management.base import BaseCommand

from demo.guard import require_demo
from demo.models import DemoSMS


class Command(BaseCommand):
    help = "Read the isolated demo SMS inbox (including OTPs)."

    def handle(self, *args, **options):
        require_demo()
        for sms in reversed(list(DemoSMS.objects.order_by("-pk")[:20])):
            self.stdout.write(f"{sms.created_at.isoformat()} | {sms.mobile} | {sms.template_id} | " + json.dumps(sms.parameters, ensure_ascii=False))
