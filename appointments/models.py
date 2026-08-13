import uuid
from django.db import models
from django.utils import timezone

class AppointmentSlot(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        BOOKED = "BOOKED", "Booked"
        BLOCKED = "BLOCKED", "Blocked"

    date = models.DateField()
    start_at = models.DateTimeField(unique=True)
    end_at = models.DateTimeField()

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["start_at"]
        indexes = [models.Index(fields=["date", "status"])]
        constraints = [
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
