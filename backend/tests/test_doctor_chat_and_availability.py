from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Doctor, NormalUser, User
from appointments.models import Appointment, AppointmentSlot, DoctorAvailabilityRule
from messaging.models import MessageThread, PinnedChatContact


TEHRAN = ZoneInfo("Asia/Tehran")


def approved_doctor(phone, *, first_name="پزشک", last_name="آزمون", specialty="عمومی"):
    return Doctor.objects.create_user(
        phone_number=phone,
        password="DoctorPass123!",
        role=User.Role.DOCTOR,
        first_name=first_name,
        last_name=last_name,
        specialty=specialty,
        verification_status=Doctor.VerificationStatus.APPROVED,
    )


def patient(phone, *, first_name="کاربر", last_name="آزمون"):
    return NormalUser.objects.create_user(
        phone_number=phone,
        password="PatientPass123!",
        role=User.Role.USER,
        first_name=first_name,
        last_name=last_name,
    )


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_doctor_contact_search_filters_specialty_phone_and_role():
    owner = approved_doctor("+989121110001")
    orthodontist = approved_doctor(
        "+989121110002",
        first_name="سارا",
        last_name="محمدی",
        specialty="ارتودنسی",
    )
    normal = patient("+989121110003", first_name="مریم", last_name="احمدی")
    unverified = Doctor.objects.create_user(
        phone_number="+989121110004",
        password="DoctorPass123!",
        role=User.Role.DOCTOR,
        specialty="ارتودنسی",
    )
    doctor_client = client_for(owner)

    by_specialty = doctor_client.get(
        "/api/v1/chat/contacts/",
        {"search": "ارتودنسی", "role": "DOCTOR"},
    )
    by_phone = doctor_client.get(
        "/api/v1/chat/contacts/",
        {"search": normal.phone_number[-6:], "role": "USER"},
    )

    assert by_specialty.status_code == 200
    assert by_specialty.data["support"]["is_pinned"] is True
    assert by_specialty.data["support"]["can_unpin"] is False
    specialty_ids = {row["id"] for row in by_specialty.data["results"]}
    assert orthodontist.pk in specialty_ids
    assert unverified.pk not in specialty_ids
    assert [row["id"] for row in by_phone.data["results"]] == [normal.pk]


@pytest.mark.django_db
def test_pins_are_persisted_idempotent_and_limited_to_five():
    owner = approved_doctor("+989121120001")
    contacts = [patient(f"+98912112{index:04d}") for index in range(2, 8)]
    doctor_client = client_for(owner)

    for contact in contacts[:5]:
        response = doctor_client.post(
            "/api/v1/chat/contacts/pins/",
            {"contact_id": contact.pk},
            format="json",
        )
        assert response.status_code == 201

    duplicate = doctor_client.post(
        "/api/v1/chat/contacts/pins/",
        {"contact_id": contacts[0].pk},
        format="json",
    )
    overflow = doctor_client.post(
        "/api/v1/chat/contacts/pins/",
        {"contact_id": contacts[5].pk},
        format="json",
    )

    assert duplicate.status_code == 200
    assert overflow.status_code == 409
    assert PinnedChatContact.objects.filter(owner=owner).count() == 5

    removed = doctor_client.delete(
        f"/api/v1/chat/contacts/{contacts[0].pk}/pin/"
    )
    replacement = doctor_client.post(
        "/api/v1/chat/contacts/pins/",
        {"contact_id": contacts[5].pk},
        format="json",
    )
    assert removed.status_code == 204
    assert replacement.status_code == 201
    assert PinnedChatContact.objects.filter(owner=owner).count() == 5


