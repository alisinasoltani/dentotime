from datetime import timedelta

import pytest
from django.utils import timezone

from accounts.models import Doctor, NormalUser
from appointments.models import Appointment, AppointmentSlot


def approve(doctor):
    doctor.verification_status = Doctor.VerificationStatus.APPROVED
    doctor.save(update_fields=("verification_status",))
    return doctor


def make_appointment(user, doctor, *, future=False, status=Appointment.Status.APPROVED):
    start = timezone.now() + timedelta(hours=2 if future else -2)
    slot = AppointmentSlot.objects.create(
        date=start.astimezone().date(),
        start_at=start,
        end_at=start + timedelta(minutes=30),
        status=AppointmentSlot.Status.BOOKED,
    )
    return Appointment.objects.create(
        patient=user,
        doctor=doctor,
        slot=slot,
        contact_phone_number=user.phone_number,
        contact_first_name=user.first_name,
        contact_last_name=user.last_name,
        status=status,
    )


@pytest.mark.django_db
def test_patient_can_confirm_and_correct_attendance_after_the_appointment(
    authed_client,
    normal_user,
    doctor_user,
):
    approve(doctor_user)
    appointment = make_appointment(normal_user, doctor_user)
    url = f"/api/v1/appointments/{appointment.pk}/attendance/"

    not_attended = authed_client.post(url, {"attended": False}, format="json")
    attended = authed_client.post(url, {"attended": True}, format="json")

    assert not_attended.status_code == 200
    assert not_attended.data["attendance_status"] == "DID_NOT_ATTEND"
    assert attended.status_code == 200
    assert attended.data["attendance_status"] == "ATTENDED"
    assert attended.data["attendance_confirmed_at"]
    assert attended.data["doctor"]["id"] == doctor_user.pk


@pytest.mark.django_db
def test_attendance_cannot_be_confirmed_before_the_appointment_ends(
    authed_client,
    normal_user,
    doctor_user,
):
    appointment = make_appointment(normal_user, approve(doctor_user), future=True)

    response = authed_client.post(
        f"/api/v1/appointments/{appointment.pk}/attendance/",
        {"attended": True},
        format="json",
    )

    assert response.status_code == 409
    appointment.refresh_from_db()
    assert appointment.attendance_status == Appointment.AttendanceStatus.NOT_CONFIRMED


@pytest.mark.django_db
@pytest.mark.parametrize("status", ["CANCELLED", "REJECTED", "NO_SHOW"])
def test_attendance_cannot_be_confirmed_for_invalid_appointment_statuses(
    status,
    authed_client,
    normal_user,
    doctor_user,
):
    appointment = make_appointment(normal_user, approve(doctor_user), status=status)

    response = authed_client.post(
        f"/api/v1/appointments/{appointment.pk}/attendance/",
        {"attended": True},
        format="json",
    )

    assert response.status_code == 409


@pytest.mark.django_db
def test_patient_cannot_confirm_another_patients_appointment(
    authed_client,
    doctor_user,
):
    other_patient = NormalUser.objects.create_user(
        phone_number="+989122222222",
        password="PatientPass123!",
        role="USER",
    )
    appointment = make_appointment(other_patient, approve(doctor_user))

    response = authed_client.post(
        f"/api/v1/appointments/{appointment.pk}/attendance/",
        {"attended": True},
        format="json",
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_legacy_appointment_without_doctor_cannot_grant_attendance(
    authed_client,
    normal_user,
):
    start = timezone.now() - timedelta(hours=2)
    slot = AppointmentSlot.objects.create(
        date=start.astimezone().date(),
        start_at=start,
        end_at=start + timedelta(minutes=30),
        status=AppointmentSlot.Status.BOOKED,
    )
    appointment = Appointment.objects.create(
        patient=normal_user,
        doctor=None,
        slot=slot,
        contact_phone_number=normal_user.phone_number,
        contact_first_name=normal_user.first_name,
        status=Appointment.Status.APPROVED,
    )

    response = authed_client.post(
        f"/api/v1/appointments/{appointment.pk}/attendance/",
        {"attended": True},
        format="json",
    )

    assert response.status_code == 400
