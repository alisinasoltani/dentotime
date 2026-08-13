# Production release and rollback

## Required release evidence

The backend and frontend CI workflows must both be green for the exact commit being deployed. Keep the generated SBOMs and scan reports with the release record. Run the staging smoke and load gates against the candidate before promoting it.

The backend container requires `UVICORN_FORWARDED_ALLOW_IPS` to contain only the reverse-proxy addresses that are allowed to supply forwarding headers. Do not use `*`. Keep the backend network private and expose it only through that proxy.

## Deployment order

1. Take and verify a PostgreSQL backup with `scripts/verify_backup_restore.py`.
2. Deploy the backend image by immutable digest and run migrations once.
3. Wait for `/api/v1/ready/` to return 200 from every backend replica.
4. Deploy the frontend image built with the production backend/public API origins.
5. Run `scripts/smoke_deployment.py` and the critical Playwright suite.

## Rollback

Application rollback uses the previous immutable frontend/backend image digests. Database rollback is permitted only when the release migration is marked reversible and the disposable migration round-trip gate passed. Otherwise restore the verified pre-deployment backup into a new database, validate it, and switch the application connection during a maintenance window. Never overwrite the only production database during a restore test.
