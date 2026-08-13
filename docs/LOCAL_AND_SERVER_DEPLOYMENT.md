# Dentotime local testing and server deployment guide

This repository has a Django/DRF backend in backend/ and a Next.js frontend in frontend/. PostgreSQL is the supported application database. Redis is required for production cache and realtime chat. Large files use private S3-compatible multipart storage; the browser uploads parts directly to storage and Django coordinates the upload session.

## 1. Local prerequisites

Install Git, Docker Desktop (Linux containers), Python 3.12, Node.js 22, npm, and OpenSSL. Give Docker at least 4 CPU cores, 8 GB RAM, and 20 GB free disk.

Do not use SQLite for the test suite. Locking, constraints, query plans, and concurrency tests require PostgreSQL.

## 2. Start local infrastructure

From PowerShell at the repository root:

~~~powershell
docker run --detach --name dentotime-postgres --env POSTGRES_DB=dentotime --env POSTGRES_USER=dentotime --env POSTGRES_PASSWORD=dentotime-local-password --publish 5432:5432 --volume dentotime-postgres-data:/var/lib/postgresql/data postgres:17
docker run --detach --name dentotime-redis --publish 6379:6379 --volume dentotime-redis-data:/data redis:8-alpine redis-server --appendonly yes
docker run --detach --name dentotime-minio --env MINIO_ROOT_USER=dentotime-local --env MINIO_ROOT_PASSWORD=dentotime-local-minio-password --publish 9000:9000 --publish 9001:9001 --volume dentotime-minio-data:/data minio/minio:RELEASE.2025-09-07T16-13-09Z server /data --console-address :9001
~~~

The MinIO container is needed for multipart-upload testing. Open http://127.0.0.1:9001, sign in with the credentials above, and create a private bucket named dentotime-local-private. The storage smoke script can also create the configured bucket.

Check the services:

~~~powershell
docker exec dentotime-postgres pg_isready -U dentotime -d dentotime
docker exec dentotime-redis redis-cli ping
~~~

For ordinary UI work, MinIO and ClamAV can be omitted. For the complete upload path, use MinIO and a local scanner/stub. Do not set REQUIRE_CLAMAV=True unless a reachable clamd service exists.

## 3. Configure and migrate the backend

~~~powershell
Set-Location .\backend
Copy-Item .env.example .env
py -3.12 -m venv .venv
& .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements/dev.lock
~~~

Edit backend/.env. A safe local baseline is:

~~~dotenv
DJANGO_ENVIRONMENT=development
DEBUG=True
SECRET_KEY=<random-development-secret>
JWT_SIGNING_KEY=<different-random-jwt-secret>
OTP_HASH_KEY=<different-random-otp-secret>
CAPTCHA_HASH_KEY=<different-random-captcha-secret>
ALLOWED_HOSTS=127.0.0.1,localhost
CORS_ALLOWED_ORIGINS=http://localhost:3000
CSRF_TRUSTED_ORIGINS=http://localhost:3000
DB_NAME=dentotime
DB_USER=dentotime
DB_PASS=dentotime-local-password
DB_HOST=127.0.0.1
DB_PORT=5432
DB_SSLMODE=disable
REDIS_URL=redis://127.0.0.1:6379/1
AWS_ACCESS_KEY_ID=dentotime-local
AWS_SECRET_ACCESS_KEY=dentotime-local-minio-password
AWS_STORAGE_BUCKET_NAME=dentotime-local-private
AWS_S3_ENDPOINT_URL=http://127.0.0.1:9000
AWS_S3_REGION_NAME=us-east-1
AWS_S3_SERVER_SIDE_ENCRYPTION=
REQUIRE_CLAMAV=False
~~~

Do not commit .env or place production values in it. The CAPTCHA is generated and verified by the backend; no third-party CAPTCHA service is required.

Run:

~~~powershell
python manage.py migrate
python manage.py check
python manage.py createsuperuser
~~~

The last command creates an administrator for the local admin panel. Normal migrations do not create sample login accounts.

For deterministic local patient/doctor actors when the SMS provider is unavailable, create throwaway accounts only in the local database:

~~~powershell
python manage.py shell
~~~

~~~python
from accounts.models import User, NormalUser, Doctor
NormalUser.objects.create_user(phone_number="+989121234567", password="Local-only-Patient-Password-2026!", role=User.Role.USER, first_name="Test", last_name="Patient")
Doctor.objects.create_user(phone_number="+989121234568", password="Local-only-Doctor-Password-2026!", role=User.Role.DOCTOR, first_name="Test", last_name="Doctor", clinic_name="Local Clinic", agreed_to_terms=True)
~~~

Delete these accounts after testing. Never run the snippet against production.

## 4. Start both applications

Backend terminal:

~~~powershell
Set-Location .\backend
& .\.venv\Scripts\Activate.ps1
python -m uvicorn config.asgi:application --host 127.0.0.1 --port 8000 --reload --forwarded-allow-ips 127.0.0.1
~~~

Verify:

