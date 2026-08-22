# راهنمای کامل راه‌اندازی دنتوتایم روی سرور

این سند روش راه‌اندازی نسخه فعلی دنتوتایم را روی یک سرور Ubuntu با Docker توضیح می‌دهد. در این روش PostgreSQL، Redis، MinIO، Django و worker بررسی فایل روی سرور اجرا می‌شوند، اما image فرانت‌اند از قبل روی سیستم build شده و روی سرور فقط بارگذاری و اجرا می‌شود.

## محدوده و هشدار مهم

فایل `backend/docker-compose.http.yml` در مخزن، یک پروفایل HTTP برای review/staging است. این فایل عمداً `DJANGO_ENVIRONMENT=development` و ارتباط داخلی بدون TLS را پشتیبانی می‌کند و نباید بدون سخت‌سازی به‌عنوان استقرار production اینترنتی معرفی شود.

راهنمای اصلی این سند برای یکی از این دو حالت است:

- سرور آزمایشی با IP و HTTP که فقط برای افراد مشخص قابل دسترسی است.
- سرور staging پشت Nginx و HTTPS، با علم به اینکه Django هنوز در پروفایل development و `DEBUG=False` اجرا می‌شود.

برای production واقعی باید بخش «الزامات production واقعی» در انتهای سند اجرا شود. صرفاً تغییر `DJANGO_ENVIRONMENT` به `production` کافی نیست؛ تنظیمات فعلی در production نیازمند PostgreSQL با TLS معتبر و ClamAV است. طبق تصمیم فعلی پروژه، ClamAV نصب نمی‌شود و این راهنما `REQUIRE_CLAMAV=False` را استفاده می‌کند.

## معماری سرویس‌ها

```text
Browser
  ├── Frontend / Next.js :3000
  │     └── /api/* → Django :8000 (داخل شبکه Docker)
  └── Multipart upload/download → MinIO :9000

Django
  ├── PostgreSQL :5432
  ├── Redis :6379 (cache و realtime chat stream)
  └── MinIO :9000

file-scanner
  ├── PostgreSQL
  └── MinIO
```

پورت PostgreSQL، Redis، پنل MinIO و backend فقط روی `127.0.0.1` bind می‌شوند. در حالت IP/HTTP، پورت‌های `3000` و `9000` باید از مرورگر قابل دسترسی باشند. در حالت Nginx/HTTPS، همین دو پورت نیز باید روی `127.0.0.1` bind شوند و فقط Nginx عمومی باشد.

## پیش‌نیازهای سرور

پیشنهاد پایه:

- Ubuntu Server 24.04 LTS یا 22.04 LTS، نسخه 64 بیتی
- حداقل 2 vCPU و 4 GB RAM؛ برای build کردن backend و اجرای روان‌تر 4 vCPU و 8 GB RAM پیشنهاد می‌شود
- حداقل 40 GB فضای SSD، به‌علاوه فضای موردنیاز فایل‌های کاربران و بکاپ‌ها
- دسترسی SSH با کاربر sudo
- Git
- Docker Engine و Docker Compose plugin
- ساعت سرور همگام با NTP

Docker را از repository رسمی نصب کنید. راهنمای مرجع:

- https://docs.docker.com/engine/install/ubuntu/
- https://docs.docker.com/compose/install/linux/

نمونه نصب روی Ubuntu:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

```bash
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
docker compose version
```

اگر کاربر deploy باید بدون sudo از Docker استفاده کند:

```bash
sudo usermod -aG docker "$USER"
```

بعد از این دستور یک بار logout/login کنید. عضویت در گروه `docker` عملاً دسترسی سطح root می‌دهد؛ آن را فقط به کاربر deploy بدهید.

## دریافت backend و فایل‌های Compose روی سرور

```bash
sudo mkdir -p /opt/dentotime
sudo chown "$USER":"$USER" /opt/dentotime
git clone YOUR_GIT_REPOSITORY_URL /opt/dentotime
cd /opt/dentotime
git checkout YOUR_RELEASE_TAG_OR_COMMIT
```

همیشه backend و image فرانت‌اند را از یک commit یا release بسازید. commit استفاده‌شده را ثبت کنید:

```bash
git rev-parse HEAD
```

## تولید secretها

برای هر secret یک مقدار مستقل تولید کنید؛ یک مقدار را بین چند متغیر تکرار نکنید:

```bash
openssl rand -base64 48
```

این دستور را حداقل برای موارد زیر جداگانه اجرا کنید:

- `SECRET_KEY`
- `JWT_SIGNING_KEY`
- `OTP_HASH_KEY`
- `CAPTCHA_HASH_KEY`
- `DB_PASS`
- `AWS_SECRET_ACCESS_KEY`
- `SYSTEM_ADMIN_PASSWORD`

رمز ادمین حداقل 14 کاراکتر باشد. secret واقعی را در Git، پیام‌رسان، issue یا log قرار ندهید.

## ساخت فایل محیطی سرور

روی سرور:

```bash
cd /opt/dentotime/backend
cp .env.server.example .env.server
chmod 600 .env.server
nano .env.server
```

نمونه کامل برای سرور آزمایشی با IP `203.0.113.10` در ادامه آمده است. IP، tag image، شماره تلفن، API key و تمام secretها را عوض کنید.

