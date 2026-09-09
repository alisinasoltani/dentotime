# راهنمای استقرار دنتوتایم با build مستقیم روی سرور

برای نمایش نقش‌ها و سناریوها از [محیط دموی مستقل](../backend/docs/demo.md) استفاده کنید.
دستورهای قدیمی `populate_db` و `seed_rating_demo` بازنشسته شده‌اند. پیش از انتقال
دیتابیس موجود به production، دستور `python manage.py check_demo_data` را اجرا کنید؛
وجود داده نمایشی مانع انتشار می‌شود و هیچ رکوردی به‌صورت خودکار حذف نخواهد شد.

این راهنما برای سرور فعلی با IP `95.38.185.165` و اجرای HTTP روی پورت `3000` نوشته شده است. تمام imageهای backend و frontend روی خود سرور و از سورس همان commit ساخته می‌شوند؛ هیچ فایل `.tar`، دستور `docker save` یا `docker load` لازم نیست.

## معماری اجرا

- سایت و API از طریق frontend روی `http://95.38.185.165:3000` در دسترس‌اند.
- frontend درخواست‌های `/api/v1/...` را داخل شبکه Docker به backend می‌فرستد.
- PostgreSQL، Redis و backend فقط روی loopback سرور منتشر می‌شوند.
- MinIO API روی پورت `9000` برای آپلود مستقیم مرورگر در دسترس است؛ console آن فقط روی loopback است.
- `backend-migrate` migrationها و ساخت/به‌روزرسانی مدیر سیستم را انجام می‌دهد.
- `file-scanner` همیشه اجرا می‌شود؛ در وضعیت فعلی `REQUIRE_CLAMAV=False` است و ClamAV لازم نیست.
- backend با یک worker اجرا می‌شود تا روی سرور کم‌حافظه پایدار بماند.
- build فرانت‌اند نیز به یک worker محدود شده است تا روی سرور 1 vCPU قابل انجام باشد.

## ۱. پیش‌نیاز سرور

حداقل پیشنهادی برای build روی خود سرور:

- Ubuntu 22.04 یا 24.04
- 1 vCPU
- 1 GB RAM همراه با حداقل 4 GB swap
- حداقل 15 GB فضای خالی
- Docker Engine و Docker Compose plugin
- Git

روی سرور 1 GB، قبل از build حتماً swap بسازید:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

اگر Docker نصب نیست:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

## ۲. دریافت سورس

برای نصب اولیه:

```bash
sudo mkdir -p /opt/dentotime
sudo chown "$USER":"$USER" /opt/dentotime
git clone YOUR_GIT_REPOSITORY_URL /opt/dentotime
cd /opt/dentotime
git checkout staging
git pull --ff-only
git rev-parse --short HEAD
```

برای بروزرسانی، ابتدا وضعیت محلی را ببینید. اگر فایل تغییرکرده دارید، بدون بررسی `reset --hard` نزنید:

```bash
cd /opt/dentotime
git status --short
git fetch origin
git pull --ff-only
git rev-parse --short HEAD
```

## ۳. تنظیم متغیرهای محیطی

```bash
cd /opt/dentotime/backend
cp .env.server.example .env.server
chmod 600 .env.server
nano .env.server
```

فایل `.env.server.example` تمام متغیرهای لازم و مقادیر مناسب IP فعلی را دارد. این موارد را حتماً با secretهای مستقل جایگزین کنید:

- `SECRET_KEY`
- `JWT_SIGNING_KEY`
- `OTP_HASH_KEY`
- `CAPTCHA_HASH_KEY`
- `DB_PASS`
- `AWS_SECRET_ACCESS_KEY`
- `SYSTEM_ADMIN_PASSWORD`
- `SMS_IR_API_KEY` در صورت فعال بودن پیامک واقعی

برای ساخت secret:

```bash
openssl rand -hex 48
```

نکات مهم:

- `SYSTEM_ADMIN_PHONE` باید E.164 باشد؛ برای شماره `09120000001` مقدار درست `+989120000001` است.
- خط‌هایی مثل `=JWT_SIGNING_KEY` اشتباه‌اند؛ سمت چپ مساوی باید نام متغیر باشد.
- مقادیر URL را بدون Markdown و بدون کروشه وارد کنید؛ مثلاً `PUBLIC_ORIGIN=http://95.38.185.165:3000`.
- `AWS_S3_PUBLIC_ENDPOINT_URL=http://95.38.185.165:9000` باید از مرورگر کاربران قابل دسترسی باشد.
- `MINIO_CORS_ALLOWED_ORIGINS=http://95.38.185.165:3000` باید با origin سایت یکسان باشد.
- در وضعیت فعلی `REQUIRE_CLAMAV=False` باقی بماند.
- متغیر `FRONTEND_IMAGE` لازم نیست و نباید تنظیم شود.
- Compose مقادیر داخلی `DB_HOST=postgres`، `REDIS_URL=redis://redis:6379/1` و `AWS_S3_ENDPOINT_URL=http://minio:9000` را داخل containerها اعمال می‌کند.

