import uuid
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeOperators
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

class AppointmentSlot(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        BOOKED = "BOOKED", "Booked"
        BLOCKED = "BLOCKED", "Blocked"

    date = models.DateField()
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    capacity_index = models.PositiveSmallIntegerField(default=1)
    generated_by_schedule = models.BooleanField(default=False)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["start_at"]
        indexes = [
            models.Index(fields=["date", "status"]),
            models.Index(fields=["start_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["start_at", "capacity_index"],
                name="unique_slot_start_capacity",
            ),
            ExclusionConstraint(
                name="exclude_overlapping_slots_capacity",
                expressions=[
                    (
                        models.Func(
                            models.F("start_at"),
                            models.F("end_at"),
                            function="TSTZRANGE",
                            output_field=DateTimeRangeField(),
                        ),
                        RangeOperators.OVERLAPS,
                    ),
                    ("capacity_index", RangeOperators.EQUAL),
                ],
                condition=models.Q(status__in=["AVAILABLE", "BOOKED"]),
            ),
            models.CheckConstraint(
                condition=models.Q(start_at__lt=models.F("end_at")),
                name="appointment_slot_start_before_end",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=["AVAILABLE", "BOOKED", "BLOCKED"]),
                name="appointment_slot_valid_status",
            ),
        ]

    def __str__(self):
        return f"Slot {self.date} @ {self.start_at:%H:%M} [{self.status}]"


class ClinicSchedule(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    timezone = models.CharField(max_length=64, default="Asia/Tehran", editable=False)

    def save(self, *args, **kwargs):
        self.pk = 1
        self.timezone = "Asia/Tehran"
        super().save(*args, **kwargs)


class WeeklyAvailabilityRule(models.Model):
    schedule = models.ForeignKey(
        ClinicSchedule, on_delete=models.CASCADE, related_name="weekly_rules", default=1
    )
    weekday = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(6)]
    )
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_duration_minutes = models.PositiveSmallIntegerField(
        default=30, validators=[MinValueValidator(5), MaxValueValidator(480)]
    )
    capacity = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(20)]
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["weekday", "start_time"]
        indexes = [models.Index(fields=["schedule", "weekday", "is_active"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(start_time__lt=models.F("end_time")),
                name="weekly_rule_start_before_end",
            ),
            models.CheckConstraint(
                condition=models.Q(weekday__gte=0, weekday__lte=6),
                name="weekly_rule_valid_weekday",
            ),
            models.CheckConstraint(
                condition=models.Q(slot_duration_minutes__gte=5, slot_duration_minutes__lte=480),
                name="weekly_rule_valid_duration",
            ),
            models.CheckConstraint(
                condition=models.Q(capacity__gte=1, capacity__lte=20),
                name="weekly_rule_valid_capacity",
            ),
        ]


class AvailabilityBreak(models.Model):
    rule = models.ForeignKey(
        WeeklyAvailabilityRule, on_delete=models.CASCADE, related_name="breaks"
    )
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ["start_time"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(start_time__lt=models.F("end_time")),
                name="availability_break_start_before_end",
            )
        ]


class AvailabilityOverride(models.Model):
    class Kind(models.TextChoices):
        CLOSED = "CLOSED", "Closed"
        CUSTOM = "CUSTOM", "Custom hours"

    schedule = models.ForeignKey(
        ClinicSchedule, on_delete=models.CASCADE, related_name="date_overrides", default=1
    )
    date = models.DateField()
    kind = models.CharField(max_length=12, choices=Kind.choices)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    slot_duration_minutes = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(5), MaxValueValidator(480)]
    )
    capacity = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(20)]
    )

    class Meta:
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(
                fields=["schedule", "date"], name="one_availability_override_per_date"
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        kind="CLOSED",
                        start_time__isnull=True,
                        end_time__isnull=True,
                        slot_duration_minutes__isnull=True,
                        capacity__isnull=True,
                    )
                    | models.Q(
                        kind="CUSTOM",
                        start_time__isnull=False,
                        end_time__isnull=False,
                        start_time__lt=models.F("end_time"),
                        slot_duration_minutes__gte=5,
                        slot_duration_minutes__lte=480,
                        capacity__gte=1,
                        capacity__lte=20,
                    )
                ),
                name="availability_override_fields_match_kind",
            ),
        ]


class Appointment(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"
        COMPLETED = "COMPLETED", "Completed"
        NO_SHOW = "NO_SHOW", "No Show"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    patient = models.ForeignKey("accounts.NormalUser", on_delete=models.CASCADE, related_name="appointments")
    slot = models.ForeignKey(AppointmentSlot, on_delete=models.PROTECT, related_name="appointments")
    idempotency_key = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    reason = models.TextField(blank=True, default="")
    admin_notes = models.TextField(blank=True, default="")

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)

    approved_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="approved_appointments")
    approved_at = models.DateTimeField(null=True, blank=True)

    cancelled_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="cancelled_appointments")
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-slot__start_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(
                fields=["patient", "status", "-created_at"],
                name="appt_patient_status_created",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["slot"],
                condition=models.Q(status__in=["PENDING", "APPROVED"]),
                name="one_active_appointment_per_slot",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    status__in=[
                        "PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED", "NO_SHOW"
                    ]
                ),
                name="appointment_valid_status",
            ),
        ]

    @property
    def start_at(self):
        return self.slot.start_at

    def can_be_cancelled_by_user(self) -> bool:
        # Local import to prevent circular dependency
        from core.models import SystemSettings
        settings = SystemSettings.load()
        
        if not settings.cancellation_enabled:
            return False
        if self.status not in (Appointment.Status.PENDING, Appointment.Status.APPROVED):
            return False
        
        now = timezone.now()
        if settings.cancellation_cutoff_hours == 0:
            return now < self.start_at
        
        cutoff = self.start_at - timezone.timedelta(hours=settings.cancellation_cutoff_hours)
        return now < cutoff