```dotenv
# اطلاعات استقرار
SERVER_HOST=203.0.113.10
PUBLIC_ORIGIN=http://203.0.113.10:3000
APP_PORT=3000
APP_BIND_ADDRESS=0.0.0.0
BACKEND_HOST_PORT=8000
FRONTEND_IMAGE=dentotime-frontend:release-20260822-01

# Django و امنیت
DJANGO_ENVIRONMENT=development
DEBUG=False
SECRET_KEY=REPLACE_WITH_RANDOM_SECRET_1
JWT_SIGNING_KEY=REPLACE_WITH_RANDOM_SECRET_2
OTP_HASH_KEY=REPLACE_WITH_RANDOM_SECRET_3
CAPTCHA_HASH_KEY=REPLACE_WITH_RANDOM_SECRET_4
JWT_ISSUER=dentotime-api
ALLOWED_HOSTS=localhost,127.0.0.1,backend,203.0.113.10
CORS_ALLOWED_ORIGINS=http://203.0.113.10:3000
CSRF_TRUSTED_ORIGINS=http://203.0.113.10:3000
TRUSTED_PROXY_IPS=
CORS_ALLOW_ALL_ORIGINS=False
ENABLE_SILK=False
LOG_LEVEL=INFO
REFRESH_THROTTLE_RATE=120/min
REFRESH_COOKIE_NAME=dentotime_refresh

# PostgreSQL
DB_NAME=dentotime
DB_USER=dentotime
DB_PASS=REPLACE_WITH_RANDOM_DATABASE_PASSWORD
POSTGRES_HOST_PORT=55432
DB_CONNECT_TIMEOUT=10
DB_CONN_MAX_AGE=60

# Redis
REDIS_HOST_PORT=6379
CACHE_KEY_PREFIX=dentotime

# Realtime chat / SSE
CHAT_EVENT_STREAM_PREFIX=dentotime:chat:events
CHAT_EVENT_STREAM_MAX_LENGTH=10000
CHAT_SSE_BLOCK_MILLISECONDS=15000
CHAT_SSE_MAX_CONNECTION_SECONDS=540
CHAT_DELTA_PAGE_SIZE=100

# پیامک؛ برای OTP واقعی و اعلان‌ها لازم است
SMS_IR_API_KEY=REPLACE_WITH_SMS_IR_API_KEY
SMS_CONNECT_TIMEOUT_SECONDS=2
SMS_READ_TIMEOUT_SECONDS=5

# OTP و captcha
OTP_TTL_SECONDS=120
OTP_GRANT_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
OTP_RATE_WINDOW_SECONDS=600
OTP_PHONE_RATE_LIMIT=3
OTP_IP_RATE_LIMIT=10
OTP_DEVICE_RATE_LIMIT=5
CAPTCHA_TTL_SECONDS=300
CAPTCHA_MAX_ATTEMPTS=5
CAPTCHA_RATE_WINDOW_SECONDS=600
CAPTCHA_IP_RATE_LIMIT=20
CAPTCHA_DEVICE_RATE_LIMIT=10

# نوبت‌ها و محدودسازی رزرو مهمان
AVAILABILITY_MAX_RANGE_DAYS=62
GUEST_BOOKING_RATE_WINDOW_SECONDS=3600
GUEST_BOOKING_PHONE_RATE_LIMIT=3
GUEST_BOOKING_IP_RATE_LIMIT=12
GUEST_BOOKING_DEVICE_RATE_LIMIT=6

# MinIO / S3-compatible storage
AWS_ACCESS_KEY_ID=dentotime-server-storage
AWS_SECRET_ACCESS_KEY=REPLACE_WITH_RANDOM_STORAGE_PASSWORD
AWS_STORAGE_BUCKET_NAME=dentotime-private-uploads
AWS_S3_REGION_NAME=us-east-1
AWS_S3_SERVER_SIDE_ENCRYPTION=
AWS_S3_PUBLIC_ENDPOINT_URL=http://203.0.113.10:9000
AWS_S3_PRESIGN_EXPIRY_SECONDS=900
AWS_S3_DOWNLOAD_EXPIRY_SECONDS=300
MINIO_CORS_ALLOWED_ORIGINS=http://203.0.113.10:3000
MINIO_BIND_ADDRESS=0.0.0.0
MINIO_CONSOLE_PORT=9001

# Multipart upload و retention
UPLOAD_PART_SIZE=16777216
UPLOAD_SESSION_TTL_SECONDS=604800
FILE_UPLOAD_QUOTA_BYTES=5368709120
FILE_FAILED_RETENTION_DAYS=7
CHAT_FILE_RETENTION_DAYS=1095
VERIFICATION_FILE_RETENTION_DAYS=2555
PROFILE_FILE_RETENTION_DAYS=365

# ادمین اولیه؛ بعد از اولین اجرای موفق خالی شود
SYSTEM_ADMIN_PHONE=+989120000001
SYSTEM_ADMIN_PASSWORD=REPLACE_WITH_UNIQUE_ADMIN_PASSWORD_14_CHARS_OR_MORE

# Uvicorn
UVICORN_FORWARDED_ALLOW_IPS=127.0.0.1

# تصمیم فعلی پروژه: بدون ClamAV
REQUIRE_CLAMAV=False
CLAMAV_HOST=
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_SECONDS=30
```

در Compose فعلی این مقادیر داخل شبکه Docker به‌صورت صریح تنظیم می‌شوند و لازم نیست در `.env.server` تغییر کنند:

```dotenv
DB_HOST=postgres
DB_PORT=5432
DB_SSLMODE=disable
REDIS_URL=redis://redis:6379/1
AWS_S3_ENDPOINT_URL=http://minio:9000
BACKEND_INTERNAL_URL=http://backend:8000
NEXT_PUBLIC_API_URL=
```

