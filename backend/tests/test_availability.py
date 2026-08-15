from datetime import datetime, time, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from appointments.availability import generate_availability
from appointments.models import (
    AppointmentSlot,
    AvailabilityBreak,
    AvailabilityOverride,
    ClinicSchedule,
    WeeklyAvailabilityRule,
)


TEHRAN = ZoneInfo("Asia/Tehran")


def future_date_for_weekday(weekday, *, weeks=1):
    today = timezone.now().astimezone(TEHRAN).date()
    offset = (weekday - today.weekday()) % 7 + 7 * weeks
    return today + timedelta(days=offset)


def schedule():
    return ClinicSchedule.objects.create(pk=1)


@pytest.mark.django_db
def test_weekly_generation_respects_breaks_and_is_idempotent():
    clinic = schedule()
    weekday = 0
    day = future_date_for_weekday(weekday)
    rule = WeeklyAvailabilityRule.objects.create(
        schedule=clinic,
        weekday=weekday,
        start_time=time(9),
        end_time=time(12),
        slot_duration_minutes=60,
        capacity=1,
    )
    AvailabilityBreak.objects.create(rule=rule, start_time=time(10), end_time=time(11))

    first = generate_availability(start_date=day, end_date=day)
    first_ids = set(AppointmentSlot.objects.values_list("pk", flat=True))
    second = generate_availability(start_date=day, end_date=day)
    second_ids = set(AppointmentSlot.objects.values_list("pk", flat=True))
    local_hours = [
        slot.start_at.astimezone(TEHRAN).hour
        for slot in AppointmentSlot.objects.order_by("start_at")
    ]

    assert first.created == 2
    assert second.created == 0
    assert first_ids == second_ids
    assert local_hours == [9, 11]


@pytest.mark.django_db
def test_holiday_removes_slots_and_custom_override_replaces_weekly_rule():
    clinic = schedule()
    weekday = 1
    holiday = future_date_for_weekday(weekday)
    custom_day = holiday + timedelta(days=7)
    WeeklyAvailabilityRule.objects.create(
        schedule=clinic,
        weekday=weekday,
        start_time=time(9),
        end_time=time(12),
        slot_duration_minutes=60,
    )
    generate_availability(start_date=holiday, end_date=holiday)
    assert AppointmentSlot.objects.filter(date=holiday).count() == 3

    AvailabilityOverride.objects.create(
        schedule=clinic, date=holiday, kind=AvailabilityOverride.Kind.CLOSED
    )
    AvailabilityOverride.objects.create(
        schedule=clinic,
        date=custom_day,
        kind=AvailabilityOverride.Kind.CUSTOM,
        start_time=time(13),
        end_time=time(15),
        slot_duration_minutes=60,
        capacity=1,
    )
    generate_availability(start_date=holiday, end_date=custom_day)

    assert AppointmentSlot.objects.filter(date=holiday).count() == 0
    custom_hours = [
        value.astimezone(TEHRAN).hour
        for value in AppointmentSlot.objects.filter(date=custom_day).values_list("start_at", flat=True)
    ]
    assert custom_hours == [13, 14]


@pytest.mark.django_db
def test_capacity_generates_distinct_single_booking_slots():
    clinic = schedule()
    weekday = 2
    day = future_date_for_weekday(weekday)
    WeeklyAvailabilityRule.objects.create(
        schedule=clinic,
        weekday=weekday,
        start_time=time(9),
        end_time=time(10),
        slot_duration_minutes=60,
        capacity=2,
    )

    generate_availability(start_date=day, end_date=day)

    slots = list(AppointmentSlot.objects.filter(date=day).order_by("capacity_index"))
    assert len(slots) == 2
    assert [slot.capacity_index for slot in slots] == [1, 2]
    assert slots[0].start_at == slots[1].start_at


