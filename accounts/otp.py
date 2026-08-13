"""Purpose-bound, replay-safe OTP challenge services."""

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import Throttled

from core.sms_service import queue_otp_sms

from .models import OTPChallenge
from .validators import normalize_phone_number


GENERIC_REQUEST_MESSAGE = "If the number can receive messages, a verification code has been queued."
GENERIC_VERIFY_ERROR = "The verification code is invalid or expired."
GRANT_SALT = "dentotime.otp-grant.v1"


def _private_digest(value: str) -> str:
    return hmac.new(
        settings.OTP_HASH_KEY.encode(), value.encode(), hashlib.sha256
    ).hexdigest()


def request_identity(request) -> tuple[str | None, str]:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",", 1)[0].strip()
    ip_address = forwarded or request.META.get("REMOTE_ADDR") or None
    supplied_device = request.headers.get("X-Device-ID", "").strip()[:200]
    fallback = f"{ip_address or 'unknown'}:{request.META.get('HTTP_USER_AGENT', '')[:300]}"
    return ip_address, _private_digest(supplied_device or fallback)


def _increment_window(key: str, limit: int, window_seconds: int) -> None:
    if cache.add(key, 1, timeout=window_seconds):
        return
    try:
        count = cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=window_seconds)
        count = 1
    if count > limit:
        raise Throttled(wait=window_seconds)


def enforce_request_throttles(request, phone_number: str) -> tuple[str | None, str]:
    ip_address, device_hash = request_identity(request)
    dimensions = (
        ("phone", phone_number, settings.OTP_PHONE_RATE_LIMIT),
        ("ip", ip_address or "unknown", settings.OTP_IP_RATE_LIMIT),
        ("device", device_hash, settings.OTP_DEVICE_RATE_LIMIT),
    )
    for name, value, limit in dimensions:
        _increment_window(
            f"otp:{name}:{_private_digest(str(value))}",
            limit,
            settings.OTP_RATE_WINDOW_SECONDS,
        )
    return ip_address, device_hash


def create_challenge(request, raw_phone: str, purpose: str) -> OTPChallenge | None:
    phone_number = normalize_phone_number(raw_phone)
    ip_address, device_hash = enforce_request_throttles(request, phone_number)
    lock_key = f"otp:create:{_private_digest(f'{phone_number}:{purpose}')}"
    if not cache.add(lock_key, "1", timeout=10):
        return None

    code = f"{secrets.randbelow(100_000):05d}"
    try:
        with transaction.atomic():
            now = timezone.now()
            OTPChallenge.objects.filter(
                phone_number=phone_number,
                purpose=purpose,
                consumed_at__isnull=True,
            ).update(consumed_at=now)
            challenge = OTPChallenge(
                phone_number=phone_number,
                purpose=purpose,
                expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS),
                requested_ip=ip_address,
                device_hash=device_hash,
                max_attempts=settings.OTP_MAX_ATTEMPTS,
            )
            challenge.set_code(code)
            challenge.save(force_insert=True)
            transaction.on_commit(lambda: queue_otp_sms(phone_number, code))
            return challenge
    except IntegrityError:
        return None
    finally:
        cache.delete(lock_key)


def verify_challenge(*, challenge_id, raw_phone: str, purpose: str, code: str) -> str:
    phone_number = normalize_phone_number(raw_phone)
    code_mismatch = False
    with transaction.atomic():
        try:
            challenge = OTPChallenge.objects.select_for_update().get(
                pk=challenge_id,
                phone_number=phone_number,
                purpose=purpose,
            )
        except (OTPChallenge.DoesNotExist, ValidationError, ValueError) as exc:
            raise ValueError(GENERIC_VERIFY_ERROR) from exc

        if not challenge.is_valid():
            raise ValueError(GENERIC_VERIFY_ERROR)
        if not challenge.code_matches(str(code)):
            challenge.attempt_count = F("attempt_count") + 1
            challenge.save(update_fields=["attempt_count"])
            code_mismatch = True
        else:
            challenge.verified_at = timezone.now()
            challenge.save(update_fields=["verified_at"])

    if code_mismatch:
        raise ValueError(GENERIC_VERIFY_ERROR)

    return signing.dumps(
        {
            "challenge_id": str(challenge.pk),
            "phone_number": phone_number,
            "purpose": purpose,
        },
        key=settings.OTP_HASH_KEY,
        salt=GRANT_SALT,
        compress=True,
    )


def consume_grant(*, token: str, raw_phone: str, purpose: str) -> OTPChallenge:
    phone_number = normalize_phone_number(raw_phone)
    try:
        payload = signing.loads(
            token,
            key=settings.OTP_HASH_KEY,
            salt=GRANT_SALT,
            max_age=settings.OTP_GRANT_TTL_SECONDS,
        )
    except signing.BadSignature as exc:
        raise ValueError(GENERIC_VERIFY_ERROR) from exc

    if payload.get("phone_number") != phone_number or payload.get("purpose") != purpose:
        raise ValueError(GENERIC_VERIFY_ERROR)

    try:
        challenge = OTPChallenge.objects.select_for_update().get(
            pk=payload.get("challenge_id"),
            phone_number=phone_number,
            purpose=purpose,
            consumed_at__isnull=True,
            verified_at__isnull=False,
        )
    except (OTPChallenge.DoesNotExist, ValidationError, ValueError) as exc:
        raise ValueError(GENERIC_VERIFY_ERROR) from exc

    challenge.consumed_at = timezone.now()
    challenge.save(update_fields=["consumed_at"])
    return challenge