`SERVER_HOST` و `PUBLIC_ORIGIN` برای خوانایی و ابزارهای عملیاتی هستند و در Compose فعلی مستقیماً مصرف نمی‌شوند؛ مقادیر واقعی مهم، `ALLOWED_HOSTS`، `CORS_ALLOWED_ORIGINS`، `CSRF_TRUSTED_ORIGINS`، `AWS_S3_PUBLIC_ENDPOINT_URL` و origin زمان build فرانت‌اند هستند.

### متغیرهای الزامی یا شرطی

| متغیر | وضعیت | توضیح |
|---|---|---|
| `SECRET_KEY` | الزامی | secret اصلی Django |
| `JWT_SIGNING_KEY` | شدیداً الزامی | باید مستقل از `SECRET_KEY` باشد |
| `OTP_HASH_KEY` | شدیداً الزامی | کلید مستقل برای OTP |
| `CAPTCHA_HASH_KEY` | شدیداً الزامی | کلید مستقل برای captcha |
| `DB_PASS` | الزامی | رمز PostgreSQL و مقدار `POSTGRES_PASSWORD` |
| `AWS_SECRET_ACCESS_KEY` | الزامی | رمز root فعلی MinIO و credential backend |
| `AWS_ACCESS_KEY_ID` | الزامی برای upload | نام credential MinIO |
| `AWS_STORAGE_BUCKET_NAME` | الزامی برای upload | bucket خصوصی فایل‌ها |
| `AWS_S3_PUBLIC_ENDPOINT_URL` | الزامی برای upload مرورگر | آدرسی که مرورگر کاربر واقعاً به آن دسترسی دارد |
| `MINIO_CORS_ALLOWED_ORIGINS` | الزامی برای upload مرورگر | origin دقیق frontend، بدون slash انتهایی |
| `SMS_IR_API_KEY` | الزامی برای OTP واقعی | بدون آن کد OTP و اعلان پیامکی به کاربر تحویل نمی‌شود |
| `SYSTEM_ADMIN_PHONE/PASSWORD` | فقط bootstrap | برای ایجاد ادمین اولیه؛ سپس هر دو را خالی کنید |
| `FRONTEND_IMAGE` | الزامی در روش این سند | tag دقیق image بارگذاری‌شده روی سرور |
| `REQUIRE_CLAMAV=False` | فعلاً الزامی طبق تصمیم پروژه | worker اجرا می‌شود اما ClamAV استفاده نمی‌شود |

## متغیرهای محیطی کامل پروژه

### متغیرهای host و Compose

| نام | پیش‌فرض | کاربرد |
|---|---:|---|
| `APP_PORT` | `3000` | پورت عمومی frontend |
| `APP_BIND_ADDRESS` | `0.0.0.0` | برای Nginx بهتر است `127.0.0.1` باشد |
| `BACKEND_HOST_PORT` | `8000` | backend فقط روی localhost منتشر می‌شود |
| `POSTGRES_HOST_PORT` | `55432` | PostgreSQL فقط روی localhost |
| `REDIS_HOST_PORT` | `6379` | Redis فقط روی localhost |
| `MINIO_BIND_ADDRESS` | `0.0.0.0` | در حالت IP عمومی؛ پشت Nginx برابر `127.0.0.1` |
| `MINIO_CONSOLE_PORT` | `9001` | پنل MinIO فقط روی localhost |
| `FRONTEND_IMAGE` | `dentotime-frontend:latest` | image از قبل build و load شده |
| `MINIO_CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | origin مجاز frontend برای PUT مستقیم |

### متغیرهای Django، auth و شبکه

| نام | پیش‌فرض | نکته |
|---|---:|---|
| `DJANGO_ENVIRONMENT` | `production` در کد | در Compose فعلی صریحاً `development` تنظیم شود |
| `DEBUG` | `False` | روی هر نوع سرور `False` |
| `ALLOWED_HOSTS` | وابسته به environment | hostname/IP صریح؛ هرگز `*` در production |
| `CORS_ALLOWED_ORIGINS` | خالی | originهای comma-separated |
| `CSRF_TRUSTED_ORIGINS` | خالی | origin کامل شامل scheme |
| `TRUSTED_PROXY_IPS` | خالی | فقط IP پراکسی واقعاً مورداعتماد |
| `CORS_ALLOW_ALL_ORIGINS` | `False` | روی سرور همیشه `False` |
| `ENABLE_SILK` | `False` | فقط توسعه محلی |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `REFRESH_THROTTLE_RATE` | `120/min` | rate limit refresh token |
| `REFRESH_COOKIE_NAME` | `dentotime_refresh` | نام cookie refresh |
| `JWT_ISSUER` | `dentotime-api` | issuer توکن‌ها |
| `UVICORN_FORWARDED_ALLOW_IPS` | `127.0.0.1` در Compose | هرگز `*` نگذارید |

### متغیرهای PostgreSQL

| نام | پیش‌فرض | نکته |
|---|---:|---|
| `DB_NAME` | `dentotime` در Compose | نام دیتابیس |
| `DB_USER` | `dentotime` در Compose | کاربر دیتابیس |
| `DB_PASS` | ندارد | الزامی |
| `DB_HOST` | `postgres` در Compose | در اجرای خارج Docker باید دستی تنظیم شود |
| `DB_PORT` | `5432` در Compose | پورت داخلی |
| `DB_SSLMODE` | `disable` در Compose review | production کد فقط `verify-ca` یا `verify-full` را می‌پذیرد |
| `DB_SSLROOTCERT` | خالی | مسیر CA برای PostgreSQL production |
| `DB_CONNECT_TIMEOUT` | `10` | ثانیه |
| `DB_CONN_MAX_AGE` | `60` | عمر connection pool بر حسب ثانیه |

### متغیرهای Redis و realtime chat

| نام | پیش‌فرض | نکته |
|---|---:|---|
| `REDIS_URL` | در production الزامی | Compose آن را `redis://redis:6379/1` می‌کند |
| `CACHE_KEY_PREFIX` | `dentotime` | برای جداسازی کلیدها |
| `CHAT_EVENT_STREAM_PREFIX` | `dentotime:chat:events` | prefix streamها |
| `CHAT_EVENT_STREAM_MAX_LENGTH` | `10000` | سقف طول stream |
| `CHAT_SSE_BLOCK_MILLISECONDS` | `15000` | مدت block هر Redis read |
| `CHAT_SSE_MAX_CONNECTION_SECONDS` | `540` | عمر اتصال SSE؛ timeout پراکسی باید بیشتر باشد |
| `CHAT_DELTA_PAGE_SIZE` | `100` | تعداد پیام delta |