@pytest.mark.django_db
def test_direct_thread_is_unique_visible_to_both_participants_and_private_from_admin():
    doctor = approved_doctor("+989121130001")
    contact = patient("+989121130002", first_name="نیلوفر")
    outsider = patient("+989121130003")
    admin = User.objects.create_superuser(
        phone_number="+989121130004",
        password="AdminPass123!",
    )
    doctor_client = client_for(doctor)

    first = doctor_client.post(
        "/api/v1/chat/threads/direct/",
        {"contact_id": contact.pk},
        format="json",
    )
    repeated = doctor_client.post(
        "/api/v1/chat/threads/direct/",
        {"contact_id": contact.pk},
        format="json",
    )

    assert first.status_code == 201
    assert repeated.status_code == 200
    assert first.data["id"] == repeated.data["id"]
    assert first.data["participant"]["id"] == contact.pk
    assert MessageThread.objects.filter(thread_type=MessageThread.ThreadType.DIRECT).count() == 1

    patient_list = client_for(contact).get("/api/v1/chat/threads/")
    assert patient_list.data["results"][0]["participant"]["id"] == doctor.pk
    assert client_for(outsider).get(
        f"/api/v1/chat/threads/{first.data['id']}/messages/"
    ).status_code == 404
    assert client_for(admin).get(
        f"/api/v1/chat/threads/{first.data['id']}/messages/"
    ).status_code == 404

    sent = doctor_client.post(
        f"/api/v1/chat/threads/{first.data['id']}/messages/",
        {"body": "سلام مستقیم"},
        format="json",
    )
    reply = client_for(contact).post(
        f"/api/v1/chat/threads/{first.data['id']}/messages/",
        {"body": "پاسخ"},
        format="json",
    )
    assert sent.status_code == 201
    assert reply.status_code == 201


@pytest.mark.django_db
def test_patient_can_search_approved_doctors_and_start_multiple_direct_threads():
    normal = patient("+989121140001")
    doctor = approved_doctor("+989121140002")
    normal_client = client_for(normal)

    assert normal_client.get("/api/v1/chat/contacts/").status_code == 200
    assert normal_client.post(
        "/api/v1/chat/threads/direct/",
        {"contact_id": doctor.pk},
        format="json",
    ).status_code == 201
    colleague = approved_doctor("+989121140003")
    assert normal_client.post(
        "/api/v1/chat/threads/direct/",
        {"contact_id": colleague.pk},
        format="json",
    ).status_code == 201


@pytest.mark.django_db
def test_recurring_generation_is_idempotent_and_doctor_scoped():
    doctor = approved_doctor("+989121150001")
    other_doctor = approved_doctor("+989121150002")
    start = timezone.localdate() + timedelta(days=2)
    end = start + timedelta(days=13)
    payload = {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "weekdays": [start.weekday()],
        "start_time": "09:00",
        "end_time": "10:00",
        "slot_duration_minutes": 30,
        "save_as_routine": True,
    }
    doctor_client = client_for(doctor)

    created = doctor_client.post(
        "/api/v1/appointments/doctor/availability/",
        payload,
        format="json",
    )
    repeated = doctor_client.post(
        "/api/v1/appointments/doctor/availability/",
        payload,
        format="json",
    )
    other = client_for(other_doctor).post(
        "/api/v1/appointments/doctor/availability/",
        payload,
        format="json",
    )

    assert created.status_code == 201
    assert created.data["created"] == 4
    assert repeated.status_code == 201
    assert repeated.data["created"] == 0
    assert repeated.data["existing"] == 4
    assert other.status_code == 201
    assert AppointmentSlot.objects.filter(doctor=doctor).count() == 4
    assert AppointmentSlot.objects.filter(doctor=other_doctor).count() == 4
    assert DoctorAvailabilityRule.objects.filter(doctor=doctor).count() == 1


