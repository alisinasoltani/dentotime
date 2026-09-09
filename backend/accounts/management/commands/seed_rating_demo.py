"""Retired sample-data command; demo data uses a dedicated stack."""

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Retired. Use scripts/Start-Demo.ps1 and the isolated demo stack."

    def add_arguments(self, parser):
        parser.add_argument("--password")

    def handle(self, *args, **options):
        raise CommandError(
            "seed_rating_demo is retired; no data was changed. "
            "Use scripts/Start-Demo.ps1 (see docs/demo.md)."
        )
