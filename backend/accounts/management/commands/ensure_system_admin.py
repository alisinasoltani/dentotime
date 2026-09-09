import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.validators import normalize_phone_number


class Command(BaseCommand):
    help = "Create or update the system administrator from environment variables."

    def add_arguments(self, parser):
        parser.add_argument(
            "--if-configured",
            action="store_true",
            help="Exit successfully when SYSTEM_ADMIN_PHONE or SYSTEM_ADMIN_PASSWORD is absent.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        phone = os.getenv("SYSTEM_ADMIN_PHONE", "").strip()
        password = os.getenv("SYSTEM_ADMIN_PASSWORD", "")
        if not phone or not password:
            if options["if_configured"]:
                self.stdout.write("System admin credentials are not configured; skipping.")
                return
            raise CommandError("SYSTEM_ADMIN_PHONE and SYSTEM_ADMIN_PASSWORD are required.")
        if len(password) < 14:
            raise CommandError("SYSTEM_ADMIN_PASSWORD must contain at least 14 characters.")

        phone = normalize_phone_number(phone)
        User = get_user_model()
        user = User.objects.select_for_update().filter(phone_number=phone).first()
        if user is not None and user.role != User.Role.ADMIN:
            raise CommandError("The configured phone number belongs to a non-admin account.")
        if user is None:
            user = User.objects.create_superuser(phone_number=phone, password=password)
            action = "created"
        else:
            user.is_active = True
            user.is_staff = True
            user.is_superuser = True
            user.set_password(password)
            user.save(update_fields=("is_active", "is_staff", "is_superuser", "password"))
            action = "updated"
        self.stdout.write(self.style.SUCCESS(f"System administrator {action}."))
