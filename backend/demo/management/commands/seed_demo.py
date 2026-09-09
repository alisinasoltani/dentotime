from django.core.management.base import BaseCommand

from demo.seed import seed


class Command(BaseCommand):
    help = "Initialize the isolated scenario demo once; preserve changes on subsequent runs."

    def handle(self, *args, **options):
        created = seed()
        self.stdout.write("Demo scenarios created." if created else "Demo already initialized; presentation changes preserved.")
        self.stdout.write("Guide: docs/demo.md | Login: http://localhost:3100/login | Password: DentoDemo2026!")
