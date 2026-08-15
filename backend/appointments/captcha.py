"""First-party, raster CAPTCHA generation and atomic verification."""

import base64
import hashlib
import hmac
import io
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from PIL import Image, ImageDraw, ImageFont
from rest_framework.exceptions import Throttled

from accounts.otp import request_identity

from .models import BookingCaptchaChallenge


CAPTCHA_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
GENERIC_CAPTCHA_ERROR = "The CAPTCHA is invalid or expired."


def _digest(value: str) -> str:
    return hmac.new(
        settings.CAPTCHA_HASH_KEY.encode(), value.encode(), hashlib.sha256
    ).hexdigest()


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


def _font(size: int):
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size=size)
    except OSError:
        return ImageFont.load_default(size=size)


def _render_png(answer: str) -> bytes:
    width, height = 260, 90
    image = Image.new("RGB", (width, height), (246, 250, 252))
    draw = ImageDraw.Draw(image)

    for _ in range(12):
        color = tuple(secrets.randbelow(55) + 145 for _ in range(3))
        draw.line(
            (
                secrets.randbelow(width),
                secrets.randbelow(height),
                secrets.randbelow(width),
                secrets.randbelow(height),
            ),
            fill=color,
            width=secrets.randbelow(2) + 1,
        )

    font = _font(45)
    for index, character in enumerate(answer):
        layer = Image.new("RGBA", (58, 76), (0, 0, 0, 0))
        layer_draw = ImageDraw.Draw(layer)
        color = (
            secrets.randbelow(70) + 20,
            secrets.randbelow(70) + 35,
            secrets.randbelow(70) + 45,
            255,
        )
        layer_draw.text((29, 38), character, font=font, fill=color, anchor="mm")
        angle = secrets.randbelow(31) - 15
        layer = layer.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False)
        image.paste(
            layer,
            (11 + index * 48, secrets.randbelow(13) + 5),
            layer,
        )

    draw = ImageDraw.Draw(image)
    for _ in range(160):
        color = tuple(secrets.randbelow(100) + 100 for _ in range(3))
        x, y = secrets.randbelow(width), secrets.randbelow(height)
        draw.ellipse((x, y, x + 1, y + 1), fill=color)

    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def create_booking_captcha(request) -> tuple[BookingCaptchaChallenge, str]:
    ip_address, device_hash = request_identity(request)
    window = settings.CAPTCHA_RATE_WINDOW_SECONDS
    _increment_window(
        f"captcha:create:ip:{_digest(ip_address or 'unknown')}",
        settings.CAPTCHA_IP_RATE_LIMIT,
        window,
    )
    _increment_window(
        f"captcha:create:device:{_digest(device_hash)}",
        settings.CAPTCHA_DEVICE_RATE_LIMIT,
        window,
    )

    answer = "".join(secrets.choice(CAPTCHA_ALPHABET) for _ in range(5))
    challenge = BookingCaptchaChallenge(
        expires_at=timezone.now() + timedelta(seconds=settings.CAPTCHA_TTL_SECONDS),
        max_attempts=settings.CAPTCHA_MAX_ATTEMPTS,
        requested_ip=ip_address,
        device_hash=device_hash,
    )
    challenge.set_answer(answer)
    challenge.save(force_insert=True)
    encoded = base64.b64encode(_render_png(answer)).decode("ascii")
    return challenge, f"data:image/png;base64,{encoded}"


def enforce_guest_booking_throttles(request, phone_number: str) -> None:
    ip_address, device_hash = request_identity(request)
    window = settings.GUEST_BOOKING_RATE_WINDOW_SECONDS
    dimensions = (
        ("phone", phone_number, settings.GUEST_BOOKING_PHONE_RATE_LIMIT),
        ("ip", ip_address or "unknown", settings.GUEST_BOOKING_IP_RATE_LIMIT),
        ("device", device_hash, settings.GUEST_BOOKING_DEVICE_RATE_LIMIT),
    )
    for name, value, limit in dimensions:
        _increment_window(
            f"guest-booking:{name}:{_digest(str(value))}", limit, window
        )


def verify_and_consume_captcha(request, *, challenge_id, answer: str) -> None:
    _, device_hash = request_identity(request)
    mismatch = False
    with transaction.atomic():
        try:
            challenge = BookingCaptchaChallenge.objects.select_for_update().get(
                pk=challenge_id
            )
        except (BookingCaptchaChallenge.DoesNotExist, ValueError) as exc:
            raise ValueError(GENERIC_CAPTCHA_ERROR) from exc

        if challenge.device_hash != device_hash or not challenge.is_valid():
            raise ValueError(GENERIC_CAPTCHA_ERROR)
        if not challenge.answer_matches(answer):
            challenge.attempt_count = F("attempt_count") + 1
            challenge.save(update_fields=["attempt_count"])
            mismatch = True
        else:
            challenge.consumed_at = timezone.now()
            challenge.save(update_fields=["consumed_at"])

    if mismatch:
        raise ValueError(GENERIC_CAPTCHA_ERROR)
