import json
from datetime import datetime, timedelta, timezone as datetime_timezone

import pytest
from django.db import connection, transaction
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts.models import Doctor, DoctorReview, NormalUser, User
from appointments.models import Appointment, AppointmentSlot
from messaging.models import Message, MessageThread


PAYLOAD_BUDGET_BYTES = 256 * 1024


def patient(index: int):
    return NormalUser.objects.create(
        phone_number=f"+98940{index:07d}",
        role=User.Role.USER,
        first_name=f"Patient{index}",
        last_name="Query",
    )


def approved_doctor(index: int):
    return Doctor.objects.create(
        phone_number=f"+98950{index:07d}",
        role=User.Role.DOCTOR,
        first_name=f"Doctor{index}",
        verification_status=Doctor.VerificationStatus.APPROVED,
    )


def response_query_count(client, url):
    with CaptureQueriesContext(connection) as captured:
        response = client.get(url)
        rendered = response.render()
    assert response.status_code == 200
    assert len(rendered.content) <= PAYLOAD_BUDGET_BYTES
    return len(captured), response


@pytest.mark.django_db
def test_appointment_list_query_count_is_constant_for_one_and_one_hundred_rows(
    admin_client, normal_user
):
    base = datetime(2031, 1, 1, tzinfo=datetime_timezone.utc)
    for index in range(100):
        slot = AppointmentSlot.objects.create(
            date=(base + timedelta(minutes=30 * index)).date(),
            start_at=base + timedelta(minutes=30 * index),
            end_at=base + timedelta(minutes=30 * index + 25),
            status=AppointmentSlot.Status.BLOCKED,
        )
        Appointment.objects.create(
            patient=normal_user,
            slot=slot,
            contact_phone_number=normal_user.phone_number,
            contact_first_name="Patient",
        )

    one_count, _ = response_query_count(
        admin_client, "/api/v1/admin/appointments/?page_size=1"
    )
    hundred_count, response = response_query_count(
        admin_client, "/api/v1/admin/appointments/?page_size=100"
    )

    assert len(response.data["results"]) == 100
    assert hundred_count == one_count
    assert hundred_count <= 2


@pytest.mark.django_db
def test_message_list_query_count_is_constant_for_one_and_one_hundred_rows(
    normal_user, admin_user
):
    thread = MessageThread.objects.create(
        participant=normal_user,
        thread_type=MessageThread.ThreadType.USER_ADMIN,
    )
    Message.objects.bulk_create(
        [
            Message(
                thread=thread,
                sender=admin_user,
                sender_type=Message.SenderType.ADMIN,
                sender_first_name="Admin",
                body=f"message {index}",
            )
            for index in range(100)
        ]
    )
    client = APIClient()
    client.force_authenticate(normal_user)

    one_count, _ = response_query_count(
        client, f"/api/v1/chat/threads/{thread.pk}/messages/?page_size=1"
    )
    hundred_count, response = response_query_count(
        client, f"/api/v1/chat/threads/{thread.pk}/messages/?page_size=100"
    )

    assert len(response.data["results"]) == 100
    assert hundred_count == one_count
    assert hundred_count <= 3


@pytest.mark.django_db
def test_review_list_query_count_is_constant_for_one_and_one_hundred_rows(
    doctor_user
):
    doctor_user.verification_status = Doctor.VerificationStatus.APPROVED
    doctor_user.save(update_fields=("verification_status",))
    for index in range(100):
        DoctorReview.objects.create(
            doctor=doctor_user,
            user=patient(index),
            rating=index % 5 + 1,
            comment=f"review {index}",
        )
    client = APIClient()

    one_count, _ = response_query_count(
        client, f"/api/v1/doctors/{doctor_user.pk}/reviews/?page_size=1"
    )
    hundred_count, response = response_query_count(
        client, f"/api/v1/doctors/{doctor_user.pk}/reviews/?page_size=100"
    )

    assert len(response.data["results"]) == 100
    assert hundred_count == one_count
    assert hundred_count <= 3


@pytest.mark.django_db
def test_doctor_list_query_count_and_payload_are_constant_and_projected():
    for index in range(100):
        approved_doctor(index)
    client = APIClient()

    one_count, _ = response_query_count(
        client, "/api/v1/doctors/list/?page_size=1"
    )
    hundred_count, response = response_query_count(
        client, "/api/v1/doctors/list/?page_size=100"
    )

    assert len(response.data["results"]) == 100
    assert hundred_count == one_count
    assert hundred_count <= 2
    serialized = json.dumps(response.data, default=str).lower()
    assert "phone_number" not in serialized
    assert "documents" not in serialized
    assert "id_number" not in serialized


