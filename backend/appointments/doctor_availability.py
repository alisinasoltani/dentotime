"""Transactional doctor-specific slot generation and safe removal."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import Doctor

from .availability import validate_date_range
from .models import Appointment, AppointmentSlot, DoctorAvailabilityRule


TEHRAN = ZoneInfo("Asia/Tehran")
ACTIVE_APPOINTMENT_STATUSES = (
    Appointment.Status.PENDING,
    Appointment.Status.APPROVED,
)


@dataclass(frozen=True)
class DoctorGenerationResult:
    created: int
    restored: int
    existing: int
    skipped_past: int
    rules_created: int


@dataclass(frozen=True)
class DoctorRemovalResult:
    removed: int
    blocked: int


class BookedAvailabilityError(Exception):
    def __init__(self, *, clinic_date: date, booked_count: int):
        self.clinic_date = clinic_date
        self.booked_count = booked_count
        super().__init__(self.message)

    @property
    def message(self):
        return (
            f"برای تاریخ انتخاب شده تعداد {self.booked_count} نوبت رزرو شده. "
            "برای حذف کردن بازه نوبت دهی در این تاریخ، ابتدا در قسمت نوبت ها، "
            "نوبت های رزرو شده برای این تاریخ را لغو نمایید و مجدد امتحان کنید."
        )


def _local_datetime(day, local_time):
    return datetime.combine(day, local_time, tzinfo=TEHRAN)


def _iter_days(start_date, end_date, weekdays):
    day = start_date
    wanted = set(weekdays)
    while day <= end_date:
        if day.weekday() in wanted:
            yield day
        day += timedelta(days=1)


def _validate_saved_rule_overlap(
    *,
    doctor,
    weekday,
    start_time,
    end_time,
    starts_on,
    ends_on,
):
    if DoctorAvailabilityRule.objects.filter(
        doctor=doctor,
        weekday=weekday,
        is_active=True,
        starts_on__lte=ends_on,
        ends_on__gte=starts_on,
        start_time__lt=end_time,
        end_time__gt=start_time,
    ).exclude(
        start_time=start_time,
        end_time=end_time,
        starts_on=starts_on,
        ends_on=ends_on,
    ).exists():
        raise ValidationError(
            {"start_time": "این بازه با یکی از برنامه‌های تکرارشونده تداخل دارد."}
        )


@transaction.atomic
def generate_doctor_availability(
    *,
    doctor,
    start_date,
    end_date,
    weekdays,
    start_time,
    end_time,
    slot_duration_minutes,
    save_as_routine,
):
    validate_date_range(start_date, end_date)
    doctor = Doctor.objects.select_for_update().get(pk=doctor.pk)
    rules_created = 0
    if save_as_routine:
        for weekday in weekdays:
            _validate_saved_rule_overlap(
                doctor=doctor,
                weekday=weekday,
                start_time=start_time,
                end_time=end_time,
                starts_on=start_date,
                ends_on=end_date,
            )
            _, created = DoctorAvailabilityRule.objects.get_or_create(
                doctor=doctor,
                weekday=weekday,
                start_time=start_time,
                end_time=end_time,
                slot_duration_minutes=slot_duration_minutes,
                starts_on=start_date,
                ends_on=end_date,
                defaults={"is_active": True},
            )
            rules_created += int(created)

    created = restored = existing = skipped_past = 0
    duration = timedelta(minutes=slot_duration_minutes)
    now = timezone.now()
    for day in _iter_days(start_date, end_date, weekdays):
        cursor = _local_datetime(day, start_time)
        interval_end = _local_datetime(day, end_time)
        while cursor + duration <= interval_end:
            slot_end = cursor + duration
            if cursor <= now:
                skipped_past += 1
                cursor = slot_end
                continue

            overlapping = list(
                AppointmentSlot.objects.select_for_update()
                .filter(
                    doctor=doctor,
                    capacity_index=1,
                    start_at__lt=slot_end,
                    end_at__gt=cursor,
                )
                .order_by("start_at")
            )
            exact = next(
                (
                    slot
                    for slot in overlapping
                    if slot.start_at == cursor and slot.end_at == slot_end
                ),
                None,
            )
            if exact:
                if exact.status == AppointmentSlot.Status.BLOCKED and not exact.appointments.filter(
                    status__in=ACTIVE_APPOINTMENT_STATUSES
                ).exists():
                    exact.status = AppointmentSlot.Status.AVAILABLE
                    exact.generated_by_schedule = True
                    exact.save(update_fields=("status", "generated_by_schedule"))
                    restored += 1
                else:
                    existing += 1
                cursor = slot_end
                continue
            if any(
                slot.status in {
                    AppointmentSlot.Status.AVAILABLE,
                    AppointmentSlot.Status.BOOKED,
                }
                for slot in overlapping
            ):
                raise ValidationError(
                    {"start_time": "یکی از بازه‌های ساخته‌شده با نوبت موجود تداخل دارد."}
                )
            AppointmentSlot.objects.create(
                doctor=doctor,
                date=day,
                start_at=cursor,
                end_at=slot_end,
                capacity_index=1,
                generated_by_schedule=True,
            )
            created += 1
            cursor = slot_end

    return DoctorGenerationResult(
        created=created,
        restored=restored,
        existing=existing,
        skipped_past=skipped_past,
        rules_created=rules_created,
    )


def _remove_locked_slots(slots):
    if not slots:
        return DoctorRemovalResult(removed=0, blocked=0)
    clinic_date = slots[0].date
    slot_ids = [slot.pk for slot in slots]
    booked_count = Appointment.objects.filter(
        slot_id__in=slot_ids,
        status__in=ACTIVE_APPOINTMENT_STATUSES,
    ).count()
    if booked_count:
        raise BookedAvailabilityError(
            clinic_date=clinic_date,
            booked_count=booked_count,
        )

    removed = blocked = 0
    for slot in slots:
        if slot.appointments.exists():
            if slot.status != AppointmentSlot.Status.BLOCKED:
                slot.status = AppointmentSlot.Status.BLOCKED
                slot.save(update_fields=("status",))
            blocked += 1
        else:
            slot.delete()
            removed += 1
    return DoctorRemovalResult(removed=removed, blocked=blocked)


@transaction.atomic
def remove_doctor_slot(*, doctor, slot_id):
    slot = (
        AppointmentSlot.objects.select_for_update()
        .filter(pk=slot_id, doctor=doctor)
        .first()
    )
    if slot is None:
        raise AppointmentSlot.DoesNotExist
    return _remove_locked_slots([slot])


@transaction.atomic
def remove_doctor_day(*, doctor, clinic_date):
    Doctor.objects.select_for_update().get(pk=doctor.pk)
    slots = list(
        AppointmentSlot.objects.select_for_update()
        .filter(doctor=doctor, date=clinic_date)
        .order_by("start_at", "pk")
    )
    return _remove_locked_slots(slots)