### متغیرهای OTP، captcha و rate limit

تمام متغیرهای این بخش مقدار پیش‌فرض امن فعلی دارند، ولی بهتر است در `.env.server` صریح باشند:

- `OTP_TTL_SECONDS`
- `OTP_GRANT_TTL_SECONDS`
- `OTP_MAX_ATTEMPTS`
- `OTP_RATE_WINDOW_SECONDS`
- `OTP_PHONE_RATE_LIMIT`
- `OTP_IP_RATE_LIMIT`
- `OTP_DEVICE_RATE_LIMIT`
- `CAPTCHA_TTL_SECONDS`
- `CAPTCHA_MAX_ATTEMPTS`
- `CAPTCHA_RATE_WINDOW_SECONDS`
- `CAPTCHA_IP_RATE_LIMIT`
- `CAPTCHA_DEVICE_RATE_LIMIT`
- `GUEST_BOOKING_RATE_WINDOW_SECONDS`
- `GUEST_BOOKING_PHONE_RATE_LIMIT`
- `GUEST_BOOKING_IP_RATE_LIMIT`
- `GUEST_BOOKING_DEVICE_RATE_LIMIT`
- `AVAILABILITY_MAX_RANGE_DAYS`

### متغیرهای MinIO، upload و نگهداری فایل

| نام | پیش‌فرض | نکته |
|---|---:|---|
| `AWS_ACCESS_KEY_ID` | `dentotime-local-storage` در Compose | روی سرور مقدار اختصاصی بگذارید |
| `AWS_SECRET_ACCESS_KEY` | ندارد | الزامی |
| `AWS_STORAGE_BUCKET_NAME` | `dentotime-uploads` | bucket خصوصی |
| `AWS_S3_ENDPOINT_URL` | `http://minio:9000` در Compose | فقط backend از آن استفاده می‌کند |
| `AWS_S3_PUBLIC_ENDPOINT_URL` | `http://localhost:9000` | در URLهای presigned به مرورگر برمی‌گردد |
| `AWS_S3_REGION_NAME` | `us-east-1` | با MinIO هماهنگ بماند |
| `AWS_S3_SERVER_SIDE_ENCRYPTION` | خالی در development | در production کد `AES256` را پیش‌فرض می‌گیرد |
| `AWS_S3_PRESIGN_EXPIRY_SECONDS` | `900` | انقضای URL آپلود |
| `AWS_S3_DOWNLOAD_EXPIRY_SECONDS` | `300`، حداکثر `900` | انقضای URL دانلود |
| `UPLOAD_PART_SIZE` | `16777216` | 16 MiB؛ بدون بررسی تغییر ندهید |
| `UPLOAD_SESSION_TTL_SECONDS` | `604800` | 7 روز |
| `FILE_UPLOAD_QUOTA_BYTES` | `5368709120` | سهمیه 5 GiB برای هر کاربر |
| `FILE_FAILED_RETENTION_DAYS` | `7` | نگهداری فایل شکست‌خورده |
| `CHAT_FILE_RETENTION_DAYS` | `1095` | فایل چت |
| `VERIFICATION_FILE_RETENTION_DAYS` | `2555` | سند احراز هویت |
| `PROFILE_FILE_RETENTION_DAYS` | `365` | تصویر پروفایل |

### متغیرهای ClamAV

طبق نیاز فعلی:

```dotenv
REQUIRE_CLAMAV=False
CLAMAV_HOST=
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_SECONDS=30
```

سرویس `file-scanner` را حذف نکنید. در این حالت بررسی داخلی deterministic اجرا می‌شود، اما جایگزین آنتی‌ویروس واقعی نیست.

### متغیرهای build فرانت‌اند

این مقادیر داخل bundle/image تثبیت می‌شوند. تغییر آن‌ها نیازمند build مجدد image است:

| نام | مقدار پیشنهادی |
|---|---|
| `BACKEND_INTERNAL_URL` | `http://backend:8000` |
| `NEXT_PUBLIC_API_URL` | خالی؛ مرورگر از `/api` همان origin استفاده می‌کند |
| `NEXT_PUBLIC_STORAGE_ORIGIN` | دقیقاً برابر `AWS_S3_PUBLIC_ENDPOINT_URL` |
| `ALLOW_INSECURE_HTTP` | برای HTTP آزمایشی `true`؛ برای HTTPS `false` |
| `NODE_ENV` | Dockerfile در runtime برابر `production` می‌گذارد |

