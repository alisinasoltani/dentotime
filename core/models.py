import uuid

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.db.models import F, Q


ONE_GIB = 1024 * 1024 * 1024


class FileAsset(models.Model):
    """Server-owned metadata for an object that may later be attached to a domain record."""

    class Purpose(models.TextChoices):
        CHAT_ATTACHMENT = "CHAT_ATTACHMENT", "Chat attachment"
        VERIFICATION_DOCUMENT = "VERIFICATION_DOCUMENT", "Verification document"
        PROFILE_PICTURE = "PROFILE_PICTURE", "Profile picture"

    class State(models.TextChoices):
        PENDING = "PENDING", "Pending"
        UPLOADING = "UPLOADING", "Uploading"
        QUARANTINED = "QUARANTINED", "Quarantined"
        AVAILABLE = "AVAILABLE", "Available"
        FAILED = "FAILED", "Failed"
        DELETED = "DELETED", "Deleted"

    class ScanStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        CLEAN = "CLEAN", "Clean"
        INFECTED = "INFECTED", "Infected"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="file_assets",
    )
    purpose = models.CharField(max_length=32, choices=Purpose.choices)
    scope_thread = models.ForeignKey(
        "messaging.MessageThread",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="scoped_file_assets",
    )
    scope_doctor = models.ForeignKey(
        "accounts.Doctor",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="scoped_file_assets",
    )
    original_name = models.CharField(max_length=255)
    expected_size = models.BigIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(ONE_GIB)]
    )
    actual_size = models.BigIntegerField(null=True, blank=True)
    claimed_mime = models.CharField(max_length=127)
    detected_mime = models.CharField(max_length=127, blank=True, default="")
    sha256 = models.CharField(
        max_length=64,
        validators=[RegexValidator(r"\A[0-9a-f]{64}\Z", "Enter a lowercase SHA-256 digest.")],
    )
    verified_sha256 = models.CharField(max_length=64, blank=True, default="")
    storage_key = models.CharField(max_length=512, unique=True)
    state = models.CharField(
        max_length=16,
        choices=State.choices,
        default=State.PENDING,
    )
    scan_status = models.CharField(
        max_length=16,
        choices=ScanStatus.choices,
        default=ScanStatus.PENDING,
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    scanned_at = models.DateTimeField(null=True, blank=True)
    failed_reason = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=("owner", "state", "-created_at"), name="asset_owner_state_created_idx"),
            models.Index(fields=("purpose", "state", "-created_at"), name="asset_purpose_state_idx"),
            models.Index(
                fields=("expires_at",),
                condition=Q(state__in=("PENDING", "UPLOADING")),
                name="asset_incomplete_expiry_idx",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(
                    state__in=("PENDING", "UPLOADING", "QUARANTINED", "AVAILABLE", "FAILED", "DELETED")
                ),
                name="asset_state_valid",
            ),
            models.CheckConstraint(
                condition=Q(scan_status__in=("PENDING", "CLEAN", "INFECTED", "FAILED")),
                name="asset_scan_status_valid",
            ),
            models.CheckConstraint(
                condition=Q(expected_size__gte=1) & Q(expected_size__lte=ONE_GIB),
                name="asset_expected_size_valid",
            ),
            models.CheckConstraint(
                condition=Q(actual_size__isnull=True) | Q(actual_size__gte=1),
                name="asset_actual_size_valid",
            ),
            models.CheckConstraint(
                condition=(
                    Q(
                        purpose="CHAT_ATTACHMENT",
                        scope_thread__isnull=False,
                        scope_doctor__isnull=True,
                    )
                    | Q(
                        purpose="VERIFICATION_DOCUMENT",
                        scope_thread__isnull=True,
                        scope_doctor__isnull=False,
                    )
                    | Q(
                        purpose="PROFILE_PICTURE",
                        scope_thread__isnull=True,
                        scope_doctor__isnull=True,
                    )
                ),
                name="asset_purpose_scope_valid",
            ),
            models.CheckConstraint(
                condition=(
                    ~Q(state="AVAILABLE")
                    | (
                        Q(scan_status="CLEAN")
                        & Q(actual_size=F("expected_size"))
                        & Q(verified_sha256=F("sha256"))
                    )
                ),
                name="available_asset_is_verified",
            ),
        ]

    def clean(self):
        errors = {}
        if self.owner_id and self.scope_doctor_id and self.owner_id != self.scope_doctor_id:
            errors["scope_doctor"] = "Verification assets must be owned by the scoped doctor."
        if self.scope_thread_id and self.owner_id:
            participant_id = getattr(self.scope_thread, "participant_id", None)
            if participant_id != self.owner_id and not self.owner.is_admin_role:
                errors["scope_thread"] = "The owner is not allowed to upload to this thread."
        if self.state == self.State.AVAILABLE and self.sha256 != self.verified_sha256:
            errors["verified_sha256"] = "The verified digest must match the claimed digest."
        if errors:
            raise ValidationError(errors)


