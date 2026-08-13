import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import pytest
from django.db import IntegrityError, close_old_connections, connections
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import NormalUser, User
from appointments.models import Appointment, AppointmentSlot
from appointments.services import (
    InvalidTransition,
    SlotUnavailable,
    book_appointment,
    transition_appointment,
)
from core.models import SystemSettings


def make_slot(*, days=5):
    start = timezone.now() + timedelta(days=days)
    return AppointmentSlot.objects.create(
        date=start.date(),
        start_at=start,
        end_at=start + timedelta(hours=1),
    )


@pytest.fixture(autouse=True)
def disable_appointment_sms(monkeypatch):
    monkeypatch.setattr("appointments.services.queue_admin_alert", lambda *args: None)
    monkeypatch.setattr("appointments.services.queue_appt_approved", lambda *args: None)
    monkeypatch.setattr("appointments.services.queue_appt_rejected", lambda *args: None)


@pytest.mark.django_db(transaction=True)
def test_twenty_concurrent_bookings_create_exactly_one_active_appointment():
    slot = make_slot()
    users = [
        NormalUser.objects.create_user(
            phone_number=f"+98912002{i:04d}",
            password="PatientPass123!",
            role=User.Role.USER,
        )
        for i in range(20)
    ]
    barrier = Barrier(len(users))

    def attempt(index):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            result = book_appointment(
                patient=users[index],
                slot_id=slot.pk,
                reason="concurrency",
                idempotency_key=uuid.uuid4(),
            )
            return result.created
        except SlotUnavailable:
            return False
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=20) as pool:
        outcomes = list(pool.map(attempt, range(20)))

    assert outcomes.count(True) == 1
    assert Appointment.objects.filter(
        slot=slot,
        status__in=[Appointment.Status.PENDING, Appointment.Status.APPROVED],
    ).count() == 1


@pytest.mark.django_db
def test_cancelled_booking_is_retained_and_slot_can_be_rebooked(normal_user):
    settings = SystemSettings.load()
    settings.cancellation_enabled = True
    settings.cancellation_cutoff_hours = 0
    settings.save()
    slot = make_slot()
    first = book_appointment(
        patient=normal_user,
        slot_id=slot.pk,
        reason="first",
        idempotency_key=uuid.uuid4(),
    ).appointment
    client = APIClient()
    client.force_authenticate(normal_user)

    cancelled = client.post(
        f"/api/v1/appointments/{first.pk}/cancel/",
        {"cancellation_reason": "changed plans"},
        format="json",
    )
    repeated = client.post(
        f"/api/v1/appointments/{first.pk}/cancel/",
        {"cancellation_reason": "changed plans"},
        format="json",
    )
    second = book_appointment(
        patient=normal_user,
        slot_id=slot.pk,
        reason="second",
        idempotency_key=uuid.uuid4(),
    ).appointment

    assert cancelled.status_code == repeated.status_code == 200
    first.refresh_from_db()
    assert first.status == Appointment.Status.CANCELLED
    assert second.pk != first.pk
    assert Appointment.objects.filter(slot=slot).count() == 2