### متغیرهایی که روی سرور نباید فعال شوند

این متغیرها فقط برای seed یا test هستند و روی سرور واقعی نباید تنظیم شوند:

- `ALLOW_DESTRUCTIVE_SEEDING`
- `SEED_USER_PASSWORD`
- `RATING_DEMO_PASSWORD`
- `LOAD_P95_BUDGET_MS`
- `LOAD_FAILURE_RATIO`

`SMOKE_BACKEND_URL` فقط هنگام اجرای smoke test به‌صورت موقت استفاده می‌شود و runtime secret نیست.

## ساخت image فرانت‌اند روی سیستم build

معماری image باید با سرور یکسان باشد. روی سرور بررسی کنید:

```bash
uname -m
```

- برای `x86_64` از `linux/amd64` استفاده کنید.
- برای `aarch64` از `linux/arm64` استفاده کنید.

### PowerShell روی Windows

از ریشه مخزن و همان commit سرور:

```powershell
$ReleaseTag = "release-20260822-01"
$FrontendImage = "dentotime-frontend:$ReleaseTag"
$StorageOrigin = "http://203.0.113.10:9000"
```

```powershell
docker buildx build `
  --platform linux/amd64 `
  --load `
  --build-arg BACKEND_INTERNAL_URL=http://backend:8000 `
  --build-arg NEXT_PUBLIC_API_URL= `
  --build-arg NEXT_PUBLIC_STORAGE_ORIGIN=$StorageOrigin `
  --build-arg ALLOW_INSECURE_HTTP=true `
  --tag $FrontendImage `
  .\frontend
```

```powershell
docker image inspect $FrontendImage
docker save --output "$ReleaseTag.tar" $FrontendImage
Get-FileHash -Algorithm SHA256 "$ReleaseTag.tar"
scp "$ReleaseTag.tar" deploy@203.0.113.10:/opt/dentotime/releases/frontend/
```

هش نمایش‌داده‌شده را جداگانه ثبت کنید. اگر سرور HTTPS دارد، `StorageOrigin` را `https://files.example.com` و `ALLOW_INSECURE_HTTP` را `false` بگذارید.

### Linux یا macOS روی سیستم build

```bash
RELEASE_TAG=release-20260822-01
FRONTEND_IMAGE="dentotime-frontend:${RELEASE_TAG}"
STORAGE_ORIGIN=http://203.0.113.10:9000
```

```bash
docker buildx build \
  --platform linux/amd64 \
  --load \
  --build-arg BACKEND_INTERNAL_URL=http://backend:8000 \
  --build-arg NEXT_PUBLIC_API_URL= \
  --build-arg NEXT_PUBLIC_STORAGE_ORIGIN="$STORAGE_ORIGIN" \
  --build-arg ALLOW_INSECURE_HTTP=true \
  --tag "$FRONTEND_IMAGE" \
  ./frontend
```

```bash
docker save "$FRONTEND_IMAGE" | gzip -9 > "${RELEASE_TAG}.tar.gz"
sha256sum "${RELEASE_TAG}.tar.gz" > "${RELEASE_TAG}.tar.gz.sha256"
scp "${RELEASE_TAG}.tar.gz" "${RELEASE_TAG}.tar.gz.sha256" deploy@203.0.113.10:/opt/dentotime/releases/frontend/
```

## بارگذاری image روی سرور

```bash
mkdir -p /opt/dentotime/releases/frontend
cd /opt/dentotime/releases/frontend
```

برای فایل gzip:

```bash
sha256sum --check release-20260822-01.tar.gz.sha256
docker load --input release-20260822-01.tar.gz
```

برای فایل tar منتقل‌شده از PowerShell، هش اعلام‌شده را با این خروجی مقایسه کنید:

```bash
sha256sum release-20260822-01.tar
docker load --input release-20260822-01.tar
```

سپس tag را بررسی کنید:

```bash
docker image inspect dentotime-frontend:release-20260822-01
```

مقدار `FRONTEND_IMAGE` در `/opt/dentotime/backend/.env.server` باید دقیقاً همین tag باشد.

## اعتبارسنجی تنظیمات Compose قبل از اجرا

```bash
cd /opt/dentotime/backend
docker compose \
  --env-file .env.server \
  -f docker-compose.http.yml \
  -f docker-compose.frontend-image.yml \
  config --quiet
```

برای مشاهده تنظیمات resolve‌شده از `config` استفاده کنید، اما خروجی کامل را در log عمومی قرار ندهید چون ممکن است secretها را نمایش دهد.

## اجرای اولین‌بار

ابتدا infrastructure و backend را اجرا کنید. نام سرویس frontend عمداً در این دستور نیست:

```bash
cd /opt/dentotime/backend
docker compose \
  --env-file .env.server \
  -f docker-compose.http.yml \
  up -d --build \
  postgres redis minio minio-init backend-migrate backend file-scanner
```

`backend-migrate` به‌صورت خودکار migrationها را اجرا می‌کند و در صورت تنظیم بودن، ادمین اولیه را ایجاد یا بروزرسانی می‌کند.

بعد frontend از image بارگذاری‌شده اجرا شود:

```bash
docker compose \
  --env-file .env.server \
  -f docker-compose.http.yml \
  -f docker-compose.frontend-image.yml \
  up -d --no-build --no-deps frontend
```