class UploadSession(models.Model):
    class State(models.TextChoices):
        CREATED = "CREATED", "Created"
        UPLOADING = "UPLOADING", "Uploading"
        COMPLETING = "COMPLETING", "Completing"
        COMPLETED = "COMPLETED", "Completed"
        ABORTED = "ABORTED", "Aborted"
        ABORTING = "ABORTING", "Aborting"
        EXPIRED = "EXPIRED", "Expired"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_upload_id = models.UUIDField(default=uuid.uuid4)
    asset = models.OneToOneField(
        FileAsset,
        on_delete=models.CASCADE,
        related_name="upload_session",
    )
    owner = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="upload_sessions",
    )
    provider_upload_id = models.CharField(max_length=512, blank=True, default="")
    part_size = models.PositiveIntegerField(
        validators=[MinValueValidator(5 * 1024 * 1024), MaxValueValidator(64 * 1024 * 1024)]
    )
    expected_part_count = models.PositiveIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(10_000)]
    )
    state = models.CharField(max_length=16, choices=State.choices, default=State.CREATED)
    expires_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=("owner", "state", "-created_at"), name="upload_owner_state_idx"),
            models.Index(
                fields=("expires_at",),
                condition=Q(state__in=("CREATED", "UPLOADING", "COMPLETING")),
                name="upload_active_expiry_idx",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("owner", "client_upload_id"),
                name="unique_owner_client_upload",
            ),
            models.CheckConstraint(
                condition=Q(
                    state__in=(
                        "CREATED",
                        "UPLOADING",
                        "COMPLETING",
                        "COMPLETED",
                        "ABORTED",
                        "ABORTING",
                        "EXPIRED",
                        "FAILED",
                    )
                ),
                name="upload_state_valid",
            ),
            models.CheckConstraint(condition=Q(part_size__gte=5 * 1024 * 1024), name="upload_part_size_min"),
            models.CheckConstraint(
                condition=Q(expected_part_count__gte=1) & Q(expected_part_count__lte=10_000),
                name="upload_part_count_valid",
            ),
        ]

    def clean(self):
        if self.owner_id and self.asset_id and self.owner_id != self.asset.owner_id:
            raise ValidationError({"owner": "Upload-session owner must match the asset owner."})


class UploadPart(models.Model):
    id = models.BigAutoField(primary_key=True)
    session = models.ForeignKey(
        UploadSession,
        on_delete=models.CASCADE,
        related_name="recorded_parts",
    )
    part_number = models.PositiveIntegerField()
    size = models.PositiveIntegerField()
    etag = models.CharField(max_length=255)
    checksum_sha256 = models.CharField(
        max_length=64,
        validators=[RegexValidator(r"\A[0-9a-f]{64}\Z", "Enter a lowercase SHA-256 digest.")],
    )
    recorded_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("part_number",)
        constraints = [
            models.UniqueConstraint(
                fields=("session", "part_number"),
                name="unique_upload_session_part",
            ),
            models.CheckConstraint(
                condition=Q(part_number__gte=1) & Q(part_number__lte=10_000),
                name="upload_part_number_valid",
            ),
            models.CheckConstraint(
                condition=Q(size__gte=1),
                name="upload_part_size_valid",
            ),
        ]

class SystemSettings(models.Model):
    cancellation_enabled = models.BooleanField(default=True)
    cancellation_cutoff_hours = models.PositiveIntegerField(default=24)
    doctor_attachment_max_size_mb = models.PositiveIntegerField(default=1024)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="system_settings_changes"
    )

    class Meta:
        verbose_name = "System Settings"
        verbose_name_plural = "System Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
        cache.delete('system_settings')

    def delete(self, *args, **kwargs):
        pass

    @classmethod
    def load(cls):
        obj = cache.get('system_settings')
        if obj is None:
            obj, _ = cls.objects.get_or_create(pk=1)
            cache.set('system_settings', obj, timeout=300)
        return obj
