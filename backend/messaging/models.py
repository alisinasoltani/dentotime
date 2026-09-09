import uuid

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Length


models.TextField.register_lookup(Length)


class MessageThread(models.Model):
    class ThreadType(models.TextChoices):
        USER_ADMIN = "USER_ADMIN", "User-Admin"
        DOCTOR_ADMIN = "DOCTOR_ADMIN", "Doctor-Admin"
        DIRECT = "DIRECT", "Direct conversation"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"
        ARCHIVED = "ARCHIVED", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread_type = models.CharField(max_length=20, choices=ThreadType.choices)
    participant = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="message_threads",
        db_index=False,
    )
    direct_participant_one = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="direct_message_threads_as_one",
    )
    direct_participant_two = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="direct_message_threads_as_two",
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
            models.Index(
                fields=("-last_message_at", "-created_at", "-id"),
                condition=models.Q(deleted_at__isnull=True),
                name="thread_active_order_idx",
            ),
            models.Index(
                fields=("participant", "-last_message_at", "-created_at", "-id"),
                condition=models.Q(deleted_at__isnull=True),
                name="thread_participant_order_idx",
            ),
            models.Index(
                fields=("direct_participant_one", "-last_message_at", "-created_at"),
                condition=models.Q(
                    thread_type="DIRECT",
                    deleted_at__isnull=True,
                ),
                name="thread_direct_one_order_idx",
            ),
            models.Index(
                fields=("direct_participant_two", "-last_message_at", "-created_at"),
                condition=models.Q(
                    thread_type="DIRECT",
                    deleted_at__isnull=True,
                ),
                name="thread_direct_two_order_idx",
            ),
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
                    thread_type="USER_ADMIN",
                    status="OPEN",
                    deleted_at__isnull=True,
                ),
                name="unique_open_guest_thread_per_phone_type",
            ),
            models.UniqueConstraint(
                fields=("direct_participant_one", "direct_participant_two"),
                condition=models.Q(
                    thread_type="DIRECT",
                    status="OPEN",
                    deleted_at__isnull=True,
                ),
                name="unique_open_direct_thread_pair",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        thread_type="DIRECT",
                        participant__isnull=True,
                        guest_phone="",
                        direct_participant_one__isnull=False,
                        direct_participant_two__isnull=False,
                        direct_participant_one__lt=models.F("direct_participant_two"),
                    )
                    | (
                        ~models.Q(thread_type="DIRECT")
                        & models.Q(direct_participant_one__isnull=True)
                        & models.Q(direct_participant_two__isnull=True)
                        & (
                            models.Q(participant__isnull=False, guest_phone="")
                            | (
                                models.Q(participant__isnull=True)
                                & ~models.Q(guest_phone="")
                            )
                        )
                    )
                ),
                name="thread_participant_shape_valid",
            ),
        ]

    def clean(self):
        errors = {}
        if self.assigned_admin_id and not (
            self.assigned_admin.is_active and self.assigned_admin.is_admin_role
        ):
            errors["assigned_admin"] = "Assigned account must be an active administrator."
        if self.thread_type == self.ThreadType.DIRECT:
            direct_ids = {
                self.direct_participant_one_id,
                self.direct_participant_two_id,
            }
            if None in direct_ids or len(direct_ids) != 2:
                errors["direct_participant_one"] = (
                    "Direct conversations require two different participants."
                )
            elif self.direct_participant_one_id > self.direct_participant_two_id:
                errors["direct_participant_one"] = (
                    "Direct participants must be stored in canonical order."
                )
            elif any(
                account.role not in {account.Role.USER, account.Role.DOCTOR}
                for account in (
                    self.direct_participant_one,
                    self.direct_participant_two,
                )
            ):
                errors["direct_participant_one"] = (
                    "Direct conversations are limited to patients and doctors."
                )
            if self.participant_id or self.guest_phone or self.assigned_admin_id:
                errors["thread_type"] = (
                    "Direct conversations cannot use support-thread participants."
                )
        elif self.participant_id:
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

    def direct_counterpart(self, user):
        if self.thread_type != self.ThreadType.DIRECT:
            return None
        if self.direct_participant_one_id == user.pk:
            return self.direct_participant_two
        if self.direct_participant_two_id == user.pk:
            return self.direct_participant_one
        return None


class PinnedChatContact(models.Model):
    """A doctor's persisted shortcut list; support itself is a permanent virtual pin."""

    owner = models.ForeignKey(
        "accounts.Doctor",
        on_delete=models.CASCADE,
        related_name="pinned_chat_contacts",
    )
    contact = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="pinned_by_doctors",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "pk")
        indexes = [models.Index(fields=("owner", "created_at", "id"))]
        constraints = [
            models.UniqueConstraint(
                fields=("owner", "contact"),
                name="unique_pinned_chat_contact",
            ),
            models.CheckConstraint(
                condition=~models.Q(owner=models.F("contact")),
                name="pinned_chat_contact_not_self",
            ),
        ]

    def clean(self):
        errors = {}
        if self.contact_id and self.contact.role not in {
            self.contact.Role.USER,
            self.contact.Role.DOCTOR,
        }:
            errors["contact"] = "Only patient and doctor accounts can be pinned."
        if self.owner_id and self.contact_id == self.owner_id:
            errors["contact"] = "Doctors cannot pin their own account."
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
    thread = models.ForeignKey(
        MessageThread,
        on_delete=models.PROTECT,
        related_name="messages",
        db_index=False,
    )
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
            models.Index(
                fields=("thread", "visibility", "is_deleted", "-created_at", "-id")
            ),
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
    is_3d_scan = models.BooleanField(default=False)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    def clean(self):
        from core.models import FileAsset

        if self.asset_id and self.asset.purpose != FileAsset.Purpose.CHAT_ATTACHMENT:
            raise ValidationError({"asset": "Only chat-attachment assets may be used here."})
        if self.asset_id and self.asset.scope_thread_id != self.message.thread_id:
            raise ValidationError({"asset": "The asset is not scoped to this thread."})