وجود `--no-build` مهم است. `--no-deps` نیز تضمین می‌کند این مرحله فقط container فرانت‌اند را تغییر دهد. روی سرور از دستور `up --build` برای frontend استفاده نکنید.

وضعیت سرویس‌ها:

```bash
docker compose \
  --env-file .env.server \
  -f docker-compose.http.yml \
  -f docker-compose.frontend-image.yml \
  ps
```

لاگ‌ها:

```bash
docker compose \
  --env-file .env.server \
  -f docker-compose.http.yml \
  -f docker-compose.frontend-image.yml \
  logs --tail=200 backend frontend file-scanner postgres redis minio
```

بعد از ایجاد موفق ادمین، این دو مقدار را در `.env.server` خالی کنید تا اجرای migrationهای بعدی رمز ادمین را دوباره reset نکند:

```dotenv
SYSTEM_ADMIN_PHONE=
SYSTEM_ADMIN_PASSWORD=
```

## بررسی سلامت استقرار

در خود سرور:

```bash
curl --fail http://127.0.0.1:3000/
curl --fail http://127.0.0.1:3000/api/v1/health/
curl --fail http://127.0.0.1:3000/api/v1/ready/
```

بررسی migrationها:

```bash
docker compose --env-file .env.server -f docker-compose.http.yml exec backend \
  python manage.py showmigrations
```

بررسی Django:

```bash
docker compose --env-file .env.server -f docker-compose.http.yml exec backend \
  python manage.py check
```

بررسی bucket خصوصی و نوشتن/خواندن/حذف فایل آزمایشی:

```bash
docker compose --env-file .env.server -f docker-compose.http.yml exec backend \
  python scripts/storage_smoke.py
```

ورود ادمین از فرم اصلی سایت در `/login` انجام می‌شود؛ مسیر جداگانه `/admin/login` استفاده نمی‌شود.

چک دستی ضروری:

- ثبت‌نام و دریافت OTP واقعی
- ورود کاربر، پزشک و ادمین
- ارسال و دریافت پیام realtime و reconnect بعد از قطع کوتاه شبکه
- آپلود فایل و ادامه upload بعد از قطع شبکه
- دریافت نوبت توسط کاربر و نمایش در تقویم پزشک
- بازشدن تصویر پروفایل و فایل‌های خصوصی فقط برای فرد مجاز

## تنظیم firewall

Docker می‌تواند قواعد UFW را دور بزند. علاوه بر UFW، firewall ارائه‌دهنده سرور یا قواعد `DOCKER-USER` را نیز بررسی کنید.

### حالت IP/HTTP آزمایشی

فقط IPهای تیم review باید به این پورت‌ها دسترسی داشته باشند:

- `22/tcp` برای SSH
- `3000/tcp` برای frontend
- `9000/tcp` برای MinIO API و upload مستقیم مرورگر

پورت‌های زیر عمومی نشوند:

- `55432` PostgreSQL
- `6379` Redis
- `8000` Django
- `9001` MinIO Console

### حالت Nginx/HTTPS

در `.env.server`:

```dotenv
APP_BIND_ADDRESS=127.0.0.1
MINIO_BIND_ADDRESS=127.0.0.1
PUBLIC_ORIGIN=https://app.example.com
CORS_ALLOWED_ORIGINS=https://app.example.com
CSRF_TRUSTED_ORIGINS=https://app.example.com
MINIO_CORS_ALLOWED_ORIGINS=https://app.example.com
AWS_S3_PUBLIC_ENDPOINT_URL=https://files.example.com
```

image frontend نیز باید با این مقادیر دوباره build شود:

```text
NEXT_PUBLIC_STORAGE_ORIGIN=https://files.example.com
ALLOW_INSECURE_HTTP=false
```

فقط پورت‌های `22`, `80`, `443` عمومی باشند.

## Nginx و HTTPS برای staging

DNSهای زیر را به IP سرور متصل کنید:

- `app.example.com`
- `files.example.com`

نصب Nginx و Certbot:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

فایل `/etc/nginx/sites-available/dentotime`:

```nginx
server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 650s;
        proxy_send_timeout 650s;
    }
}

server {
    listen 80;
    server_name files.example.com;

    client_max_body_size 0;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 650s;
        proxy_send_timeout 650s;
    }
}
```

فعال‌سازی:

```bash
sudo ln -s /etc/nginx/sites-available/dentotime /etc/nginx/sites-enabled/dentotime
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d app.example.com -d files.example.com
sudo certbot renew --dry-run
```

مقادیر timeout بالاتر از `CHAT_SSE_MAX_CONNECTION_SECONDS=540` نگه داشته شده‌اند تا اتصال realtime چت توسط Nginx زودتر قطع نشود. مستند رسمی reverse proxy در https://nginx.org/en/docs/http/ngx_http_proxy_module.html قرار دارد.

بعد از تغییر origin یا دامنه، frontend image باید دوباره build شود؛ تغییر runtime `.env.server` به‌تنهایی `NEXT_PUBLIC_STORAGE_ORIGIN` داخل image را عوض نمی‌کند.

## بروزرسانی frontend بدون build روی سرور

روی سیستم build:

1. commit/release جدید را checkout کنید.
2. image را با tag جدید بسازید.
3. تست‌ها را اجرا کنید.
4. image را `docker save` کنید.
5. checksum و archive را به سرور بفرستید.

روی سرور:

```bash
docker load --input /opt/dentotime/releases/frontend/release-NEW.tar
nano /opt/dentotime/backend/.env.server
```

`FRONTEND_IMAGE` را به tag جدید تغییر دهید، سپس:

