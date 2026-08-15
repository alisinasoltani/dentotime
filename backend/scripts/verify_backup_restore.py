"""Create and restore a PostgreSQL custom-format backup in an isolated database."""

import os
import subprocess
import tempfile
import uuid

import psycopg
from psycopg import sql


source_db = os.environ["DB_NAME"]
restore_db = f"dentotime_restore_test_{uuid.uuid4().hex[:10]}"
if not restore_db.startswith("dentotime_restore_test_"):
    raise RuntimeError("Refusing an unsafe restore database name.")

connection_args = {
    "host": os.environ["DB_HOST"],
    "port": os.environ["DB_PORT"],
    "user": os.environ["DB_USER"],
    "password": os.environ["DB_PASS"],
}
command_env = {**os.environ, "PGPASSWORD": os.environ["DB_PASS"]}

with tempfile.TemporaryDirectory(prefix="dentotime-backup-") as directory:
    dump_path = os.path.join(directory, "database.dump")
    try:
        subprocess.run(
            [
                "pg_dump", "--format=custom", "--no-owner", "--no-privileges",
                "--host", connection_args["host"], "--port", str(connection_args["port"]),
                "--username", connection_args["user"], "--file", dump_path, source_db,
            ],
            check=True,
            env=command_env,
        )
        with psycopg.connect(dbname="postgres", autocommit=True, **connection_args) as admin:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(restore_db)))
        subprocess.run(
            [
                "pg_restore", "--exit-on-error", "--no-owner", "--no-privileges",
                "--host", connection_args["host"], "--port", str(connection_args["port"]),
                "--username", connection_args["user"], "--dbname", restore_db, dump_path,
            ],
            check=True,
            env=command_env,
        )
        with psycopg.connect(dbname=source_db, **connection_args) as source:
            source_count = source.execute("SELECT COUNT(*) FROM django_migrations").fetchone()[0]
        with psycopg.connect(dbname=restore_db, **connection_args) as restored:
            restored_count = restored.execute("SELECT COUNT(*) FROM django_migrations").fetchone()[0]
        assert restored_count == source_count and restored_count > 0
    finally:
        with psycopg.connect(dbname="postgres", autocommit=True, **connection_args) as admin:
            admin.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s",
                (restore_db,),
            )
            admin.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(restore_db)))

print("PostgreSQL backup and isolated restore verification passed.")