@pytest.mark.django_db
def test_booking_idempotency_returns_one_appointment(normal_user):
    slot = make_slot()
    key = uuid.uuid4()
    client = APIClient()
    client.force_authenticate(normal_user)
    payload = {"slot_id": slot.pk, "reason": "same request"}

    first = client.post(
        "/api/v1/appointments/", payload, format="json", HTTP_IDEMPOTENCY_KEY=str(key)
    )
    second = client.post(
        "/api/v1/appointments/", payload, format="json", HTTP_IDEMPOTENCY_KEY=str(key)
    )

    assert first.status_code == 201
    assert second.status_code == 200
    assert first.data["id"] == second.data["id"]
    assert Appointment.objects.filter(idempotency_key=key).count() == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_decisions_end_in_a_valid_state(normal_user, admin_user):
    appointment = book_appointment(
        patient=normal_user,
        slot_id=make_slot().pk,
        reason="decision race",
        idempotency_key=uuid.uuid4(),
    ).appointment
    barrier = Barrier(3)

    def decide(target):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            return transition_appointment(
                appointment_id=appointment.pk,
                target_status=target,
                actor=admin_user,
                admin_notes="decision",
            ).changed
        except InvalidTransition:
            return False
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=3) as pool:
        list(
            pool.map(
                decide,
                [
                    Appointment.Status.APPROVED,
                    Appointment.Status.REJECTED,
                    Appointment.Status.CANCELLED,
                ],
            )
        )

    appointment.refresh_from_db()
    assert appointment.status in {
        Appointment.Status.REJECTED,
        Appointment.Status.CANCELLED,
    }
    assert Appointment.objects.filter(
        slot=appointment.slot,
        status__in=[Appointment.Status.PENDING, Appointment.Status.APPROVED],
    ).count() <= 1


@pytest.mark.django_db
def test_terminal_appointment_cannot_be_resurrected(normal_user, admin_user):
    appointment = Appointment.objects.create(
        patient=normal_user,
        slot=make_slot(),
        status=Appointment.Status.CANCELLED,
    )
    with pytest.raises(InvalidTransition):
        transition_appointment(
            appointment_id=appointment.pk,
            target_status=Appointment.Status.APPROVED,
            actor=admin_user,
        )


@pytest.mark.django_db
def test_repeating_admin_approval_is_idempotent(
    normal_user, admin_user, monkeypatch, django_capture_on_commit_callbacks
):
    notifications = []
    monkeypatch.setattr(
        "appointments.services.queue_appt_approved",
        lambda *args: notifications.append(args),
    )
    appointment = book_appointment(
        patient=normal_user,
        slot_id=make_slot().pk,
        reason="approve once",
        idempotency_key=uuid.uuid4(),
    ).appointment

    with django_capture_on_commit_callbacks(execute=True):
        first = transition_appointment(
            appointment_id=appointment.pk,
            target_status=Appointment.Status.APPROVED,
            actor=admin_user,
        )
        second = transition_appointment(
            appointment_id=appointment.pk,
            target_status=Appointment.Status.APPROVED,
            actor=admin_user,
        )

    assert first.changed is True
    assert second.changed is False
    assert len(notifications) == 1


@pytest.mark.django_db
def test_sms_enqueue_failure_does_not_rollback_booking(normal_user, monkeypatch):
    monkeypatch.setattr(
        "appointments.services.queue_admin_alert",
        lambda *args: (_ for _ in ()).throw(RuntimeError("simulated SMS failure")),
    )
    User.objects.create_user(
        phone_number="+989120029999",
        password="AdminPass123!",
        role=User.Role.ADMIN,
    )
    slot = make_slot()

    result = book_appointment(
        patient=normal_user,
        slot_id=slot.pk,
        reason="SMS independent",
        idempotency_key=uuid.uuid4(),
    )

    assert result.created is True
    assert Appointment.objects.filter(pk=result.appointment.pk).exists()


@pytest.mark.django_db(transaction=True)
def test_database_constraints_reject_invalid_direct_writes(normal_user):
    slot = make_slot()
    Appointment.objects.create(
        patient=normal_user,
        slot=slot,
        status=Appointment.Status.PENDING,
    )
    with pytest.raises(IntegrityError):
        Appointment.objects.create(
            patient=normal_user,
            slot=slot,
            status=Appointment.Status.APPROVED,
        )

    start = timezone.now() + timedelta(days=8)
    with pytest.raises(IntegrityError):
        AppointmentSlot.objects.create(
            date=start.date(),
            start_at=start,
            end_at=start - timedelta(minutes=30),
        )

    valid_slot = make_slot(days=9)
    with pytest.raises(IntegrityError):
        Appointment.objects.create(
            patient=normal_user,
            slot=valid_slot,
            status="NOT_A_STATE",
        )
