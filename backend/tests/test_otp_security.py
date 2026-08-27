import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from time import perf_counter

import pytest
import requests
from django.core.cache import cache
from django.db import close_old_connections, connection, connections
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import NormalUser, OTPChallenge, User
from core.sms_service import send_otp, send_sms


PHONE = "+989121234567"
OTHER_PHONE = "+989121234568"
SIGNUP = OTPChallenge.Purpose.SIGNUP
RESET = OTPChallenge.Purpose.PASSWORD_RESET
CHANGE = OTPChallenge.Purpose.PASSWORD_CHANGE


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def sms_codes(monkeypatch):
    delivered = []
    monkeypatch.setattr(
        "accounts.otp.queue_otp_sms",
        lambda phone, code: delivered.append((phone, code)),
    )
    return delivered


def request_code(client, sms_codes, capture_callbacks, *, phone=PHONE, purpose=SIGNUP):
    with capture_callbacks(execute=True):
        response = client.post(
            "/api/v1/auth/request-otp/",
            {"phone_number": phone, "purpose": purpose},
            format="json",
            HTTP_X_DEVICE_ID="test-browser-device",
        )
    assert response.status_code == 202, response.data
    assert response.data["challenge_id"]
    delivered_phone, code = sms_codes[-1]
    assert delivered_phone == phone
    return response.data["challenge_id"], code


def verify_code(client, challenge_id, code, *, phone=PHONE, purpose=SIGNUP):
    return client.post(
        "/api/v1/auth/verify-otp/",
        {
            "phone_number": phone,
            "purpose": purpose,
            "challenge_id": challenge_id,
            "code": code,
        },
        format="json",
    )


@pytest.mark.django_db
def test_otp_is_hashed_and_correct_code_works_only_once(
    sms_codes, django_capture_on_commit_callbacks
):
    client = APIClient()
    challenge_id, code = request_code(
        client, sms_codes, django_capture_on_commit_callbacks
    )
    challenge = OTPChallenge.objects.get(pk=challenge_id)

    assert code not in challenge.code_digest
    assert len(challenge.code_digest) == 64
    assert not hasattr(challenge, "code")
    first = verify_code(client, challenge_id, code)
    second = verify_code(client, challenge_id, code)

    assert first.status_code == 200
    assert first.data["otp_token"]
    assert second.status_code == 400


@pytest.mark.django_db
def test_expired_wrong_and_locked_challenges_fail(
    sms_codes, django_capture_on_commit_callbacks, settings
):
    settings.OTP_MAX_ATTEMPTS = 2
    client = APIClient()
    challenge_id, code = request_code(
        client, sms_codes, django_capture_on_commit_callbacks
    )

    assert verify_code(client, challenge_id, "00000").status_code == 400
    challenge = OTPChallenge.objects.get(pk=challenge_id)
    assert challenge.attempt_count == 1
    assert verify_code(client, challenge_id, "00001").status_code == 400
    challenge.refresh_from_db()
    assert challenge.attempt_count == 2
    assert verify_code(client, challenge_id, code).status_code == 400

    cache.clear()
    expired_id, expired_code = request_code(
        client, sms_codes, django_capture_on_commit_callbacks, phone=OTHER_PHONE
    )
    OTPChallenge.objects.filter(pk=expired_id).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )
    assert verify_code(
        client, expired_id, expired_code, phone=OTHER_PHONE
    ).status_code == 400


@pytest.mark.django_db
def test_otp_is_bound_to_purpose_and_phone(
    sms_codes, django_capture_on_commit_callbacks
):
    client = APIClient()
    challenge_id, code = request_code(
        client, sms_codes, django_capture_on_commit_callbacks
    )

    assert verify_code(client, challenge_id, code, purpose=RESET).status_code == 400
    assert verify_code(client, challenge_id, code, phone=OTHER_PHONE).status_code == 400
    assert verify_code(client, challenge_id, code).status_code == 200


