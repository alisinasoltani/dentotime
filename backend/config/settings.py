"""Django settings for the Dentotime API."""

import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.utils.csp import CSP
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

TRUE_VALUES = {"1", "true", "yes", "on"}


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in TRUE_VALUES


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


DJANGO_ENVIRONMENT = os.getenv("DJANGO_ENVIRONMENT", "production").strip().lower()
if DJANGO_ENVIRONMENT not in {"development", "test", "production"}:
    raise ImproperlyConfigured("DJANGO_ENVIRONMENT must be development, test, or production.")

IS_PRODUCTION = DJANGO_ENVIRONMENT == "production"
DEBUG = env_bool("DEBUG", default=False)
SECRET_KEY = os.getenv("SECRET_KEY", "")
JWT_SIGNING_KEY = os.getenv("JWT_SIGNING_KEY", "")
OTP_HASH_KEY = os.getenv("OTP_HASH_KEY", "")
CAPTCHA_HASH_KEY = os.getenv("CAPTCHA_HASH_KEY", "")

if not SECRET_KEY:
    raise ImproperlyConfigured("SECRET_KEY is required.")
if IS_PRODUCTION and DEBUG:
    raise ImproperlyConfigured("DEBUG must be false in production.")
if IS_PRODUCTION and not JWT_SIGNING_KEY:
    raise ImproperlyConfigured("JWT_SIGNING_KEY is required in production.")
if IS_PRODUCTION and JWT_SIGNING_KEY == SECRET_KEY:
    raise ImproperlyConfigured("JWT_SIGNING_KEY must differ from SECRET_KEY in production.")
if not JWT_SIGNING_KEY:
    JWT_SIGNING_KEY = SECRET_KEY
if IS_PRODUCTION and not OTP_HASH_KEY:
    raise ImproperlyConfigured("OTP_HASH_KEY is required in production.")
if IS_PRODUCTION and OTP_HASH_KEY in {SECRET_KEY, JWT_SIGNING_KEY}:
    raise ImproperlyConfigured("OTP_HASH_KEY must be independent in production.")
if not OTP_HASH_KEY:
    OTP_HASH_KEY = SECRET_KEY
if IS_PRODUCTION and not CAPTCHA_HASH_KEY:
    raise ImproperlyConfigured("CAPTCHA_HASH_KEY is required in production.")
if IS_PRODUCTION and CAPTCHA_HASH_KEY in {SECRET_KEY, JWT_SIGNING_KEY, OTP_HASH_KEY}:
    raise ImproperlyConfigured("CAPTCHA_HASH_KEY must be independent in production.")
if not CAPTCHA_HASH_KEY:
    CAPTCHA_HASH_KEY = SECRET_KEY

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "127.0.0.1,localhost" if not IS_PRODUCTION else "")
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")
TRUSTED_PROXY_IPS = frozenset(env_list("TRUSTED_PROXY_IPS"))

if IS_PRODUCTION and (not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS):
    raise ImproperlyConfigured("Production ALLOWED_HOSTS must be explicit and cannot contain '*'.")
if IS_PRODUCTION and not CORS_ALLOWED_ORIGINS:
    raise ImproperlyConfigured("CORS_ALLOWED_ORIGINS is required in production.")
if IS_PRODUCTION and not CSRF_TRUSTED_ORIGINS:
    raise ImproperlyConfigured("CSRF_TRUSTED_ORIGINS is required in production.")

ENABLE_SILK = not IS_PRODUCTION and env_bool("ENABLE_SILK", default=False)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "accounts",
    "appointments",
    "messaging",
    "core",
]
if ENABLE_SILK:
    INSTALLED_APPS.append("silk")

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "django.middleware.csp.ContentSecurityPolicyMiddleware",
    "core.middleware.SecurityHeadersMiddleware",
]
if ENABLE_SILK:
    MIDDLEWARE.insert(2, "silk.middleware.SilkyMiddleware")

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DB_SSLMODE = os.getenv("DB_SSLMODE", "verify-full" if IS_PRODUCTION else "disable")
if IS_PRODUCTION and DB_SSLMODE not in {"verify-ca", "verify-full"}:
    raise ImproperlyConfigured("Production DB_SSLMODE must verify the PostgreSQL certificate.")

database_options = {
    "connect_timeout": int(os.getenv("DB_CONNECT_TIMEOUT", "10")),
    "sslmode": DB_SSLMODE,
}
if ssl_root_cert := os.getenv("DB_SSLROOTCERT"):
    database_options["sslrootcert"] = ssl_root_cert

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME"),
        "USER": os.getenv("DB_USER"),
        "PASSWORD": os.getenv("DB_PASS"),
        "HOST": os.getenv("DB_HOST"),
        "PORT": os.getenv("DB_PORT"),
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": database_options,
    }
}

