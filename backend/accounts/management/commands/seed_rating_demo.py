"""Retired sample-data command; demo data uses a dedicated stack."""

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Retired. Use docker-compose.demo.yml and docs/demo.md (Ubuntu/Bash or Windows/PowerShell)."

    def add_arguments(self, parser):
        parser.add_argument("--password")

    def handle(self, *args, **options):
        raise CommandError(
            "seed_rating_demo is retired; no data was changed. "
            "From the host backend/ directory, start the isolated demo:\n"
            "docker compose -p dentotime-demo -f docker-compose.demo.yml "
            "up -d --build --wait --wait-timeout 180\n"
            "On Ubuntu, prefix docker with sudo if required. "
            "See docs/demo.md for Ubuntu/Bash, Windows/PowerShell and SSH access. "
            "Do not use docker-compose.http.yml or .env.server for demo data."
        )
