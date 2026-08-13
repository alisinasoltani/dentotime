"""Transactional booking and appointment state-transition services."""

import logging
import uuid
from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import User
from core.sms_service import (
    queue_admin_alert,
    queue_appt_approved,
    queue_appt_rejected,
)

from .models import Appointment, AppointmentSlot


logger = logging.getLogger(__name__)
ACTIVE_STATUSES = frozenset({Appointment.Status.PENDING, Appointment.Status.APPROVED})
ALLOWED_TRANSITIONS = {
    Appointment.Status.PENDING: frozenset(
        {Appointment.Status.APPROVED, Appointment.Status.REJECTED, Appointment.Status.CANCELLED}
    ),
    Appointment.Status.APPROVED: frozenset(
        {Appointment.Status.CANCELLED, Appointment.Status.COMPLETED, Appointment.Status.NO_SHOW}
    ),
    Appointment.Status.REJECTED: frozenset(),
    Appointment.Status.CANCELLED: frozenset(),
    Appointment.Status.COMPLETED: frozenset(),
    Appointment.Status.NO_SHOW: frozenset(),
}


class BookingConflict(Exception):
    pass


class SlotUnavailable(BookingConflict):
    pass


class IdempotencyConflict(BookingConflict):
    pass


class InvalidTransition(Exception):
    pass


class CancellationNotAllowed(Exception):
    pass


@dataclass(frozen=True)
class BookingResult:
    appointment: Appointment
    created: bool


@dataclass(frozen=True)
class TransitionResult:
    appointment: Appointment
    changed: bool


def parse_idempotency_key(raw_key: str | None) -> uuid.UUID:
    if not raw_key:
        raise IdempotencyConflict("Idempotency-Key header is required.")
    try:
        return uuid.UUID(str(raw_key))
    except (TypeError, ValueError) as exc:
        raise IdempotencyConflict("Idempotency-Key must be a valid UUID.") from exc


def _matching_idempotent_booking(existing, *, patient, slot_id, reason):
    if existing.patient_id != patient.pk or existing.slot_id != slot_id or existing.reason != reason:
        raise IdempotencyConflict("This idempotency key was already used for another booking.")
    return BookingResult(existing, created=False)


def _queue_booking_notifications(admin_phones):
    for phone in admin_phones:
        try:
            queue_admin_alert(phone, "نوبت جدید")
        except Exception:
            logger.exception("Unable to enqueue an appointment administrator notification.")


def book_appointment(*, patient, slot_id: int, reason: str, idempotency_key) -> BookingResult:
    existing = Appointment.objects.select_related("slot").filter(
        idempotency_key=idempotency_key
    ).first()
    if existing:
        return _matching_idempotent_booking(
            existing, patient=patient, slot_id=slot_id, reason=reason
        )

    try:
        with transaction.atomic():
            slot = AppointmentSlot.objects.select_for_update().get(pk=slot_id)
            existing = Appointment.objects.select_related("slot").filter(
                idempotency_key=idempotency_key
            ).first()
            if existing:
                return _matching_idempotent_booking(
                    existing, patient=patient, slot_id=slot_id, reason=reason
                )
            if slot.status != AppointmentSlot.Status.AVAILABLE:
                raise SlotUnavailable("This slot is no longer available.")

            appointment = Appointment.objects.create(
                patient=patient,
                slot=slot,
                status=Appointment.Status.PENDING,
                reason=reason,
                idempotency_key=idempotency_key,
            )
            slot.status = AppointmentSlot.Status.BOOKED
            slot.save(update_fields=["status"])
            admin_phones = list(
                User.objects.filter(role=User.Role.ADMIN, is_active=True).values_list(
                    "phone_number", flat=True
                )
            )
            transaction.on_commit(lambda: _queue_booking_notifications(admin_phones))
            return BookingResult(appointment, created=True)
    except IntegrityError:
        existing = Appointment.objects.select_related("slot").filter(
            idempotency_key=idempotency_key
        ).first()
        if existing:
            return _matching_idempotent_booking(
                existing, patient=patient, slot_id=slot_id, reason=reason
            )
        raise SlotUnavailable("This slot is no longer available.")


