import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import pytest
from django.core import signing
from django.core.cache import cache
from django.conf import settings
from django.db import close_old_connections, connections
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import NormalUser, OTPChallenge, User
from accounts.otp import GRANT_SALT
from accounts.otp import request_identity
from appointments.models import Appointment, AppointmentSlot, BookingCaptchaChallenge
from appointments.services import claim_guest_appointments


def make_slot(*, days=6, minutes=0):
    start = timezone.now() + timedelta(days=days, minutes=minutes)
    return AppointmentSlot.objects.create(
        date=start.astimezone().date(),
        start_at=start,
        end_at=start + timedelta(minutes=30),
    )


def captcha_payload(client, *, answer="D3NTO", device="guest-device"):
    challenge = BookingCaptchaChallenge(
        expires_at=timezone.now() + timedelta(minutes=5),
        device_hash="",
    )
    client.credentials(HTTP_X_DEVICE_ID=device)
    from accounts.otp import request_identity
    from rest_framework.test import APIRequestFactory

    request = APIRequestFactory().post("/", HTTP_X_DEVICE_ID=device)
    challenge.device_hash = request_identity(request)[1]
    challenge.set_answer(answer)
    challenge.save()
    return {
        "captcha_challenge_id": str(challenge.pk),
        "captcha_answer": answer,
    }


def guest_booking_payload(slot, client, *, phone="+989121234567", first="Guest", last="Person"):
    return {
        "slot_id": slot.pk,
        "phone_number": phone,
        "first_name": first,
        "last_name": last,
        "reason": "guest booking",
        **captcha_payload(client),
    }


@pytest.fixture(autouse=True)
def isolated_guest_security(monkeypatch, settings):
    cache.clear()
    settings.GUEST_BOOKING_PHONE_RATE_LIMIT = 20
    settings.GUEST_BOOKING_IP_RATE_LIMIT = 20
    settings.GUEST_BOOKING_DEVICE_RATE_LIMIT = 20
    settings.CAPTCHA_IP_RATE_LIMIT = 20
    settings.CAPTCHA_DEVICE_RATE_LIMIT = 20
    monkeypatch.setattr("appointments.services.queue_admin_alert", lambda *args: None)
    yield
    cache.clear()


@pytest.mark.django_db
def test_first_party_captcha_contains_local_png_and_no_answer(monkeypatch):
    client = APIClient()
    client.credentials(HTTP_X_DEVICE_ID="captcha-device")

    response = client.post("/api/v1/appointments/captcha/", {}, format="json")

    assert response.status_code == 201
    assert response.data["image_data_url"].startswith("data:image/png;base64,")
    assert "answer" not in response.data
    assert response["Cache-Control"] == "no-store, private"
    challenge = BookingCaptchaChallenge.objects.get(pk=response.data["challenge_id"])
    assert len(challenge.answer_digest) == 64
    assert not hasattr(challenge, "answer")


@pytest.mark.django_db
def test_untrusted_forwarded_ip_cannot_bypass_rate_limit_identity(settings):
    from rest_framework.test import APIRequestFactory

    settings.TRUSTED_PROXY_IPS = frozenset()
    request = APIRequestFactory().post(
        "/",
        REMOTE_ADDR="203.0.113.8",
        HTTP_X_FORWARDED_FOR="198.51.100.10",
    )
    assert request_identity(request)[0] == "203.0.113.8"

    settings.TRUSTED_PROXY_IPS = frozenset({"203.0.113.8"})
    assert request_identity(request)[0] == "198.51.100.10"


@pytest.mark.django_db
def test_guest_booking_creates_no_user_and_stores_contact_snapshot():
    client = APIClient()
    slot = make_slot()
    before = User.objects.count()

    response = client.post(
        "/api/v1/appointments/",
        guest_booking_payload(slot, client),
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )

    assert response.status_code == 201
    assert response.data["authenticated"] is False
    assert User.objects.count() == before
    appointment = Appointment.objects.get(pk=response.data["id"])
    assert appointment.patient_id is None
    assert appointment.contact_phone_number == "+989121234567"
    assert appointment.contact_first_name == "Guest"


