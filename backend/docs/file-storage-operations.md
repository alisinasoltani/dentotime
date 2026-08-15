# Private file-storage operations

Production file handling requires three private services/processes:

1. An S3-compatible bucket with public access disabled and server-side encryption enabled.
2. A ClamAV daemon reachable only from the backend network.
3. A continuously running Django scanner worker.

Apply bucket controls after deployment:

```powershell
python manage.py configure_upload_bucket
```

Run the scanner as a supervised process (systemd, Kubernetes, or the platform's worker service):

```powershell
python manage.py scan_pending_assets --watch --limit 25 --poll-seconds 2
```

Run retention cleanup on a schedule. It aborts expired multipart uploads and removes only
retention-expired objects that are not attached to a message or verification submission:

```powershell
python manage.py cleanup_file_assets --limit 100
```

For the 1 GiB application limit, ClamAV must be configured to accept the same stream boundary.
Set `StreamMaxLength`, `MaxFileSize`, and `MaxScanSize` to at least `1100M`, give the daemon
appropriate memory and request timeouts, and keep it off the public network. Production sets
`REQUIRE_CLAMAV=True`; the backend will leave files quarantined when the scanner is unavailable.
The built-in EICAR detector is a deterministic development/test fallback, not a production
malware engine.

Use `AWS_S3_SERVER_SIDE_ENCRYPTION=AES256` (or the provider-supported encrypted mode) in
production. It may be empty only for a local MinIO instance without KMS. Downloads remain
private in either case: clients obtain a short-lived signed grant through the authorized API,
and no storage key or permanent object URL is serialized.