~~~powershell
Invoke-WebRequest http://127.0.0.1:8000/api/v1/health/
Invoke-WebRequest http://127.0.0.1:8000/api/v1/ready/
~~~

Both should return 200. Readiness checks PostgreSQL and the shared Redis cache.

Frontend terminal:

~~~powershell
Set-Location .\frontend
Copy-Item .env.example .env.local
~~~

Set frontend/.env.local:

~~~dotenv
NEXT_PUBLIC_API_URL=
BACKEND_INTERNAL_URL=http://127.0.0.1:8000
~~~

Then install and start:

~~~powershell
npm ci
npm run dev
~~~

Open http://localhost:3000. Browser API requests use the Next same-origin /api rewrite.

## 5. Manual local acceptance test

Use a private window for guest behavior and separate browser profiles for patient, doctor, and administrator sessions.

1. Browse /doctors and a doctor detail page. Confirm only public doctor fields, rating averages, and vote counts are returned; phone numbers and identity documents must not appear.
2. As a guest, book an appointment. Confirm the exact notification: Ù†ÙˆØ¨Øª Ø´Ù…Ø§ Ø¨Ø§ Ù…ÙˆÙÙ‚ÛŒØª Ø«Ø¨Øª Ø´Ø¯. Ø¨Ø±Ø§ÛŒ Ù…Ø´Ø§Ù‡Ø¯Ù‡ Ù†ÙˆØ¨Øª Ùˆ Ù¾ÛŒÚ¯ÛŒØ±ÛŒ Ù„Ø·ÙØ§ Ø¨Ù‡ Ø­Ø³Ø§Ø¨ Ø®ÙˆØ¯ ÙˆØ§Ø±Ø¯ Ø´ÙˆÛŒØ¯. Confirm ÙˆØ±ÙˆØ¯ Ø¨Ù‡ Ø­Ø³Ø§Ø¨ is a real button on a separate line.
3. As a logged-in patient, book, list, and cancel an appointment. Confirm the exact notification: Ù†ÙˆØ¨Øª Ø´Ù…Ø§ Ø¨Ø§ Ù…ÙˆÙÙ‚ÛŒØª Ø°Ø®ÛŒØ±Ù‡ Ø´Ø¯.
4. Submit two concurrent bookings for one slot. Exactly one may succeed. Cancel it, verify history remains, and rebook the slot.
5. As a patient, rate an approved doctor with 1 and 5. Repeat a rating and confirm it updates one record. Confirm guest, doctor, inactive-doctor, and unapproved-doctor submissions are rejected.
6. As a doctor, submit verification documents. As an administrator, approve and reject requests. Confirm downloads require authorization and never expose permanent storage URLs.
7. Send messages as patient and administrator. Verify cursor pagination, realtime reconnect without duplicates, administrator-only internal notes, and reduced hidden-tab activity.
8. Upload an attachment, force a failed middle part, reload, reselect the same file, and verify successful parts are not uploaded again. Reselect a same-name/same-size different file and confirm resume is refused. Verify the final SHA-256 equals the local file.
9. Exercise the self-hosted CAPTCHA: solve once, reuse it, submit wrong answers until throttled, and confirm browser network logs contain no third-party CAPTCHA request.

## 6. Automated local verification

Backend, from backend/ with PostgreSQL and Redis running:

~~~powershell
python -m pip check
python manage.py check
python manage.py makemigrations --check --dry-run
pytest -q
python -m pip_audit --requirement requirements/production.lock --strict
python -m bandit -r accounts appointments config core messaging -x '*/migrations/*' -ll -ii
~~~

Frontend, from frontend/:

~~~powershell
npm ci
npm audit --audit-level=high
npm run lint
npm run typecheck
npm test
npx playwright install chromium firefox webkit
npm run test:e2e
npm run build
~~~

The E2E server creates temporary local HTTPS certificates. If browser installation is unavailable, record the browser suite as not run; do not treat that as a production pass.

## 7. Build and inspect production images locally

~~~powershell
Set-Location .\backend
docker build --tag dentotime-backend:local .
docker run --rm --entrypoint python dentotime-backend:local -m pip check
docker run --rm --entrypoint python dentotime-backend:local -c "import django, psycopg, redis; print('backend imports ok')"
Set-Location ..\frontend
docker build --tag dentotime-frontend:local --build-arg BACKEND_INTERNAL_URL=https://api.example.test --build-arg NEXT_PUBLIC_API_URL=https://api.example.test .
~~~

Both images run as UID/GID 10001:10001. The backend requires UVICORN_FORWARDED_ALLOW_IPS at runtime and the frontend requires BACKEND_INTERNAL_URL. Never use * for forwarded proxy IPs.

## 8. Production architecture

~~~text
Internet -> TLS reverse proxy -> frontend:3000
                         \-> backend:8000 (private only)
backend -> PostgreSQL over TLS
backend -> Redis over TLS
backend -> private S3-compatible bucket
backend -> ClamAV/clamd
~~~

