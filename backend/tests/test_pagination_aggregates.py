from datetime import datetime, timedelta, timezone as datetime_timezone

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Doctor, NormalUser, User
from appointments.models import Appointment, AppointmentSlot
from messaging.models import Message, MessageThread


def make_slot(index: int, *, month=9):
    start = datetime(2030, month, 1, 8, tzinfo=datetime_timezone.utc) + timedelta(
        minutes=30 * index
    )
    return AppointmentSlot.objects.create(
        date=start.date(),
        start_at=start,
        end_at=start + timedelta(minutes=30),
        capacity_index=1,
        status=AppointmentSlot.Status.BLOCKED,
    )


def make_appointment(index: int, patient, *, month=9, status=Appointment.Status.PENDING):
    return Appointment.objects.create(
        patient=patient,
        slot=make_slot(index, month=month),
        contact_phone_number=patient.phone_number,
        contact_first_name=patient.first_name or "Patient",
        contact_last_name=patient.last_name,
        status=status,
    )


@pytest.mark.django_db
def test_default_pagination_caps_page_size_and_preserves_envelope(admin_client):
    for index in range(105):
        NormalUser.objects.create(
            phone_number=f"+98930{index:07d}",
            role=User.Role.USER,
            first_name=f"Patient{index}",
        )

    first = admin_client.get("/api/v1/admin/users/?page_size=1000")
    second = admin_client.get("/api/v1/admin/users/?page=2&page_size=1000")
    searched = admin_client.get("/api/v1/admin/users/?search=Patient104")

    assert first.status_code == 200
    assert set(first.data) == {"count", "next", "previous", "results"}
    assert len(first.data["results"]) == 100
    assert first.data["next"]
    assert second.data["previous"]
    first_ids = {row["id"] for row in first.data["results"]}
    second_ids = {row["id"] for row in second.data["results"]}
    assert not first_ids & second_ids
    assert [row["first_name"] for row in searched.data["results"]] == ["Patient104"]


@pytest.mark.django_db
def test_doctor_preview_projects_at_most_four_public_rows():
    for index in range(6):
        Doctor.objects.create(
            phone_number=f"+98931{index:07d}",
            role=User.Role.DOCTOR,
            first_name=f"Doctor{index}",
            verification_status=Doctor.VerificationStatus.APPROVED,
        )

    response = APIClient().get("/api/v1/doctors/preview/")

    assert response.status_code == 200
    assert len(response.data) == 4
    assert set(response.data[0]) == {
        "id",
        "slug",
        "first_name",
        "last_name",
        "display_name",
        "clinic_name",
        "profile_picture",
        "specialty",
        "bio",
        "experience",
        "address",
        "map_url",
        "services",
        "insurances",
        "likes_count",
        "average_rating",
        "vote_count",
    }
    assert "phone" not in str(response.data).lower()


@pytest.mark.django_db
def test_admin_doctor_documents_are_excluded_from_lists_and_scoped_to_detail(
    admin_client, doctor_user
):
    listing = admin_client.get("/api/v1/admin/doctors/")
    detail = admin_client.get(f"/api/v1/admin/doctors/{doctor_user.pk}/")

    assert listing.status_code == 200
    assert "documents" not in listing.data["results"][0]
    assert detail.status_code == 200
    assert detail.data["documents"] == []


@pytest.mark.django_db
def test_dashboard_summary_uses_exact_aggregate_counts(
    admin_client, admin_user, normal_user, doctor_user
):
    doctor_user.verification_status = Doctor.VerificationStatus.APPROVED
    doctor_user.verification_submitted_at = timezone.now()
    doctor_user.save(
        update_fields=("verification_status", "verification_submitted_at")
    )
    Doctor.objects.create(
        phone_number="+989329999999",
        role=User.Role.DOCTOR,
        verification_status=Doctor.VerificationStatus.PENDING,
        verification_submitted_at=timezone.now() - timedelta(days=1),
    )
    thread = MessageThread.objects.create(
        participant=normal_user,
        thread_type=MessageThread.ThreadType.USER_ADMIN,
    )
    Message.objects.create(
        thread=thread,
        sender=normal_user,
        sender_type=Message.SenderType.USER,
        body="unread",
    )
    Message.objects.create(
        thread=thread,
        sender=admin_user,
        sender_type=Message.SenderType.ADMIN,
        body="own message",
    )
    make_appointment(1, normal_user)

    response = admin_client.get("/api/v1/admin/dashboard/summary/")

    assert response.status_code == 200
    assert response.data == {
        "users": NormalUser.objects.count(),
        "doctors_approved": Doctor.objects.filter(
            verification_status=Doctor.VerificationStatus.APPROVED,
        ).count(),
        "doctors_pending": 1,
        "unread_messages": 1,
        "recent_verifications": 2,
        "recent_appointments": 1,
        "window_days": 7,
    }


@pytest.mark.django_db
def test_calendar_returns_bounded_daily_counts_and_day_detail_is_paginated(
    admin_client, normal_user
):
    statuses = [
        Appointment.Status.PENDING,
        Appointment.Status.APPROVED,
        Appointment.Status.CANCELLED,
    ]
    for index, appointment_status in enumerate(statuses):
        make_appointment(index, normal_user, status=appointment_status)
    for index in range(3, 24):
        make_appointment(index, normal_user)

    summary = admin_client.get("/api/v1/admin/appointments/calendar/?month=2030-09")
    page_one = admin_client.get(
        "/api/v1/admin/appointments/?start_date=2030-09-01&end_date=2030-09-01"
    )
    page_two = admin_client.get(
        "/api/v1/admin/appointments/?start_date=2030-09-01&end_date=2030-09-01&page=2"
    )

    assert summary.status_code == 200
    assert summary.data["month"] == "2030-09"
    assert summary.data["days"] == [{
        "date": "2030-09-01",
        "total": 24,
        "pending": 22,
        "approved": 1,
        "rejected": 0,
        "cancelled": 1,
        "completed": 0,
        "no_show": 0,
    }]
    assert page_one.data["count"] == 24
    assert page_one.data["next"]
    assert len(page_one.data["results"]) == 20
    assert len(page_two.data["results"]) == 4
    assert not {
        row["id"] for row in page_one.data["results"]
    } & {row["id"] for row in page_two.data["results"]}


@pytest.mark.django_db
def test_appointment_search_and_ordering_run_on_server(admin_client, normal_user):
    first = make_appointment(1, normal_user)
    second_patient = NormalUser.objects.create(
        phone_number="+989339999999",
        role=User.Role.USER,
        first_name="OutsideFirstPage",
    )
    second = make_appointment(2, second_patient)

    response = admin_client.get(
        "/api/v1/admin/appointments/?search=OutsideFirstPage&ordering=slot__start_at"
    )

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["id"] == str(second.pk)
    assert response.data["results"][0]["id"] != str(first.pk)
