#!/usr/bin/env bash
# Publish only the dedicated synthetic demo; never touch review/production volumes.
set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
    printf 'Usage: sudo bash scripts/start-public-demo.sh PUBLIC_IPV4_OR_HOSTNAME\n' >&2
    printf 'Pass only the host, without http://, a port, or a path.\n' >&2
    exit 2
fi

demo_host="$1"
demo_backend="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
demo_env="$demo_backend/.env.demo-public"
command -v docker >/dev/null
command -v openssl >/dev/null

# Generate all values before creating the file, and never overwrite existing keys.
# MinIO root-key changes preserve objects; the existing PostgreSQL password stays
# unchanged because POSTGRES_PASSWORD does not update an initialized database.
if [[ ! -e "$demo_env" ]]; then
    demo_secret="$(openssl rand -hex 48)"
    demo_jwt="$(openssl rand -hex 48)"
    demo_otp="$(openssl rand -hex 48)"
    demo_captcha="$(openssl rand -hex 48)"
    demo_storage="$(openssl rand -hex 48)"
    (
        umask 077
        set -o noclobber
        printf '%s\n' \
            "DEMO_PUBLIC_HOST=$demo_host" \
            "DEMO_SECRET_KEY=$demo_secret" \
            "DEMO_JWT_SIGNING_KEY=$demo_jwt" \
            "DEMO_OTP_HASH_KEY=$demo_otp" \
            "DEMO_CAPTCHA_HASH_KEY=$demo_captcha" \
            "DEMO_STORAGE_SECRET_KEY=$demo_storage" > "$demo_env"
    )
    printf 'Created private .env.demo-public; keep it and never commit or share it.\n'
fi
chmod 600 "$demo_env"
if ! grep -Fqx "DEMO_PUBLIC_HOST=$demo_host" "$demo_env"; then
    printf 'Host differs from .env.demo-public. Edit DEMO_PUBLIC_HOST there, keep all keys, and retry.\n' >&2
    exit 2
fi

# Explicit file/project selection prevents accidental use of .env.server.
# Ignore exported overrides so the saved file remains the authoritative source.
unset DEMO_PUBLIC_HOST DEMO_SECRET_KEY DEMO_JWT_SIGNING_KEY DEMO_OTP_HASH_KEY
unset DEMO_CAPTCHA_HASH_KEY DEMO_STORAGE_SECRET_KEY
export COMPOSE_PARALLEL_LIMIT=1
demo_compose=(docker compose --project-directory "$demo_backend" --env-file "$demo_env"
    -p dentotime-demo -f "$demo_backend/docker-compose.demo.yml"
    -f "$demo_backend/docker-compose.demo-public.yml")

"${demo_compose[@]}" config --quiet
printf 'Publishing a public-password HTTP demo. Use synthetic data only; this is not production.\n'
# Build first so a failed build does not replace currently running containers.
"${demo_compose[@]}" build backend frontend
"${demo_compose[@]}" up -d --no-build --wait --wait-timeout 180
"${demo_compose[@]}" ps -a
printf 'Public demo: http://%s:3100/login\n' "$demo_host"
printf 'Account guide: docs/demo.md | Initial account password: DentoDemo2026!\n'
printf 'Allow inbound TCP 3100 and 19000 in the provider firewall; keep DB/API/console ports private.\n'