@pytest.mark.django_db
def test_booked_slot_removal_has_exact_conflict_then_cancel_allows_blocking_history():
    doctor = approved_doctor("+989121160001")
    normal = patient("+989121160002", first_name="علی", last_name="رضایی")
    start_at = datetime.combine(
        timezone.localdate() + timedelta(days=5),
        time(11),
        tzinfo=TEHRAN,
    )
    slot = AppointmentSlot.objects.create(
        doctor=doctor,
        date=start_at.date(),
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
        status=AppointmentSlot.Status.BOOKED,
        generated_by_schedule=True,
    )
    appointment = Appointment.objects.create(
        doctor=doctor,
        patient=normal,
        slot=slot,
        status=Appointment.Status.PENDING,
        contact_phone_number=normal.phone_number,
        contact_first_name=normal.first_name,
        contact_last_name=normal.last_name,
    )
    doctor_client = client_for(doctor)

    conflict = doctor_client.delete(
        f"/api/v1/appointments/doctor/availability/slots/{slot.pk}/"
    )
    assert conflict.status_code == 409
    assert conflict.data["booked_count"] == 1
    assert conflict.data["detail"] == (
        "برای تاریخ انتخاب شده تعداد 1 نوبت رزرو شده. برای حذف کردن بازه نوبت دهی "
        "در این تاریخ، ابتدا در قسمت نوبت ها، نوبت های رزرو شده برای این تاریخ را "
        "لغو نمایید و مجدد امتحان کنید."
    )

    cancelled = doctor_client.post(
        f"/api/v1/appointments/doctor/{appointment.pk}/cancel/",
        {},
        format="json",
    )
    removed = doctor_client.delete(
        f"/api/v1/appointments/doctor/availability/slots/{slot.pk}/"
    )
    slot.refresh_from_db()
    assert cancelled.status_code == 200
    assert removed.status_code == 200
    assert removed.data == {"removed": 0, "blocked": 1}
    assert slot.status == AppointmentSlot.Status.BLOCKED


@pytest.mark.django_db
def test_doctor_appointment_date_filter_calendar_and_patient_profile_are_scoped():
    doctor = approved_doctor("+989121170001")
    other_doctor = approved_doctor("+989121170002")
    normal = patient("+989121170003", first_name="آرزو", last_name="کریمی")
    normal.profile_picture = "https://cdn.example/avatar.jpg"
    normal.save(update_fields=("profile_picture",))
    clinic_date = timezone.localdate() + timedelta(days=4)
    start_at = datetime.combine(clinic_date, time(14), tzinfo=TEHRAN)
    own_slot = AppointmentSlot.objects.create(
        doctor=doctor,
        date=clinic_date,
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
        status=AppointmentSlot.Status.BOOKED,
    )
    other_slot = AppointmentSlot.objects.create(
        doctor=other_doctor,
        date=clinic_date,
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
        status=AppointmentSlot.Status.BOOKED,
    )
    Appointment.objects.create(
        doctor=doctor,
        patient=normal,
        slot=own_slot,
        contact_phone_number=normal.phone_number,
        contact_first_name=normal.first_name,
        status=Appointment.Status.APPROVED,
    )
    Appointment.objects.create(
        doctor=other_doctor,
        patient=normal,
        slot=other_slot,
        contact_phone_number=normal.phone_number,
        contact_first_name=normal.first_name,
        status=Appointment.Status.PENDING,
    )
    doctor_client = client_for(doctor)

    listing = doctor_client.get(
        "/api/v1/appointments/doctor/",
        {"date": clinic_date.isoformat()},
    )
    calendar = doctor_client.get(
        "/api/v1/appointments/doctor/calendar/",
        {
            "start_date": clinic_date.isoformat(),
            "end_date": clinic_date.isoformat(),
        },
    )

    assert listing.status_code == 200
    assert listing.data["count"] == 1
    assert listing.data["results"][0]["patient"]["profile_picture"].endswith("avatar.jpg")
    assert calendar.status_code == 200
    assert calendar.data["days"][0]["total"] == 1
    assert calendar.data["days"][0]["approved"] == 1


@pytest.mark.django_db
def test_doctor_specific_slot_rejects_booking_for_another_doctor():
    slot_doctor = approved_doctor("+989121180001")
    wrong_doctor = approved_doctor("+989121180002")
    normal = patient("+989121180003")
    start_at = timezone.now() + timedelta(days=3)
    slot = AppointmentSlot.objects.create(
        doctor=slot_doctor,
        date=start_at.astimezone(TEHRAN).date(),
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
    )

    response = client_for(normal).post(
        "/api/v1/appointments/",
        {
            "slot_id": slot.pk,
            "doctor_id": wrong_doctor.pk,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="8ce17b2c-7735-45f9-9181-bb0216aad233",
    )

    assert response.status_code == 409
    assert Appointment.objects.filter(slot=slot).count() == 0