@pytest.mark.django_db
def test_rule_and_break_validation_rejects_invalid_or_overlapping_intervals(admin_client):
    first = admin_client.post(
        "/api/v1/admin/appointments/availability/rules/",
        {
            "weekday": 3,
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "slot_duration_minutes": 30,
            "capacity": 1,
        },
        format="json",
    )
    overlap = admin_client.post(
        "/api/v1/admin/appointments/availability/rules/",
        {
            "weekday": 3,
            "start_time": "11:00:00",
            "end_time": "13:00:00",
            "slot_duration_minutes": 30,
            "capacity": 1,
        },
        format="json",
    )
    reversed_rule = admin_client.post(
        "/api/v1/admin/appointments/availability/rules/",
        {
            "weekday": 4,
            "start_time": "12:00:00",
            "end_time": "09:00:00",
            "slot_duration_minutes": 30,
            "capacity": 1,
        },
        format="json",
    )
    outside_break = admin_client.post(
        "/api/v1/admin/appointments/availability/breaks/",
        {"rule": first.data["id"], "start_time": "08:00:00", "end_time": "09:30:00"},
        format="json",
    )

    assert first.status_code == 201
    assert overlap.status_code == 400
    assert reversed_rule.status_code == 400
    assert outside_break.status_code == 400


@pytest.mark.django_db(transaction=True)
def test_database_exclusion_constraint_rejects_overlapping_slots():
    day = future_date_for_weekday(5)
    start = datetime.combine(day, time(9), tzinfo=TEHRAN)
    AppointmentSlot.objects.create(date=day, start_at=start, end_at=start + timedelta(hours=1))

    with pytest.raises(IntegrityError):
        AppointmentSlot.objects.create(
            date=day,
            start_at=start + timedelta(minutes=30),
            end_at=start + timedelta(hours=2),
        )


@pytest.mark.django_db
def test_tehran_midnight_conversion_and_public_round_trip(admin_client):
    clinic = schedule()
    day = future_date_for_weekday(6)
    AvailabilityOverride.objects.create(
        schedule=clinic,
        date=day,
        kind=AvailabilityOverride.Kind.CUSTOM,
        start_time=time(0, 30),
        end_time=time(1, 0),
        slot_duration_minutes=30,
        capacity=1,
    )
    generate_availability(start_date=day, end_date=day)
    slot = AppointmentSlot.objects.get(date=day)

    assert slot.start_at.astimezone(TEHRAN).date() == day
    assert slot.start_at.astimezone(TEHRAN).time().replace(tzinfo=None) == time(0, 30)
    assert slot.start_at.astimezone(dt_timezone.utc).date() == day - timedelta(days=1)

    response = APIClient().get(
        "/api/v1/appointments/slots/",
        {"start_date": day.isoformat(), "end_date": day.isoformat()},
    )
    assert response.status_code == 200
    rendered = response.data["results"][0]["start_at"]
    parsed = datetime.fromisoformat(rendered.replace("Z", "+00:00"))
    assert parsed.astimezone(TEHRAN).time().replace(tzinfo=None) == time(0, 30)


@pytest.mark.django_db
def test_past_slots_and_unbounded_ranges_are_rejected(admin_client, settings):
    today = timezone.now().astimezone(TEHRAN).date()
    past = timezone.now() - timedelta(hours=2)
    past_response = admin_client.post(
        "/api/v1/admin/appointments/slots/",
        {
            "date": past.astimezone(TEHRAN).date().isoformat(),
            "start_at": past.isoformat(),
            "end_at": (past + timedelta(hours=1)).isoformat(),
            "status": "AVAILABLE",
        },
        format="json",
    )
    too_far = today + timedelta(days=settings.AVAILABILITY_MAX_RANGE_DAYS)
    public_range = APIClient().get(
        "/api/v1/appointments/slots/",
        {"start_date": today.isoformat(), "end_date": too_far.isoformat()},
    )
    generation = admin_client.post(
        "/api/v1/admin/appointments/availability/generate/",
        {"start_date": today.isoformat(), "end_date": too_far.isoformat()},
        format="json",
    )

    assert past_response.status_code == 400
    assert public_range.status_code == 400
    assert generation.status_code == 400