@pytest.mark.django_db
def test_thread_list_query_count_is_constant_for_one_and_one_hundred_rows(
    admin_client, admin_user
):
    for index in range(100):
        account = patient(index)
        thread = MessageThread.objects.create(
            participant=account,
            thread_type=MessageThread.ThreadType.USER_ADMIN,
        )
        Message.objects.create(
            thread=thread,
            sender=account,
            sender_type=Message.SenderType.USER,
            sender_first_name=account.first_name,
            body=f"thread {index}",
        )

    one_count, _ = response_query_count(
        admin_client, "/api/v1/chat/threads/?page_size=1"
    )
    hundred_count, response = response_query_count(
        admin_client, "/api/v1/chat/threads/?page_size=100"
    )

    assert len(response.data["results"]) == 100
    assert hundred_count == one_count
    assert hundred_count <= 2


def index_names(plan):
    names = set()
    if isinstance(plan, dict):
        if plan.get("Index Name"):
            names.add(plan["Index Name"])
        for value in plan.values():
            names.update(index_names(value))
    elif isinstance(plan, list):
        for value in plan:
            names.update(index_names(value))
    return names


@pytest.mark.django_db
def test_critical_postgresql_plans_use_the_targeted_composite_indexes(
    normal_user, admin_user
):
    slot = AppointmentSlot.objects.create(
        date=datetime(2031, 2, 1).date(),
        start_at=datetime(2031, 2, 1, 8, tzinfo=datetime_timezone.utc),
        end_at=datetime(2031, 2, 1, 8, 30, tzinfo=datetime_timezone.utc),
        status=AppointmentSlot.Status.AVAILABLE,
    )
    AppointmentSlot.objects.bulk_create(
        [
            AppointmentSlot(
                date=datetime(2031, 2, 1).date(),
                start_at=datetime(2031, 2, 1, 9, tzinfo=datetime_timezone.utc)
                + timedelta(minutes=30 * index),
                end_at=datetime(2031, 2, 1, 9, 25, tzinfo=datetime_timezone.utc)
                + timedelta(minutes=30 * index),
                status=AppointmentSlot.Status.BLOCKED,
            )
            for index in range(100)
        ]
    )
    thread = MessageThread.objects.create(
        participant=normal_user,
        thread_type=MessageThread.ThreadType.USER_ADMIN,
    )
    Message.objects.create(
        thread=thread,
        sender=admin_user,
        sender_type=Message.SenderType.ADMIN,
        body="plan",
    )
    Message.objects.bulk_create(
        [
            Message(
                thread=thread,
                sender=admin_user,
                sender_type=Message.SenderType.ADMIN,
                visibility=Message.Visibility.ADMINS_ONLY,
                body=f"internal {index}",
            )
            for index in range(100)
        ]
    )
    assert slot.pk

    querysets = (
        (
            AppointmentSlot.objects.filter(
                status=AppointmentSlot.Status.AVAILABLE,
                date__range=(datetime(2031, 2, 1).date(), datetime(2031, 2, 28).date()),
            ).order_by("start_at"),
            {"exclude_overlapping_slots_capacity", "unique_slot_start_capacity"},
        ),
        (
            Message.objects.filter(
                thread=thread,
                visibility=Message.Visibility.PARTICIPANTS,
                is_deleted=False,
            ).order_by("-created_at", "-id"),
            {"messaging_m_thread__9b87ef_idx"},
        ),
        (
            MessageThread.objects.filter(
                participant=normal_user, deleted_at__isnull=True
            ).order_by("-last_message_at", "-created_at", "-id"),
            {"thread_participant_order_idx"},
        ),
    )
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("ANALYZE appointments_appointmentslot")
            cursor.execute("ANALYZE messaging_message")
            cursor.execute("ANALYZE messaging_messagethread")
            cursor.execute("SET LOCAL enable_seqscan = off")
        for queryset, expected_indexes in querysets:
            plan = json.loads(
                queryset.explain(format="json", analyze=True, buffers=True)
            )
            assert expected_indexes & index_names(plan), plan


@pytest.mark.django_db
def test_duplicate_indexes_are_removed_from_the_postgresql_catalog():
    removed = {
        "accounts_do_verific_a9ada0_idx",
        "accounts_us_usernam_c0ea66_idx",
        "appointment_status_8fe9d7_idx",
        "appointment_start_a_2d6933_idx",
        "messaging_m_is_3d_s_2a376c_idx",
    }
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"
        )
        actual = {row[0] for row in cursor.fetchall()}
    assert removed.isdisjoint(actual)