The proxy terminates public TLS, sends X-Forwarded-Proto: https, and is the only component allowed to reach backend port 8000. Keep database, Redis, object storage, and ClamAV private. Do not expose ports 3000, 8000, 5432, 6379, 9000, or 3310 publicly.

## 9. Prepare a server

On Ubuntu, create a dedicated deploy user, install Docker Engine and a TLS reverse proxy, and restrict the firewall:

~~~bash
sudo adduser --disabled-password --gecos "" dentotime
sudo usermod -aG docker dentotime
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
~~~

Create DNS records, issue certificates, and confirm automatic renewal.

## 10. Production secrets and configuration

Store secrets in a secret manager, never in Git, Dockerfiles, or shell history. Required backend secrets include SECRET_KEY, JWT_SIGNING_KEY, OTP_HASH_KEY, CAPTCHA_HASH_KEY, DB_PASS, SMS_IR_API_KEY, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.

Production settings must include values equivalent to:

~~~dotenv
DJANGO_ENVIRONMENT=production
DEBUG=False
ALLOWED_HOSTS=api.example.com
CORS_ALLOWED_ORIGINS=https://app.example.com
CSRF_TRUSTED_ORIGINS=https://app.example.com
DB_SSLMODE=verify-full
DB_SSLROOTCERT=/run/secrets/postgres-ca.pem
REDIS_URL=rediss://:<password>@redis.example.internal:6379/1
REQUIRE_CLAMAV=True
CLAMAV_HOST=clamav.internal
CLAMAV_PORT=3310
AWS_STORAGE_BUCKET_NAME=dentotime-private
AWS_S3_ENDPOINT_URL=https://s3.example.internal
AWS_S3_SERVER_SIDE_ENCRYPTION=AES256
~~~

Set UVICORN_FORWARDED_ALLOW_IPS to the reverse proxy's private address/subnet; never *. Set frontend BACKEND_INTERNAL_URL to an HTTPS backend origin reachable from the frontend container, and NEXT_PUBLIC_API_URL to the public HTTPS API origin.

## 11. Build and publish immutable images

After CI is green, from a trusted build machine:

~~~bash
docker build -t registry.example.com/dentotime/backend:<git-sha> ./backend
docker build -t registry.example.com/dentotime/frontend:<git-sha> --build-arg BACKEND_INTERNAL_URL=https://backend.internal.example.com --build-arg NEXT_PUBLIC_API_URL=https://api.example.com ./frontend
docker push registry.example.com/dentotime/backend:<git-sha>
docker push registry.example.com/dentotime/frontend:<git-sha>
~~~

On the server, pull by digest rather than latest:

~~~bash
docker pull registry.example.com/dentotime/backend@sha256:<backend-digest>
docker pull registry.example.com/dentotime/frontend@sha256:<frontend-digest>
~~~

Run migrations once, before traffic switches:

~~~bash
docker run --rm --network dentotime-private --env-file /run/secrets/dentotime-backend.env registry.example.com/dentotime/backend@sha256:<backend-digest> python manage.py migrate --noinput
~~~

Use a supervisor, Compose, or Kubernetes restart policy. Never use Django runserver in production.

## 12. Reverse proxy requirements

Configure the proxy to redirect HTTP to HTTPS; proxy /api/ and /admin/ to the private backend; proxy other routes to frontend port 3000; preserve Host, X-Forwarded-For, and X-Forwarded-Proto; disable buffering and use a long read timeout for SSE; and apply edge rate limits to authentication and administrative paths.

Do not proxy 1 GB file bytes through Django. The browser should receive short-lived presigned part URLs and upload directly to private object storage. Do not serve backend /media/ publicly.

Verify after deployment:

~~~bash
curl -I http://app.example.com
curl -I https://app.example.com
curl -fsS https://api.example.com/api/v1/health/
curl -fsS https://api.example.com/api/v1/ready/
curl -i https://api.example.com/silk/
~~~

HTTP must redirect, HTTPS probes must be 200, and /silk/ must be unavailable.

## 13. Promotion, backup, and rollback

Before promotion, retain CI test output, SBOMs, secret/dependency/container scan reports, migration round-trip evidence, and backup/restore evidence. Run backend/scripts/smoke_deployment.py against staging and the critical Playwright suite against the candidate.

Confirm every replica is ready; PostgreSQL and Redis use TLS; the storage bucket is private; malware files remain quarantined; guest and authenticated Persian booking messages are exact; failed multipart parts resume after browser closure; private documents deny anonymous and cross-user access; realtime chat reconnects without loss or duplication; and p95 latency, query-count, memory, and upload-throughput budgets are met.

For application rollback, switch frontend/backend to previous immutable digests. Do not reverse a database migration unless its rollback was tested. Otherwise restore the verified pre-deployment backup into a new database and switch the application connection during a maintenance window. Never overwrite the only production database during a restore test.

## 14. Stop local services

~~~powershell
docker rm --force dentotime-postgres dentotime-redis dentotime-minio
~~~

Named volumes remain for reuse. List them before any intentional deletion:

~~~powershell
docker volume ls --filter name=dentotime-
~~~