اعتبارسنجی Compose:

```bash
cd /opt/dentotime/backend
sudo docker compose --env-file .env.server -f docker-compose.http.yml config --quiet
sudo docker compose --env-file .env.server -f docker-compose.http.yml config --services
```

خروجی services باید شامل این موارد باشد:

```text
minio
minio-init
postgres
redis
backend-migrate
backend
file-scanner
frontend
```

## ۴. build مستقیم backend و frontend روی سرور

روی سرور کم‌حافظه buildها را موازی اجرا نکنید:

```bash
cd /opt/dentotime/backend

sudo env COMPOSE_PARALLEL_LIMIT=1 docker compose +  --env-file .env.server +  -f docker-compose.http.yml +  build --pull backend backend-migrate file-scanner

sudo env COMPOSE_PARALLEL_LIMIT=1 docker compose +  --env-file .env.server +  -f docker-compose.http.yml +  build --pull frontend
```

Dockerfile فرانت‌اند `npm ci --include=optional` را اجرا می‌کند تا binaryهای Linux/musl مربوط به LightningCSS و Tailwind هنگام build روی Ubuntu حذف نشوند. build باید با عبارت `Compiled successfully` تمام شود.

## ۵. اجرای سرویس‌ها و migration

containerهای one-shot قبلی را حذف کنید تا migration و MinIO init با image جدید دوباره اجرا شوند:

```bash
cd /opt/dentotime/backend

sudo docker compose +  --env-file .env.server +  -f docker-compose.http.yml +  rm -f backend-migrate minio-init

sudo docker compose +  --env-file .env.server +  -f docker-compose.http.yml +  up -d
```

وضعیت:

```bash
sudo docker compose --env-file .env.server -f docker-compose.http.yml ps -a
sudo docker compose --env-file .env.server -f docker-compose.http.yml logs --no-color --tail=200 backend-migrate
```

`backend-migrate` و `minio-init` باید با exit code صفر تمام شوند. سایر سرویس‌ها باید Running/Healthy باشند.

## ۶. داده‌های اولیه

ساخت مدیر سیستم توسط `backend-migrate` و فرمان `ensure_system_admin --if-configured` انجام می‌شود.

اگر همین محیط باید داده‌های نمایشی پزشکان، امتیازها و کاربران تستی را داشته باشد، یک بار اجرا کنید:

```bash
sudo docker compose +  --env-file .env.server +  -f docker-compose.http.yml +  run --rm --no-deps backend +  python manage.py seed_rating_demo --password 'DemoRating123!'
```

برای دیتابیس واقعی production این seed را اجرا نکنید.

## ۷. firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw allow 9000/tcp
sudo ufw enable
sudo ufw status
```

پورت‌های PostgreSQL، Redis، backend و MinIO console در Compose فقط روی `127.0.0.1` هستند و نباید عمومی شوند.

## ۸. تست سلامت بعد از استقرار

روی خود سرور:

```bash
curl -fsS http://127.0.0.1:3000/ >/dev/null
curl -fsS http://127.0.0.1:3000/doctors >/dev/null
curl -fsS http://127.0.0.1:3000/login >/dev/null
curl -fsS http://127.0.0.1:3000/api/v1/health/
curl -fsS http://127.0.0.1:3000/api/v1/doctors/preview/
curl -fsS http://127.0.0.1:3000/api/v1/doctors/arman-hosseini/rating-summary/
curl -fsS http://127.0.0.1:3000/api/v1/doctors/arman-hosseini/reviews/
```

از یک دستگاه خارج از شبکه سرور نیز باز کنید:

- `http://95.38.185.165:3000/`
- `http://95.38.185.165:3000/login`
- `http://95.38.185.165:3000/doctors/arman-hosseini`

مواردی که باید دستی کنترل شوند:

- ورود کاربر، پزشک و مدیر سیستم
- نمایش پزشکان، امتیازها و نظرها
- ثبت امتیاز توسط کاربر مجاز و نمایش خطای درست برای کاربر غیرمجاز
- ورود به chat هر سه نقش بدون redirect loop
- ارسال پیام، قطع و وصل شبکه و بازیابی اتصال
- آپلود فایل و پایان یافتن پردازش توسط `file-scanner`
- نوبت‌ها و تقویم پزشک
- خروج هر نقش و انتقال به `/login`

## ۹. مشاهده logها

```bash
sudo docker compose --env-file .env.server -f docker-compose.http.yml +  logs -f --tail=200 frontend backend file-scanner
```

برای migration:

```bash
sudo docker compose --env-file .env.server -f docker-compose.http.yml +  logs --no-color --tail=300 backend-migrate
```

## ۱۰. بروزرسانی امن

ابتدا backup دیتابیس:

