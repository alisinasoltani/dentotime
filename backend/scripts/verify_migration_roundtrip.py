"""Exercise the supported pre-release schema -> latest -> rollback -> latest path."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from django.db import connection
from django.db.migrations.executor import MigrationExecutor


PREVIOUS_RELEASE = [
    ("accounts", "0012_alter_doctorreview_options_and_more"),
    ("appointments", "0004_guest_booking_identity"),
    ("core", "0004_fileaccessaudit_and_more"),
    ("messaging", "0004_threadreadstate_alter_message_options_and_more"),
]


def executor():
    return MigrationExecutor(connection)


executor().migrate(PREVIOUS_RELEASE)
latest = executor().loader.graph.leaf_nodes()
executor().migrate(latest)
executor().migrate(PREVIOUS_RELEASE)
executor().migrate(latest)

with connection.cursor() as cursor:
    cursor.execute("SELECT COUNT(*) FROM django_migrations")
    assert cursor.fetchone()[0] > 0

print("Fresh, upgrade, rollback, and re-upgrade migration paths passed.")
