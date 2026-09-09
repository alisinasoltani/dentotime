import uuid
import hashlib
import hmac

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeOperators
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from accounts.validators import validate_e164_phone

class AppointmentSlot(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        BOOKED = "BOOKED", "Booked"
        BLOCKED = "BLOCKED", "Blocked"

    date = models.DateField()
    doctor = models.ForeignKey(
        "accounts.Doctor",
        on_delete=models.PROTECT,
        related_name="availability_slots",
        null=True,
        blank=True,
    )
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    capacity_index = models.PositiveSmallIntegerField(default=1)
    generated_by_schedule = models.BooleanField(default=False)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.AVAILABLE,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["start_at"]
        indexes = [
            models.Index(fields=["date", "start_at"], name="slot_date_start_idx"),
            models.Index(
                fields=["doctor", "date", "start_at"],
                name="slot_doctor_date_start_idx",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["start_at", "capacity_index"],
                condition=models.Q(doctor__isnull=True),
                name="unique_global_slot_start_capacity",
            ),
            models.UniqueConstraint(
                fields=["doctor", "start_at", "capacity_index"],
                condition=models.Q(doctor__isnull=False),
                name="unique_doctor_slot_start_capacity",
            ),
            ExclusionConstraint(
                name="exclude_global_slot_overlap",
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
                condition=models.Q(
                    doctor__isnull=True,
                    status__in=["AVAILABLE", "BOOKED"],
                ),
            ),
            ExclusionConstraint(
                name="exclude_doctor_slot_overlap",
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
                    ("doctor", RangeOperators.EQUAL),
                ],
                condition=models.Q(
                    doctor__isnull=False,
                    status__in=["AVAILABLE", "BOOKED"],
                ),
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


class DoctorAvailabilityRule(models.Model):
    """A saved recurring routine used by a doctor to generate appointment slots."""

    doctor = models.ForeignKey(
        "accounts.Doctor",
        on_delete=models.CASCADE,
        related_name="availability_rules",
    )
    weekday = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(6)]
    )
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_duration_minutes = models.PositiveSmallIntegerField(
        default=30,
        validators=[MinValueValidator(5), MaxValueValidator(480)],
    )
    starts_on = models.DateField()
    ends_on = models.DateField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("weekday", "start_time", "starts_on", "pk")
        indexes = [
            models.Index(
                fields=("doctor", "weekday", "is_active", "starts_on", "ends_on"),
                name="doctor_rule_lookup_idx",
            )
        ]
        constraints = [
            models.UniqueConstraint(
                fields=(
                    "doctor",
                    "weekday",
                    "start_time",
                    "end_time",
                    "slot_duration_minutes",
                    "starts_on",
                    "ends_on",
                ),
                name="unique_doctor_availability_rule",
            ),
            models.CheckConstraint(
                condition=models.Q(start_time__lt=models.F("end_time")),
                name="doctor_rule_start_before_end",
            ),
            models.CheckConstraint(
                condition=models.Q(starts_on__lte=models.F("ends_on")),
                name="doctor_rule_date_range_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(weekday__gte=0, weekday__lte=6),
                name="doctor_rule_weekday_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    slot_duration_minutes__gte=5,
                    slot_duration_minutes__lte=480,
                ),
                name="doctor_rule_duration_valid",
            ),
        ]


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


class BookingCaptchaChallenge(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    answer_digest = models.CharField(max_length=64, editable=False)
    expires_at = models.DateTimeField()
    attempt_count = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    requested_ip = models.GenericIPAddressField(null=True, blank=True)
    device_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(
                fields=["expires_at"],
                condition=models.Q(consumed_at__isnull=True),
                name="captcha_unconsumed_expiry_idx",
            ),
            models.Index(fields=["device_hash", "-created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(max_attempts__gt=0),
                name="captcha_max_attempts_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(attempt_count__lte=models.F("max_attempts")),
                name="captcha_attempts_within_limit",
            ),
        ]

    def set_answer(self, answer: str) -> None:
        message = f"{self.pk}:{answer.strip().upper()}".encode()
        self.answer_digest = hmac.new(
            settings.CAPTCHA_HASH_KEY.encode(), message, hashlib.sha256
        ).hexdigest()

    def answer_matches(self, answer: str) -> bool:
        message = f"{self.pk}:{answer.strip().upper()}".encode()
        candidate = hmac.new(
            settings.CAPTCHA_HASH_KEY.encode(), message, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(self.answer_digest, candidate)

    def is_valid(self) -> bool:
        return bool(
            self.consumed_at is None
            and self.attempt_count < self.max_attempts
            and timezone.now() < self.expires_at
        )


class Appointment(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"
        COMPLETED = "COMPLETED", "Completed"
        NO_SHOW = "NO_SHOW", "No Show"

    class AttendanceStatus(models.TextChoices):
        NOT_CONFIRMED = "NOT_CONFIRMED", "تأیید نشده"
        ATTENDED = "ATTENDED", "مراجعه کردم"
        DID_NOT_ATTEND = "DID_NOT_ATTEND", "مراجعه نکردم"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    patient = models.ForeignKey(
        "accounts.NormalUser",
        on_delete=models.SET_NULL,
        related_name="appointments",
        null=True,
        blank=True,
        db_index=False,
    )
    doctor = models.ForeignKey(
        "accounts.Doctor",
        on_delete=models.PROTECT,
        related_name="appointments",
        null=True,
        blank=True,
    )
    slot = models.ForeignKey(AppointmentSlot, on_delete=models.PROTECT, related_name="appointments")
    # Null only for historical and unassigned clinic bookings. Never infer old choices.
    service = models.ForeignKey("accounts.DentalService", on_delete=models.PROTECT, null=True, blank=True)
    insurance = models.ForeignKey("accounts.InsuranceProvider", on_delete=models.PROTECT, null=True, blank=True)
    idempotency_key = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    contact_phone_number = models.CharField(
        max_length=20,
        validators=[validate_e164_phone],
        db_index=True,
    )
    contact_first_name = models.CharField(max_length=150)
    contact_last_name = models.CharField(max_length=150, blank=True, default="")

    reason = models.TextField(blank=True, default="")
    admin_notes = models.TextField(blank=True, default="")

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    attendance_status = models.CharField(
        max_length=20,
        choices=AttendanceStatus.choices,
        default=AttendanceStatus.NOT_CONFIRMED,
        db_index=True,
    )
    attendance_confirmed_at = models.DateTimeField(null=True, blank=True)

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
            models.Index(
                fields=["patient", "status", "-created_at"],
                name="appt_patient_status_created",
            ),
            models.Index(
                fields=["patient", "doctor", "attendance_status"],
                name="appt_patient_doctor_attend",
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
            models.CheckConstraint(
                condition=models.Q(
                    attendance_status__in=[
                        "NOT_CONFIRMED", "ATTENDED", "DID_NOT_ATTEND"
                    ]
                ),
                name="appointment_valid_attendance_status",
            ),
            models.CheckConstraint(
                condition=~models.Q(contact_phone_number=""),
                name="appointment_contact_phone_required",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.patient_id and not self.contact_phone_number:
            self.contact_phone_number = self.patient.phone_number
            self.contact_first_name = self.patient.first_name
            self.contact_last_name = self.patient.last_name
        super().save(*args, **kwargs)

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
