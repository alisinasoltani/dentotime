"""Read-only release gate for databases that may have historical sample data."""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.models import Q

from accounts.models import Doctor, User
from appointments.models import Appointment


class Command(BaseCommand):
    help = "Refuse production promotion when known demo records or the demo marker exist. Never deletes data."

    def add_arguments(self, parser):
        parser.add_argument("--if-production", action="store_true")

    def handle(self, *args, **options):
        if options["if_production"] and not settings.IS_PRODUCTION:
            return
        legacy = (
            "+989010669227", "+989028262592", "+989138958712", "+989148721497",
            "+989121111101", "+989121111102", "+989121111201", "+989121111202", "+989121111203",
            *[f"+98913111120{i}" for i in range(1, 9)],
            *[f"+9891200000{i}" for i in range(10, 22)],
            *[f"+9891200000{i}" for i in range(50, 56)],
        )
        findings = {
            "demo schema": int("demo_demostate" in connection.introspection.table_names()),
            "demo usernames": User.objects.filter(username__startswith="demo-").count(),
            "active historical sample identities": User.objects.filter(phone_number__in=legacy, is_active=True).count(),
            "sample doctor registrations": Doctor.objects.filter(
                Q(medical_registration_number__startswith="SEED-") | Q(medical_registration_number__startswith="DEMO-")
            ).count(),
            "sample visits": Appointment.objects.filter(
                Q(reason__startswith="[DEMO]") | Q(reason__startswith="[INITIAL_DATA]") | Q(reason__startswith="[RATING_DEMO]")
            ).count(),
        }
        # This phone is also a configurable real bootstrap admin: flag only the legacy seed's identity.
        findings["legacy sample administrator"] = User.objects.filter(
            phone_number="+989120000001", first_name="مدیر", last_name="کلینیک",
        ).count()
        issues = [f"{name}: {count}" for name, count in findings.items() if count]
        if issues:
            raise CommandError(
                "Production promotion blocked; inspect known demo data before release. "
                + "; ".join(issues) + ". No data was changed. See docs/demo.md."
            )
        self.stdout.write("No known demo records detected (this is not a complete production security audit).")