```bash
mkdir -p /opt/dentotime/backups
sudo docker compose --env-file /opt/dentotime/backend/.env.server +  -f /opt/dentotime/backend/docker-compose.http.yml +  exec -T postgres pg_dump -U dentotime -d dentotime +  | gzip > /opt/dentotime/backups/dentotime-before-update.sql.gz
```

سپس:

```bash
cd /opt/dentotime
git status --short
git pull --ff-only

cd backend
sudo env COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file .env.server -f docker-compose.http.yml +  build --pull backend backend-migrate file-scanner
sudo env COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file .env.server -f docker-compose.http.yml +  build --pull frontend

sudo docker compose --env-file .env.server -f docker-compose.http.yml +  rm -f backend-migrate minio-init
sudo docker compose --env-file .env.server -f docker-compose.http.yml up -d
```

تا قبل از موفقیت build، containerهای نسخه قبلی متوقف نمی‌شوند. قبل از migration از PostgreSQL backup بگیرید، چون rollback کد لزوماً migration دیتابیس را برنمی‌گرداند.

## ۱۱. عیب‌یابی سریع

### build فرانت‌اند با LightningCSS شکست می‌خورد

مطمئن شوید جدیدترین Dockerfile pull شده است:

```bash
grep -n 'npm ci --include=optional' /opt/dentotime/frontend/Dockerfile
```

سپس frontend را بدون cache بسازید:

```bash
cd /opt/dentotime/backend
sudo env COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file .env.server -f docker-compose.http.yml +  build --no-cache frontend
```

### build روی سرور با exit 137 متوقف می‌شود

`free -h` را بررسی کنید، 4 GB swap بسازید و buildها را با `COMPOSE_PARALLEL_LIMIT=1` جداگانه اجرا کنید.

### سرویس file-scanner دیده نمی‌شود

```bash
cd /opt/dentotime
git pull --ff-only
cd backend
sudo docker compose --env-file .env.server -f docker-compose.http.yml config --services
```

از overlay قدیمی `docker-compose.frontend-image.yml` استفاده نکنید.

### ensure_system_admin شماره را نامعتبر می‌داند

`SYSTEM_ADMIN_PHONE` را به فرمت `+989...` تغییر دهید، سپس:

```bash
sudo docker compose --env-file .env.server -f docker-compose.http.yml rm -f backend-migrate
sudo docker compose --env-file .env.server -f docker-compose.http.yml up backend-migrate
```

### فرمان seed_rating_demo وجود ندارد

سورس یا image backend قدیمی است. commit را بررسی و backend را دوباره build کنید:

```bash
git rev-parse --short HEAD
sudo docker compose --env-file .env.server -f docker-compose.http.yml build backend
sudo docker compose --env-file .env.server -f docker-compose.http.yml +  run --rm --no-deps backend python manage.py help | grep seed_rating_demo
```

### صفحه باز می‌شود ولی پزشکان، نظرها یا login کار نمی‌کنند

```bash
sudo docker compose --env-file .env.server -f docker-compose.http.yml ps -a
sudo docker compose --env-file .env.server -f docker-compose.http.yml +  logs --no-color --tail=300 frontend backend backend-migrate
curl -i http://127.0.0.1:3000/api/v1/health/
```

backend و frontend را همیشه از یک commit build کنید.

## ۱۲. HTTPS

پیکربندی فعلی برای تست عمومی HTTP است. برای production واقعی:

- یک دامنه و reverse proxy مانند Caddy یا Nginx اضافه کنید.
- TLS معتبر فعال کنید.
- `PUBLIC_ORIGIN`، `CORS_ALLOWED_ORIGINS`، `CSRF_TRUSTED_ORIGINS`، `MINIO_CORS_ALLOWED_ORIGINS` و `AWS_S3_PUBLIC_ENDPOINT_URL` را به URLهای HTTPS تغییر دهید.
- build arg/runtime مربوط به `ALLOW_INSECURE_HTTP` را `false` کنید.
- `DJANGO_ENVIRONMENT=production` قرار دهید.
- پس از تغییر origin، frontend را روی همان سرور دوباره build کنید.

## چک‌لیست نهایی

- [ ] `.env.server` شامل secret واقعی و مستقل است و commit نشده است.
- [ ] `SYSTEM_ADMIN_PHONE` با `+989` شروع می‌شود.
- [ ] `REQUIRE_CLAMAV=False` است.
- [ ] حداقل 4 GB swap روی سرور 1 GB فعال است.
- [ ] هر دو build backend و frontend روی خود سرور موفق‌اند.
- [ ] `backend-migrate` با code صفر خارج شده است.
- [ ] backend و frontend از یک commit هستند.
- [ ] frontend، backend، PostgreSQL، Redis و MinIO healthy هستند.
- [ ] file-scanner در حال اجرا است.
- [ ] پورت‌های 3000 و 9000 از بیرون قابل دسترسی‌اند.
- [ ] login، پزشکان، rating، comments، chat، upload و appointments تست شده‌اند.
- [ ] قبل از هر بروزرسانی از PostgreSQL backup گرفته شده است.