```bash
cd /opt/dentotime/backend
docker compose \
  --env-file .env.server \
  -f docker-compose.http.yml \
  -f docker-compose.frontend-image.yml \
  up -d --no-build --no-deps --force-recreate frontend
```

پس از health check، imageهای قدیمی را فوراً پاک نکنید؛ حداقل یک نسخه سالم برای rollback نگه دارید.

### rollback فرانت‌اند

`FRONTEND_IMAGE` را به tag قبلی برگردانید و همان دستور `up -d --no-build --no-deps --force-recreate frontend` را اجرا کنید. چون image قبلی روی سرور باقی مانده، rollback نیازمند build نیست.

## بروزرسانی backend و migrationها

قبل از هر بروزرسانی بکاپ بگیرید. سپس:

```bash
cd /opt/dentotime
git fetch --all --tags
git checkout YOUR_NEW_RELEASE_TAG_OR_COMMIT
```

```bash
cd /opt/dentotime/backend
docker compose --env-file .env.server -f docker-compose.http.yml \
  up -d --build postgres redis minio minio-init backend-migrate backend file-scanner
```

frontend را با overlay و `--no-build` اجرا یا حفظ کنید:

```bash
docker compose \
  --env-file .env.server \
  -f docker-compose.http.yml \
  -f docker-compose.frontend-image.yml \
  up -d --no-build --no-deps frontend
```

rollback کد backend بدون rollback دیتابیس همیشه امن نیست. migration را فقط وقتی reverse کنید که مسیر downgrade همان release تست شده باشد. در غیر این صورت بکاپ قبل از release را restore کنید.

## بکاپ PostgreSQL

```bash
mkdir -p /opt/dentotime/backups/postgres
cd /opt/dentotime/backend
```

```bash
docker compose --env-file .env.server -f docker-compose.http.yml exec -T postgres \
  sh -c 'pg_dump --format=custom --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  > "/opt/dentotime/backups/postgres/dentotime-$(date +%F-%H%M%S).dump"
```

وجود و اندازه فایل را بررسی کنید و نسخه‌ای رمزگذاری‌شده خارج از همین سرور نگه دارید.

### تست restore ایزوله

اسکریپت `backend/scripts/verify_backup_restore.py` یک dump موقت می‌سازد، آن را در دیتابیس ایزوله restore می‌کند و دیتابیس آزمایشی را حذف می‌کند. این تست به ابزارهای PostgreSQL client نیاز دارد و بهتر است دوره‌ای در محیط عملیات اجرا شود.

### restore واقعی

restore روی دیتابیس اصلی destructive است. قبل از اجرا، فایل، نام دیتابیس و بکاپ را دوباره بررسی کنید و سرویس‌های writer را متوقف کنید:

```bash
cd /opt/dentotime/backend
docker compose --env-file .env.server -f docker-compose.http.yml stop backend file-scanner
```

سپس با `pg_restore --clean --if-exists` بکاپ تأییدشده را restore و سرویس‌ها را مجدد اجرا کنید. این عملیات را ابتدا روی سرور staging تمرین کنید.

## بکاپ MinIO و volumeها

دیتابیس بدون objectهای MinIO یک بکاپ کامل نیست. bucket خصوصی را با `mc mirror` به فضای بکاپ مستقل mirror کنید یا از snapshot رمزگذاری‌شده volume `dentotime-minio` استفاده کنید.

مواردی که باید بکاپ شوند:

- PostgreSQL dump
- bucket تعریف‌شده در `AWS_STORAGE_BUCKET_NAME`
- فایل `.env.server` به‌صورت رمزگذاری‌شده
- tag و digest imageهای frontend/backend
- commit یا release دقیق کد

Redis منبع اصلی داده نیست، اما volume آن برای کاهش از دست رفتن streamهای اخیر persist شده است.

## نگهداری دوره‌ای فایل‌ها

برای پاک‌سازی sessionها و فایل‌های منقضی‌شده، command زیر را طبق سیاست retention در cron اجرا کنید:

```bash
cd /opt/dentotime/backend
docker compose --env-file .env.server -f docker-compose.http.yml exec -T backend \
  python manage.py cleanup_file_assets
```

ابتدا help command را ببینید و زمان‌بندی را در staging آزمایش کنید:

```bash
docker compose --env-file .env.server -f docker-compose.http.yml exec backend \
  python manage.py cleanup_file_assets --help
```

## مانیتورینگ و عملیات روزمره

```bash
docker compose --env-file .env.server -f docker-compose.http.yml ps
docker stats
df -h
docker system df
```

لاگ زنده یک سرویس:

```bash
docker compose --env-file .env.server -f docker-compose.http.yml logs -f --tail=200 backend
```

restart کنترل‌شده:

```bash
docker compose --env-file .env.server -f docker-compose.http.yml restart backend file-scanner
```

برای frontend همیشه overlay را نیز بدهید:

```bash
docker compose \
  --env-file .env.server \
  -f docker-compose.http.yml \
  -f docker-compose.frontend-image.yml \
  restart frontend
```

هشدارهای پیشنهادی:

- فضای دیسک کمتر از 20٪
- unhealthy شدن backend یا frontend
- failure پیوسته file-scanner
- افزایش 5xx
- خطای Redis یا قطع SSE
- رشد غیرعادی PostgreSQL یا bucket
- شکست بکاپ یا dry-run restore
- انقضای گواهی TLS

## عیب‌یابی

### backend unhealthy است

```bash
docker compose --env-file .env.server -f docker-compose.http.yml logs --tail=300 backend backend-migrate
```

