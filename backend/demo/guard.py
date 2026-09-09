from django.conf import settings
from django.core.management import CommandError
from django.db import connection


def require_demo():
    expected = "test_dentotime_demo" if settings.DJANGO_ENVIRONMENT == "test" else "dentotime_demo"
    if (
        not getattr(settings, "DEMO_MODE", False)
        or settings.IS_PRODUCTION
        or settings.DJANGO_ENVIRONMENT not in {"development", "test"}
        or connection.vendor != "postgresql"
        or connection.settings_dict["NAME"] != expected
        or connection.settings_dict["HOST"] != "demo-postgres"
        or settings.AWS_STORAGE_BUCKET_NAME != "dentotime-demo"
    ):
        raise CommandError("Demo operations require the isolated demo settings, database and storage.")
    with connection.cursor() as cursor:
        cursor.execute("SELECT current_database()")
        if cursor.fetchone()[0] != expected:
            raise CommandError("Connected database does not match the demo configuration.")