@pytest.mark.django_db(transaction=True)
def test_two_concurrent_otp_submissions_have_exactly_one_success(settings):
    challenge = OTPChallenge(
        phone_number=PHONE,
        purpose=SIGNUP,
        expires_at=timezone.now() + timedelta(minutes=2),
        max_attempts=5,
    )
    challenge.set_code("47291")
    challenge.save()

    def submit():
        close_old_connections()
        try:
            return verify_code(APIClient(), challenge.pk, "47291").status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda _: submit(), range(2)))

    assert sorted(statuses) == [200, 400]


@pytest.mark.django_db
def test_request_throttles_before_sms_dispatch(
    sms_codes, django_capture_on_commit_callbacks, settings
):
    settings.OTP_PHONE_RATE_LIMIT = 2
    client = APIClient()
    statuses = []
    for _ in range(3):
        with django_capture_on_commit_callbacks(execute=True):
            response = client.post(
                "/api/v1/auth/request-otp/",
                {"phone_number": PHONE, "purpose": SIGNUP},
                format="json",
                HTTP_X_DEVICE_ID="shared-device",
            )
        statuses.append(response.status_code)

    assert statuses == [202, 202, 429]
    assert len(sms_codes) == 2


@pytest.mark.django_db
def test_otp_request_does_not_enumerate_accounts(
    sms_codes, django_capture_on_commit_callbacks
):
    NormalUser.objects.create_user(
        phone_number=PHONE,
        password="ExistingPass123!",
        role=User.Role.USER,
    )
    client = APIClient()

    def request(phone):
        cache.clear()
        started = perf_counter()
        with django_capture_on_commit_callbacks(execute=True):
            response = client.post(
                "/api/v1/auth/request-otp/",
                {"phone_number": phone, "purpose": RESET},
                format="json",
                HTTP_X_DEVICE_ID=f"device-{phone[-1]}",
            )
        return response, perf_counter() - started

    existing, existing_time = request(PHONE)
    missing, missing_time = request(OTHER_PHONE)

    assert existing.status_code == missing.status_code == 202
    assert existing.data.keys() == missing.data.keys()
    assert existing.data["detail"] == missing.data["detail"]
    assert max(existing_time, missing_time) < max(min(existing_time, missing_time) * 8, 0.25)


@pytest.mark.django_db
def test_password_reset_rejects_weak_password_and_revokes_old_sessions(
    sms_codes, django_capture_on_commit_callbacks
):
    user = NormalUser.objects.create_user(
        phone_number=PHONE,
        password="ExistingPass123!",
        role=User.Role.USER,
    )
    client = APIClient()
    login = client.post(
        "/api/v1/auth/login/",
        {"phone_number": PHONE, "password": "ExistingPass123!", "user_type": "USER"},
        format="json",
    )
    assert login.status_code == 200
    assert "refresh" not in login.data
    refresh_cookie = login.cookies["dentotime_refresh"]
    assert refresh_cookie["httponly"] is True
    assert refresh_cookie["samesite"] == "Lax"
    old_access = login.data["access"]
    old_refresh = client.cookies["dentotime_refresh"].value

    challenge_id, code = request_code(
        client,
        sms_codes,
        django_capture_on_commit_callbacks,
        purpose=RESET,
    )
    verified = verify_code(client, challenge_id, code, purpose=RESET)
    otp_token = verified.data["otp_token"]
    weak = client.post(
        "/api/v1/auth/reset-password/",
        {"phone_number": PHONE, "otp_token": otp_token, "new_password": "12345"},
        format="json",
    )
    assert weak.status_code == 400

    reset = client.post(
        "/api/v1/auth/reset-password/",
        {
            "phone_number": PHONE,
            "otp_token": otp_token,
            "new_password": "NewSecurePass456!",
        },
        format="json",
    )
    assert reset.status_code == 200
    user.refresh_from_db()
    assert user.check_password("NewSecurePass456!")

    old_access_client = APIClient()
    old_access_client.credentials(HTTP_AUTHORIZATION=f"Bearer {old_access}")
    assert old_access_client.get("/api/v1/users/me/").status_code == 401
    old_refresh_client = APIClient()
    old_refresh_client.cookies["dentotime_refresh"] = old_refresh
    assert old_refresh_client.post("/api/v1/auth/token/refresh/").status_code == 401
    assert client.post(
        "/api/v1/auth/reset-password/",
        {
            "phone_number": PHONE,
            "otp_token": otp_token,
            "new_password": "AnotherSecurePass789!",
        },
        format="json",
    ).status_code == 400


