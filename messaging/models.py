import uuid

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Length


models.TextField.register_lookup(Length)


class MessageThread(models.Model):
    class ThreadType(models.TextChoices):
        USER_ADMIN = "USER_ADMIN", "User-Admin"
        DOCTOR_ADMIN = "DOCTOR_ADMIN", "Doctor-Admin"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"
        ARCHIVED = "ARCHIVED", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread_type = models.CharField(max_length=20, choices=ThreadType.choices, db_index=True)
    participant = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="message_threads",
    )
    guest_phone = models.CharField(max_length=20, blank=True, default="")
    guest_first_name = models.CharField(max_length=150, blank=True, default="")
    guest_last_name = models.CharField(max_length=150, blank=True, default="")
    assigned_admin = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_threads",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_message_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deleted_message_threads",
    )

    class Meta:
        ordering = ("-last_message_at", "-created_at", "-id")
        indexes = [
            models.Index(fields=("thread_type", "status", "-last_message_at")),
            models.Index(fields=("participant", "-last_message_at")),
            models.Index(fields=("guest_phone", "status")),
            models.Index(fields=("deleted_at",)),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("participant", "thread_type"),
                condition=models.Q(status="OPEN", deleted_at__isnull=True),
                name="unique_open_thread_per_participant_type",
            ),
            models.UniqueConstraint(
                fields=("guest_phone", "thread_type"),
                condition=models.Q(
                    participant__isnull=True,
                    status="OPEN",
                    deleted_at__isnull=True,
                ),
                name="unique_open_guest_thread_per_phone_type",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(participant__isnull=False, guest_phone="")
                    | (models.Q(participant__isnull=True) & ~models.Q(guest_phone=""))
                ),
                name="thread_has_one_participant_identity",
            ),
        ]

    def clean(self):
        errors = {}
        if self.assigned_admin_id and not (
            self.assigned_admin.is_active and self.assigned_admin.is_admin_role
        ):
            errors["assigned_admin"] = "Assigned account must be an active administrator."
        if self.participant_id:
            expected_type = (
                self.ThreadType.DOCTOR_ADMIN
                if self.participant.is_doctor_role
                else self.ThreadType.USER_ADMIN
            )
            if self.thread_type != expected_type:
                errors["thread_type"] = "Thread type does not match the participant role."
        elif self.thread_type != self.ThreadType.USER_ADMIN:
            errors["thread_type"] = "Guest contacts may only use user-admin threads."
        if errors:
            raise ValidationError(errors)


class ThreadReadState(models.Model):
    """A per-account high-water mark; one administrator cannot read for another."""

    id = models.BigAutoField(primary_key=True)
    thread = models.ForeignKey(
        MessageThread,
        on_delete=models.CASCADE,
        related_name="read_states",
    )
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="message_read_states",
    )
    last_read_at = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("thread", "user"),
                name="unique_thread_read_state_per_user",
            )
        ]
        indexes = [models.Index(fields=("user", "thread", "last_read_at"))]


class Message(models.Model):
    class SenderType(models.TextChoices):
        USER = "USER", "User"
        DOCTOR = "DOCTOR", "Doctor"
        ADMIN = "ADMIN", "Admin"
        GUEST = "GUEST", "Guest"

    class Visibility(models.TextChoices):
        PARTICIPANTS = "PARTICIPANTS", "Participants"
        ADMINS_ONLY = "ADMINS_ONLY", "Administrators only"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread = models.ForeignKey(MessageThread, on_delete=models.PROTECT, related_name="messages")
    sender = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sent_messages",
    )
    sender_type = models.CharField(max_length=10, choices=SenderType.choices)
    sender_first_name = models.CharField(max_length=150, blank=True, default="")
    sender_last_name = models.CharField(max_length=150, blank=True, default="")
    visibility = models.CharField(
        max_length=16,
        choices=Visibility.choices,
        default=Visibility.PARTICIPANTS,
    )
    body = models.TextField(blank=True, default="")
    edited_at = models.DateTimeField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deleted_messages",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("created_at", "id")
        indexes = [
            models.Index(fields=("thread", "-created_at", "-id")),
            models.Index(fields=("thread", "visibility", "is_deleted", "-created_at")),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(body__length__lte=4000),
                name="message_body_max_4000",
            ),
            models.CheckConstraint(
                condition=models.Q(visibility__in=("PARTICIPANTS", "ADMINS_ONLY")),
                name="message_visibility_valid",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(sender_type="GUEST", sender__isnull=True)
                    | (~models.Q(sender_type="GUEST") & models.Q(sender__isnull=False))
                ),
                name="message_sender_matches_type",
            ),
        ]


class MessageAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(Message, on_delete=models.PROTECT, related_name="attachments")
    asset = models.OneToOneField(
        "core.FileAsset",
        on_delete=models.PROTECT,
        related_name="message_attachment",
    )
    is_3d_scan = models.BooleanField(default=False, db_index=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    def clean(self):
        if self.message.thread.thread_type != MessageThread.ThreadType.DOCTOR_ADMIN:
            raise ValidationError("Attachments are only allowed in DOCTOR-ADMIN threads.")
        from core.models import FileAsset

        if self.asset_id and self.asset.purpose != FileAsset.Purpose.CHAT_ATTACHMENT:
            raise ValidationError({"asset": "Only chat-attachment assets may be used here."})
        if self.asset_id and self.asset.scope_thread_id != self.message.thread_id:
            raise ValidationError({"asset": "The asset is not scoped to this thread."})

    class Meta:
        indexes = [models.Index(fields=("is_3d_scan",))]
