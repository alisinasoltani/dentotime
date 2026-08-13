"""Clinic-local availability validation and bounded slot generation."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import (
    Appointment,
    AppointmentSlot,
    AvailabilityBreak,
    AvailabilityOverride,
    ClinicSchedule,
    WeeklyAvailabilityRule,
)


TEHRAN = ZoneInfo("Asia/Tehran")


@dataclass(frozen=True)
class GenerationResult:
    created: int
    updated: int
    removed: int
    total: int


def clinic_today() -> date:
    return timezone.now().astimezone(TEHRAN).date()


def validate_date_range(start_date: date, end_date: date) -> None:
    if start_date > end_date:
        raise ValidationError({"end_date": "end_date must be on or after start_date."})
    requested_days = (end_date - start_date).days + 1
    if requested_days > settings.AVAILABILITY_MAX_RANGE_DAYS:
        raise ValidationError(
            {"end_date": f"Availability ranges cannot exceed {settings.AVAILABILITY_MAX_RANGE_DAYS} days."}
        )


def validate_rule_overlap(*, schedule_id, weekday, start_time, end_time, exclude_pk=None):
    queryset = WeeklyAvailabilityRule.objects.filter(
        schedule_id=schedule_id,
        weekday=weekday,
        is_active=True,
        start_time__lt=end_time,
        end_time__gt=start_time,
    )
    if exclude_pk:
        queryset = queryset.exclude(pk=exclude_pk)
    if queryset.exists():
        raise ValidationError({"start_time": "This weekly interval overlaps another active rule."})


def validate_break(*, rule, start_time, end_time, exclude_pk=None):
    if not (rule.start_time <= start_time < end_time <= rule.end_time):
        raise ValidationError({"start_time": "A break must be fully inside its weekly rule."})
    queryset = AvailabilityBreak.objects.filter(
        rule=rule, start_time__lt=end_time, end_time__gt=start_time
    )
    if exclude_pk:
        queryset = queryset.exclude(pk=exclude_pk)
    if queryset.exists():
        raise ValidationError({"start_time": "This break overlaps another break."})


def _local_datetime(day: date, local_time) -> datetime:
    return datetime.combine(day, local_time, tzinfo=TEHRAN)


def _interval_slots(day, start_time, end_time, duration, capacity, breaks=()):
    interval_start = _local_datetime(day, start_time)
    interval_end = _local_datetime(day, end_time)
    cursor = interval_start
    while cursor + duration <= interval_end:
        slot_end = cursor + duration
        overlaps_break = any(
            cursor < _local_datetime(day, item.end_time)
            and slot_end > _local_datetime(day, item.start_time)
            for item in breaks
        )
        if not overlaps_break:
            for capacity_index in range(1, capacity + 1):
                yield cursor, slot_end, capacity_index
        cursor = slot_end


def _desired_slots(start_date, end_date, rules, overrides):
    desired = {}
    day = start_date
    while day <= end_date:
        override = overrides.get(day)
        intervals = []
        if override:
            if override.kind == AvailabilityOverride.Kind.CUSTOM:
                intervals.append(
                    (
                        override.start_time,
                        override.end_time,
                        override.slot_duration_minutes,
                        override.capacity,
                        (),
                    )
                )
        else:
            intervals.extend(
                (
                    rule.start_time,
                    rule.end_time,
                    rule.slot_duration_minutes,
                    rule.capacity,
                    tuple(rule.breaks.all()),
                )
                for rule in rules.get(day.weekday(), ())
            )

        for start_time, end_time, duration_minutes, capacity, breaks in intervals:
            duration = timedelta(minutes=duration_minutes)
            for start_at, end_at, capacity_index in _interval_slots(
                day, start_time, end_time, duration, capacity, breaks
            ):
                desired[(start_at, capacity_index)] = (day, start_at, end_at, capacity_index)
        day += timedelta(days=1)
    return desired


@transaction.atomic
def generate_availability(*, start_date: date, end_date: date) -> GenerationResult:
    validate_date_range(start_date, end_date)
    schedule, _ = ClinicSchedule.objects.get_or_create(pk=1)
    schedule = ClinicSchedule.objects.select_for_update().get(pk=schedule.pk)
    rule_rows = list(
        WeeklyAvailabilityRule.objects.filter(schedule=schedule, is_active=True)
        .prefetch_related("breaks")
        .order_by("weekday", "start_time")
    )
    rules = {}
    for rule in rule_rows:
        rules.setdefault(rule.weekday, []).append(rule)
    overrides = {
        item.date: item
        for item in AvailabilityOverride.objects.filter(
            schedule=schedule, date__range=(start_date, end_date)
        )
    }
    desired = _desired_slots(start_date, end_date, rules, overrides)
    existing = list(
        AppointmentSlot.objects.select_for_update().filter(
            generated_by_schedule=True,
            date__range=(start_date, end_date),
        )
    )
    by_key = {(slot.start_at.astimezone(TEHRAN), slot.capacity_index): slot for slot in existing}
    created = updated = removed = 0

    for key, (clinic_date, start_at, end_at, capacity_index) in desired.items():
        slot = by_key.pop(key, None)
        if slot is None:
            AppointmentSlot.objects.create(
                date=clinic_date,
                start_at=start_at,
                end_at=end_at,
                capacity_index=capacity_index,
                generated_by_schedule=True,
            )
            created += 1
            continue
        update_fields = []
        if slot.end_at != end_at:
            slot.end_at = end_at
            update_fields.append("end_at")
        if slot.date != clinic_date:
            slot.date = clinic_date
            update_fields.append("date")
        has_active = slot.appointments.filter(
            status__in=[Appointment.Status.PENDING, Appointment.Status.APPROVED]
        ).exists()
        if slot.status == AppointmentSlot.Status.BLOCKED and not has_active:
            slot.status = AppointmentSlot.Status.AVAILABLE
            update_fields.append("status")
        if update_fields:
            slot.save(update_fields=update_fields)
            updated += 1

    for stale in by_key.values():
        if not stale.appointments.exists():
            stale.delete()
            removed += 1
        elif not stale.appointments.filter(
            status__in=[Appointment.Status.PENDING, Appointment.Status.APPROVED]
        ).exists() and stale.status != AppointmentSlot.Status.BLOCKED:
            stale.status = AppointmentSlot.Status.BLOCKED
            stale.save(update_fields=["status"])
            updated += 1

    return GenerationResult(
        created=created,
        updated=updated,
        removed=removed,
        total=len(desired),
    )