@pytest.mark.django_db
def test_authenticated_password_change_uses_phone_otp(
    sms_codes, django_capture_on_commit_callbacks
):
    user = NormalUser.objects.create_user(
        phone_number=PHONE,
        password="ExistingPass123!",
        role=User.Role.USER,
    )
    client = APIClient()
    client.force_authenticate(user=user)

    with django_capture_on_commit_callbacks(execute=True):
        requested = client.post(
            "/api/v1/users/me/change-password/request-otp/",
            {},
            format="json",
            HTTP_X_DEVICE_ID="password-change-device",
        )
    assert requested.status_code == 202
    assert requested.data["phone_number"] == PHONE
    challenge_id, code = str(requested.data["challenge_id"]), sms_codes[-1][1]
    verified = client.post(
        "/api/v1/auth/verify-otp/",
        {
            "phone_number": PHONE,
            "purpose": CHANGE,
            "challenge_id": challenge_id,
            "code": code,
        },
        format="json",
    )
    assert verified.status_code == 200

    changed = client.post(
        "/api/v1/users/me/change-password/",
        {"otp_token": verified.data["otp_token"], "new_password": "NewSecurePass456!"},
        format="json",
    )
    assert changed.status_code == 200
    user.refresh_from_db()
    assert user.check_password("NewSecurePass456!")

    assert client.post(
        "/api/v1/users/me/change-password/",
        {"otp_token": verified.data["otp_token"], "new_password": "AnotherPass789!"},
        format="json",
    ).status_code == 400


@pytest.mark.django_db
def test_password_change_otp_is_not_public():
    response = APIClient().post(
        "/api/v1/auth/request-otp/",
        {"phone_number": PHONE, "purpose": CHANGE},
        format="json",
    )
    assert response.status_code == 400


def test_otp_uses_configured_sms_ir_template(monkeypatch, settings):
    sent = []
    settings.SMS_IR_OTP_TEMPLATE_ID = 123456
    monkeypatch.setattr(
        "core.sms_service.send_sms",
        lambda mobile, template_id, parameters: sent.append(
            (mobile, template_id, parameters)
        ) or True,
    )

    assert send_otp(PHONE, "83920") is True
    assert sent == [(PHONE, 123456, [{"name": "Code", "value": "83920"}])]


@pytest.mark.django_db(transaction=True)
def test_sms_dispatch_occurs_after_database_transaction(monkeypatch):
    dispatch_transaction_states = []
    monkeypatch.setattr(
        "accounts.otp.queue_otp_sms",
        lambda phone, code: dispatch_transaction_states.append(connection.in_atomic_block),
    )

    response = APIClient().post(
        "/api/v1/auth/request-otp/",
        {"phone_number": PHONE, "purpose": SIGNUP},
        format="json",
        HTTP_X_DEVICE_ID="transaction-test",
    )

    assert response.status_code == 202
    assert dispatch_transaction_states == [False]


def test_sms_timeout_is_bounded_and_logs_are_redacted(monkeypatch, caplog, settings):
    settings.SMS_CONNECT_TIMEOUT_SECONDS = 0.01
    settings.SMS_READ_TIMEOUT_SECONDS = 0.01
    observed_timeout = []

    def timeout(*args, **kwargs):
        observed_timeout.append(kwargs["timeout"])
        raise requests.Timeout("provider timeout with no secrets")

    monkeypatch.setattr("core.sms_service.requests.post", timeout)
    caplog.set_level(logging.WARNING)
    code = "83920"
    token = "signed.jwt.secret"

    assert send_sms(PHONE, 288919, [{"name": "Code", "value": code}]) is False
    rendered = caplog.text

    assert observed_timeout == [(0.01, 0.01)]
    assert code not in rendered
    assert token not in rendered
    assert PHONE not in rendered
