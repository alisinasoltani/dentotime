from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Doctor, User
from appointments.models import Appointment, AppointmentSlot


@pytest.mark.django_db
def test_password_login_ignores_an_expired_previous_session():
    user = User.objects.create_user(
        phone_number="+989120003333", password="ValidLoginPassword!", role="USER",
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer expired-or-revoked-session")
    response = client.post("/api/v1/auth/login/", {
        "phone_number": user.phone_number, "password": "ValidLoginPassword!", "user_type": "USER",
    })
    assert response.status_code == 200
    assert str(response.data["user"]["id"]) == str(user.pk)


@pytest.mark.django_db
def test_admin_can_login_from_every_login_portal(admin_user):
    admin_user.phone_number = "+989120000021"
    admin_user.save(update_fields=["phone_number"])
    for index, user_type in enumerate(("USER", "DOCTOR", "ADMIN"), start=10):
        client = APIClient()
        response = client.post(
            "/api/v1/auth/login/",
            {
                "phone_number": admin_user.phone_number,
                "password": "TestPass123!",
                "user_type": user_type,
            },
            format="json",
            REMOTE_ADDR=f"198.51.100.{index}",
        )

        assert response.status_code == 200
        assert response.data["user"]["role"] == "ADMIN"
        assert "dentotime_refresh" in response.cookies


@pytest.mark.django_db
def test_non_admin_accounts_still_use_their_matching_login_portal(
    normal_user, doctor_user
):
    normal_user.phone_number = "+989120000022"
    normal_user.save(update_fields=["phone_number"])
    doctor_user.phone_number = "+989120000023"
    doctor_user.save(update_fields=["phone_number"])
    cases = (
        (normal_user, "DOCTOR", "198.51.100.21"),
        (normal_user, "ADMIN", "198.51.100.22"),
        (doctor_user, "USER", "198.51.100.23"),
        (doctor_user, "ADMIN", "198.51.100.24"),
    )
    for user, user_type, remote_addr in cases:
        response = APIClient().post(
            "/api/v1/auth/login/",
            {
                "phone_number": user.phone_number,
                "password": "TestPass123!",
                "user_type": user_type,
            },
            format="json",
            REMOTE_ADDR=remote_addr,
        )
        assert response.status_code == 403


def make_appointment(*, patient, doctor, minutes_from_now):
    starts_at = timezone.now() + timedelta(minutes=minutes_from_now)
    slot = AppointmentSlot.objects.create(
        date=starts_at.date(),
        start_at=starts_at,
        end_at=starts_at + timedelta(minutes=30),
        status=AppointmentSlot.Status.BOOKED,
    )
    return Appointment.objects.create(
        patient=patient,
        doctor=doctor,
        slot=slot,
        contact_phone_number=patient.phone_number,
        contact_first_name=patient.first_name,
        contact_last_name=patient.last_name,
        reason="بررسی دوره‌ای",
        status=Appointment.Status.APPROVED,
    )


@pytest.mark.django_db
def test_doctor_appointment_list_is_role_protected_and_scoped(
    api_client, doctor_user, normal_user, admin_user
):
    other_doctor = Doctor.objects.create_user(
        phone_number="+989120000024",
        password="TestPass123!",
        role="DOCTOR",
        first_name="Other",
        last_name="Doctor",
    )
    own_appointment = make_appointment(
        patient=normal_user,
        doctor=doctor_user,
        minutes_from_now=120,
    )
    other_appointment = make_appointment(
        patient=normal_user,
        doctor=other_doctor,
        minutes_from_now=240,
    )

    api_client.force_authenticate(user=doctor_user)
    response = api_client.get("/api/v1/appointments/doctor/")
    assert response.status_code == 200
    results = response.data.get("results", response.data)
    assert [item["id"] for item in results] == [str(own_appointment.pk)]
    assert str(other_appointment.pk) not in {item["id"] for item in results}
    assert results[0]["patient"]["phone_number"] == normal_user.phone_number

    for unauthorized_user in (normal_user, admin_user):
        api_client.force_authenticate(user=unauthorized_user)
        assert api_client.get("/api/v1/appointments/doctor/").status_code == 403

    api_client.force_authenticate(user=None)
    assert api_client.get("/api/v1/appointments/doctor/").status_code == 401