if IS_PRODUCTION:
    missing_database_values = [
        name
        for name in ("DB_NAME", "DB_USER", "DB_PASS", "DB_HOST", "DB_PORT")
        if not os.getenv(name)
    ]
    if missing_database_values:
        raise ImproperlyConfigured(
            "Missing production database variables: " + ", ".join(missing_database_values)
        )

REDIS_URL = os.getenv("REDIS_URL", "")
if IS_PRODUCTION and not REDIS_URL:
    raise ImproperlyConfigured("REDIS_URL is required in production.")

if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
            "KEY_PREFIX": os.getenv("CACHE_KEY_PREFIX", "dentotime"),
            "TIMEOUT": 300,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "dentotime-development",
        }
    }

CHAT_EVENT_STREAM_PREFIX = os.getenv("CHAT_EVENT_STREAM_PREFIX", "dentotime:chat:events")
CHAT_EVENT_STREAM_MAX_LENGTH = int(os.getenv("CHAT_EVENT_STREAM_MAX_LENGTH", "10000"))
CHAT_SSE_BLOCK_MILLISECONDS = int(os.getenv("CHAT_SSE_BLOCK_MILLISECONDS", "15000"))
CHAT_SSE_MAX_CONNECTION_SECONDS = int(os.getenv("CHAT_SSE_MAX_CONNECTION_SECONDS", "540"))
CHAT_DELTA_PAGE_SIZE = int(os.getenv("CHAT_DELTA_PAGE_SIZE", "100"))

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

CORS_ALLOW_ALL_ORIGINS = not IS_PRODUCTION and env_bool("CORS_ALLOW_ALL_ORIGINS", default=False)
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
        "x-csrftoken",
    "x-device-id",
    "idempotency-key",
    "x-requested-with",
    "last-event-id",
]
CORS_ALLOW_METHODS = ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "accounts.authentication.SessionVersionJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "core.pagination.BoundedPageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "20/min",
        "user": "120/min",
        "login": "5/min",
        "signup": "3/hour",
        "refresh": os.getenv("REFRESH_THROTTLE_RATE", "120/min"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=10),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "SIGNING_KEY": JWT_SIGNING_KEY,
    "ISSUER": os.getenv("JWT_ISSUER", "dentotime-api"),
}

REFRESH_COOKIE_NAME = os.getenv("REFRESH_COOKIE_NAME", "dentotime_refresh")
REFRESH_COOKIE_PATH = "/api/v1/auth/"
REFRESH_COOKIE_SECURE = IS_PRODUCTION
REFRESH_COOKIE_SAMESITE = "Lax"
OTP_TTL_SECONDS = int(os.getenv("OTP_TTL_SECONDS", "120"))
OTP_GRANT_TTL_SECONDS = int(os.getenv("OTP_GRANT_TTL_SECONDS", "300"))
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
OTP_RATE_WINDOW_SECONDS = int(os.getenv("OTP_RATE_WINDOW_SECONDS", "600"))
OTP_PHONE_RATE_LIMIT = int(os.getenv("OTP_PHONE_RATE_LIMIT", "3"))
OTP_IP_RATE_LIMIT = int(os.getenv("OTP_IP_RATE_LIMIT", "10"))
OTP_DEVICE_RATE_LIMIT = int(os.getenv("OTP_DEVICE_RATE_LIMIT", "5"))
SMS_CONNECT_TIMEOUT_SECONDS = float(os.getenv("SMS_CONNECT_TIMEOUT_SECONDS", "2"))
SMS_READ_TIMEOUT_SECONDS = float(os.getenv("SMS_READ_TIMEOUT_SECONDS", "5"))
AVAILABILITY_MAX_RANGE_DAYS = int(os.getenv("AVAILABILITY_MAX_RANGE_DAYS", "62"))
CAPTCHA_TTL_SECONDS = int(os.getenv("CAPTCHA_TTL_SECONDS", "300"))
CAPTCHA_MAX_ATTEMPTS = int(os.getenv("CAPTCHA_MAX_ATTEMPTS", "5"))
CAPTCHA_RATE_WINDOW_SECONDS = int(os.getenv("CAPTCHA_RATE_WINDOW_SECONDS", "600"))
CAPTCHA_IP_RATE_LIMIT = int(os.getenv("CAPTCHA_IP_RATE_LIMIT", "20"))
CAPTCHA_DEVICE_RATE_LIMIT = int(os.getenv("CAPTCHA_DEVICE_RATE_LIMIT", "10"))
GUEST_BOOKING_RATE_WINDOW_SECONDS = int(
    os.getenv("GUEST_BOOKING_RATE_WINDOW_SECONDS", "3600")
)
GUEST_BOOKING_PHONE_RATE_LIMIT = int(os.getenv("GUEST_BOOKING_PHONE_RATE_LIMIT", "3"))
GUEST_BOOKING_IP_RATE_LIMIT = int(os.getenv("GUEST_BOOKING_IP_RATE_LIMIT", "12"))
GUEST_BOOKING_DEVICE_RATE_LIMIT = int(os.getenv("GUEST_BOOKING_DEVICE_RATE_LIMIT", "6"))

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = IS_PRODUCTION
SECURE_HSTS_SECONDS = 31_536_000 if IS_PRODUCTION else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = IS_PRODUCTION
SECURE_HSTS_PRELOAD = IS_PRODUCTION
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
SESSION_COOKIE_SECURE = IS_PRODUCTION
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = IS_PRODUCTION
CSRF_COOKIE_SAMESITE = "Lax"
X_FRAME_OPTIONS = "DENY"