موارد رایج:

- secret خالی
- `DB_PASS` متفاوت با volume PostgreSQL قدیمی
- migration ناموفق
- `ALLOWED_HOSTS` ناقص
- Redis یا MinIO unhealthy

اگر volume PostgreSQL قبلاً با رمز دیگری ساخته شده باشد، تغییر `DB_PASS` در env رمز داخل دیتابیس موجود را خودکار تغییر نمی‌دهد.

### frontend روی سرور build می‌شود یا image پیدا نمی‌شود

بررسی کنید:

```bash
docker image inspect dentotime-frontend:YOUR_RELEASE_TAG
```

دستور اجرا باید هر دو فایل Compose، `--no-build` و `--no-deps` را داشته باشد. مقدار `pull_policy: never` در overlay مانع دریافت image اشتباه از registry می‌شود.

### آپلود فایل کار نمی‌کند

این موارد باید دقیقاً با هم هماهنگ باشند:

- `NEXT_PUBLIC_STORAGE_ORIGIN` زمان build frontend
- `AWS_S3_PUBLIC_ENDPOINT_URL` روی backend
- `MINIO_CORS_ALLOWED_ORIGINS`
- DNS/scheme/port قابل دسترسی از مرورگر
- باز بودن پورت `9000` یا reverse proxy دامنه فایل

خطای certificate، mixed content یا CORS را در Network tab مرورگر بررسی کنید.

### چت realtime مرتب قطع می‌شود

- Redis باید healthy باشد.
- Nginx باید `proxy_buffering off` داشته باشد.
- `proxy_read_timeout` باید بیشتر از `CHAT_SSE_MAX_CONNECTION_SECONDS` باشد.
- تغییر کوتاه شبکه باید توسط frontend reconnect شود؛ log backend و Network tab را بررسی کنید.

### login loop یا refresh ناموفق

- ساعت سرور و مرورگر درست باشد.
- originهای CORS/CSRF دقیق و شامل scheme صحیح باشند.
- `/api` باید از frontend به backend rewrite شود.
- در استقرار HTTPS، frontend image باید با originهای HTTPS ساخته شده باشد.
- مسیر ورود همه نقش‌ها `/login` است.

## الزامات production واقعی

پروفایل فعلی را نمی‌توان فقط با تغییر یک env به production تبدیل کرد. قبل از قرار دادن سامانه در دسترس عمومی واقعی، حداقل موارد زیر لازم است:

1. Compose production جداگانه با `DJANGO_ENVIRONMENT=production` و `DEBUG=False`.
2. PostgreSQL با TLS و `DB_SSLMODE=verify-full` یا `verify-ca` به‌همراه `DB_SSLROOTCERT`؛ Compose فعلی `disable` را override می‌کند و باید تغییر کند.
3. frontend build با `ALLOW_INSECURE_HTTP=false` و originهای HTTPS.
4. `SECURE` شدن refresh/session/CSRF cookieها که با `DJANGO_ENVIRONMENT=production` فعال می‌شود.
5. reverse proxy قابل‌اعتماد با `X-Forwarded-Proto=https` و allowlist دقیق proxy IPها.
6. object storage خصوصی، TLS، بکاپ خارج از سرور و lifecycle policy.
7. اسکن آنتی‌ویروس فایل. طبق تصمیم فعلی پروژه ClamAV غیرفعال است؛ بنابراین این شرط production هنوز عمداً برآورده نشده است.
8. secret manager یا حداقل فایل env رمزگذاری‌شده و rotation دوره‌ای.
9. مانیتورینگ، alerting، log retention و تست restore دوره‌ای.
10. تست امنیت، تست بار، تست migration و برنامه rollback تأییدشده.

تا وقتی PostgreSQL TLS و اسکن آنتی‌ویروس production آماده نشده‌اند، مقدار زیر را برای پروفایل فعلی حفظ کنید:

```dotenv
DJANGO_ENVIRONMENT=development
DEBUG=False
REQUIRE_CLAMAV=False
```

این انتخاب برای review/staging است و نباید به‌عنوان production نهایی گزارش شود.

## چک‌لیست نهایی تحویل سرور

- [ ] commit backend و tag frontend image ثبت شده است.
- [ ] checksum archive frontend قبل از `docker load` تأیید شده است.
- [ ] frontend با `--no-build` اجرا شده است.
- [ ] `.env.server` دارای permission برابر `600` است.
- [ ] چهار secret اصلی مستقل هستند.
- [ ] PostgreSQL و Redis عمومی نیستند.
- [ ] MinIO Console عمومی نیست.
- [ ] origin عمومی MinIO از مرورگر قابل دسترسی است.
- [ ] CORS و CSRF فقط origin واقعی را دارند.
- [ ] `DEBUG=False` و `ENABLE_SILK=False` است.
- [ ] `REQUIRE_CLAMAV=False` مطابق تصمیم فعلی ثبت شده است.
- [ ] migrationها موفق هستند.
- [ ] health، readiness و storage smoke موفق هستند.
- [ ] ادمین اولیه ساخته و سپس env رمز آن خالی شده است.
- [ ] OTP واقعی آزمایش شده است.
- [ ] چت realtime و reconnect آزمایش شده است.
- [ ] multipart upload و resume آزمایش شده است.
- [ ] بکاپ PostgreSQL و MinIO گرفته شده است.
- [ ] restore بکاپ در محیط ایزوله آزمایش شده است.
- [ ] حداقل یک frontend image سالم قبلی برای rollback وجود دارد.
