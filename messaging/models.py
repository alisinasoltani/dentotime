import uuid
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver

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

    participant = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="message_threads")
    assigned_admin = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_threads")

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_message_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-last_message_at", "-created_at"]
        indexes = [
            models.Index(fields=["thread_type", "status"]),
            models.Index(fields=["participant"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["participant", "thread_type"],
                condition=models.Q(status="OPEN"),
                name="unique_open_thread_per_participant_type",
            ),
        ]

class Message(models.Model):
    class SenderType(models.TextChoices):
        USER = "USER", "User"
        DOCTOR = "DOCTOR", "Doctor"
        ADMIN = "ADMIN", "Admin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    thread = models.ForeignKey(MessageThread, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="sent_messages")
    sender_type = models.CharField(max_length=10, choices=SenderType.choices)

    body = models.TextField(blank=True, default="")

    read_by_recipient = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    edited_at = models.DateTimeField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["thread", "created_at"]),
            # Add this new index for faster unread filtering:
            models.Index(fields=["thread", "read_by_recipient"]),
        ]


@receiver(post_save, sender=Message)
def update_thread_last_message_at(sender, instance, **kwargs):
    thread = instance.thread
    thread.last_message_at = instance.created_at
    thread.save(update_fields=["last_message_at", "updated_at"])


class MessageAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="attachments")
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
        indexes = [models.Index(fields=["is_3d_scan"])]