SECURE_CSP = {
    "default-src": [CSP.SELF],
    "base-uri": [CSP.SELF],
    "connect-src": [CSP.SELF],
    "font-src": [CSP.SELF, "data:"],
    "form-action": [CSP.SELF],
    "frame-ancestors": [CSP.NONE],
    "img-src": [CSP.SELF, "data:"],
    "object-src": [CSP.NONE],
    "script-src": [CSP.SELF, CSP.UNSAFE_INLINE],
    "style-src": [CSP.SELF, CSP.UNSAFE_INLINE],
}
SECURE_CSP_REPORT_ONLY = {}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "redact_sensitive": {"()": "core.logging.RedactSensitiveDataFilter"},
    },
    "formatters": {
        "standard": {
            "format": "{asctime} {levelname} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "filters": ["redact_sensitive"],
            "formatter": "standard",
        },
    },
    "root": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
    "loggers": {
        "django.security.DisallowedHost": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        }
    },
}

SMS_IR_API_KEY = os.getenv("SMS_IR_API_KEY", "")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
AWS_STORAGE_BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME", "")
AWS_S3_ENDPOINT_URL = os.getenv("AWS_S3_ENDPOINT_URL", "")
AWS_S3_PUBLIC_ENDPOINT_URL = os.getenv(
    "AWS_S3_PUBLIC_ENDPOINT_URL",
    AWS_S3_ENDPOINT_URL,
)
AWS_S3_REGION_NAME = os.getenv("AWS_S3_REGION_NAME", "us-east-1")
AWS_S3_ADDRESSING_STYLE = "path"
AWS_S3_SERVER_SIDE_ENCRYPTION = os.getenv(
    "AWS_S3_SERVER_SIDE_ENCRYPTION", "AES256" if IS_PRODUCTION else ""
)
AWS_S3_PRESIGN_EXPIRY_SECONDS = int(os.getenv("AWS_S3_PRESIGN_EXPIRY_SECONDS", "900"))
AWS_S3_DOWNLOAD_EXPIRY_SECONDS = min(
    int(os.getenv("AWS_S3_DOWNLOAD_EXPIRY_SECONDS", "300")), 900
)
UPLOAD_PART_SIZE = int(os.getenv("UPLOAD_PART_SIZE", str(16 * 1024 * 1024)))
UPLOAD_SESSION_TTL_SECONDS = int(os.getenv("UPLOAD_SESSION_TTL_SECONDS", str(7 * 24 * 60 * 60)))
FILE_UPLOAD_QUOTA_BYTES = int(os.getenv("FILE_UPLOAD_QUOTA_BYTES", str(5 * 1024 * 1024 * 1024)))
FILE_FAILED_RETENTION_DAYS = int(os.getenv("FILE_FAILED_RETENTION_DAYS", "7"))
FILE_RETENTION_DAYS = {
    "CHAT_ATTACHMENT": int(os.getenv("CHAT_FILE_RETENTION_DAYS", "1095")),
    "VERIFICATION_DOCUMENT": int(os.getenv("VERIFICATION_FILE_RETENTION_DAYS", "2555")),
    "PROFILE_PICTURE": int(os.getenv("PROFILE_FILE_RETENTION_DAYS", "365")),
}
CLAMAV_HOST = os.getenv("CLAMAV_HOST", "")
CLAMAV_PORT = int(os.getenv("CLAMAV_PORT", "3310"))
CLAMAV_TIMEOUT_SECONDS = float(os.getenv("CLAMAV_TIMEOUT_SECONDS", "30"))
REQUIRE_CLAMAV = os.getenv("REQUIRE_CLAMAV", "True" if IS_PRODUCTION else "False").lower() == "true"