@pytest.mark.django_db
def test_guest_booking_existing_phone_does_not_mutate_profile():
    normal_user = NormalUser.objects.create_user(
        phone_number="+989121112233",
        password="PatientPass123!",
        role=User.Role.USER,
        first_name="Original",
        last_name="Owner",
    )
    client = APIClient()
    slot = make_slot()

    response = client.post(
        "/api/v1/appointments/",
        guest_booking_payload(
            slot,
            client,
            phone=normal_user.phone_number,
            first="Attacker",
            last="Changed",
        ),
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )

    assert response.status_code == 201
    normal_user.refresh_from_db()
    assert (normal_user.first_name, normal_user.last_name) == ("Original", "Owner")
    assert Appointment.objects.get(pk=response.data["id"]).patient_id is None


@pytest.mark.django_db
def test_logged_in_booking_uses_account_snapshot_and_ignores_supplied_identity(normal_user):
    client = APIClient()
    client.force_authenticate(normal_user)
    slot = make_slot()

    response = client.post(
        "/api/v1/appointments/",
        {
            "slot_id": slot.pk,
            "phone_number": "+989129999999",
            "first_name": "Forged",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )

    assert response.status_code == 201
    appointment = Appointment.objects.get(pk=response.data["id"])
    assert appointment.patient_id == normal_user.pk
    assert appointment.contact_phone_number == normal_user.phone_number
    assert appointment.contact_first_name == normal_user.first_name


@pytest.mark.django_db
def test_captcha_is_single_use_and_bound_to_device():
    client = APIClient()
    first_slot = make_slot()
    second_slot = make_slot(minutes=60)
    payload = guest_booking_payload(first_slot, client)
    key = str(uuid.uuid4())

    first = client.post(
        "/api/v1/appointments/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key
    )
    retry = client.post(
        "/api/v1/appointments/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key
    )
    payload["slot_id"] = second_slot.pk
    replay = client.post(
        "/api/v1/appointments/",
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )

    assert first.status_code == 201
    assert retry.status_code == 200
    assert retry.data["id"] == first.data["id"]
    assert replay.status_code == 400

    other_client = APIClient()
    wrong_device_payload = guest_booking_payload(second_slot, client)
    other_client.credentials(HTTP_X_DEVICE_ID="different-device")
    wrong_device = other_client.post(
        "/api/v1/appointments/",
        wrong_device_payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert wrong_device.status_code == 400


@pytest.mark.django_db
def test_wrong_captcha_counts_attempts_and_expired_captcha_fails():
    client = APIClient()
    slot = make_slot()
    payload = guest_booking_payload(slot, client)
    challenge_id = payload["captcha_challenge_id"]
    payload["captcha_answer"] = "WRONG"

    response = client.post(
        "/api/v1/appointments/",
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )

    assert response.status_code == 400
    challenge = BookingCaptchaChallenge.objects.get(pk=challenge_id)
    assert challenge.attempt_count == 1
    challenge.expires_at = timezone.now() - timedelta(seconds=1)
    challenge.save(update_fields=["expires_at"])
    payload["captcha_answer"] = "D3NTO"
    expired = client.post(
        "/api/v1/appointments/",
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert expired.status_code == 400


@pytest.mark.django_db
def test_guest_booking_rate_limit_applies_before_booking(settings):
    settings.GUEST_BOOKING_PHONE_RATE_LIMIT = 1
    client = APIClient()
    first_slot = make_slot()
    second_slot = make_slot(minutes=60)
    first = client.post(
        "/api/v1/appointments/",
        guest_booking_payload(first_slot, client),
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    second = client.post(
        "/api/v1/appointments/",
        guest_booking_payload(second_slot, client),
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert first.status_code == 201
    assert second.status_code == 429
    assert Appointment.objects.count() == 1


def make_claim_grant(phone):
    challenge = OTPChallenge.objects.create(
        phone_number=phone,
        purpose=OTPChallenge.Purpose.APPOINTMENT_CLAIM,
        code_digest="0" * 64,
        expires_at=timezone.now() + timedelta(minutes=5),
        verified_at=timezone.now(),
    )
    return signing.dumps(
        {
            "challenge_id": str(challenge.pk),
            "phone_number": phone,
            "purpose": OTPChallenge.Purpose.APPOINTMENT_CLAIM,
        },
        key=settings.OTP_HASH_KEY,
        salt=GRANT_SALT,
        compress=True,
    )


@pytest.mark.django_db
def test_only_verified_matching_patient_claims_guest_appointment():
    normal_user = NormalUser.objects.create_user(
        phone_number="+989121234000",
        password="PatientPass123!",
        role=User.Role.USER,
    )
    matching_phone = normal_user.phone_number
    appointment = Appointment.objects.create(
        patient=None,
        slot=make_slot(),
        contact_phone_number=matching_phone,
        contact_first_name="Guest",
    )
    other = NormalUser.objects.create_user(
        phone_number="+989120009876", password="OtherPass123!", role=User.Role.USER
    )

    wrong_client = APIClient()
    wrong_client.force_authenticate(other)
    token = make_claim_grant(matching_phone)
    wrong = wrong_client.post(
        "/api/v1/appointments/claim/",
        {"otp_token": token},
        format="json",
    )
    assert wrong.status_code == 400
    appointment.refresh_from_db()
    assert appointment.patient_id is None

    client = APIClient()
    client.force_authenticate(normal_user)
    claimed = client.post(
        "/api/v1/appointments/claim/", {"otp_token": token}, format="json"
    )
    repeated = client.post(
        "/api/v1/appointments/claim/", {"otp_token": token}, format="json"
    )
    assert claimed.data == {"claimed": 1, "total": 1}
    assert repeated.data == {"claimed": 0, "total": 1}
    appointment.refresh_from_db()
    assert appointment.patient_id == normal_user.pk


@pytest.mark.django_db(transaction=True)
def test_concurrent_claim_is_atomic_and_idempotent():
    patient = NormalUser.objects.create_user(
        phone_number="+989121110000", password="PatientPass123!", role=User.Role.USER
    )
    Appointment.objects.create(
        patient=None,
        slot=make_slot(),
        contact_phone_number=patient.phone_number,
        contact_first_name="Guest",
    )
    barrier = Barrier(2)

    def claim():
        close_old_connections()
        try:
            barrier.wait(timeout=5)
            return claim_guest_appointments(patient=patient)[0]
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: claim(), range(2)))

    assert sum(outcomes) == 1
    assert Appointment.objects.filter(patient=patient).count() == 1


@pytest.mark.django_db
def test_guest_admin_phone_shadowing_and_notification_use_guest_phone(
    monkeypatch, django_capture_on_commit_callbacks
):
    admin = User.objects.create_user(
        phone_number="+989122220000",
        password="AdminPass123!",
        role=User.Role.ADMIN,
        first_name="Real admin",
    )
    notifications = []
    monkeypatch.setattr(
        "appointments.services.queue_admin_alert",
        lambda target, message: notifications.append((target, message)),
    )
    client = APIClient()
    slot = make_slot()

    with django_capture_on_commit_callbacks(execute=True):
        response = client.post(
            "/api/v1/appointments/",
            guest_booking_payload(
                slot,
                client,
                phone=admin.phone_number,
                first="Untrusted guest name",
            ),
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )

    assert response.status_code == 201
    admin.refresh_from_db()
    assert admin.first_name == "Real admin"
    assert notifications == [(admin.phone_number, f"نوبت جدید: {admin.phone_number}")]


@pytest.mark.django_db
def test_signup_claims_matching_guest_appointments_atomically(monkeypatch):
    phone = "+989123330000"
    appointment = Appointment.objects.create(
        patient=None,
        slot=make_slot(),
        contact_phone_number=phone,
        contact_first_name="Guest",
    )
    monkeypatch.setattr("accounts.serializers.consume_grant", lambda **kwargs: None)

    response = APIClient().post(
        "/api/v1/auth/signup/",
        {
            "user_type": "USER",
            "phone_number": phone,
            "password": "StrongPatientPass123!",
            "password_confirm": "StrongPatientPass123!",
            "first_name": "Claimed",
            "last_name": "Patient",
            "otp_token": "verified-signup-grant",
        },
        format="json",
    )

    assert response.status_code == 201
    appointment.refresh_from_db()
    assert appointment.patient.phone_number == phone