def _lock_appointment(appointment_id):
    slot_id = Appointment.objects.filter(pk=appointment_id).values_list("slot_id", flat=True).first()
    if slot_id is None:
        raise Appointment.DoesNotExist
    AppointmentSlot.objects.select_for_update().get(pk=slot_id)
    return Appointment.objects.select_for_update().select_related("patient", "slot").get(
        pk=appointment_id
    )


def _set_slot_for_status(appointment):
    desired = (
        AppointmentSlot.Status.BOOKED
        if appointment.status in ACTIVE_STATUSES
        else AppointmentSlot.Status.AVAILABLE
    )
    if appointment.slot.status != desired:
        appointment.slot.status = desired
        appointment.slot.save(update_fields=["status"])


def _queue_transition_notification(appointment, target_status):
    try:
        if target_status == Appointment.Status.APPROVED:
            queue_appt_approved(
                appointment.patient.phone_number,
                appointment.slot.date.strftime("%Y-%m-%d"),
                appointment.slot.start_at.strftime("%H:%M"),
            )
        elif target_status == Appointment.Status.REJECTED:
            queue_appt_rejected(
                appointment.patient.phone_number,
                appointment.slot.date.strftime("%Y-%m-%d"),
            )
    except Exception:
        logger.exception("Unable to enqueue an appointment state notification.")


def _transition_locked(appointment, *, target_status, actor, admin_notes=None, cancellation_reason=""):
    if target_status == appointment.status:
        if admin_notes is not None and appointment.admin_notes != admin_notes:
            appointment.admin_notes = admin_notes
            appointment.save(update_fields=["admin_notes", "updated_at"])
            return TransitionResult(appointment, changed=True)
        return TransitionResult(appointment, changed=False)
    if target_status not in ALLOWED_TRANSITIONS[appointment.status]:
        raise InvalidTransition(f"Cannot transition {appointment.status} to {target_status}.")

    now = timezone.now()
    appointment.status = target_status
    update_fields = ["status", "updated_at"]
    if admin_notes is not None:
        appointment.admin_notes = admin_notes
        update_fields.append("admin_notes")
    if target_status == Appointment.Status.APPROVED:
        appointment.approved_by = actor
        appointment.approved_at = now
        update_fields.extend(["approved_by", "approved_at"])
    if target_status == Appointment.Status.CANCELLED:
        appointment.cancelled_by = actor
        appointment.cancelled_at = now
        appointment.cancellation_reason = cancellation_reason
        update_fields.extend(["cancelled_by", "cancelled_at", "cancellation_reason"])
    appointment.save(update_fields=update_fields)
    _set_slot_for_status(appointment)
    transaction.on_commit(
        lambda: _queue_transition_notification(appointment, target_status)
    )
    return TransitionResult(appointment, changed=True)


@transaction.atomic
def transition_appointment(*, appointment_id, target_status, actor, admin_notes=None):
    appointment = _lock_appointment(appointment_id)
    return _transition_locked(
        appointment,
        target_status=target_status,
        actor=actor,
        admin_notes=admin_notes,
    )


@transaction.atomic
def cancel_patient_appointment(*, appointment_id, patient, reason=""):
    appointment = _lock_appointment(appointment_id)
    if appointment.patient_id != patient.pk:
        raise Appointment.DoesNotExist
    if appointment.status == Appointment.Status.CANCELLED:
        return TransitionResult(appointment, changed=False)
    if not appointment.can_be_cancelled_by_user():
        raise CancellationNotAllowed
    return _transition_locked(
        appointment,
        target_status=Appointment.Status.CANCELLED,
        actor=patient,
        cancellation_reason=reason,
    )
